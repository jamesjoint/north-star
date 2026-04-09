import { configDotenv } from 'dotenv'
// override: true ensures .env values win over any ambient env vars (e.g. Claude Code's session key)
configDotenv({ override: true })
import express from 'express'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth.js'
import { requireAuth } from './middleware/requireAuth.js'
import authRoutes from './routes/auth.js'
import inviteRoutes, { publicInviteRouter } from './routes/invites.js'
import adminRoutes from './routes/admin.js'
import {
  getAllJobs, getJobById, insertManualJob, updateJobDescription,
  markDeleted, updateTrackerEntry
} from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROFILE_PATH = path.join(__dirname, 'profile.json')

export function createApp(pool, pipeline = null) {
  const app = express()
  app.use(express.json())

  // Attach pool to every request so routes can access it
  app.use((req, _res, next) => { req.pool = pool; next() })

  // Health check — always reachable, no auth
  app.get('/api/health', (_req, res) => res.json({ ok: true }))

  // Custom auth routes (signup, /me) — must come BEFORE better-auth catch-all
  app.use('/api/auth', authRoutes)

  // better-auth handles all remaining /api/auth/* (magic link, session, sign-out)
  app.all('/api/auth/*splat', toNodeHandler(auth))

  // Public invite routes (redeem) — before requireAuth
  app.use('/api/invites', publicInviteRouter)

  // All remaining /api/* routes require a valid session
  app.use('/api', requireAuth)

  app.use('/api/invites', inviteRoutes)
  app.use('/api/admin', adminRoutes)

  app.get('/api/jobs', async (req, res) => {
    const userId = req.user?.id
    const jobs = await getAllJobs(pool, userId)
    const now = Date.now()
    const result = jobs.map(job => {
      if (!job.score_aggregate) return job
      const dateStr = job.posted_at || (job.fetched_at && new Date(job.fetched_at).toISOString().slice(0, 10))
      if (!dateStr) return job
      const ageDays = (now - new Date(dateStr).getTime()) / 86_400_000
      if (ageDays > 30) {
        return { ...job, score_aggregate: Math.max(1, +(job.score_aggregate - 2).toFixed(2)) }
      }
      return job
    })
    result.sort((a, b) => (b.score_aggregate ?? -1) - (a.score_aggregate ?? -1))
    res.json(result)
  })

  app.get('/api/jobs/:id', async (req, res) => {
    const userId = req.user?.id
    const job = await getJobById(pool, req.params.id, userId)
    if (!job) return res.status(404).json({ error: 'Not found' })
    res.json(job)
  })

  app.patch('/api/jobs/:id', async (req, res) => {
    const userId = req.user?.id
    const { status, follow_up_date, notes, applied_date } = req.body
    const updates = {}
    if (status !== undefined) updates.status = status
    if (follow_up_date !== undefined) updates.follow_up_date = follow_up_date
    if (notes !== undefined) updates.notes = notes
    if (applied_date !== undefined) updates.applied_date = applied_date
    if (status === 'Applied' && !('applied_date' in updates)) {
      const current = await getJobById(pool, req.params.id)
      if (current && !current.applied_date) {
        updates.applied_date = new Date().toISOString().slice(0, 10)
      }
    }
    await updateTrackerEntry(pool, req.params.id, userId, updates)
    const job = await getJobById(pool, req.params.id, userId)
    if (!job) return res.status(404).json({ error: 'Not found' })
    res.json(job)
  })

  app.post('/api/jobs', async (req, res) => {
    const { title, company, location, url, description } = req.body
    if (!title || !url) return res.status(400).json({ error: 'title and url are required' })
    const id = await insertManualJob(pool, { title, company, location, url, description })
    const job = await getJobById(pool, id, req.user?.id)
    res.status(201).json(job)
    import('./scheduler.js')
      .then(({ scoreOneJob }) => scoreOneJob(pool, id, req.user.id))
      .catch(err => console.error('[POST /api/jobs] scoring failed:', err.message))
  })

  app.patch('/api/jobs/:id/description', async (req, res) => {
    const { description } = req.body
    if (typeof description !== 'string') return res.status(400).json({ error: 'description required' })
    await updateJobDescription(pool, req.params.id, description)
    res.json({ ok: true })
    import('./scheduler.js')
      .then(({ scoreOneJob }) => scoreOneJob(pool, req.params.id, req.user.id))
      .catch(err => console.error('[PATCH description] scoring failed:', err.message))
  })

  app.delete('/api/jobs/:id', async (req, res) => {
    await markDeleted(pool, req.params.id)
    res.status(204).end()
  })

  app.get('/api/rescore-status', async (_req, res) => {
    try {
      const { getRescoreStatus } = await import('./scheduler.js')
      res.json(getRescoreStatus())
    } catch (err) {
      res.status(500).json({ error: 'Could not get rescore status' })
    }
  })

  app.post('/api/refresh', (req, res) => {
    res.status(202).json({ status: 'refresh started' })
    if (pipeline) pipeline(pool).catch(err => console.error('Pipeline error:', err))
  })

  app.get('/api/profile', (req, res) => {
    try {
      const profile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
      res.json({ weights: profile.weights })
    } catch (err) {
      console.error('[GET /api/profile] Failed:', err.message)
      res.status(500).json({ error: 'Could not read profile' })
    }
  })

  app.patch('/api/profile/weights', async (req, res) => {
    const { weights } = req.body
    const VALID_WEIGHT_KEYS = ['core_mechanism','gap_bridgeability','bd_track_record','product_depth','regulated_complexity','mba_preference','domain_gap']
    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({ error: 'weights object required' })
    }
    for (const [key, val] of Object.entries(weights)) {
      if (!VALID_WEIGHT_KEYS.includes(key)) {
        return res.status(400).json({ error: `unknown weight key: ${key}` })
      }
      if (typeof val !== 'number' || !isFinite(val) || val < 0) {
        return res.status(400).json({ error: `weight ${key} must be a non-negative finite number` })
      }
    }
    try {
      const profile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
      profile.weights = { ...profile.weights, ...weights }
      writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2))
      res.json({ ok: true })
      import('./scheduler.js')
        .then(({ rescoreAllJobs }) => rescoreAllJobs(pool, req.user.id))
        .catch(err => console.error('[PATCH /api/profile/weights] rescore failed:', err.message))
    } catch (err) {
      console.error('[PATCH /api/profile/weights] Failed:', err.message)
      res.status(500).json({ error: 'Could not update profile' })
    }
  })

  // Serve Vite build in production
  const distPath = path.join(__dirname, '../dist')
  if (existsSync(distPath)) {
    app.use(express.static(distPath))
    app.get('*splat', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
  }

  return app
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { createPool } = await import('./db.js')
  const { runPipeline, startScheduler } = await import('./scheduler.js')
  const pool = createPool()
  const app = createApp(pool, runPipeline)
  const PORT = process.env.PORT || 3001
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
    startScheduler(pool)
  })
}
