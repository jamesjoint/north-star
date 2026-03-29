import cron from 'node-cron'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runAllScrapers } from './scrapers/index.js'
import { scoreJob } from './scorer.js'
import { updateScore, getJobById, getUnscoredIds } from './db.js'

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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ALL_SCRAPERS = [weworkremotely, nyfa, ixda, themuse, backstage, web3career, staffmeup, creatoreconomyjobs, linkedin, jsearch]

function loadProfile() {
  try {
    const raw = readFileSync(path.join(__dirname, 'profile.json'), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    throw new Error('[pipeline] Could not load profile.json: ' + err.message)
  }
}

export async function runPipeline(db) {
  console.log('[pipeline] Starting scrape...')
  const profile = loadProfile()
  const newIds = await runAllScrapers(db, ALL_SCRAPERS)

  // Include any previously-scraped jobs that never got scored (e.g. scorer was broken)
  const backlogIds = getUnscoredIds(db).filter(id => !newIds.includes(id))
  const toScore = [...newIds, ...backlogIds]
  console.log(`[pipeline] ${newIds.length} new, ${backlogIds.length} backlog unscored. Scoring ${toScore.length} total...`)

  let scored = 0
  for (let i = 0; i < toScore.length; i++) {
    const id = toScore[i]
    try {
      const job = getJobById(db, id)
      if (!job) { console.warn(`[scorer] Job ${id} not found in db, skipping`); continue }
      console.log(`[scorer] Scoring job ${i + 1} of ${toScore.length}: ${job.company} - ${job.title}`)
      const result = await scoreJob(job, profile)
      updateScore(db, id, result.aggregate, { ...result.dimensions, summary: result.summary })
      scored++
      console.log(`[scorer] Done ${i + 1}/${toScore.length} — score: ${result.aggregate}`)
      if (i < toScore.length - 1) await sleep(500)
    } catch (err) {
      console.error(`[scorer] FAILED job ${i + 1}/${toScore.length} id=${id}:`, err.message)
      console.error(err.stack)
    }
  }

  console.log(`[pipeline] Done. ${newIds.length} scraped, ${scored}/${toScore.length} scored.`)
  return { scraped: newIds.length, scored }
}

export function startScheduler(db) {
  const cronExpr = process.env.SCRAPE_CRON || '0 8 * * *'
  cron.schedule(cronExpr, () => {
    runPipeline(db).catch(err => console.error('[scheduler] Pipeline error:', err))
  })
  console.log(`[scheduler] Scheduled daily pipeline: ${cronExpr}`)
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
