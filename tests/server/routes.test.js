import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { openDb, upsertJob } from '../../server/db.js'

// We'll import createApp from server/index.js (not the running server)
let createApp, db

beforeEach(async () => {
  const mod = await import('../../server/index.js?t=' + Date.now())
  createApp = mod.createApp
  db = openDb(':memory:')
})
afterEach(() => { db.close() })

const SAMPLE_JOB = {
  title: 'Product Manager', company: 'Acme', location: 'NYC',
  remote: 'hybrid', url: 'https://x.com/1', source: 'test',
  posted_at: '2026-03-28', description: 'Great role'
}

describe('GET /api/jobs', () => {
  test('returns empty array when no jobs', async () => {
    const app = createApp(db)
    const res = await request(app).get('/api/jobs')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('returns jobs as array', async () => {
    upsertJob(db, SAMPLE_JOB)
    const app = createApp(db)
    const res = await request(app).get('/api/jobs')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].title).toBe('Product Manager')
  })
})

describe('GET /api/jobs/:id', () => {
  test('returns 404 for unknown id', async () => {
    const app = createApp(db)
    const res = await request(app).get('/api/jobs/unknownid')
    expect(res.status).toBe(404)
  })

  test('returns job and marks it seen', async () => {
    const id = upsertJob(db, SAMPLE_JOB)
    const app = createApp(db)
    const res = await request(app).get(`/api/jobs/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Product Manager')
    expect(res.body.seen).toBe(1)
  })
})

describe('POST /api/refresh', () => {
  test('returns 202 and triggers pipeline', async () => {
    const mockPipeline = vi.fn().mockResolvedValue({ scraped: 0, scored: 0 })
    const app = createApp(db, mockPipeline)
    const res = await request(app).post('/api/refresh')
    expect(res.status).toBe(202)
    expect(mockPipeline).toHaveBeenCalledOnce()
  })
})
