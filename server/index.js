import { configDotenv } from 'dotenv'
// override: true ensures .env values win over any ambient env vars (e.g. Claude Code's session key)
configDotenv({ override: true })
import express from 'express'
import { getAllJobs, getJobById, markSeen, markAllSeen, updateJobTracking } from './db.js'

export function createApp(db, pipeline = null) {
  const app = express()
  app.use(express.json())

  app.get('/api/jobs', (req, res) => {
    const jobs = getAllJobs(db)
    markAllSeen(db)
    res.json(jobs)
  })

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJobById(db, req.params.id)
    if (!job) return res.status(404).json({ error: 'Not found' })
    markSeen(db, req.params.id)
    res.json({ ...job, seen: 1 })
  })

  app.patch('/api/jobs/:id', (req, res) => {
    const { status, follow_up_date, notes, applied_date } = req.body
    const updates = {}
    if (status !== undefined) updates.status = status
    if (follow_up_date !== undefined) updates.follow_up_date = follow_up_date
    if (notes !== undefined) updates.notes = notes
    if (applied_date !== undefined) updates.applied_date = applied_date
    // Auto-set applied_date to today when status first becomes Applied
    if (status === 'Applied' && !('applied_date' in updates)) {
      const current = getJobById(db, req.params.id)
      if (current && !current.applied_date) {
        updates.applied_date = new Date().toISOString().slice(0, 10)
      }
    }
    updateJobTracking(db, req.params.id, updates)
    const job = getJobById(db, req.params.id)
    if (!job) return res.status(404).json({ error: 'Not found' })
    res.json(job)
  })

  app.post('/api/refresh', (req, res) => {
    res.status(202).json({ status: 'refresh started' })
    if (pipeline) pipeline(db).catch(err => console.error('Pipeline error:', err))
  })

  return app
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { openDb } = await import('./db.js')
  const { runPipeline, startScheduler } = await import('./scheduler.js')
  const db = openDb()
  const app = createApp(db, runPipeline)
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    startScheduler(db)
  })
}
