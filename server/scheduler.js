import cron from 'node-cron'
import { sendDigestEmail } from './email.js'
import { runAllScrapers } from './scrapers/index.js'
import { scoreJob } from './scorer.js'
import { updateScore, getJobById, getUnscoredJobs, getProfile, upsertProfileDimensions } from './db.js'

// ── Per-user rescore state ────────────────────────────────────────────────────
// Keyed by userId so concurrent rescores don't overwrite each other's progress.
const rescoreByUser = {}

function getUserState(userId) {
  if (!rescoreByUser[userId]) rescoreByUser[userId] = { running: false, lastCount: null, lastTs: null }
  return rescoreByUser[userId]
}

import * as weworkremotely from './scrapers/weworkremotely.js'
import * as nyfa from './scrapers/nyfa.js'
import * as ixda from './scrapers/ixda.js'
import * as themuse from './scrapers/themuse.js'
import * as backstage from './scrapers/backstage.js'
import * as web3career from './scrapers/web3career.js'
import * as staffmeup from './scrapers/staffmeup.js'
import * as creatoreconomyjobs from './scrapers/creatoreconomyjobs.js'
import * as linkedin from './scrapers/linkedin.js'
import * as jsearch from './scrapers/jsearch.js'
import * as builtin from './scrapers/builtin.js'
import * as whoishiringintech from './scrapers/whoishiringintech.js'

const ALL_SCRAPERS = [weworkremotely, nyfa, ixda, themuse, backstage, web3career, staffmeup, creatoreconomyjobs, linkedin, jsearch, builtin, whoishiringintech]

// Load per-user profile from DB
async function loadProfile(pool, userId) {
  if (userId) {
    const dbProfile = await getProfile(pool, userId)
    if (dbProfile?.background) {
      return {
        background: dbProfile.background,
        weights: dbProfile.weights || {},
        dimensions: dbProfile.dimensions || null,
        personality: dbProfile.personality || null,
        target_level: dbProfile.target_level || null,
        target_roles: dbProfile.target_roles || null,
        target_sectors: dbProfile.target_sectors || null,
      }
    }
  }
  throw new Error(`[pipeline] No profile found for user ${userId}`)
}

// Generate and persist dimensions for a user in the background
export async function generateAndSaveDimensions(pool, userId, background) {
  try {
    const { generateDimensions } = await import('./dimension-generator.js')
    const dbProfile = await getProfile(pool, userId)
    console.log(`[dimensions] Generating dimensions for user ${userId}...`)
    const dimensions = await generateDimensions(background, dbProfile || {})
    await upsertProfileDimensions(pool, userId, dimensions)
    console.log(`[dimensions] Saved ${Object.keys(dimensions).length} dimensions for user ${userId}`)
  } catch (err) {
    console.error(`[dimensions] Failed for user ${userId}:`, err.message)
  }
}

async function getAdminUserId(pool) {
  const { rows } = await pool.query(`SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`)
  return rows[0]?.id
}

// Get all active users who have completed onboarding
async function getActiveUsersWithProfiles(pool) {
  const { rows } = await pool.query(
    `SELECT u.id FROM "user" u
     JOIN profiles p ON p.user_id = u.id
     WHERE u.status = 'active' AND p.onboarding_done = true`
  )
  return rows.map(r => r.id)
}

export async function runPipeline(pool) {
  console.log('[pipeline] Starting scrape...')
  const adminUserId = await getAdminUserId(pool)
  const newIds = await runAllScrapers(pool, ALL_SCRAPERS)

  // Collect all users who need scoring (admin-first for fast notifications)
  const allUserIds = await getActiveUsersWithProfiles(pool)
  const orderedUserIds = adminUserId
    ? [adminUserId, ...allUserIds.filter(id => id !== adminUserId)]
    : allUserIds

  if (orderedUserIds.length === 0) {
    console.log('[pipeline] No users with profiles to score for.')
    if (adminUserId) {
      sendDigestNotification(pool, newIds, adminUserId).catch(err =>
        console.error('[notify] Failed:', err.message)
      )
    }
    return { scraped: newIds.length, scored: 0 }
  }

  let totalScored = 0
  for (const userId of orderedUserIds) {
    const profile = await loadProfile(pool, userId).catch(() => null)
    if (!profile) continue

    const backlogIds = (await getUnscoredJobs(pool, userId)).filter(id => !newIds.includes(id))
    const toScore = [...newIds, ...backlogIds]
    if (toScore.length === 0) continue

    // Mark as running so ScoreBanner picks it up
    const state = getUserState(userId)
    state.running = true
    state.lastCount = null

    console.log(`[pipeline] Scoring ${toScore.length} jobs for user ${userId} (${newIds.length} new, ${backlogIds.length} backlog)...`)
    let scored = 0
    for (let i = 0; i < toScore.length; i++) {
      const id = toScore[i]
      try {
        const job = await getJobById(pool, id)
        if (!job) continue
        const result = await scoreJob(job, profile)
        await updateScore(pool, id, userId, result.aggregate, { ...result.dimensions, summary: result.summary })
        scored++
        if (i < toScore.length - 1) await sleep(400)
      } catch (err) {
        console.error(`[pipeline] FAILED id=${id} user=${userId}:`, err.message)
      }
    }
    state.running = false
    state.lastCount = scored
    state.lastTs = Date.now()
    totalScored += scored
    console.log(`[pipeline] User ${userId}: ${scored}/${toScore.length} scored.`)
  }

  console.log(`[pipeline] Done. ${newIds.length} scraped, ${totalScored} total scores written.`)
  // Send digest to every user who was scored
  for (const uid of orderedUserIds) {
    sendDigestNotification(pool, newIds, uid).catch(err =>
      console.error(`[notify] Failed for user ${uid}:`, err.message)
    )
  }
  return { scraped: newIds.length, scored: totalScored }
}

export async function scoreOneJob(pool, id, userId) {
  const profile = await loadProfile(pool, userId)
  const job = await getJobById(pool, id)
  if (!job) { console.warn(`[scoreOneJob] job ${id} not found`); return }
  try {
    console.log(`[scoreOneJob] Scoring: ${job.company} — ${job.title}`)
    const result = await scoreJob(job, profile)
    await updateScore(pool, id, userId, result.aggregate, { ...result.dimensions, summary: result.summary })
    console.log(`[scoreOneJob] Done — score: ${result.aggregate}`)
  } catch (err) {
    console.error(`[scoreOneJob] Failed id=${id}:`, err.message)
    console.error(err.stack)
  }
}

export function getRescoreStatus(userId) {
  if (userId) return { ...getUserState(userId) }
  // No userId: return running=true if ANY user's rescore is running
  const running = Object.values(rescoreByUser).some(s => s.running)
  const latest = Object.values(rescoreByUser).reduce((best, s) => {
    if (!s.lastTs) return best
    return !best || s.lastTs > best.lastTs ? s : best
  }, null)
  return { running, lastCount: latest?.lastCount ?? null, lastTs: latest?.lastTs ?? null }
}

export async function rescoreAllJobs(pool, userId) {
  const state = getUserState(userId)
  if (state.running) {
    console.log(`[rescoreAllJobs] Already running for user ${userId}, skipping.`)
    return
  }
  state.running = true
  state.lastCount = null
  state.lastTs = null
  const { rows } = await pool.query('SELECT id FROM jobs WHERE deleted = false')
  const ids = rows.map(r => r.id)
  console.log(`[rescoreAllJobs] Re-scoring ${ids.length} jobs for user ${userId}...`)
  let scored = 0
  for (let i = 0; i < ids.length; i++) {
    try {
      await scoreOneJob(pool, ids[i], userId)
      scored++
    } catch (err) {
      console.error(`[rescoreAllJobs] Failed id=${ids[i]}:`, err.message)
    }
    if (i < ids.length - 1) await sleep(300)
  }
  state.running = false
  state.lastCount = scored
  state.lastTs = Date.now()
  console.log(`[rescoreAllJobs] Done. ${scored}/${ids.length} rescored for user ${userId}.`)
}

async function sendDigestNotification(pool, newIds, userId) {
  if (newIds.length === 0 || !userId) return
  try {
    const { rows: userRows } = await pool.query(`SELECT email FROM "user" WHERE id = $1`, [userId])
    const email = userRows[0]?.email
    if (!email) return

    const placeholders = newIds.map((_, i) => `$${i + 1}`).join(',')
    const userParam = `$${newIds.length + 1}`
    const { rows } = await pool.query(
      `SELECT j.title, j.company, j.location, js.score_aggregate
       FROM jobs j
       LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = ${userParam}
       WHERE j.id IN (${placeholders})
       ORDER BY js.score_aggregate DESC NULLS LAST
       LIMIT 5`,
      [...newIds, userId]
    )
    await sendDigestEmail({ to: email, total: newIds.length, topJobs: rows })
    console.log(`[notify] Digest email sent to ${email}`)
  } catch (err) {
    console.error('[notify] Failed to send digest:', err.message)
  }
}

export function startScheduler(pool) {
  const cronExpr = process.env.SCRAPE_CRON || '0 8 * * *'
  cron.schedule(cronExpr, () => {
    runPipeline(pool).catch(err => console.error('[scheduler] Pipeline error:', err))
  })
  console.log(`[scheduler] Scheduled daily pipeline: ${cronExpr}`)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
