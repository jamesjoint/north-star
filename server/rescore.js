import { configDotenv } from 'dotenv'
configDotenv({ override: true })

import { openDb } from './db.js'
import { runPipeline } from './scheduler.js'

const db = openDb()
const { changes } = db.prepare('UPDATE jobs SET score_aggregate = NULL, score_dimensions = NULL').run()
console.log(`[rescore] Cleared scores for ${changes} jobs. Starting pipeline...`)
await runPipeline(db)
console.log('[rescore] Complete.')
process.exit(0)
