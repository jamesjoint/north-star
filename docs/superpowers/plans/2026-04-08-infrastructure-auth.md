# Infrastructure & Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the app from a single-user local SQLite tool into a cloud-ready multi-user Express app with PostgreSQL, magic link auth, self-signup waitlist, invite bypass, and an admin panel.

**Architecture:** Replace `better-sqlite3` with `pg` (all DB calls become async). Add `better-auth` for magic link auth — it manages its own `user`/`session`/`verification` tables, extended with `role` and `status` fields. All existing `/api/*` routes require a valid session. A React `AuthGate` wraps the app and shows a login page to unauthenticated users.

**Tech Stack:** `pg` (PostgreSQL), `better-auth` + magic link plugin, `resend` (email), `vitest` + `supertest` (already installed)

**Note:** This is Plan 1 of 3. Plans 2 and 3 (onboarding wizard + per-user scoring, tracker boards + UI shell) depend on this plan being complete.

---

## File Map

**New files:**
- `server/db/schema.sql` — full PostgreSQL schema (auth tables + custom tables)
- `server/db/migrate.js` — one-time migration from SQLite → PostgreSQL
- `server/auth.js` — better-auth instance + `fromNodeHeaders` helper export
- `server/email.js` — Resend wrapper (sendMagicLink, sendWaitlistConfirmation, sendApprovalEmail)
- `server/middleware/requireAuth.js` — attaches `req.user`, 401 if no session, 403 if pending
- `server/middleware/requireAdmin.js` — 403 if `req.user.role !== 'admin'`
- `server/routes/auth.js` — self-signup (POST /api/auth/signup) + POST /api/auth/me
- `server/routes/invites.js` — admin invite CRUD + public POST /api/invites/:code/redeem
- `server/routes/admin.js` — waitlist + user management
- `src/hooks/useAuth.js` — React hook: `{ user, loading, logout }`
- `src/components/LoginPage.jsx` — email input → "check your inbox" / waitlist confirmation
- `src/components/AuthGate.jsx` — wraps app, shows LoginPage if unauthenticated
- `tests/server/auth.test.js`
- `tests/server/invites.test.js`
- `tests/server/admin.test.js`
- `.env.example`
- `railway.toml`

**Modified files:**
- `package.json` — add `pg`, `better-auth`, `resend`; remove `better-sqlite3`
- `server/db.js` — complete rewrite for PostgreSQL (async, `$1` params)
- `server/index.js` — all route handlers become async; mount auth/invite/admin routes; add session middleware
- `server/scorer.js` — all DB calls become async/await
- `server/scheduler.js` — all DB calls become async/await
- `server/scrapers/index.js` — update upsertJob calls to await
- `src/App.jsx` — wrap in `<AuthGate>`
- `src/api.js` — add `credentials: 'include'` to all fetch calls

---

## Task 1: Install dependencies + configure environment

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: Install new packages, remove SQLite**

```bash
npm install pg better-auth resend
npm uninstall better-sqlite3
```

- [ ] **Step 2: Create `.env.example`**

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/jobsearch
DATABASE_URL_TEST=postgresql://user:password@localhost:5432/jobsearch_test

# Auth
BETTER_AUTH_SECRET=<generate with: openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3001

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM=noreply@yourdomain.com

# Existing
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

- [ ] **Step 3: Copy `.env.example` to `.env` and fill in values for local dev**

```bash
cp .env.example .env
# Edit .env with your local PostgreSQL credentials and a real Resend key
```

- [ ] **Step 4: Verify PostgreSQL is running and create the test database**

```bash
createdb jobsearch
createdb jobsearch_test
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add pg, better-auth, resend dependencies"
```

---

## Task 2: PostgreSQL schema

**Files:**
- Create: `server/db/schema.sql`

- [ ] **Step 1: Create the schema file**

```sql
-- server/db/schema.sql

-- better-auth tables (camelCase columns are better-auth's convention)
CREATE TABLE IF NOT EXISTS "user" (
  "id"            text        NOT NULL PRIMARY KEY,
  "name"          text        NOT NULL DEFAULT '',
  "email"         text        NOT NULL UNIQUE,
  "emailVerified" boolean     NOT NULL DEFAULT false,
  "image"         text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  "role"          text        NOT NULL DEFAULT 'user',
  "status"        text        NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          text        NOT NULL PRIMARY KEY,
  "expiresAt"   timestamptz NOT NULL,
  "token"       text        NOT NULL UNIQUE,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "ipAddress"   text,
  "userAgent"   text,
  "userId"      text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                     text        NOT NULL PRIMARY KEY,
  "accountId"              text        NOT NULL,
  "providerId"             text        NOT NULL,
  "userId"                 text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"            text,
  "refreshToken"           text,
  "idToken"                text,
  "accessTokenExpiresAt"   timestamptz,
  "refreshTokenExpiresAt"  timestamptz,
  "scope"                  text,
  "password"               text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedAt"              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         text        NOT NULL PRIMARY KEY,
  "identifier" text        NOT NULL,
  "value"      text        NOT NULL,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- Custom app tables
CREATE TABLE IF NOT EXISTS jobs (
  id          text        NOT NULL PRIMARY KEY,
  title       text        NOT NULL,
  company     text,
  location    text,
  remote      text        NOT NULL DEFAULT 'unknown',
  url         text        NOT NULL,
  source      text        NOT NULL,
  posted_at   text,
  description text,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  deleted     boolean     NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_scores (
  job_id            text    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id           text    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  score_aggregate   real,
  score_dimensions  jsonb,
  coherence_signal  real,
  scored_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, user_id)
);

CREATE TABLE IF NOT EXISTS boards (
  id         text        NOT NULL PRIMARY KEY,
  user_id    text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  name       text        NOT NULL,
  emoji      text,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracker_entries (
  id             text        NOT NULL PRIMARY KEY,
  board_id       text        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id        text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  job_id         text        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'saved',
  notes          text,
  follow_up_date date,
  applied_date   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_invites (
  code              text        NOT NULL PRIMARY KEY,
  created_by        text        NOT NULL REFERENCES "user"("id"),
  used_by           text        REFERENCES "user"("id"),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Run the schema against both databases**

```bash
psql $DATABASE_URL -f server/db/schema.sql
psql $DATABASE_URL_TEST -f server/db/schema.sql
```

Expected: each table created with no errors.

- [ ] **Step 3: Commit**

```bash
git add server/db/schema.sql
git commit -m "feat: add postgresql schema"
```

---

## Task 3: Rewrite `server/db.js` for PostgreSQL

**Files:**
- Modify: `server/db.js`
- Create: `tests/server/db.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/server/db.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import {
  createPool, makeId, upsertJob, getAllJobs, getJobById,
  getUnscoredJobs, updateScore, markDeleted
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
  await pool.query('DELETE FROM jobs')
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

it('upserts a job and retrieves it', async () => {
  const id = await upsertJob(pool, sample)
  expect(id).toBeTruthy()
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

it('getAllJobs excludes deleted', async () => {
  const id = await upsertJob(pool, sample)
  await markDeleted(pool, id)
  const jobs = await getAllJobs(pool)
  expect(jobs.find(j => j.id === id)).toBeUndefined()
})

it('getUnscoredJobs returns jobs with no score', async () => {
  await upsertJob(pool, sample)
  const unscored = await getUnscoredJobs(pool)
  expect(unscored.length).toBe(1)
})

it('updateScore writes score to job_scores for a given user', async () => {
  // insert a minimal user row for FK
  const userId = 'user_test_1'
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified") VALUES ($1, 'Test', 'test@example.com', false) ON CONFLICT DO NOTHING`,
    [userId]
  )
  const id = await upsertJob(pool, sample)
  await updateScore(pool, id, userId, 8.5, { core_mechanism: 9 })
  const job = await getJobById(pool, id)
  // getJobById without userId returns raw job — no score
  expect(job.score_aggregate).toBeUndefined()
  // getJobById with userId joins job_scores
  const jobWithScore = await getJobById(pool, id, userId)
  expect(jobWithScore.score_aggregate).toBe(8.5)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/db.test.js
```

Expected: FAIL — `createPool` not exported from `server/db.js`

- [ ] **Step 3: Rewrite `server/db.js`**

```js
// server/db.js
import pg from 'pg'
import crypto from 'crypto'

const { Pool } = pg

export function createPool(connectionString = process.env.DATABASE_URL) {
  return new Pool({ connectionString })
}

export function makeId(source, url) {
  return crypto.createHash('sha256').update(source + url).digest('hex').slice(0, 16)
}

export async function upsertJob(pool, job) {
  const id = makeId(job.source, job.url)
  const { rows: existing } = await pool.query(
    'SELECT deleted FROM jobs WHERE id = $1', [id]
  )
  if (existing[0]?.deleted) return null
  await pool.query(`
    INSERT INTO jobs (id, title, company, location, remote, url, source, posted_at, description, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      company = EXCLUDED.company,
      location = EXCLUDED.location,
      remote = EXCLUDED.remote,
      posted_at = EXCLUDED.posted_at,
      description = EXCLUDED.description,
      fetched_at = now()
  `, [id, job.title, job.company, job.location, job.remote, job.url, job.source, job.posted_at, job.description])
  return id
}

export async function insertManualJob(pool, { title, company, location, url, description }) {
  const trimmedUrl = url.trim()
  const { rows } = await pool.query('SELECT id FROM jobs WHERE url = $1 LIMIT 1', [trimmedUrl])
  if (rows[0]) {
    await pool.query(
      'UPDATE jobs SET description = $1 WHERE id = $2',
      [(description || '').trim(), rows[0].id]
    )
    return rows[0].id
  }
  const id = makeId('manual', trimmedUrl)
  const l = (location || '').toLowerCase()
  const remote = l.includes('remote') || l.includes('flexible') ? 'remote'
    : l.includes('hybrid') ? 'hybrid'
    : l ? 'onsite' : 'unknown'
  await pool.query(`
    INSERT INTO jobs (id, title, company, location, remote, url, source, description, fetched_at)
    VALUES ($1,$2,$3,$4,$5,$6,'manual',$7,now())
  `, [id, title.trim(), (company||'').trim(), (location||'').trim(), remote, trimmedUrl, (description||'').trim()])
  return id
}

export async function getAllJobs(pool, userId = null) {
  let query, params = []
  if (userId) {
    query = `
      SELECT j.*, js.score_aggregate, js.score_dimensions, js.coherence_signal
      FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $1
      WHERE j.deleted = false
      ORDER BY js.score_aggregate DESC NULLS LAST, j.fetched_at DESC
    `
    params = [userId]
  } else {
    query = `SELECT * FROM jobs WHERE deleted = false ORDER BY fetched_at DESC`
  }
  const { rows } = await pool.query(query, params)
  return rows.map(deserialize)
}

export async function getJobById(pool, id, userId = null) {
  let row
  if (userId) {
    const { rows } = await pool.query(`
      SELECT j.*, js.score_aggregate, js.score_dimensions, js.coherence_signal
      FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $2
      WHERE j.id = $1
    `, [id, userId])
    row = rows[0]
  } else {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [id])
    row = rows[0]
  }
  return row ? deserialize(row) : null
}

export async function getUnscoredJobs(pool, userId = null) {
  if (userId) {
    const { rows } = await pool.query(`
      SELECT j.id FROM jobs j
      LEFT JOIN job_scores js ON js.job_id = j.id AND js.user_id = $1
      WHERE j.deleted = false AND js.job_id IS NULL
    `, [userId])
    return rows.map(r => r.id)
  }
  const { rows } = await pool.query(
    `SELECT id FROM jobs WHERE deleted = false`
  )
  return rows.map(r => r.id)
}

export async function updateScore(pool, jobId, userId, scoreAggregate, scoreDimensions, coherenceSignal = null) {
  await pool.query(`
    INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions, coherence_signal, scored_at)
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (job_id, user_id) DO UPDATE SET
      score_aggregate = EXCLUDED.score_aggregate,
      score_dimensions = EXCLUDED.score_dimensions,
      coherence_signal = EXCLUDED.coherence_signal,
      scored_at = now()
  `, [jobId, userId, scoreAggregate, JSON.stringify(scoreDimensions), coherenceSignal])
}

export async function markDeleted(pool, id) {
  await pool.query('UPDATE jobs SET deleted = true WHERE id = $1', [id])
}

export async function updateJobDescription(pool, id) {
  await pool.query(
    'UPDATE jobs SET description = $1 WHERE id = $2',
    [description.trim(), id]
  )
}

export async function updateTrackerEntry(pool, entryId, userId, updates) {
  const allowed = ['status', 'follow_up_date', 'notes', 'applied_date']
  const fields = [], values = []
  for (const key of allowed) {
    if (key in updates) {
      fields.push(`${key} = $${fields.length + 1}`)
      values.push(updates[key])
    }
  }
  if (!fields.length) return
  fields.push(`updated_at = now()`)
  values.push(entryId, userId)
  await pool.query(
    `UPDATE tracker_entries SET ${fields.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
    values
  )
}

function deserialize(row) {
  if (!row) return row
  return {
    ...row,
    score_dimensions: row.score_dimensions
      ? (typeof row.score_dimensions === 'string' ? JSON.parse(row.score_dimensions) : row.score_dimensions)
      : null
  }
}
```

- [ ] **Step 4: Run tests**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/db.test.js
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/db.js server/db/schema.sql tests/server/db.test.js
git commit -m "feat: replace sqlite with postgresql, add job_scores and boards schema"
```

---

## Task 4: Update all DB importers to async

**Files:**
- Modify: `server/index.js`
- Modify: `server/scorer.js`
- Modify: `server/scheduler.js`
- Modify: `server/scrapers/index.js`

- [ ] **Step 1: Update `server/scorer.js` — add `userId` param to `scoreJob`**

In `server/scorer.js`, find where `updateScore` is called and update its signature. The scorer itself doesn't call `updateScore` directly (it just returns scores), but `scheduler.js` does. No changes needed in scorer.js itself — the score return shape is unchanged.

- [ ] **Step 2: Update `server/scheduler.js` — await all DB calls**

Find every call to `getJobById`, `getUnscoredIds`, `updateScore` in `scheduler.js` and add `await`. Also update `getUnscoredIds` → `getUnscoredJobs` (renamed in new db.js). Update `updateScore` call signature to include `userId`:

```js
// OLD
updateScore(db, id, result.aggregate, result.dimensions)
// NEW — for now use the admin user's id; Plan 2 will fan out to all users
await updateScore(pool, id, adminUserId, result.aggregate, result.dimensions)
```

Add at the top of `scheduler.js`:
```js
// Temporary until Plan 2 wires up per-user scoring
async function getAdminUserId(pool) {
  const { rows } = await pool.query(`SELECT id FROM "user" WHERE role = 'admin' LIMIT 1`)
  return rows[0]?.id
}
```

Update every `db` parameter to `pool` throughout `scheduler.js`.

- [ ] **Step 3: Update `server/scrapers/index.js` — await upsertJob**

```js
// In runAllScrapers, every upsertJob call needs await:
const id = await upsertJob(pool, job)
```

Update the function signature from `runAllScrapers(db, scrapers)` to `runAllScrapers(pool, scrapers)`.

- [ ] **Step 4: Update `server/index.js` — all route handlers become async**

Change every route handler to `async (req, res)` and add `await` before all DB calls. Replace `db.prepare(...)` calls with the new db functions. Change `db` parameter → `pool` throughout. Example:

```js
// OLD
app.get('/api/jobs', (req, res) => {
  const jobs = getAllJobs(db)
  // ...
  res.json(result)
})

// NEW
app.get('/api/jobs', async (req, res) => {
  const userId = req.user?.id
  const jobs = await getAllJobs(pool, userId)
  // ... age penalty logic unchanged ...
  res.json(result)
})
```

The inline `db.prepare('UPDATE jobs SET deleted = 1...')` call in `DELETE /api/jobs/:id` becomes:
```js
app.delete('/api/jobs/:id', async (req, res) => {
  await markDeleted(pool, req.params.id)
  res.status(204).end()
})
```

Update the `createApp(db, pipeline)` signature to `createApp(pool, pipeline)`.

Update the startup block at the bottom:
```js
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
```

- [ ] **Step 5: Smoke test — start the server**

```bash
npm run server
```

Expected: `Server running on http://localhost:3001` with no errors.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/scorer.js server/scheduler.js server/scrapers/index.js
git commit -m "refactor: migrate all db calls to async postgresql"
```

---

## Task 5: Set up better-auth with magic link

**Files:**
- Create: `server/auth.js`

- [ ] **Step 1: Create `server/auth.js`**

```js
// server/auth.js
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import pg from 'pg'
import { sendMagicLinkEmail } from './email.js'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export const auth = betterAuth({
  database: pool,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET,
  user: {
    additionalFields: {
      role:   { type: 'string', defaultValue: 'user',    required: false },
      status: { type: 'string', defaultValue: 'pending', required: false },
    }
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail({ to: email, url })
      },
      expiresIn: 900, // 15 minutes
    })
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    cookieCache: { enabled: true, maxAge: 60 * 5 }
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL || 'http://localhost:3001'],
})

export { fromNodeHeaders } from 'better-auth/node'
```

- [ ] **Step 2: Verify better-auth imports resolve**

```bash
node --input-type=module <<'EOF'
import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node'
console.log('better-auth imports OK')
EOF
```

Expected: `better-auth imports OK`

- [ ] **Step 3: Commit**

```bash
git add server/auth.js
git commit -m "feat: configure better-auth with magic link plugin"
```

---

## Task 6: Resend email module

**Files:**
- Create: `server/email.js`

- [ ] **Step 1: Create `server/email.js`**

```js
// server/email.js
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM || 'noreply@example.com'
const APP_NAME = 'JobMatch'

export async function sendMagicLinkEmail({ to, url }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Your ${APP_NAME} sign-in link`,
    html: `
      <p>Click below to sign in to ${APP_NAME}. This link expires in 15 minutes.</p>
      <p><a href="${url}" style="background:#6d28d9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">Sign in to ${APP_NAME}</a></p>
      <p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>
    `,
  })
}

export async function sendWaitlistConfirmationEmail({ to }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You're on the ${APP_NAME} waitlist`,
    html: `
      <p>Thanks for signing up! You're on the ${APP_NAME} waitlist.</p>
      <p>We'll send you a sign-in link as soon as your account is approved.</p>
    `,
  })
}

export async function sendApprovalEmail({ to }) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You're in — sign in to ${APP_NAME}`,
    html: `
      <p>Good news — your ${APP_NAME} account has been approved!</p>
      <p>Go to <a href="${process.env.BETTER_AUTH_URL}">${process.env.BETTER_AUTH_URL}</a> and enter your email to get a sign-in link.</p>
    `,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add server/email.js
git commit -m "feat: add resend email module"
```

---

## Task 7: Session middleware + self-signup route

**Files:**
- Create: `server/middleware/requireAuth.js`
- Create: `server/middleware/requireAdmin.js`
- Create: `server/routes/auth.js`
- Create: `tests/server/auth.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/server/auth.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import pg from 'pg'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { createApp } from '../../server/index.js'
import { createPool } from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

let pool, app
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
  app = createApp(pool)
})
afterAll(() => pool.end())
beforeEach(async () => {
  await pool.query('DELETE FROM tracker_entries')
  await pool.query('DELETE FROM boards')
  await pool.query('DELETE FROM job_scores')
  await pool.query('DELETE FROM jobs')
  await pool.query('DELETE FROM app_invites')
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM verification')
  await pool.query('DELETE FROM account')
  await pool.query('DELETE FROM "user"')
})

describe('GET /api/jobs (protected)', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/jobs')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/signup', () => {
  it('creates a pending user and sends waitlist confirmation', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'newuser@example.com' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('pending')

    const { rows } = await pool.query(`SELECT * FROM "user" WHERE email = $1`, ['newuser@example.com'])
    expect(rows[0].status).toBe('pending')
  })

  it('returns 400 for missing email', async () => {
    const res = await request(app).post('/api/auth/signup').send({})
    expect(res.status).toBe(400)
  })

  it('returns 409 if email already registered', async () => {
    await request(app).post('/api/auth/signup').send({ email: 'dup@example.com' })
    const res = await request(app).post('/api/auth/signup').send({ email: 'dup@example.com' })
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/auth.test.js
```

Expected: FAIL — `POST /api/auth/signup` returns 404

- [ ] **Step 3: Create `server/middleware/requireAuth.js`**

```js
// server/middleware/requireAuth.js
import { auth, fromNodeHeaders } from '../auth.js'

export async function requireAuth(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (!session) return res.status(401).json({ error: 'Unauthorized' })
    if (session.user.status === 'pending') {
      return res.status(403).json({ error: 'Account pending approval' })
    }
    if (session.user.status === 'deactivated') {
      return res.status(403).json({ error: 'Account deactivated' })
    }
    req.user = session.user
    req.session = session
    next()
  } catch (err) {
    console.error('[requireAuth]', err.message)
    res.status(500).json({ error: 'Auth check failed' })
  }
}
```

- [ ] **Step 4: Create `server/middleware/requireAdmin.js`**

```js
// server/middleware/requireAdmin.js
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }
  next()
}
```

- [ ] **Step 5: Create `server/routes/auth.js`**

```js
// server/routes/auth.js
import { Router } from 'express'
import { auth, fromNodeHeaders } from '../auth.js'
import { sendWaitlistConfirmationEmail } from '../email.js'

const router = Router()

// Self-signup — creates pending user, sends waitlist email
router.post('/signup', async (req, res) => {
  const { email } = req.body
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' })
  }

  // Check for existing user via better-auth's db
  const existing = await auth.db.findOne({ model: 'user', where: [{ field: 'email', value: email }] })
  if (existing) return res.status(409).json({ error: 'Email already registered' })

  // Create user directly — status: 'pending', no magic link yet
  await auth.db.create({
    model: 'user',
    data: {
      id: crypto.randomUUID(),
      name: '',
      email,
      emailVerified: false,
      role: 'user',
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  })

  // Send waitlist confirmation (fire-and-forget — don't fail signup if email fails)
  sendWaitlistConfirmationEmail({ to: email }).catch(err =>
    console.error('[signup] waitlist email failed:', err.message)
  )

  res.status(201).json({ status: 'pending', message: 'Check your inbox — you\'re on the waitlist.' })
})

// Current user info
router.get('/me', async (req, res) => {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  const { id, email, role, status } = session.user
  res.json({ id, email, role, status })
})

export default router
```

- [ ] **Step 6: Mount auth routes and session middleware in `server/index.js`**

At the top of `createApp`, add:
```js
import { toNodeHandler } from 'better-auth/node'
import { requireAuth } from './middleware/requireAuth.js'
import authRoutes from './routes/auth.js'

export function createApp(pool, pipeline = null) {
  const app = express()
  app.use(express.json())

  // better-auth handles all /api/auth/* routes (magic link send/verify, session, etc.)
  app.all('/api/auth/*splat', toNodeHandler(auth))

  // Custom auth routes
  app.use('/api/auth', authRoutes)

  // All remaining /api/* routes require a session
  app.use('/api', requireAuth)

  // ... existing routes unchanged below ...
}
```

- [ ] **Step 7: Run tests**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/auth.test.js
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add server/middleware/ server/routes/auth.js tests/server/auth.test.js server/index.js
git commit -m "feat: add session middleware, self-signup route, auth gate on all api routes"
```

---

## Task 8: Invite system

**Files:**
- Create: `server/routes/invites.js`
- Create: `tests/server/invites.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/server/invites.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import pg from 'pg'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createApp } from '../../server/index.js'
import { createPool } from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

// Helper: inject a session directly into the app for testing
// We bypass the full magic link flow by inserting a user + session row directly.
async function seedUserSession(pool, { email, role = 'user', status = 'active' }) {
  const userId = crypto.randomUUID()
  const sessionToken = crypto.randomUUID()
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1, '', $2, true, $3, $4)`,
    [userId, email, role, status]
  )
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
  await pool.query(
    `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), expiresAt, sessionToken, userId]
  )
  return { userId, sessionToken }
}

let pool, app
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
  app = createApp(pool)
})
afterAll(() => pool.end())
beforeEach(async () => {
  await pool.query('DELETE FROM app_invites')
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM account')
  await pool.query('DELETE FROM "user"')
})

describe('POST /api/invites (admin only)', () => {
  it('admin can generate an invite code', async () => {
    const { sessionToken } = await seedUserSession(pool, { email: 'admin@example.com', role: 'admin' })
    const res = await request(app)
      .post('/api/invites')
      .set('Cookie', `better-auth.session_token=${sessionToken}`)
      .send({ expiresInDays: 7 })
    expect(res.status).toBe(201)
    expect(res.body.code).toBeTruthy()
    expect(res.body.expiresAt).toBeTruthy()
  })

  it('non-admin gets 403', async () => {
    const { sessionToken } = await seedUserSession(pool, { email: 'user@example.com', role: 'user' })
    const res = await request(app)
      .post('/api/invites')
      .set('Cookie', `better-auth.session_token=${sessionToken}`)
      .send({ expiresInDays: 7 })
    expect(res.status).toBe(403)
  })
})

describe('POST /api/invites/:code/redeem', () => {
  it('valid invite creates an active user', async () => {
    const { userId, sessionToken } = await seedUserSession(pool, { email: 'admin@example.com', role: 'admin' })
    const { body: invite } = await request(app)
      .post('/api/invites')
      .set('Cookie', `better-auth.session_token=${sessionToken}`)
      .send({ expiresInDays: 7 })

    const res = await request(app)
      .post(`/api/invites/${invite.code}/redeem`)
      .send({ email: 'invitee@example.com' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('active')

    const { rows } = await pool.query(`SELECT status FROM "user" WHERE email = $1`, ['invitee@example.com'])
    expect(rows[0].status).toBe('active')
  })

  it('expired invite returns 410', async () => {
    const { userId } = await seedUserSession(pool, { email: 'admin2@example.com', role: 'admin' })
    const expiredCode = crypto.randomUUID()
    await pool.query(
      `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1, $2, $3)`,
      [expiredCode, userId, new Date(Date.now() - 1000)]
    )
    const res = await request(app)
      .post(`/api/invites/${expiredCode}/redeem`)
      .send({ email: 'late@example.com' })
    expect(res.status).toBe(410)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/invites.test.js
```

Expected: FAIL — `/api/invites` returns 404

- [ ] **Step 3: Create `server/routes/invites.js`**

```js
// server/routes/invites.js
import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { auth } from '../auth.js'

const router = Router()

// Admin: generate invite link
router.post('/', requireAdmin, async (req, res) => {
  const pool = req.pool
  const { expiresInDays = 7 } = req.body
  const code = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
  await pool.query(
    `INSERT INTO app_invites (code, created_by, expires_at) VALUES ($1, $2, $3)`,
    [code, req.user.id, expiresAt]
  )
  res.status(201).json({ code, expiresAt, url: `${process.env.BETTER_AUTH_URL}?invite=${code}` })
})

// Admin: list invites
router.get('/', requireAdmin, async (req, res) => {
  const { rows } = await req.pool.query(
    `SELECT code, created_by, used_by, expires_at, created_at FROM app_invites ORDER BY created_at DESC`
  )
  res.json(rows)
})

// Admin: revoke invite
router.delete('/:code', requireAdmin, async (req, res) => {
  await req.pool.query(`DELETE FROM app_invites WHERE code = $1 AND used_by IS NULL`, [req.params.code])
  res.status(204).end()
})

// Public: redeem invite (creates active account, sends magic link)
router.post('/:code/redeem', async (req, res) => {
  const { email } = req.body
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' })

  const pool = req.pool
  const { rows } = await pool.query(`SELECT * FROM app_invites WHERE code = $1`, [req.params.code])
  const invite = rows[0]
  if (!invite) return res.status(404).json({ error: 'Invite not found' })
  if (invite.used_by) return res.status(409).json({ error: 'Invite already used' })
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' })

  // Check for existing user
  const existing = await auth.db.findOne({ model: 'user', where: [{ field: 'email', value: email }] })
  if (existing) {
    // Upgrade pending → active if they were on waitlist
    if (existing.status === 'pending') {
      await pool.query(`UPDATE "user" SET status = 'active', "updatedAt" = now() WHERE id = $1`, [existing.id])
    }
  } else {
    // Create active user
    await auth.db.create({
      model: 'user',
      data: {
        id: crypto.randomUUID(),
        name: '',
        email,
        emailVerified: false,
        role: 'user',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })
  }

  // Mark invite used
  const { rows: userRows } = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [email])
  await pool.query(`UPDATE app_invites SET used_by = $1 WHERE code = $2`, [userRows[0].id, invite.code])

  // Send magic link so they can sign in immediately
  await auth.api.sendMagicLinkEmail({ body: { email } })

  res.status(201).json({ status: 'active', message: 'Check your inbox for a sign-in link.' })
})

export default router
```

- [ ] **Step 4: Mount invites router in `server/index.js`**

```js
import inviteRoutes from './routes/invites.js'

// In createApp, after existing routes:
app.use('/api/invites', inviteRoutes)
```

Also attach the pool to `req` so routes can access it:
```js
// Right after app.use(express.json()):
app.use((req, _res, next) => { req.pool = pool; next() })
```

- [ ] **Step 5: Run tests**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/invites.test.js
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add server/routes/invites.js tests/server/invites.test.js server/index.js
git commit -m "feat: invite system with admin generation and public redemption"
```

---

## Task 9: Admin routes — waitlist and user management

**Files:**
- Create: `server/routes/admin.js`
- Create: `tests/server/admin.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/server/admin.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createApp } from '../../server/index.js'
import { createPool } from '../../server/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const schema = readFileSync(path.join(__dirname, '../../server/db/schema.sql'), 'utf8')

async function seedUserSession(pool, { email, role = 'user', status = 'active' }) {
  const userId = crypto.randomUUID()
  const sessionToken = crypto.randomUUID()
  await pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1, '', $2, true, $3, $4)`,
    [userId, email, role, status]
  )
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24)
  await pool.query(
    `INSERT INTO session (id, "expiresAt", token, "userId") VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), expiresAt, sessionToken, userId]
  )
  return { userId, sessionToken }
}

let pool, app
beforeAll(async () => {
  pool = createPool(process.env.DATABASE_URL_TEST)
  await pool.query(schema)
  app = createApp(pool)
})
afterAll(() => pool.end())
beforeEach(async () => {
  await pool.query('DELETE FROM session')
  await pool.query('DELETE FROM account')
  await pool.query('DELETE FROM "user"')
})

describe('GET /api/admin/waitlist', () => {
  it('returns pending users only', async () => {
    const { sessionToken } = await seedUserSession(pool, { email: 'admin@example.com', role: 'admin' })
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1, '', 'pending@example.com', false, 'user', 'pending')`,
      [crypto.randomUUID()]
    )
    const res = await request(app)
      .get('/api/admin/waitlist')
      .set('Cookie', `better-auth.session_token=${sessionToken}`)
    expect(res.status).toBe(200)
    expect(res.body.length).toBe(1)
    expect(res.body[0].email).toBe('pending@example.com')
  })
})

describe('POST /api/admin/waitlist/:userId/approve', () => {
  it('sets user status to active and triggers approval email', async () => {
    const { sessionToken } = await seedUserSession(pool, { email: 'admin@example.com', role: 'admin' })
    const pendingId = crypto.randomUUID()
    await pool.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", role, status) VALUES ($1, '', 'waiter@example.com', false, 'user', 'pending')`,
      [pendingId]
    )
    const res = await request(app)
      .post(`/api/admin/waitlist/${pendingId}/approve`)
      .set('Cookie', `better-auth.session_token=${sessionToken}`)
    expect(res.status).toBe(200)
    const { rows } = await pool.query(`SELECT status FROM "user" WHERE id = $1`, [pendingId])
    expect(rows[0].status).toBe('active')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/admin.test.js
```

Expected: FAIL — `/api/admin/waitlist` returns 404

- [ ] **Step 3: Create `server/routes/admin.js`**

```js
// server/routes/admin.js
import { Router } from 'express'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { sendApprovalEmail } from '../email.js'

const router = Router()
router.use(requireAdmin)

// Waitlist — list pending users
router.get('/waitlist', async (req, res) => {
  const { rows } = await req.pool.query(
    `SELECT id, email, "createdAt" FROM "user" WHERE status = 'pending' ORDER BY "createdAt" ASC`
  )
  res.json(rows)
})

// Approve a waitlisted user
router.post('/waitlist/:userId/approve', async (req, res) => {
  const { userId } = req.params
  const { rows } = await req.pool.query(
    `UPDATE "user" SET status = 'active', "updatedAt" = now() WHERE id = $1 AND status = 'pending' RETURNING email`,
    [userId]
  )
  if (!rows[0]) return res.status(404).json({ error: 'Pending user not found' })
  sendApprovalEmail({ to: rows[0].email }).catch(err =>
    console.error('[approve] email failed:', err.message)
  )
  res.json({ ok: true })
})

// Reject / remove from waitlist
router.delete('/waitlist/:userId', async (req, res) => {
  await req.pool.query(`DELETE FROM "user" WHERE id = $1 AND status = 'pending'`, [req.params.userId])
  res.status(204).end()
})

// List all active users
router.get('/users', async (req, res) => {
  const { rows } = await req.pool.query(
    `SELECT id, email, role, status, "createdAt" FROM "user" WHERE status != 'pending' ORDER BY "createdAt" DESC`
  )
  res.json(rows)
})

// Deactivate a user
router.patch('/users/:userId', async (req, res) => {
  const { status } = req.body
  if (status !== 'deactivated') return res.status(400).json({ error: 'Only "deactivated" status allowed' })
  await req.pool.query(
    `UPDATE "user" SET status = 'deactivated', "updatedAt" = now() WHERE id = $1`,
    [req.params.userId]
  )
  res.json({ ok: true })
})

export default router
```

- [ ] **Step 4: Mount admin router in `server/index.js`**

```js
import adminRoutes from './routes/admin.js'
// after other route mounts:
app.use('/api/admin', adminRoutes)
```

- [ ] **Step 5: Run tests**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run tests/server/admin.test.js
```

Expected: all PASS

- [ ] **Step 6: Run all tests**

```bash
DATABASE_URL_TEST=$DATABASE_URL_TEST npx vitest run
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add server/routes/admin.js tests/server/admin.test.js server/index.js
git commit -m "feat: admin routes for waitlist and user management"
```

---

## Task 10: React auth gate + login page

**Files:**
- Create: `src/hooks/useAuth.js`
- Create: `src/components/LoginPage.jsx`
- Create: `src/components/AuthGate.jsx`
- Modify: `src/App.jsx`
- Modify: `src/api.js`

- [ ] **Step 1: Update `src/api.js` — add `credentials: 'include'` everywhere**

Find every `fetch(` call in `src/api.js` and add `credentials: 'include'` to the options object. Example:

```js
// Before
const res = await fetch('/api/jobs')
// After
const res = await fetch('/api/jobs', { credentials: 'include' })

// Before
const res = await fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: ..., body: ... })
// After
const res = await fetch(`/api/jobs/${id}`, { method: 'PATCH', credentials: 'include', headers: ..., body: ... })
```

Apply this change to every fetch call in the file.

- [ ] **Step 2: Create `src/hooks/useAuth.js`**

```jsx
// src/hooks/useAuth.js
import { useState, useEffect } from 'react'

export function useAuth() {
  const [user, setUser] = useState(undefined) // undefined = loading, null = not authed
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUser(data); setLoading(false) })
      .catch(() => { setUser(null); setLoading(false) })
  }, [])

  async function logout() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    setUser(null)
  }

  return { user, loading, logout }
}
```

- [ ] **Step 3: Create `src/components/LoginPage.jsx`**

```jsx
// src/components/LoginPage.jsx
import { useState } from 'react'

const INVITE_CODE = new URLSearchParams(window.location.search).get('invite')

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState(INVITE_CODE ? 'invite' : 'login') // 'login' | 'signup' | 'invite' | 'sent' | 'waitlisted'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (mode === 'invite') {
        const res = await fetch(`/api/invites/${INVITE_CODE}/redeem`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error); return }
        setMode('sent')
      } else if (mode === 'signup') {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error); return }
        setMode('waitlisted')
      } else {
        // Login — trigger magic link via better-auth
        const res = await fetch('/api/auth/magic-link/send', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) { setError('Could not send sign-in link. Check your email address.'); return }
        setMode('sent')
      }
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'sent') return (
    <div style={styles.container}>
      <h1 style={styles.title}>Check your inbox</h1>
      <p style={styles.sub}>We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.</p>
    </div>
  )

  if (mode === 'waitlisted') return (
    <div style={styles.container}>
      <h1 style={styles.title}>You're on the list</h1>
      <p style={styles.sub}>We'll send you a sign-in link as soon as your account is approved.</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>JobMatch <span style={{ color: '#7c3aed' }}>✦</span></h1>
      <p style={styles.sub}>
        {mode === 'invite' ? 'You\'ve been invited. Enter your email to get started.' : 'Sign in to your account.'}
      </p>
      {error && <p style={styles.error}>{error}</p>}
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          style={styles.input}
        />
        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Sending…' : mode === 'invite' ? 'Get started' : mode === 'signup' ? 'Join waitlist' : 'Send sign-in link'}
        </button>
      </form>
      {mode === 'login' && (
        <p style={styles.footer}>
          No account? <button onClick={() => setMode('signup')} style={styles.link}>Join the waitlist</button>
        </p>
      )}
      {mode === 'signup' && (
        <p style={styles.footer}>
          Already have an account? <button onClick={() => setMode('login')} style={styles.link}>Sign in</button>
        </p>
      )}
    </div>
  )
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif', background: '#0a0a0b', color: '#fff' },
  title: { fontSize: 28, fontWeight: 700, margin: '0 0 8px' },
  sub: { color: '#888', margin: '0 0 24px', textAlign: 'center', maxWidth: 320 },
  error: { color: '#f87171', marginBottom: 12, fontSize: 14 },
  form: { display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 320 },
  input: { padding: '10px 14px', borderRadius: 6, border: '1px solid #333', background: '#1a1a1b', color: '#fff', fontSize: 15 },
  button: { padding: '10px 14px', borderRadius: 6, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 15, cursor: 'pointer', fontWeight: 600 },
  footer: { marginTop: 16, color: '#666', fontSize: 13 },
  link: { background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' },
}
```

- [ ] **Step 4: Create `src/components/AuthGate.jsx`**

```jsx
// src/components/AuthGate.jsx
import { useAuth } from '../hooks/useAuth.js'
import LoginPage from './LoginPage.jsx'

export default function AuthGate({ children }) {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0a0a0b', color: '#888' }}>
      Loading…
    </div>
  )

  if (!user) return <LoginPage />

  return children
}
```

- [ ] **Step 5: Wrap `src/App.jsx` with `AuthGate`**

In `src/main.jsx` (or at the top of `src/App.jsx`), import and wrap:

```jsx
// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AuthGate from './components/AuthGate.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
)
```

- [ ] **Step 6: Manual test — start the app and verify the auth gate works**

```bash
npm run dev
```

1. Open http://localhost:5173
2. Expected: login page shown (email input)
3. Enter an unregistered email → click "Send sign-in link"
4. Expected: "Check your inbox" message (and a magic link email if Resend key is live)

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useAuth.js src/components/LoginPage.jsx src/components/AuthGate.jsx src/main.jsx src/api.js
git commit -m "feat: react auth gate, login page, magic link flow"
```

---

## Task 11: SQLite → PostgreSQL migration script

**Files:**
- Create: `server/db/migrate.js`

- [ ] **Step 1: Create `server/db/migrate.js`**

```js
// server/db/migrate.js
// One-time migration: read from local SQLite jobs.db → write to PostgreSQL
// Run once: node server/db/migrate.js
import { configDotenv } from 'dotenv'
configDotenv({ override: true })

import BetterSqlite3 from 'better-sqlite3' // install temporarily: npm install --save-dev better-sqlite3
import { createPool, makeId } from '../db.js'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function migrate() {
  const sqlitePath = process.env.SQLITE_DB_PATH || path.join(__dirname, '../../jobs.db')
  const sqlite = new BetterSqlite3(sqlitePath, { readonly: true })
  const pool = createPool()

  // Apply schema first
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(schema)

  // Migrate jobs (excluding user-specific fields)
  const jobs = sqlite.prepare('SELECT * FROM jobs WHERE deleted = 0 OR deleted IS NULL').all()
  console.log(`Migrating ${jobs.length} jobs...`)
  for (const job of jobs) {
    await pool.query(`
      INSERT INTO jobs (id, title, company, location, remote, url, source, posted_at, description, fetched_at, deleted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)
      ON CONFLICT (id) DO NOTHING
    `, [job.id, job.title, job.company, job.location, job.remote || 'unknown', job.url, job.source,
        job.posted_at, job.description, job.fetched_at || new Date().toISOString()])
  }

  // Create Ashley's admin user (you)
  const adminId = crypto.randomUUID()
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail) throw new Error('Set ADMIN_EMAIL in .env before running migration')

  await pool.query(`
    INSERT INTO "user" (id, name, email, "emailVerified", role, status)
    VALUES ($1, 'Ashley', $2, true, 'admin', 'active')
    ON CONFLICT (email) DO NOTHING
  `, [adminId, adminEmail])

  // Get the actual admin id (in case ON CONFLICT fired)
  const { rows: adminRows } = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [adminEmail])
  const actualAdminId = adminRows[0].id

  // Migrate Ashley's scores → job_scores
  const scored = jobs.filter(j => j.score_aggregate != null)
  console.log(`Migrating ${scored.length} scores...`)
  for (const job of scored) {
    await pool.query(`
      INSERT INTO job_scores (job_id, user_id, score_aggregate, score_dimensions, scored_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (job_id, user_id) DO NOTHING
    `, [job.id, actualAdminId, job.score_aggregate, job.score_dimensions])
  }

  // Create Ashley's default board and migrate tracker entries
  const boardId = crypto.randomUUID()
  await pool.query(`
    INSERT INTO boards (id, user_id, name) VALUES ($1, $2, 'My Job Search')
    ON CONFLICT DO NOTHING
  `, [boardId, actualAdminId])

  const tracked = jobs.filter(j => j.status && j.status !== 'none')
  console.log(`Migrating ${tracked.length} tracker entries...`)
  for (const job of tracked) {
    await pool.query(`
      INSERT INTO tracker_entries (id, board_id, user_id, job_id, status, notes, follow_up_date, applied_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
    `, [crypto.randomUUID(), boardId, actualAdminId, job.id, job.status, job.notes,
        job.follow_up_date || null, job.applied_date || null])
  }

  sqlite.close()
  await pool.end()
  console.log('Migration complete.')
}

migrate().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Add ADMIN_EMAIL to `.env` and `.env.example`**

```bash
# In .env.example:
ADMIN_EMAIL=your@email.com
SQLITE_DB_PATH=./jobs.db  # path to existing SQLite db
```

- [ ] **Step 3: Temporarily install better-sqlite3 for migration only**

```bash
npm install --save-dev better-sqlite3
```

- [ ] **Step 4: Run the migration (against real DATABASE_URL, not test)**

```bash
node server/db/migrate.js
```

Expected output:
```
Migrating N jobs...
Migrating N scores...
Migrating N tracker entries...
Migration complete.
```

- [ ] **Step 5: Verify data in PostgreSQL**

```bash
psql $DATABASE_URL -c "SELECT count(*) FROM jobs;"
psql $DATABASE_URL -c 'SELECT count(*) FROM "user";'
psql $DATABASE_URL -c "SELECT count(*) FROM job_scores;"
psql $DATABASE_URL -c "SELECT count(*) FROM tracker_entries;"
```

Expected: counts match what was in SQLite.

- [ ] **Step 6: Remove better-sqlite3 dev dependency**

```bash
npm uninstall better-sqlite3
```

- [ ] **Step 7: Commit**

```bash
git add server/db/migrate.js .env.example package.json package-lock.json
git commit -m "feat: sqlite to postgresql migration script"
```

---

## Task 12: Deployment config

**Files:**
- Create: `railway.toml`
- Create: `Dockerfile` (optional, Railway can auto-detect Node)

- [ ] **Step 1: Create `railway.toml`**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "node server/index.js"
healthcheckPath = "/api/health"
healthcheckTimeout = 30

[[services]]
name = "app"
```

- [ ] **Step 2: Add a health endpoint to `server/index.js`**

```js
// Add before the /api/* session middleware, so it's always reachable:
app.get('/api/health', (_req, res) => res.json({ ok: true }))
```

- [ ] **Step 3: Update `server/index.js` to serve built frontend in production**

```js
// After all API routes, serve the Vite build:
import { existsSync } from 'fs'
const distPath = path.join(__dirname, '../dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*splat', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}
```

- [ ] **Step 4: Add `build` script note**

In Railway, set the build command to `npm run build` and the start command to `node server/index.js`. Set all environment variables from `.env.example` in the Railway dashboard.

- [ ] **Step 5: Commit**

```bash
git add railway.toml server/index.js
git commit -m "feat: railway deployment config and health endpoint"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| PostgreSQL migration from SQLite | Task 3, Task 11 |
| Multi-tenant schema (users, job_scores, boards, tracker_entries) | Task 2 |
| better-auth magic link | Task 5 |
| Resend email | Task 6 |
| Session middleware on all API routes | Task 7 |
| Self-signup with waitlist | Task 7 |
| Invite links bypass waitlist | Task 8 |
| Admin: approve waitlist | Task 9 |
| Admin: generate/revoke invites | Task 8 |
| Admin: user management | Task 9 |
| React login page | Task 10 |
| Auth gate in React app | Task 10 |
| Deployment config | Task 12 |
| `role` + `status` fields on user | Task 2, 5 |
| Pending user blocked at middleware | Task 7 |

**Out of scope for this plan (Plans 2 & 3):**
- Onboarding wizard
- Per-user profile/dimensions/personality
- Per-user scoring + coherence signal
- Tracker board sidebar UI
- Top nav shell
- Profile summary radar chart
