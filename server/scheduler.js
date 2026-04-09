import cron from 'node-cron'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import notifier from 'node-notifier'
import { runAllScrapers } from './scrapers/index.js'
import { scoreJob } from './scorer.js'
import { updateScore, getJobById, getUnscoredJobs } from './db.js'

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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ALL_SCRAPERS = [weworkremotely, nyfa, ixda, themuse, backstage, web3career, staffmeup, creatoreconomyjobs, linkedin, jsearch, builtin, whoishiringintech]

function loadProfile() {
  try {
    const raw = readFileSync(path.join(__dirname, 'profile.json'), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    throw new Error('[pipeline] Could not load profile.json: ' + err.message)
  }
}

// Temporary until Plan 2 wires up per-user scoring
async function getAdminUserId(pool) {
  const { rows } = await pool.query(`SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`)
  return rows[0]?.id
}

export async function runPipeline(pool) {
  console.log('[pipeline] Starting scrape...')
  const profile = loadProfile()
  const adminUserId = await getAdminUserId(pool)
  const newIds = await runAllScrapers(pool, ALL_SCRAPERS)

  // Include any previously-scraped jobs that never got scored
  const backlogIds = (await getUnscoredJobs(pool, adminUserId)).filter(id => !newIds.includes(id))
  const toScore = [...newIds, ...backlogIds]
  console.log(`[pipeline] ${newIds.length} new, ${backlogIds.length} backlog unscored. Scoring ${toScore.length} total...`)

  let scored = 0
  for (let i = 0; i < toScore.length; i++) {
    const id = toScore[i]
    try {
      const job = await getJobById(pool, id)
      if (!job) { console.warn(`[scorer] Job ${id} not found in db, skipping`); continue }
      console.log(`[scorer] Scoring job ${i + 1} of ${toScore.length}: ${job.company} - ${job.title}`)
      const result = await scoreJob(job, profile)
      if (adminUserId) {
        await updateScore(pool, id, adminUserId, result.aggregate, { ...result.dimensions, summary: result.summary })
      }
      scored++
      console.log(`[scorer] Done ${i + 1}/${toScore.length} — score: ${result.aggregate}`)
      if (i < toScore.length - 1) await sleep(500)
    } catch (err) {
      console.error(`[scorer] FAILED job ${i + 1}/${toScore.length} id=${id}:`, err.message)
      console.error(err.stack)
    }
  }

  console.log(`[pipeline] Done. ${newIds.length} scraped, ${scored}/${toScore.length} scored.`)
  sendDigestNotification(pool, newIds, adminUserId).catch(err =>
    console.error('[notify] Failed:', err.message)
  )
  return { scraped: newIds.length, scored }
}

export async function scoreOneJob(pool, id, userId) {
  const profile = loadProfile()
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

const rescoreState = { running: false, lastCount: null, lastTs: null }

export function getRescoreStatus() { return { ...rescoreState } }

export async function rescoreAllJobs(pool, userId) {
  if (rescoreState.running) {
    console.log('[rescoreAllJobs] Already running, skipping.')
    return
  }
  rescoreState.running = true
  rescoreState.lastCount = null
  rescoreState.lastTs = null
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
  rescoreState.running = false
  rescoreState.lastCount = scored
  rescoreState.lastTs = Date.now()
  console.log(`[rescoreAllJobs] Done. ${scored}/${ids.length} rescored.`)
}

async function sendDigestNotification(pool, newIds, userId) {
  if (newIds.length === 0) return
  try {
    const placeholders = newIds.map((_, i) => `$${i + 1}`).join(',')
    const userParam = `$${newIds.length + 1}`
    const { rows } = await pool.query(
      `SELECT j.title, j.company, js.score_aggregate
       FROM jobs j
       LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = ${userParam}
       WHERE j.id IN (${placeholders})
       ORDER BY js.score_aggregate DESC NULLS LAST
       LIMIT 1`,
      [...newIds, userId]
    )
    const topJob = rows[0]
    const scoreStr = topJob?.score_aggregate != null ? ` (${topJob.score_aggregate.toFixed(1)})` : ''
    const topLine = topJob ? `Top: ${topJob.title} at ${topJob.company}${scoreStr}` : ''
    notifier.notify({
      title: `Job Search — ${newIds.length} new job${newIds.length !== 1 ? 's' : ''} today`,
      message: topLine,
      sound: false,
    })
  } catch (err) {
    console.error('[notify] Failed to send notification:', err.message)
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
