import { configDotenv } from 'dotenv'
configDotenv({ override: true })

import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { openDb, getUnscoredIds, getJobById, updateScore } from './db.js'
import { scoreJob } from './scorer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const db = openDb()
db.prepare('UPDATE jobs SET score_aggregate = NULL, score_dimensions = NULL').run()

const ids = getUnscoredIds(db)
const profile = JSON.parse(readFileSync(path.join(__dirname, 'profile.json'), 'utf8'))
console.log(`[rescore] Scoring ${ids.length} jobs with updated profile...`)

let scored = 0
for (let i = 0; i < ids.length; i++) {
  const id = ids[i]
  const job = getJobById(db, id)
  if (!job) continue
  try {
    console.log(`[rescore] ${i + 1}/${ids.length}: ${job.company} — ${job.title}`)
    const result = await scoreJob(job, profile)
    updateScore(db, id, result.aggregate, { ...result.dimensions, summary: result.summary })
    scored++
    console.log(`[rescore] ✓ score: ${result.aggregate}`)
    if (i < ids.length - 1) await new Promise(r => setTimeout(r, 400))
  } catch (err) {
    console.error(`[rescore] ✗ FAILED:`, err.message)
  }
}

console.log(`[rescore] Done. ${scored}/${ids.length} scored.`)
process.exit(0)
