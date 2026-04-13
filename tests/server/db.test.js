import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import {
  createPool, makeId, upsertJob, insertManualJob, getAllJobs, getJobById,
  getUnscoredJobs, updateScore, markDeleted, updateJobDescription,
  getOrCreateDefaultBoard, getBoards, createBoard, updateBoard, deleteBoard,
  upsertTrackerEntry, removeTrackerEntry,
  getProfile, upsertProfileWeights, upsertProfileBackground,
  upsertProfilePersonality, upsertProfileDimensions, seedAdminProfile,
  upsertProfileName,
} from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

let pool
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
})
afterAll(() => pool.end())
beforeEach(async () => {
  await pool.query('DELETE FROM job_scores')
  await pool.query('DELETE FROM tracker_entries')
  await pool.query('DELETE FROM boards')
  await pool.query('DELETE FROM jobs')
  await pool.query('DELETE FROM app_invites')
  await pool.query('DELETE FROM verification')
  await pool.query('DELETE FROM account')
  await pool.query('DELETE FROM profiles')
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM "user"')
})

const sample = {
  title: 'Head of Partnerships',
  company: 'Acme',
  location: 'Remote',
  remote: 'remote',
  url: 'https://example.com/job/1',
  source: 'test',
  posted_at: '2026-01-01',
  description: 'Great role',
}

describe('makeId', () => {
  it('returns same hash for same source+url', () => {
    expect(makeId('test', 'https://x.com/1')).toBe(makeId('test', 'https://x.com/1'))
  })
  it('returns different hash for different url', () => {
    expect(makeId('test', 'https://x.com/1')).not.toBe(makeId('test', 'https://x.com/2'))
  })
})

describe('upsertJob', () => {
  it('inserts a job and returns its id', async () => {
    const id = await upsertJob(pool, sample)
    expect(typeof id).toBe('string')
    expect(id.length).toBe(16)
  })

  it('getJobById returns inserted job', async () => {
    const id = await upsertJob(pool, sample)
    const job = await getJobById(pool, id)
    expect(job.title).toBe('Head of Partnerships')
    expect(job.company).toBe('Acme')
  })

  it('does not re-add a deleted job', async () => {
    const id = await upsertJob(pool, sample)
    await markDeleted(pool, id)
    const id2 = await upsertJob(pool, sample)
    expect(id2).toBeNull()
  })

  it('re-upserting updates fields but preserves score_dimensions structure', async () => {
    const id = await upsertJob(pool, sample)
    const userId = 'user_upsert_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'upsert@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    await updateScore(pool, id, userId, 7.5, { core_mechanism: { score: 8, reasoning: 'good' } })
    await upsertJob(pool, { ...sample, title: 'Senior Partnerships Lead' })
    const job = await getJobById(pool, id, userId)
    expect(job.title).toBe('Senior Partnerships Lead')
    expect(job.score_aggregate).toBe(7.5)
  })
})

describe('getAllJobs', () => {
  it('returns empty array when no jobs in db', async () => {
    const jobs = await getAllJobs(pool)
    expect(jobs).toEqual([])
  })

  it('excludes deleted jobs', async () => {
    const id = await upsertJob(pool, sample)
    await markDeleted(pool, id)
    const jobs = await getAllJobs(pool)
    expect(jobs.find(j => j.id === id)).toBeUndefined()
  })

  it('returns jobs sorted by score descending when userId provided', async () => {
    const userId = 'user_sort_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'sort@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id1 = await upsertJob(pool, { ...sample, url: 'https://x.com/1', title: 'Low' })
    const id2 = await upsertJob(pool, { ...sample, url: 'https://x.com/2', title: 'High' })
    await upsertJob(pool, { ...sample, url: 'https://x.com/3', title: 'Unscored' })
    await updateScore(pool, id1, userId, 3.0, {})
    await updateScore(pool, id2, userId, 9.0, {})
    const jobs = await getAllJobs(pool, userId)
    expect(jobs[0].title).toBe('High')
    expect(jobs[1].title).toBe('Low')
    expect(jobs[2].title).toBe('Unscored')
  })
})

describe('getUnscoredJobs', () => {
  it('returns ids of jobs with no score for a user', async () => {
    const userId = 'user_unscored_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'unscored@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id1 = await upsertJob(pool, { ...sample, url: 'https://x.com/1' })
    const id2 = await upsertJob(pool, { ...sample, url: 'https://x.com/2' })
    await updateScore(pool, id1, userId, 7.5, {})
    const unscored = await getUnscoredJobs(pool, userId)
    expect(unscored).toEqual([id2])
  })

  it('returns all non-deleted job ids when no userId', async () => {
    await upsertJob(pool, { ...sample, url: 'https://x.com/1' })
    await upsertJob(pool, { ...sample, url: 'https://x.com/2' })
    const ids = await getUnscoredJobs(pool)
    expect(ids.length).toBe(2)
  })

  it('returns empty array when all jobs are scored for a user', async () => {
    const userId = 'user_allscored_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'allscored@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id1 = await upsertJob(pool, { ...sample, url: 'https://x.com/scored-1' })
    const id2 = await upsertJob(pool, { ...sample, url: 'https://x.com/scored-2' })
    await updateScore(pool, id1, userId, 8.0, {})
    await updateScore(pool, id2, userId, 6.0, {})
    const unscored = await getUnscoredJobs(pool, userId)
    expect(unscored).toEqual([])
  })
})

describe('updateScore', () => {
  it('writes score to job_scores for a given user', async () => {
    const userId = 'user_score_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'score@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id = await upsertJob(pool, sample)
    await updateScore(pool, id, userId, 8.5, { core_mechanism: { score: 9, reasoning: 'great' } })

    const jobWithScore = await getJobById(pool, id, userId)
    expect(jobWithScore.score_aggregate).toBe(8.5)
    expect(jobWithScore.score_dimensions.core_mechanism.score).toBe(9)

    // without userId, score fields are not returned
    const jobRaw = await getJobById(pool, id)
    expect(jobRaw.score_aggregate).toBeUndefined()
  })

  it('re-scoring the same job updates the record (no duplicate rows)', async () => {
    const userId = 'user_rescore_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'rescore@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id = await upsertJob(pool, { ...sample, url: 'https://x.com/rescore' })
    await updateScore(pool, id, userId, 7.0, {})
    await updateScore(pool, id, userId, 9.0, {}) // re-score

    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM job_scores WHERE job_id = $1 AND user_id = $2`,
      [id, userId]
    )
    expect(Number(rows[0].cnt)).toBe(1) // only one row, not two

    const job = await getJobById(pool, id, userId)
    expect(job.score_aggregate).toBe(9.0) // updated value
  })

  it('stores and retrieves coherenceSignal when provided', async () => {
    const userId = 'user_coherence_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'coherence@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id = await upsertJob(pool, { ...sample, url: 'https://x.com/coherence' })
    await updateScore(pool, id, userId, 7.0, { core: { score: 7 } }, 0.9)

    const { rows } = await pool.query(
      `SELECT coherence_signal FROM job_scores WHERE job_id = $1 AND user_id = $2`,
      [id, userId]
    )
    expect(Number(rows[0].coherence_signal)).toBeCloseTo(0.9)
  })

  it('coherenceSignal defaults to null when omitted', async () => {
    const userId = 'user_coherence_null_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'coherencenull@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id = await upsertJob(pool, { ...sample, url: 'https://x.com/coherence-null' })
    await updateScore(pool, id, userId, 5.0, {})

    const { rows } = await pool.query(
      `SELECT coherence_signal FROM job_scores WHERE job_id = $1 AND user_id = $2`,
      [id, userId]
    )
    expect(rows[0].coherence_signal).toBeNull()
  })

  it('re-scoring updates coherenceSignal from null to a value', async () => {
    const userId = 'user_coherence_update_test'
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'coherenceupdate@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
    const id = await upsertJob(pool, { ...sample, url: 'https://x.com/coherence-update' })
    await updateScore(pool, id, userId, 6.0, {})        // no signal
    await updateScore(pool, id, userId, 8.0, {}, 0.75) // now with signal

    const { rows } = await pool.query(
      `SELECT coherence_signal, score_aggregate FROM job_scores WHERE job_id = $1 AND user_id = $2`,
      [id, userId]
    )
    expect(Number(rows[0].coherence_signal)).toBeCloseTo(0.75)
    expect(Number(rows[0].score_aggregate)).toBe(8.0)
  })
})

describe('updateJobDescription', () => {
  it('updates description', async () => {
    const id = await upsertJob(pool, sample)
    await updateJobDescription(pool, id, 'Updated description')
    const job = await getJobById(pool, id)
    expect(job.description).toBe('Updated description')
  })
})

describe('insertManualJob', () => {
  it('creates a new job from manual input', async () => {
    const id = await insertManualJob(pool, {
      title: 'Designer',
      company: 'Studio',
      location: 'Remote',
      url: 'https://example.com/manual',
      description: 'Design work',
    })
    expect(typeof id).toBe('string')
    const job = await getJobById(pool, id)
    expect(job.title).toBe('Designer')
    expect(job.source).toBe('manual')
    expect(job.remote).toBe('remote')
  })

  it('updates description if url already exists', async () => {
    const url = 'https://example.com/existing'
    const id1 = await upsertJob(pool, { ...sample, url, source: 'test' })
    const id2 = await insertManualJob(pool, { title: 'Updated', url, description: 'New desc' })
    expect(id2).toBe(id1)
    const job = await getJobById(pool, id1)
    expect(job.description).toBe('New desc')
  })
})

describe('boards and tracker entries', () => {
  const userId = 'user_board_test'

  beforeEach(async () => {
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'board@example.com', false) ON CONFLICT DO NOTHING`,
      [userId]
    )
  })

  it('getOrCreateDefaultBoard creates a board and returns same id on repeat', async () => {
    const id1 = await getOrCreateDefaultBoard(pool, userId)
    const id2 = await getOrCreateDefaultBoard(pool, userId)
    expect(typeof id1).toBe('string')
    expect(id1).toBe(id2)
  })

  it('getBoards returns boards with job_count', async () => {
    await getOrCreateDefaultBoard(pool, userId)
    const boards = await getBoards(pool, userId)
    expect(boards.length).toBe(1)
    expect(boards[0].name).toBe('Default')
    expect(boards[0].job_count).toBe(0)
  })

  it('createBoard adds a new board', async () => {
    await createBoard(pool, userId, 'Dream Jobs', '⭐')
    const boards = await getBoards(pool, userId)
    expect(boards.some(b => b.name === 'Dream Jobs')).toBe(true)
  })

  it('upsertTrackerEntry creates and updates an entry; getJobById returns status', async () => {
    const boardId = await getOrCreateDefaultBoard(pool, userId)
    const jobId = await upsertJob(pool, sample)
    await upsertTrackerEntry(pool, jobId, userId, boardId, { status: 'Applied' })
    const job = await getJobById(pool, jobId, userId)
    expect(job.status).toBe('Applied')
    expect(job.board_id).toBe(boardId)
    // Update notes
    await upsertTrackerEntry(pool, jobId, userId, boardId, { notes: 'Great role' })
    const updated = await getJobById(pool, jobId, userId)
    expect(updated.notes).toBe('Great role')
    expect(updated.status).toBe('Applied') // preserved
  })

  it('upsertTrackerEntry persists and updates direct_link', async () => {
    const boardId = await getOrCreateDefaultBoard(pool, userId)
    const jobId = await upsertJob(pool, { ...sample, url: 'https://x.com/directlink-test' })

    // Set direct_link on initial upsert
    await upsertTrackerEntry(pool, jobId, userId, boardId, {
      status: 'Applied',
      direct_link: 'https://linkedin.com/jobs/123',
    })
    const job = await getJobById(pool, jobId, userId)
    expect(job.direct_link).toBe('https://linkedin.com/jobs/123')
    expect(job.status).toBe('Applied')

    // Update direct_link without touching status
    await upsertTrackerEntry(pool, jobId, userId, boardId, {
      direct_link: 'https://greenhouse.io/jobs/456',
    })
    const updated = await getJobById(pool, jobId, userId)
    expect(updated.direct_link).toBe('https://greenhouse.io/jobs/456')
    expect(updated.status).toBe('Applied') // preserved

    // Clear direct_link
    await upsertTrackerEntry(pool, jobId, userId, boardId, { direct_link: null })
    const cleared = await getJobById(pool, jobId, userId)
    expect(cleared.direct_link).toBeNull()
  })

  it('getAllJobs includes status from tracker_entries', async () => {
    const boardId = await getOrCreateDefaultBoard(pool, userId)
    const jobId = await upsertJob(pool, { ...sample, url: 'https://x.com/board-test' })
    await upsertTrackerEntry(pool, jobId, userId, boardId, { status: 'Interviewing' })
    const jobs = await getAllJobs(pool, userId)
    const found = jobs.find(j => j.id === jobId)
    expect(found?.status).toBe('Interviewing')
  })

  it('removeTrackerEntry clears the entry', async () => {
    const boardId = await getOrCreateDefaultBoard(pool, userId)
    const jobId = await upsertJob(pool, { ...sample, url: 'https://x.com/remove-test' })
    await upsertTrackerEntry(pool, jobId, userId, boardId, { status: 'Saved' })
    await removeTrackerEntry(pool, jobId, userId)
    const job = await getJobById(pool, jobId, userId)
    expect(job.status).toBeNull()
  })

  it('updateBoard renames a board and sets emoji', async () => {
    const boardId = await createBoard(pool, userId, 'Old Name')
    await updateBoard(pool, boardId, userId, { name: 'New Name', emoji: '🚀' })
    const boards = await getBoards(pool, userId)
    const board = boards.find(b => b.id === boardId)
    expect(board.name).toBe('New Name')
    expect(board.emoji).toBe('🚀')
  })

  it('updateBoard ignores update for wrong userId', async () => {
    const boardId = await createBoard(pool, userId, 'Mine')
    await updateBoard(pool, boardId, 'other-user', { name: 'Hijacked' })
    const boards = await getBoards(pool, userId)
    const board = boards.find(b => b.id === boardId)
    expect(board.name).toBe('Mine') // unchanged
  })

  it('deleteBoard removes a board when another exists', async () => {
    const b1 = await createBoard(pool, userId, 'Board A')
    const b2 = await createBoard(pool, userId, 'Board B')
    await deleteBoard(pool, b1, userId)
    const boards = await getBoards(pool, userId)
    expect(boards.find(b => b.id === b1)).toBeUndefined()
    expect(boards.find(b => b.id === b2)).toBeTruthy()
  })

  it('deleteBoard throws when only one board remains', async () => {
    const boardId = await getOrCreateDefaultBoard(pool, userId)
    await expect(deleteBoard(pool, boardId, userId)).rejects.toThrow('Cannot delete your only board')
  })

  it('upsertTrackerEntry preserves board_id when updating notes without board_id', async () => {
    const b1Id = await createBoard(pool, userId, 'Board A')
    const b2Id = await createBoard(pool, userId, 'Board B')
    const jobId = await upsertJob(pool, { ...sample, url: 'https://x.com/board-preserve' })

    // Place in Board A
    await upsertTrackerEntry(pool, jobId, userId, b1Id, { status: 'Saved', board_id: b1Id })
    const before = await getJobById(pool, jobId, userId)
    expect(before.board_id).toBe(b1Id)

    // Update only notes — board_id not in updates, so board should not change
    await upsertTrackerEntry(pool, jobId, userId, b2Id, { notes: 'Keep this job' })
    const after = await getJobById(pool, jobId, userId)
    // board_id was NOT in updates, so ON CONFLICT should not change it
    expect(after.notes).toBe('Keep this job')
    expect(after.board_id).toBe(b1Id) // preserved
  })
})

describe('user isolation — scores are per-user', () => {
  it('user B does not see user A score for the same job', async () => {
    const userA = 'user_iso_a'
    const userB = 'user_iso_b'
    await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1,'','a@iso.test',false) ON CONFLICT DO NOTHING`, [userA])
    await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1,'','b@iso.test',false) ON CONFLICT DO NOTHING`, [userB])

    const jobId = await upsertJob(pool, { ...sample, url: 'https://iso.test/1' })
    await updateScore(pool, jobId, userA, 9.5, {})

    // User A sees their score
    const forA = await getJobById(pool, jobId, userA)
    expect(forA.score_aggregate).toBe(9.5)

    // User B sees null (their own score doesn't exist yet)
    const forB = await getJobById(pool, jobId, userB)
    expect(forB.score_aggregate).toBeNull()
  })

  it('tracker entries are per-user', async () => {
    const userA = 'user_tracker_a'
    const userB = 'user_tracker_b'
    await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1,'','ta@iso.test',false) ON CONFLICT DO NOTHING`, [userA])
    await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1,'','tb@iso.test',false) ON CONFLICT DO NOTHING`, [userB])

    const jobId = await upsertJob(pool, { ...sample, url: 'https://iso.test/2' })
    const boardA = await getOrCreateDefaultBoard(pool, userA)
    await upsertTrackerEntry(pool, jobId, userA, boardA, { status: 'Applied' })

    // User A sees Applied status
    const forA = await getJobById(pool, jobId, userA)
    expect(forA.status).toBe('Applied')

    // User B sees no status
    const forB = await getJobById(pool, jobId, userB)
    expect(forB.status).toBeNull()
  })
})

describe('profiles', () => {
  const userId = 'user_profile_test'

  beforeEach(async () => {
    await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'profile@example.com', false) ON CONFLICT DO NOTHING`, [userId])
    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [userId])
  })

  it('getProfile returns null when no profile exists', async () => {
    const profile = await getProfile(pool, userId)
    expect(profile).toBeNull()
  })

  it('upsertProfileBackground creates a profile with onboarding_done=true', async () => {
    await upsertProfileBackground(pool, userId, 'Product leader with 10 years experience')
    const profile = await getProfile(pool, userId)
    expect(profile.background).toBe('Product leader with 10 years experience')
    expect(profile.onboarding_done).toBe(true)
  })

  it('upsertProfileBackground updates background on repeat calls', async () => {
    await upsertProfileBackground(pool, userId, 'First background')
    await upsertProfileBackground(pool, userId, 'Updated background')
    const profile = await getProfile(pool, userId)
    expect(profile.background).toBe('Updated background')
  })

  it('upsertProfileWeights stores and retrieves weights as JSON', async () => {
    const weights = { leadership: 1.5, technical: 0.8 }
    await upsertProfileWeights(pool, userId, weights)
    const profile = await getProfile(pool, userId)
    expect(profile.weights).toEqual(weights)
  })

  it('upsertProfilePersonality stores personality JSON', async () => {
    const personality = { tone: 'direct', style: 'analytical' }
    await upsertProfilePersonality(pool, userId, personality)
    const profile = await getProfile(pool, userId)
    expect(profile.personality).toEqual(personality)
  })

  it('upsertProfileDimensions stores dimensions JSON', async () => {
    const dimensions = {
      leadership: { label: 'Leadership', description: 'Leads teams', weight: 1.5 },
      impact: { label: 'Impact', description: 'Drives outcomes', weight: 1.0 },
    }
    await upsertProfileDimensions(pool, userId, dimensions)
    const profile = await getProfile(pool, userId)
    expect(profile.dimensions.leadership.label).toBe('Leadership')
    expect(profile.dimensions.impact.weight).toBe(1.0)
  })

  it('seedAdminProfile creates profile with background and weights', async () => {
    const adminId = 'admin_seed_test'
    await pool.query(`INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Admin', 'admin@seed.test', false) ON CONFLICT DO NOTHING`, [adminId])
    await pool.query(`DELETE FROM profiles WHERE user_id = $1`, [adminId])
    await seedAdminProfile(pool, adminId, { background: 'Admin background', weights: { fit: 2.0 } })
    const profile = await getProfile(pool, adminId)
    expect(profile.background).toBe('Admin background')
    expect(profile.weights.fit).toBe(2.0)
    expect(profile.onboarding_done).toBe(true)
  })

  it('seedAdminProfile does not overwrite an existing profile', async () => {
    await upsertProfileBackground(pool, userId, 'Original background')
    await seedAdminProfile(pool, userId, { background: 'Should not overwrite', weights: {} })
    const profile = await getProfile(pool, userId)
    expect(profile.background).toBe('Original background')
  })

  test('upsertProfileName saves and retrieves first_name and last_name', async () => {
    await upsertProfileName(pool, userId, 'Ada', 'Lovelace')
    const profile = await getProfile(pool, userId)
    expect(profile.first_name).toBe('Ada')
    expect(profile.last_name).toBe('Lovelace')
  })

  test('upsertProfileName allows null last_name', async () => {
    await upsertProfileName(pool, userId, 'Ada', null)
    const profile = await getProfile(pool, userId)
    expect(profile.first_name).toBe('Ada')
    expect(profile.last_name).toBeNull()
  })
})
