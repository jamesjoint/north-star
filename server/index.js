import 'dotenv/config'
import express from 'express'
import { getAllJobs, getJobById, markSeen } from './db.js'

export function createApp(db, pipeline = null) {
  const app = express()
  app.use(express.json())

  app.get('/api/jobs', (req, res) => {
    const jobs = getAllJobs(db)
    res.json(jobs)
  })

  app.get('/api/jobs/:id', (req, res) => {
    const job = getJobById(db, req.params.id)
    if (!job) return res.status(404).json({ error: 'Not found' })
    markSeen(db, req.params.id)
    res.json({ ...job, seen: 1 })
  })

  app.post('/api/refresh', (req, res) => {
    res.status(202).json({ status: 'refresh started' })
    if (pipeline) pipeline(db).catch(err => console.error('Pipeline error:', err))
  })

  return app
}

// Only start the server when run directly (not imported in tests)
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { openDb } = await import('./db.js')
  const { runPipeline } = await import('./scheduler.js')
  const db = openDb()
  const app = createApp(db, runPipeline)
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
}
