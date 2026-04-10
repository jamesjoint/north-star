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
import { applyAgePenalty } from './jobUtils.js'
import {
  getAllJobs, getJobById, insertManualJob, updateJobDescription,
  markDeleted, upsertTrackerEntry, removeTrackerEntry,
  getBoards, createBoard, updateBoard, deleteBoard, getOrCreateDefaultBoard,
  getProfile, upsertProfileWeights, upsertProfileBackground, upsertProfilePersonality,
  upsertProfileDimensions, seedAdminProfile,
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
    const result = jobs.map(job => applyAgePenalty(job, now))
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
    const { status, follow_up_date, notes, applied_date, board_id, salary_range } = req.body
    const updates = {}
    if (status !== undefined) updates.status = status
    if (follow_up_date !== undefined) updates.follow_up_date = follow_up_date
    if (notes !== undefined) updates.notes = notes
    if (applied_date !== undefined) updates.applied_date = applied_date
    if (board_id !== undefined) updates.board_id = board_id
    if (salary_range !== undefined) updates.salary_range = salary_range

    // Auto-set applied_date when status changes to Applied
    if (status === 'Applied' && !('applied_date' in updates)) {
      const current = await getJobById(pool, req.params.id, userId)
      if (current && !current.applied_date) {
        updates.applied_date = new Date().toISOString().slice(0, 10)
      }
    }

    // status=none means remove from tracker entirely
    if (status === 'none') {
      await removeTrackerEntry(pool, req.params.id, userId)
    } else {
      const boardId = board_id || await getOrCreateDefaultBoard(pool, userId)
      await upsertTrackerEntry(pool, req.params.id, userId, boardId, updates)
    }

    const job = await getJobById(pool, req.params.id, userId)
    if (!job) return res.status(404).json({ error: 'Not found' })
    res.json(job)
  })

  app.post('/api/jobs', async (req, res) => {
    const { title, company, location, url, description, status } = req.body
    if (!title || !url) return res.status(400).json({ error: 'title and url are required' })
    const id = await insertManualJob(pool, { title, company, location, url, description })
    // If a status was provided (e.g. from Tracker's Add Job form), create the tracker entry now
    if (status && status !== 'none') {
      const boardId = await getOrCreateDefaultBoard(pool, req.user.id)
      await upsertTrackerEntry(pool, id, req.user.id, boardId, { status })
    }
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

  // ── Boards ──────────────────────────────────────────────────────────────────

  app.get('/api/boards', async (req, res) => {
    const boards = await getBoards(pool, req.user.id)
    res.json(boards)
  })

  app.post('/api/boards', async (req, res) => {
    const { name, emoji } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'name required' })
    const id = await createBoard(pool, req.user.id, name, emoji || null)
    const boards = await getBoards(pool, req.user.id)
    res.status(201).json(boards.find(b => b.id === id))
  })

  app.patch('/api/boards/:id', async (req, res) => {
    const { name, emoji } = req.body
    await updateBoard(pool, req.params.id, req.user.id, { name, emoji })
    res.json({ ok: true })
  })

  app.delete('/api/boards/:id', async (req, res) => {
    try {
      await deleteBoard(pool, req.params.id, req.user.id)
      res.status(204).end()
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })

  app.get('/api/rescore-status', async (req, res) => {
    try {
      const { getRescoreStatus } = await import('./scheduler.js')
      res.json(getRescoreStatus(req.user?.id))
    } catch (err) {
      res.status(500).json({ error: 'Could not get rescore status' })
    }
  })

  app.post('/api/refresh', (req, res) => {
    res.status(202).json({ status: 'refresh started' })
    if (pipeline) pipeline(pool).catch(err => console.error('Pipeline error:', err))
  })

  app.get('/api/profile', async (req, res) => {
    const dbProfile = await getProfile(pool, req.user.id)
    if (dbProfile) {
      return res.json({
        weights: dbProfile.weights || {},
        background: dbProfile.background,
        onboarding_done: dbProfile.onboarding_done,
        dimensions: dbProfile.dimensions || null,
        personality: dbProfile.personality || null,
      })
    }
    // Admin only: fall back to profile.json if DB profile not seeded yet
    if (req.user.role === 'admin') {
      try {
        const fileProfile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
        return res.json({ weights: fileProfile.weights, background: fileProfile.background, onboarding_done: false, dimensions: null })
      } catch { /* fall through */ }
    }
    // New user with no profile yet — send them through onboarding
    res.json({ weights: {}, background: '', onboarding_done: false, dimensions: null, personality: null })
  })

  app.patch('/api/profile/weights', async (req, res) => {
    const { weights } = req.body
    const DEFAULT_WEIGHT_KEYS = ['core_mechanism','gap_bridgeability','bd_track_record','product_depth','regulated_complexity','mba_preference','domain_gap']
    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({ error: 'weights object required' })
    }
    // Accept default keys + any custom dimension keys from the user's profile
    const userProfile = await getProfile(pool, req.user.id)
    const customDimKeys = userProfile?.dimensions ? Object.keys(userProfile.dimensions) : []
    const validKeys = new Set([...DEFAULT_WEIGHT_KEYS, ...customDimKeys])
    for (const [key, val] of Object.entries(weights)) {
      if (!validKeys.has(key)) {
        return res.status(400).json({ error: `unknown weight key: ${key}` })
      }
      if (typeof val !== 'number' || !isFinite(val) || val < 0) {
        return res.status(400).json({ error: `weight ${key} must be a non-negative finite number` })
      }
    }
    // Merge with existing weights so partial updates work
    const existing = await getProfile(pool, req.user.id)
    const merged = { ...(existing?.weights || {}), ...weights }
    await upsertProfileWeights(pool, req.user.id, merged)
    res.json({ ok: true })
    import('./scheduler.js')
      .then(({ rescoreAllJobs }) => rescoreAllJobs(pool, req.user.id))
      .catch(err => console.error('[PATCH /api/profile/weights] rescore failed:', err.message))
  })

  app.patch('/api/profile/personality', async (req, res) => {
    const { personality } = req.body
    if (!personality || typeof personality !== 'object') {
      return res.status(400).json({ error: 'personality object required' })
    }
    await upsertProfilePersonality(pool, req.user.id, personality)
    res.json({ ok: true })
    import('./scheduler.js')
      .then(({ rescoreAllJobs }) => rescoreAllJobs(pool, req.user.id))
      .catch(err => console.error('[PATCH /api/profile/personality] rescore failed:', err.message))
  })

  app.patch('/api/profile/dimensions', async (req, res) => {
    const { dimensions } = req.body
    if (!dimensions || typeof dimensions !== 'object') {
      return res.status(400).json({ error: 'dimensions object required' })
    }
    // Validate each value has at least a label field
    for (const [key, val] of Object.entries(dimensions)) {
      if (typeof val !== 'object' || !val.label) {
        return res.status(400).json({ error: `dimension "${key}" must have a label` })
      }
    }
    await upsertProfileDimensions(pool, req.user.id, dimensions)
    res.json({ ok: true })
    // Rescore with updated dimension descriptions
    import('./scheduler.js')
      .then(({ rescoreAllJobs }) => rescoreAllJobs(pool, req.user.id))
      .catch(err => console.error('[PATCH /api/profile/dimensions] rescore failed:', err.message))
  })

  app.post('/api/profile/dimensions/regenerate', async (req, res) => {
    const dbProfile = await getProfile(pool, req.user.id)
    if (!dbProfile?.background) {
      return res.status(400).json({ error: 'No background set — complete onboarding first' })
    }
    res.json({ ok: true })
    import('./scheduler.js').then(({ generateAndSaveDimensions, rescoreAllJobs }) => {
      generateAndSaveDimensions(pool, req.user.id, dbProfile.background)
        .then(() => rescoreAllJobs(pool, req.user.id))
        .catch(err => console.error('[POST /api/profile/dimensions/regenerate] failed:', err.message))
    }).catch(err => console.error('[POST /api/profile/dimensions/regenerate] import failed:', err.message))
  })

  app.patch('/api/profile/background', async (req, res) => {
    const { background } = req.body
    if (typeof background !== 'string' || !background.trim()) {
      return res.status(400).json({ error: 'background string required' })
    }
    const bg = background.trim()
    await upsertProfileBackground(pool, req.user.id, bg)
    res.json({ ok: true })
    // Generate personalised dimensions, then rescore — both fire-and-forget
    import('./scheduler.js').then(({ generateAndSaveDimensions, rescoreAllJobs }) => {
      generateAndSaveDimensions(pool, req.user.id, bg)
        .then(() => rescoreAllJobs(pool, req.user.id))
        .catch(err => console.error('[PATCH /api/profile/background] post-save jobs failed:', err.message))
    }).catch(err => console.error('[PATCH /api/profile/background] import failed:', err.message))
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
  app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`)
    startScheduler(pool)
    // Seed admin's DB profile from profile.json on first run
    try {
      const { rows } = await pool.query(`SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`)
      if (rows[0]) {
        const fileProfile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
        await seedAdminProfile(pool, rows[0].id, fileProfile)
        console.log('[startup] Admin profile seeded from profile.json')
      }
    } catch (err) {
      console.warn('[startup] Could not seed admin profile:', err.message)
    }
  })
}
