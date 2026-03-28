# Job Search App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal job discovery app that scrapes 9 sources daily, scores each listing against a 7-dimension fit framework via Claude AI, and renders filterable scored job cards in a React UI.

**Architecture:** Node.js/Express backend handles scraping (Cheerio for static HTML, Playwright for JS-rendered sites), LinkedIn via Composio SDK, Claude API for fit scoring, SQLite for persistence, and node-cron for daily refresh. Vite React frontend proxies to the backend and renders job cards with expandable dimension scores.

**Tech Stack:** Node.js, Express, better-sqlite3, Playwright, Cheerio, axios, @anthropic-ai/sdk, composio-core, node-cron, concurrently, Vite, React, Vitest, @testing-library/react, supertest

---

## File Map

**Server (all new):**
- `server/index.js` — Express app + route handlers (GET /jobs, GET /jobs/:id, POST /api/refresh)
- `server/db.js` — SQLite open/schema + query functions (upsertJob, updateScore, getAllJobs, getJobById, markSeen)
- `server/scorer.js` — Claude API call, JSON parse, weighted aggregate
- `server/scheduler.js` — node-cron daily trigger + runPipeline orchestrator
- `server/profile.json` — user background text + dimension weights (user edits this)
- `server/scrapers/index.js` — loops all scrapers, calls upsertJob per result
- `server/scrapers/weworkremotely.js` — Cheerio, exports `{ scrape, parse }`
- `server/scrapers/nyfa.js` — Cheerio, exports `{ scrape, parse }`
- `server/scrapers/ixda.js` — Cheerio, exports `{ scrape, parse }`
- `server/scrapers/themuse.js` — The Muse REST API, exports `{ scrape }`
- `server/scrapers/backstage.js` — Playwright, exports `{ scrape, parse }`
- `server/scrapers/web3career.js` — Playwright, exports `{ scrape, parse }`
- `server/scrapers/staffmeup.js` — Playwright, exports `{ scrape, parse }`
- `server/scrapers/creatoreconomyjobs.js` — Playwright, exports `{ scrape, parse }`
- `server/scrapers/linkedin.js` — Composio SDK, exports `{ scrape }`

**Client (modify existing Vite scaffold):**
- `src/api.js` — fetch wrappers for /jobs, /jobs/:id, /api/refresh
- `src/hooks/useJobs.js` — fetches + filters job list
- `src/components/Header.jsx` — title, last-refreshed, refresh button
- `src/components/FilterBar.jsx` — source checkboxes, remote toggle, score slider
- `src/components/JobCard.jsx` — card with score badge, new indicator, expand toggle
- `src/components/JobDetail.jsx` — dimension bars + reasoning + external link
- `src/App.jsx` — root: wires Header + FilterBar + job list + JobDetail

**Config:**
- `package.json` — add all server deps + dev/test/server scripts
- `vite.config.js` — add Vitest config + proxy `/api → localhost:3001`
- `.env.example` — required env vars

**Tests:**
- `tests/server/db.test.js`
- `tests/server/routes.test.js`
- `tests/server/scorer.test.js`
- `tests/server/scrapers/runner.test.js`
- `tests/server/scrapers/weworkremotely.test.js`
- `tests/server/scrapers/nyfa.test.js`
- `tests/server/scrapers/ixda.test.js`
- `tests/server/scrapers/themuse.test.js`
- `tests/server/scrapers/backstage.test.js`
- `tests/server/scrapers/web3career.test.js`
- `tests/server/scrapers/staffmeup.test.js`
- `tests/server/scrapers/creatoreconomyjobs.test.js`
- `tests/client/JobCard.test.jsx`
- `tests/client/FilterBar.test.jsx`
- `tests/client/JobDetail.test.jsx`
- `tests/fixtures/weworkremotely.html`
- `tests/fixtures/nyfa.html`
- `tests/fixtures/ixda.html`
- `tests/fixtures/backstage.html`
- `tests/fixtures/web3career.html`
- `tests/fixtures/staffmeup.html`
- `tests/fixtures/creatoreconomyjobs.html`

---

## Task 1: Project Setup

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js`
- Create: `.env.example`

- [ ] **Step 1: Install server + dev dependencies**

```bash
cd ~/job-search-app
npm install express better-sqlite3 node-cron cheerio axios playwright @anthropic-ai/sdk composio-core dotenv
npm install --save-dev concurrently vitest @vitest/coverage-v8 supertest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
npx playwright install chromium
```

- [ ] **Step 2: Update `package.json` scripts**

Open `package.json`. Replace the `"scripts"` section with:

```json
"scripts": {
  "dev": "concurrently \"npm run server\" \"vite\"",
  "build": "vite build",
  "preview": "vite preview",
  "server": "node server/index.js",
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage"
},
```

- [ ] **Step 3: Update `vite.config.js`**

Replace the entire file:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setup.js'],
    environmentMatchGlobs: [
      ['tests/client/**', 'jsdom'],
      ['tests/server/**', 'node'],
    ],
  }
})
```

- [ ] **Step 4: Create `tests/setup.js`**

```js
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Create `.env.example`**

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
COMPOSIO_API_KEY=your_composio_api_key_here
PORT=3001
SCRAPE_CRON=0 8 * * *
DB_PATH=./jobs.db
```

- [ ] **Step 6: Create `.env` from the example**

```bash
cp .env.example .env
# Fill in ANTHROPIC_API_KEY and COMPOSIO_API_KEY
```

- [ ] **Step 7: Create server directory**

```bash
mkdir -p server/scrapers tests/server/scrapers tests/client tests/fixtures
```

- [ ] **Step 8: Verify Vitest runs (no tests yet)**

```bash
npm test -- --run
```

Expected: `No test files found` or exits 0.

- [ ] **Step 9: Commit**

```bash
git add package.json vite.config.js .env.example tests/setup.js
git commit -m "chore: add server deps, vitest config, dev scripts"
```

---

## Task 2: Database Layer

**Files:**
- Create: `server/db.js`
- Create: `tests/server/db.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/db.test.js`:

```js
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { openDb, makeId, upsertJob, updateScore, getAllJobs, getJobById, markSeen } from '../../server/db.js'

const JOB = {
  title: 'Product Manager',
  company: 'Acme',
  location: 'New York, NY',
  remote: 'hybrid',
  url: 'https://example.com/job/1',
  source: 'weworkremotely',
  posted_at: '2026-03-28',
  description: 'Build great products'
}

describe('makeId', () => {
  test('returns same hash for same source+url', () => {
    expect(makeId('linkedin', 'https://x.com/1')).toBe(makeId('linkedin', 'https://x.com/1'))
  })
  test('returns different hash for different url', () => {
    expect(makeId('linkedin', 'https://x.com/1')).not.toBe(makeId('linkedin', 'https://x.com/2'))
  })
})

describe('upsertJob', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('inserts a new job and returns its id', () => {
    const id = upsertJob(db, JOB)
    expect(typeof id).toBe('string')
    expect(id.length).toBe(16)
  })

  test('getJobById returns inserted job with seen=0', () => {
    const id = upsertJob(db, JOB)
    const row = getJobById(db, id)
    expect(row.title).toBe('Product Manager')
    expect(row.company).toBe('Acme')
    expect(row.seen).toBe(0)
    expect(row.score_aggregate).toBeNull()
  })

  test('re-upserting same url updates title but preserves score', () => {
    const id = upsertJob(db, JOB)
    updateScore(db, id, 7.5, { core_mechanism: { score: 8, reasoning: 'good' } })
    upsertJob(db, { ...JOB, title: 'Senior PM' })
    const row = getJobById(db, id)
    expect(row.title).toBe('Senior PM')
    expect(row.score_aggregate).toBe(7.5)
  })
})

describe('getAllJobs', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('returns jobs sorted by score_aggregate descending, nulls last', () => {
    const id1 = upsertJob(db, { ...JOB, url: 'https://x.com/1', title: 'Low' })
    const id2 = upsertJob(db, { ...JOB, url: 'https://x.com/2', title: 'Unscored' })
    const id3 = upsertJob(db, { ...JOB, url: 'https://x.com/3', title: 'High' })
    updateScore(db, id1, 3.0, {})
    updateScore(db, id3, 9.0, {})
    const jobs = getAllJobs(db)
    expect(jobs[0].title).toBe('High')
    expect(jobs[1].title).toBe('Low')
    expect(jobs[2].title).toBe('Unscored')
  })
})

describe('markSeen', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('sets seen to 1', () => {
    const id = upsertJob(db, JOB)
    expect(getJobById(db, id).seen).toBe(0)
    markSeen(db, id)
    expect(getJobById(db, id).seen).toBe(1)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test -- --run tests/server/db.test.js
```

Expected: FAIL — `Cannot find module '../../server/db.js'`

- [ ] **Step 3: Create `server/db.js`**

```js
import Database from 'better-sqlite3'
import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../jobs.db')

export function openDb(dbPath = DEFAULT_DB_PATH) {
  const db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      company TEXT,
      location TEXT,
      remote TEXT DEFAULT 'unknown',
      url TEXT NOT NULL,
      source TEXT NOT NULL,
      posted_at TEXT,
      description TEXT,
      score_aggregate REAL,
      score_dimensions TEXT,
      fetched_at TEXT NOT NULL,
      seen INTEGER DEFAULT 0
    )
  `)
  return db
}

export function makeId(source, url) {
  return crypto.createHash('sha256').update(source + url).digest('hex').slice(0, 16)
}

export function upsertJob(db, job) {
  const id = makeId(job.source, job.url)
  db.prepare(`
    INSERT INTO jobs (id, title, company, location, remote, url, source, posted_at, description, fetched_at, seen)
    VALUES (@id, @title, @company, @location, @remote, @url, @source, @posted_at, @description, @fetched_at, 0)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      remote = excluded.remote,
      posted_at = excluded.posted_at,
      description = excluded.description,
      fetched_at = excluded.fetched_at
  `).run({ ...job, id, fetched_at: new Date().toISOString() })
  return id
}

export function updateScore(db, id, scoreAggregate, scoreDimensions) {
  db.prepare(`
    UPDATE jobs SET score_aggregate = ?, score_dimensions = ? WHERE id = ?
  `).run(scoreAggregate, JSON.stringify(scoreDimensions), id)
}

export function getAllJobs(db) {
  return db.prepare(`
    SELECT * FROM jobs ORDER BY score_aggregate DESC NULLS LAST, fetched_at DESC
  `).all()
}

export function getJobById(db, id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)
}

export function markSeen(db, id) {
  db.prepare('UPDATE jobs SET seen = 1 WHERE id = ?').run(id)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run tests/server/db.test.js
```

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/db.js tests/server/db.test.js
git commit -m "feat: add SQLite database layer with upsert and scoring"
```

---

## Task 3: Express Server + API Routes

**Files:**
- Create: `server/index.js`
- Create: `tests/server/routes.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/routes.test.js`:

```js
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { openDb, upsertJob, updateScore } from '../../server/db.js'

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
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test -- --run tests/server/routes.test.js
```

Expected: FAIL — `Cannot find module '../../server/index.js'`

- [ ] **Step 3: Create `server/index.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run tests/server/routes.test.js
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/index.js tests/server/routes.test.js
git commit -m "feat: add Express server with /api/jobs and /api/refresh routes"
```

---

## Task 4: Scraper Runner + Deduplication

**Files:**
- Create: `server/scrapers/index.js`
- Create: `tests/server/scrapers/runner.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/scrapers/runner.test.js`:

```js
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { openDb, getJobById } from '../../../server/db.js'
import { runAllScrapers } from '../../../server/scrapers/index.js'

const makeJob = (url) => ({
  title: 'PM', company: 'X', location: 'NYC', remote: 'remote',
  url, source: 'test', posted_at: null, description: 'desc'
})

describe('runAllScrapers', () => {
  let db
  beforeEach(() => { db = openDb(':memory:') })
  afterEach(() => { db.close() })

  test('persists jobs from all scrapers', async () => {
    const scrapers = [
      { scrape: async () => [makeJob('https://a.com/1')] },
      { scrape: async () => [makeJob('https://b.com/1')] },
    ]
    const ids = await runAllScrapers(db, scrapers)
    expect(ids).toHaveLength(2)
  })

  test('deduplicates same url from two scrapers with same source', async () => {
    const job = makeJob('https://a.com/1')
    const scrapers = [
      { scrape: async () => [job] },
      { scrape: async () => [job] },
    ]
    const ids = await runAllScrapers(db, scrapers)
    expect(ids).toHaveLength(1)
  })

  test('continues running remaining scrapers when one throws', async () => {
    const scrapers = [
      { scrape: async () => { throw new Error('network error') } },
      { scrape: async () => [makeJob('https://c.com/1')] },
    ]
    const ids = await runAllScrapers(db, scrapers)
    expect(ids).toHaveLength(1)
  })

  test('returns new job ids only (skips already-existing ids)', async () => {
    const job = makeJob('https://a.com/1')
    const scrapers = [{ scrape: async () => [job] }]
    const first = await runAllScrapers(db, scrapers)
    const second = await runAllScrapers(db, scrapers)
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(0) // already in db
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test -- --run tests/server/scrapers/runner.test.js
```

Expected: FAIL — `Cannot find module '../../../server/scrapers/index.js'`

- [ ] **Step 3: Create `server/scrapers/index.js`**

```js
import { upsertJob, getJobById } from '../db.js'

export async function runAllScrapers(db, scrapers) {
  const newIds = []
  for (const scraper of scrapers) {
    try {
      const jobs = await scraper.scrape()
      for (const job of jobs) {
        const existsBefore = getJobById(db, makeId(job.source, job.url))
        const id = upsertJob(db, job)
        if (!existsBefore) newIds.push(id)
      }
    } catch (err) {
      console.error(`Scraper failed:`, err.message)
    }
  }
  return newIds
}

function makeId(source, url) {
  const { createHash } = await import('crypto').then(m => m)
  // inline hash to avoid circular import — matches db.makeId exactly
  const crypto = await import('crypto')
  return crypto.createHash('sha256').update(source + url).digest('hex').slice(0, 16)
}
```

Wait — `makeId` can't be async like that. Fix: import crypto at top level.

- [ ] **Step 3 (corrected): Create `server/scrapers/index.js`**

```js
import { createHash } from 'crypto'
import { upsertJob, getJobById, makeId } from '../db.js'

export async function runAllScrapers(db, scrapers) {
  const newIds = []
  for (const scraper of scrapers) {
    try {
      const jobs = await scraper.scrape()
      for (const job of jobs) {
        const alreadyExists = !!getJobById(db, makeId(job.source, job.url))
        const id = upsertJob(db, job)
        if (!alreadyExists) newIds.push(id)
      }
    } catch (err) {
      console.error(`Scraper failed:`, err.message)
    }
  }
  return newIds
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run tests/server/scrapers/runner.test.js
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add server/scrapers/index.js tests/server/scrapers/runner.test.js
git commit -m "feat: add scraper runner with deduplication and error isolation"
```

---

## Task 5: Cheerio Scrapers — WeWorkRemotely, NYFA, IxDA

**Files:**
- Create: `server/scrapers/weworkremotely.js`
- Create: `server/scrapers/nyfa.js`
- Create: `server/scrapers/ixda.js`
- Create: `tests/fixtures/weworkremotely.html`
- Create: `tests/fixtures/nyfa.html`
- Create: `tests/fixtures/ixda.html`
- Create: `tests/server/scrapers/weworkremotely.test.js`
- Create: `tests/server/scrapers/nyfa.test.js`
- Create: `tests/server/scrapers/ixda.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/scrapers/weworkremotely.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/weworkremotely.js'

const fixture = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/weworkremotely.html'), 'utf8'
)

test('parse extracts job fields from HTML', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(2)
  expect(jobs[0]).toMatchObject({
    title: 'Product Manager',
    company: 'Acme Corp',
    remote: 'remote',
    source: 'weworkremotely',
  })
  expect(jobs[0].url).toMatch(/^https:\/\/weworkremotely\.com/)
})
```

Create `tests/server/scrapers/nyfa.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/nyfa.js'

const fixture = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/nyfa.html'), 'utf8'
)

test('parse extracts job fields from HTML', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Product Director',
    company: 'Film Studio',
    source: 'nyfa',
  })
  expect(jobs[0].url).toMatch(/^https:\/\//)
})
```

Create `tests/server/scrapers/ixda.test.js`:

```js
import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/ixda.js'

const fixture = readFileSync(
  path.join(process.cwd(), 'tests/fixtures/ixda.html'), 'utf8'
)

test('parse extracts job fields from HTML', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Head of Product',
    company: 'Design Co',
    source: 'ixda',
  })
  expect(jobs[0].url).toMatch(/^https:\/\//)
})
```

- [ ] **Step 2: Create fixture files**

Create `tests/fixtures/weworkremotely.html`:

```html
<section class="jobs">
  <ul>
    <li>
      <div>
        <a href="/remote-jobs/product-manager-acme">
          <span class="company">Acme Corp</span>
          <span class="title">Product Manager</span>
          <span class="region">Worldwide</span>
          <span class="date">March 28</span>
        </a>
      </div>
    </li>
    <li>
      <div>
        <a href="/remote-jobs/partnerships-lead-beta">
          <span class="company">Beta Inc</span>
          <span class="title">Partnerships Lead</span>
          <span class="region">USA Only</span>
          <span class="date">March 27</span>
        </a>
      </div>
    </li>
  </ul>
</section>
```

Create `tests/fixtures/nyfa.html`:

```html
<div class="job-listings">
  <div class="job-listing">
    <h3 class="job-title"><a href="https://nyfa.org/jobs/product-director-123">Product Director</a></h3>
    <div class="company-name">Film Studio</div>
    <div class="job-location">New York, NY</div>
    <div class="job-description">Lead product strategy for a major film studio.</div>
  </div>
</div>
```

Create `tests/fixtures/ixda.html`:

```html
<div class="jobs-list">
  <div class="job-item">
    <h2 class="job-title"><a href="https://ixda.org/jobs/head-of-product-456">Head of Product</a></h2>
    <span class="company">Design Co</span>
    <span class="location">Remote</span>
    <div class="description">Lead product at a UX-focused company.</div>
  </div>
</div>
```

- [ ] **Step 3: Run to verify tests fail**

```bash
npm test -- --run tests/server/scrapers/weworkremotely.test.js tests/server/scrapers/nyfa.test.js tests/server/scrapers/ixda.test.js
```

Expected: FAIL — scraper modules not found.

- [ ] **Step 4: Create `server/scrapers/weworkremotely.js`**

```js
import * as cheerio from 'cheerio'
import axios from 'axios'

const BASE = 'https://weworkremotely.com'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('section.jobs ul li').each((_, el) => {
    const a = $(el).find('a').first()
    const href = a.attr('href')
    if (!href || href === '#') return
    const title = a.find('span.title').text().trim()
    const company = a.find('span.company').text().trim()
    const region = a.find('span.region').text().trim().toLowerCase()
    if (!title) return
    jobs.push({
      title,
      company,
      location: region || 'Remote',
      remote: 'remote',
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      source: 'weworkremotely',
      posted_at: null,
      description: '',
    })
  })
  return jobs
}

export async function scrape() {
  const categories = [
    '/remote-jobs/product',
    '/remote-jobs/business-exec',
  ]
  const all = []
  for (const cat of categories) {
    const { data } = await axios.get(`${BASE}${cat}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    })
    all.push(...parse(data))
    await sleep(2000)
  }
  return all
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
```

- [ ] **Step 5: Create `server/scrapers/nyfa.js`**

```js
import * as cheerio from 'cheerio'
import axios from 'axios'

const BASE = 'https://www.nyfa.org'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-listing').each((_, el) => {
    const titleEl = $(el).find('.job-title a')
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    const company = $(el).find('.company-name').text().trim()
    const location = $(el).find('.job-location').text().trim()
    const description = $(el).find('.job-description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location: location || 'New York, NY',
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      source: 'nyfa',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const { data } = await axios.get(`${BASE}/jobs/?_page=1`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  return parse(data)
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
```

- [ ] **Step 6: Create `server/scrapers/ixda.js`**

```js
import * as cheerio from 'cheerio'
import axios from 'axios'

const BASE = 'https://ixda.org'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-item').each((_, el) => {
    const titleEl = $(el).find('.job-title a')
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    const company = $(el).find('.company').text().trim()
    const location = $(el).find('.location').text().trim()
    const description = $(el).find('.description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location: location || '',
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `${BASE}${href}`,
      source: 'ixda',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const { data } = await axios.get(`${BASE}/jobs/`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })
  return parse(data)
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npm test -- --run tests/server/scrapers/weworkremotely.test.js tests/server/scrapers/nyfa.test.js tests/server/scrapers/ixda.test.js
```

Expected: PASS — all 3 tests green.

> **Note:** When running the live scrapers for the first time, inspect the real site HTML (browser DevTools → Elements) and adjust the CSS selectors in `parse()` if the output looks empty.

- [ ] **Step 8: Commit**

```bash
git add server/scrapers/weworkremotely.js server/scrapers/nyfa.js server/scrapers/ixda.js \
  tests/server/scrapers/weworkremotely.test.js tests/server/scrapers/nyfa.test.js tests/server/scrapers/ixda.test.js \
  tests/fixtures/
git commit -m "feat: add Cheerio scrapers for WeWorkRemotely, NYFA, IxDA"
```

---

## Task 6: The Muse API Scraper

**Files:**
- Create: `server/scrapers/themuse.js`
- Create: `tests/server/scrapers/themuse.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/server/scrapers/themuse.test.js`:

```js
import { describe, test, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'

vi.mock('axios')

describe('themuse scraper', () => {
  beforeEach(() => vi.clearAllMocks())

  test('maps API response to job shape', async () => {
    axios.get.mockResolvedValue({
      data: {
        results: [
          {
            name: 'Head of Product',
            company: { name: 'StartupCo' },
            locations: [{ name: 'New York, NY' }],
            refs: { landing_page: 'https://www.themuse.com/jobs/startupco/head-of-product' },
            publication_date: '2026-03-27T00:00:00Z',
            contents: '<p>Lead product at a fast-growing startup.</p>',
          }
        ],
        total: 1,
        page_count: 1,
      }
    })

    const { scrape } = await import('../../../server/scrapers/themuse.js')
    const jobs = await scrape()
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      title: 'Head of Product',
      company: 'StartupCo',
      location: 'New York, NY',
      source: 'themuse',
    })
    expect(jobs[0].url).toContain('themuse.com')
  })
})
```

- [ ] **Step 2: Run to verify test fails**

```bash
npm test -- --run tests/server/scrapers/themuse.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/scrapers/themuse.js`**

```js
import axios from 'axios'

const BASE = 'https://www.themuse.com/api/public/jobs'
const CATEGORIES = ['Product Management', 'Business Development']

export async function scrape() {
  const all = []
  for (const category of CATEGORIES) {
    let page = 1
    while (page <= 3) {
      const { data } = await axios.get(BASE, {
        params: { category, page, descending: true }
      })
      const jobs = data.results.map(j => ({
        title: j.name,
        company: j.company?.name || '',
        location: j.locations?.[0]?.name || '',
        remote: detectRemote(j.locations?.[0]?.name || ''),
        url: j.refs?.landing_page || '',
        source: 'themuse',
        posted_at: j.publication_date ? j.publication_date.slice(0, 10) : null,
        description: j.contents ? j.contents.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '',
      }))
      all.push(...jobs)
      if (page >= data.page_count) break
      page++
      await sleep(1000)
    }
  }
  return all
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote') || l.includes('flexible')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run tests/server/scrapers/themuse.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scrapers/themuse.js tests/server/scrapers/themuse.test.js
git commit -m "feat: add The Muse API scraper for product + BD categories"
```

---

## Task 7: Playwright Scrapers — Backstage, Web3.career, StaffMeUp, CreatorEconomyJobs

**Files:**
- Create: `server/scrapers/backstage.js`
- Create: `server/scrapers/web3career.js`
- Create: `server/scrapers/staffmeup.js`
- Create: `server/scrapers/creatoreconomyjobs.js`
- Create: `tests/fixtures/backstage.html`
- Create: `tests/fixtures/web3career.html`
- Create: `tests/fixtures/staffmeup.html`
- Create: `tests/fixtures/creatoreconomyjobs.html`
- Create: `tests/server/scrapers/backstage.test.js`
- Create: `tests/server/scrapers/web3career.test.js`
- Create: `tests/server/scrapers/staffmeup.test.js`
- Create: `tests/server/scrapers/creatoreconomyjobs.test.js`

> **Before writing code:** For each site, open the URL in a browser, inspect the job listing HTML (DevTools → Elements), and note the CSS selectors for: job title, company, location, job URL, and description. Update the selectors in the `parse()` functions below to match what you see. The fixture HTML and selectors below are based on the current site structure and may need adjustment.

- [ ] **Step 1: Create fixture HTMLs**

Create `tests/fixtures/backstage.html`:

```html
<div class="jobs-list">
  <div class="job-listing-item" data-job-id="123">
    <a class="job-listing-link" href="https://www.backstage.com/casting/jobs/123">
      <h3 class="job-listing-name">Creative Producer</h3>
      <p class="job-listing-company">Production House</p>
      <p class="job-listing-location">New York, NY</p>
    </a>
  </div>
</div>
```

Create `tests/fixtures/web3career.html`:

```html
<div id="jobs-list">
  <div class="job-card">
    <h2><a href="/web3-product-manager-dao" class="job-title-link">Web3 Product Manager</a></h2>
    <span class="company-name">DAO Labs</span>
    <span class="job-location">Remote</span>
    <div class="job-description">Build decentralized products.</div>
  </div>
</div>
```

Create `tests/fixtures/staffmeup.html`:

```html
<div class="jobs-container">
  <div class="job-card">
    <h3 class="job-title"><a href="https://app.staffmeup.com/jobs/partnerships-manager-456">Partnerships Manager</a></h3>
    <div class="company">MediaCo</div>
    <div class="location">New York, NY (Hybrid)</div>
    <div class="description">Build media partnerships.</div>
  </div>
</div>
```

Create `tests/fixtures/creatoreconomyjobs.html`:

```html
<div class="job-list">
  <div class="job-card">
    <a href="https://creatoreconomyjobs.co/jobs/creator-partnerships-lead" class="job-link">
      <h3 class="job-title">Creator Partnerships Lead</h3>
      <p class="company">CreatorPlatform</p>
      <p class="location">Remote</p>
    </a>
    <p class="description">Lead creator partnerships strategy.</p>
  </div>
</div>
```

- [ ] **Step 2: Write the failing tests**

Create `tests/server/scrapers/backstage.test.js`:

```js
import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/backstage.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/backstage.html'), 'utf8')

test('parse extracts backstage job fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Creative Producer',
    company: 'Production House',
    location: 'New York, NY',
    source: 'backstage',
  })
  expect(jobs[0].url).toContain('backstage.com')
})
```

Create `tests/server/scrapers/web3career.test.js`:

```js
import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/web3career.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/web3career.html'), 'utf8')

test('parse extracts web3career job fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Web3 Product Manager',
    company: 'DAO Labs',
    remote: 'remote',
    source: 'web3career',
  })
})
```

Create `tests/server/scrapers/staffmeup.test.js`:

```js
import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/staffmeup.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/staffmeup.html'), 'utf8')

test('parse extracts staffmeup job fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Partnerships Manager',
    company: 'MediaCo',
    source: 'staffmeup',
  })
})
```

Create `tests/server/scrapers/creatoreconomyjobs.test.js`:

```js
import { test, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from '../../../server/scrapers/creatoreconomyjobs.js'

const fixture = readFileSync(path.join(process.cwd(), 'tests/fixtures/creatoreconomyjobs.html'), 'utf8')

test('parse extracts creatoreconomyjobs fields', () => {
  const jobs = parse(fixture)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({
    title: 'Creator Partnerships Lead',
    company: 'CreatorPlatform',
    remote: 'remote',
    source: 'creatoreconomyjobs',
  })
})
```

- [ ] **Step 3: Run to verify tests fail**

```bash
npm test -- --run tests/server/scrapers/backstage.test.js tests/server/scrapers/web3career.test.js tests/server/scrapers/staffmeup.test.js tests/server/scrapers/creatoreconomyjobs.test.js
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Create `server/scrapers/backstage.js`**

```js
import * as cheerio from 'cheerio'
import { chromium } from 'playwright'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-listing-item').each((_, el) => {
    const a = $(el).find('.job-listing-link')
    const href = a.attr('href')
    const title = $(el).find('.job-listing-name').text().trim()
    const company = $(el).find('.job-listing-company').text().trim()
    const location = $(el).find('.job-listing-location').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://www.backstage.com${href}`,
      source: 'backstage',
      posted_at: null,
      description: '',
    })
  })
  return jobs
}

export async function scrape() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto('https://www.backstage.com/casting/', { waitUntil: 'networkidle' })
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
```

- [ ] **Step 5: Create `server/scrapers/web3career.js`**

```js
import * as cheerio from 'cheerio'
import { chromium } from 'playwright'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('#jobs-list .job-card, .job-card').each((_, el) => {
    const titleEl = $(el).find('.job-title-link, h2 a').first()
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    const company = $(el).find('.company-name').text().trim()
    const location = $(el).find('.job-location').text().trim()
    const description = $(el).find('.job-description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://web3.career${href}`,
      source: 'web3career',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto('https://web3.career/', { waitUntil: 'networkidle' })
    await page.waitForSelector('.job-card', { timeout: 10000 })
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
```

- [ ] **Step 6: Create `server/scrapers/staffmeup.js`**

```js
import * as cheerio from 'cheerio'
import { chromium } from 'playwright'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-card').each((_, el) => {
    const titleEl = $(el).find('.job-title a')
    const title = titleEl.text().trim()
    const href = titleEl.attr('href')
    const company = $(el).find('.company').text().trim()
    const location = $(el).find('.location').text().trim()
    const description = $(el).find('.description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://app.staffmeup.com${href}`,
      source: 'staffmeup',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto('https://app.staffmeup.com/jobs?tab=jobs', { waitUntil: 'networkidle' })
    await page.waitForSelector('.job-card', { timeout: 10000 })
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
```

- [ ] **Step 7: Create `server/scrapers/creatoreconomyjobs.js`**

```js
import * as cheerio from 'cheerio'
import { chromium } from 'playwright'

export function parse(html) {
  const $ = cheerio.load(html)
  const jobs = []
  $('.job-card').each((_, el) => {
    const a = $(el).find('.job-link, a').first()
    const href = a.attr('href')
    const title = $(el).find('.job-title').text().trim()
    const company = $(el).find('.company').text().trim()
    const location = $(el).find('.location').text().trim()
    const description = $(el).find('.description').text().trim()
    if (!title || !href) return
    jobs.push({
      title,
      company,
      location,
      remote: detectRemote(location),
      url: href.startsWith('http') ? href : `https://creatoreconomyjobs.co${href}`,
      source: 'creatoreconomyjobs',
      posted_at: null,
      description,
    })
  })
  return jobs
}

export async function scrape() {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto('https://creatoreconomyjobs.co/', { waitUntil: 'networkidle' })
    await page.waitForSelector('.job-card', { timeout: 10000 })
    const html = await page.content()
    return parse(html)
  } finally {
    await browser.close()
  }
}

function detectRemote(location = '') {
  const l = location.toLowerCase()
  if (l.includes('remote')) return 'remote'
  if (l.includes('hybrid')) return 'hybrid'
  return 'onsite'
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npm test -- --run tests/server/scrapers/backstage.test.js tests/server/scrapers/web3career.test.js tests/server/scrapers/staffmeup.test.js tests/server/scrapers/creatoreconomyjobs.test.js
```

Expected: PASS — all 4 tests green.

- [ ] **Step 9: Commit**

```bash
git add server/scrapers/backstage.js server/scrapers/web3career.js server/scrapers/staffmeup.js server/scrapers/creatoreconomyjobs.js \
  tests/server/scrapers/backstage.test.js tests/server/scrapers/web3career.test.js tests/server/scrapers/staffmeup.test.js tests/server/scrapers/creatoreconomyjobs.test.js \
  tests/fixtures/backstage.html tests/fixtures/web3career.html tests/fixtures/staffmeup.html tests/fixtures/creatoreconomyjobs.html
git commit -m "feat: add Playwright scrapers for Backstage, Web3.career, StaffMeUp, CreatorEconomyJobs"
```

---

## Task 8: LinkedIn Scraper (Composio)

**Files:**
- Create: `server/scrapers/linkedin.js`

> **Before implementing:** In your Composio dashboard, find the exact action name for LinkedIn job search. It is likely `LINKEDIN_SEARCH_JOB_POSTINGS` or `LINKEDIN_GET_JOB_RECOMMENDATIONS`. Search for "job" in the Composio actions list for your LinkedIn connection.

- [ ] **Step 1: Create `server/scrapers/linkedin.js`**

```js
import { OpenAIToolSet } from 'composio-core'

// Action name — verify in your Composio dashboard under LinkedIn actions
const LINKEDIN_ACTION = 'LINKEDIN_SEARCH_JOB_POSTINGS'

export async function scrape() {
  const toolset = new OpenAIToolSet({ apiKey: process.env.COMPOSIO_API_KEY })
  const result = await toolset.executeAction(LINKEDIN_ACTION, {
    keywords: 'product manager OR partnerships manager OR head of product OR business development',
    location: 'New York, NY',
    count: 50,
  })

  if (!result?.data?.elements) {
    console.warn('LinkedIn scraper: unexpected response shape', JSON.stringify(result).slice(0, 200))
    return []
  }

  return result.data.elements.map(job => ({
    title: job.title || job.position || '',
    company: job.companyName || job.company?.name || '',
    location: job.formattedLocation || job.location || 'New York, NY',
    remote: detectRemote(job.workplaceType || job.formattedLocation || ''),
    url: job.applyUrl || job.entityUrn
      ? `https://www.linkedin.com/jobs/view/${job.entityUrn?.split(':').pop()}/`
      : '',
    source: 'linkedin',
    posted_at: job.listedAt
      ? new Date(job.listedAt).toISOString().slice(0, 10)
      : null,
    description: job.description?.text || '',
  })).filter(j => j.title && j.url)
}

function detectRemote(type = '') {
  const t = type.toLowerCase()
  if (t.includes('remote')) return 'remote'
  if (t.includes('hybrid')) return 'hybrid'
  if (t.includes('onsite') || t.includes('on-site')) return 'onsite'
  return 'unknown'
}
```

- [ ] **Step 2: Smoke test LinkedIn scraper manually**

```bash
node -e "
import('./server/scrapers/linkedin.js').then(m => m.scrape()).then(jobs => {
  console.log('Jobs found:', jobs.length)
  if (jobs.length) console.log('First job:', JSON.stringify(jobs[0], null, 2))
}).catch(console.error)
"
```

Expected: prints job count and first job object. If the response shape is unexpected, adjust the field mappings in `scrape()` to match what Composio returns.

- [ ] **Step 3: Commit**

```bash
git add server/scrapers/linkedin.js
git commit -m "feat: add LinkedIn scraper via Composio SDK"
```

---

## Task 9: Fit Scorer

**Files:**
- Create: `server/scorer.js`
- Create: `tests/server/scorer.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/server/scorer.test.js`:

```js
import { describe, test, expect, vi, beforeEach } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'

vi.mock('@anthropic-ai/sdk')

const MOCK_PROFILE = {
  background: 'Experienced product leader with BD background in regulated industries.',
  weights: {
    core_mechanism: 1, product_depth: 1, regulated_complexity: 1,
    bd_track_record: 1, mba_preference: 1, domain_gap: 1, gap_bridgeability: 1
  }
}

const MOCK_SCORE_RESPONSE = {
  dimensions: {
    core_mechanism: { score: 8, reasoning: 'Role needs cross-functional influence.' },
    product_depth: { score: 7, reasoning: 'Owns a product line.' },
    regulated_complexity: { score: 9, reasoning: 'Fintech is highly regulated.' },
    bd_track_record: { score: 6, reasoning: 'Deal-closing mentioned.' },
    mba_preference: { score: 5, reasoning: 'MBA preferred but not required.' },
    domain_gap: { score: 4, reasoning: 'No crypto background.' },
    gap_bridgeability: { score: 7, reasoning: 'Crypto is learnable from fintech base.' },
  },
  aggregate: 6.57,
  summary: 'Strong fit on influence and regulated complexity. Domain gap in crypto is bridgeable.'
}

describe('scoreJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }]
        })
      }
    }))
  })

  test('returns parsed dimensions, aggregate, and summary', async () => {
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const result = await scoreJob(
      { title: 'PM', description: 'Lead product at a crypto startup.' },
      MOCK_PROFILE
    )
    expect(result.dimensions.core_mechanism.score).toBe(8)
    expect(result.aggregate).toBe(6.57)
    expect(result.summary).toContain('influence')
  })

  test('recalculates aggregate using profile weights', async () => {
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const heavyWeights = { ...MOCK_PROFILE, weights: {
      core_mechanism: 2, product_depth: 1, regulated_complexity: 1,
      bd_track_record: 1, mba_preference: 1, domain_gap: 1, gap_bridgeability: 1
    }}
    const result = await scoreJob(
      { title: 'PM', description: 'desc' },
      heavyWeights
    )
    // core_mechanism (score 8) is double-weighted — aggregate should differ from 6.57
    const dims = MOCK_SCORE_RESPONSE.dimensions
    const expected = (
      dims.core_mechanism.score * 2 +
      dims.product_depth.score * 1 +
      dims.regulated_complexity.score * 1 +
      dims.bd_track_record.score * 1 +
      dims.mba_preference.score * 1 +
      dims.domain_gap.score * 1 +
      dims.gap_bridgeability.score * 1
    ) / 8
    expect(result.aggregate).toBeCloseTo(expected, 2)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npm test -- --run tests/server/scorer.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `server/scorer.js`**

```js
import Anthropic from '@anthropic-ai/sdk'

const DIMENSIONS = [
  'core_mechanism',
  'product_depth',
  'regulated_complexity',
  'bd_track_record',
  'mba_preference',
  'domain_gap',
  'gap_bridgeability',
]

const DIMENSION_DESCRIPTIONS = {
  core_mechanism: 'Does the role run primarily on influence without authority? Score 10 if the job requires driving outcomes through persuasion, alignment, and coalition-building across teams with no direct reports.',
  product_depth: 'Is the person close to the product, owning a roadmap or specific surface? Score 10 if the role has clear product ownership.',
  regulated_complexity: 'Does the constraint-heavy environment (regulated industries, compliance, legal) experience transfer? Score 10 if the role is in a regulated domain.',
  bd_track_record: 'Is the deal-closing and partnership background a direct credential for this role, not just color? Score 10 if BD is the primary skill required.',
  mba_preference: 'Does the role explicitly prefer or require an MBA? Score 10 if MBA is mandatory, 5 if preferred, 1 if not mentioned.',
  domain_gap: 'What is the missing background the candidate lacks? Score 10 if there is no domain gap, 1 if the gap is large and central to the role.',
  gap_bridgeability: 'Is the identified domain gap learnable on the job, or is it structural? Score 10 if the gap is easily bridgeable, 1 if it is a hard blocker.',
}

export async function scoreJob(job, profile) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const systemPrompt = `You are a job-fit evaluator. You will assess a job listing against a candidate profile using exactly 7 dimensions.

Candidate background:
${profile.background}

Dimensions to score (each 1-10):
${DIMENSIONS.map(d => `- ${d}: ${DIMENSION_DESCRIPTIONS[d]}`).join('\n')}

Respond ONLY with valid JSON in this exact shape:
{
  "dimensions": {
    ${DIMENSIONS.map(d => `"${d}": { "score": <number 1-10>, "reasoning": "<one sentence>" }`).join(',\n    ')}
  },
  "aggregate": <weighted average, will be recalculated — just use equal weights here>,
  "summary": "<2-3 sentence overall fit summary>"
}`

  const userPrompt = `Job title: ${job.title}

Job description:
${job.description || '(no description provided)'}`

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const parsed = JSON.parse(response.content[0].text)
  const aggregate = computeAggregate(parsed.dimensions, profile.weights)

  return {
    dimensions: parsed.dimensions,
    aggregate,
    summary: parsed.summary,
  }
}

function computeAggregate(dimensions, weights) {
  let total = 0
  let weightSum = 0
  for (const dim of DIMENSIONS) {
    const w = weights[dim] ?? 1
    total += (dimensions[dim]?.score ?? 0) * w
    weightSum += w
  }
  return Math.round((total / weightSum) * 100) / 100
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --run tests/server/scorer.test.js
```

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add server/scorer.js tests/server/scorer.test.js
git commit -m "feat: add Claude-powered 7-dimension fit scorer with weighted aggregate"
```

---

## Task 10: Scheduler + Profile Template + Wire Pipeline

**Files:**
- Create: `server/scheduler.js`
- Create: `server/profile.json`

- [ ] **Step 1: Create `server/profile.json`**

```json
{
  "background": "I am a product and partnerships leader with 8+ years of experience in regulated industries (fintech, insurance, healthcare). I excel at driving outcomes through influence without direct authority — building alignment across engineering, legal, compliance, and external partners. My BD track record includes closing multi-million-dollar platform deals. I hold an MBA. I am based in New York City and open to remote or hybrid roles. I am looking for senior individual contributor or director-level product or partnerships roles.",
  "weights": {
    "core_mechanism": 1,
    "product_depth": 1,
    "regulated_complexity": 1,
    "bd_track_record": 1,
    "mba_preference": 1,
    "domain_gap": 1,
    "gap_bridgeability": 1
  }
}
```

> **Edit this file now** — replace the `background` value with your actual background before running the app.

- [ ] **Step 2: Create `server/scheduler.js`**

```js
import cron from 'node-cron'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runAllScrapers } from './scrapers/index.js'
import { scoreJob } from './scorer.js'
import { updateScore, getJobById } from './db.js'

import * as weworkremotely from './scrapers/weworkremotely.js'
import * as nyfa from './scrapers/nyfa.js'
import * as ixda from './scrapers/ixda.js'
import * as themuse from './scrapers/themuse.js'
import * as backstage from './scrapers/backstage.js'
import * as web3career from './scrapers/web3career.js'
import * as staffmeup from './scrapers/staffmeup.js'
import * as creatoreconomyjobs from './scrapers/creatoreconomyjobs.js'
import * as linkedin from './scrapers/linkedin.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ALL_SCRAPERS = [weworkremotely, nyfa, ixda, themuse, backstage, web3career, staffmeup, creatoreconomyjobs, linkedin]

function loadProfile() {
  const raw = readFileSync(path.join(__dirname, 'profile.json'), 'utf8')
  return JSON.parse(raw)
}

export async function runPipeline(db) {
  console.log('[pipeline] Starting scrape...')
  const profile = loadProfile()
  const newIds = await runAllScrapers(db, ALL_SCRAPERS)
  console.log(`[pipeline] Scraped ${newIds.length} new jobs. Scoring...`)

  let scored = 0
  for (const id of newIds) {
    try {
      const job = getJobById(db, id)
      if (!job) continue
      const result = await scoreJob(job, profile)
      updateScore(db, id, result.aggregate, { ...result.dimensions, summary: result.summary })
      scored++
      await sleep(500) // rate limit Claude API calls
    } catch (err) {
      console.error(`[pipeline] Scoring failed for ${id}:`, err.message)
    }
  }

  console.log(`[pipeline] Done. ${newIds.length} scraped, ${scored} scored.`)
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
```

- [ ] **Step 3: Update `server/index.js` to import and start the scheduler**

Open `server/index.js`. Replace the bottom section (the `if (process.argv[1]...)` block) with:

```js
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
```

- [ ] **Step 4: Run the full test suite to confirm nothing broke**

```bash
npm test -- --run
```

Expected: all previous tests still pass.

- [ ] **Step 5: Commit**

```bash
git add server/scheduler.js server/profile.json server/index.js
git commit -m "feat: add scheduler, pipeline orchestration, and profile template"
```

---

## Task 11: React API Client + useJobs Hook

**Files:**
- Create: `src/api.js`
- Create: `src/hooks/useJobs.js`

- [ ] **Step 1: Create `src/api.js`**

```js
const BASE = '/api'

export async function fetchJobs() {
  const res = await fetch(`${BASE}/jobs`)
  if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`)
  return res.json()
}

export async function fetchJob(id) {
  const res = await fetch(`${BASE}/jobs/${id}`)
  if (!res.ok) throw new Error(`Failed to fetch job ${id}: ${res.status}`)
  return res.json()
}

export async function triggerRefresh() {
  const res = await fetch(`${BASE}/refresh`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to trigger refresh: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Create `src/hooks/useJobs.js`**

```js
import { useState, useEffect, useCallback } from 'react'
import { fetchJobs, triggerRefresh } from '../api.js'

export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastRefreshed, setLastRefreshed] = useState(null)
  const [filters, setFilters] = useState({
    sources: [],       // [] means all
    remote: 'all',     // 'all' | 'remote' | 'onsite' | 'hybrid'
    minScore: 0,
  })

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchJobs()
      setJobs(data)
      setLastRefreshed(new Date())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(async () => {
    try {
      setRefreshing(true)
      await triggerRefresh()
      // Poll for new results after a short delay (pipeline is async)
      setTimeout(() => load(), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }, [load])

  const filteredJobs = jobs.filter(job => {
    if (filters.sources.length > 0 && !filters.sources.includes(job.source)) return false
    if (filters.remote !== 'all' && job.remote !== filters.remote) return false
    if (filters.minScore > 0 && (job.score_aggregate === null || job.score_aggregate < filters.minScore)) return false
    return true
  })

  return { jobs: filteredJobs, allJobs: jobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/api.js src/hooks/useJobs.js
git commit -m "feat: add API client and useJobs hook with filtering"
```

---

## Task 12: JobCard Component

**Files:**
- Create: `src/components/JobCard.jsx`
- Create: `tests/client/JobCard.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/client/JobCard.test.jsx`:

```jsx
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JobCard from '../../src/components/JobCard.jsx'

const JOB = {
  id: 'abc123',
  title: 'Product Manager',
  company: 'Acme',
  location: 'New York, NY',
  remote: 'hybrid',
  source: 'weworkremotely',
  score_aggregate: 7.5,
  score_dimensions: JSON.stringify({
    core_mechanism: { score: 8, reasoning: 'Influence-based role.' },
    summary: 'Strong fit overall.'
  }),
  seen: 0,
  url: 'https://x.com/1',
}

test('renders title, company, location', () => {
  render(<JobCard job={JOB} onSelect={vi.fn()} />)
  expect(screen.getByText('Product Manager')).toBeInTheDocument()
  expect(screen.getByText('Acme')).toBeInTheDocument()
  expect(screen.getByText('New York, NY')).toBeInTheDocument()
})

test('shows "New" badge when seen is 0', () => {
  render(<JobCard job={JOB} onSelect={vi.fn()} />)
  expect(screen.getByText('New')).toBeInTheDocument()
})

test('does not show "New" badge when seen is 1', () => {
  render(<JobCard job={{ ...JOB, seen: 1 }} onSelect={vi.fn()} />)
  expect(screen.queryByText('New')).not.toBeInTheDocument()
})

test('score badge shows aggregate score', () => {
  render(<JobCard job={JOB} onSelect={vi.fn()} />)
  expect(screen.getByText('7.5')).toBeInTheDocument()
})

test('calls onSelect with job id when clicked', () => {
  const onSelect = vi.fn()
  render(<JobCard job={JOB} onSelect={onSelect} />)
  fireEvent.click(screen.getByRole('article'))
  expect(onSelect).toHaveBeenCalledWith('abc123')
})
```

- [ ] **Step 2: Run to verify test fails**

```bash
npm test -- --run tests/client/JobCard.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/JobCard.jsx`**

```jsx
export default function JobCard({ job, onSelect, selected }) {
  const score = job.score_aggregate
  const scoreColor = score === null ? '#888'
    : score >= 7 ? '#22c55e'
    : score >= 4 ? '#eab308'
    : '#ef4444'

  const remoteBadge = {
    remote: { label: 'Remote', bg: '#dcfce7', color: '#166534' },
    hybrid: { label: 'Hybrid', bg: '#fef9c3', color: '#854d0e' },
    onsite: { label: 'On-site', bg: '#fee2e2', color: '#991b1b' },
  }[job.remote] || { label: job.remote, bg: '#f3f4f6', color: '#374151' }

  return (
    <article
      role="article"
      onClick={() => onSelect(job.id)}
      style={{
        border: selected ? '2px solid #3b82f6' : '1px solid #e5e7eb',
        borderRadius: 8,
        padding: '12px 16px',
        cursor: 'pointer',
        background: selected ? '#eff6ff' : '#fff',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Score badge */}
      <div style={{
        minWidth: 44, height: 44, borderRadius: '50%',
        background: scoreColor, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 14,
      }}>
        {score !== null ? score.toFixed(1) : '–'}
      </div>

      {/* Main content */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong style={{ fontSize: 15 }}>{job.title}</strong>
          {!job.seen && (
            <span style={{ background: '#3b82f6', color: '#fff', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>
              New
            </span>
          )}
        </div>
        <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>
          {job.company} · {job.location}
        </div>
      </div>

      {/* Right badges */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <span style={{ background: remoteBadge.bg, color: remoteBadge.color, borderRadius: 4, padding: '2px 8px', fontSize: 12 }}>
          {remoteBadge.label}
        </span>
        <span style={{ color: '#9ca3af', fontSize: 11 }}>
          {job.source}
        </span>
      </div>
    </article>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run tests/client/JobCard.test.jsx
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobCard.jsx tests/client/JobCard.test.jsx
git commit -m "feat: add JobCard component with score badge and New indicator"
```

---

## Task 13: FilterBar Component

**Files:**
- Create: `src/components/FilterBar.jsx`
- Create: `tests/client/FilterBar.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/client/FilterBar.test.jsx`:

```jsx
import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../../src/components/FilterBar.jsx'

const SOURCES = ['weworkremotely', 'linkedin', 'nyfa']
const FILTERS = { sources: [], remote: 'all', minScore: 0 }

test('renders source checkboxes', () => {
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={vi.fn()} />)
  expect(screen.getByLabelText('weworkremotely')).toBeInTheDocument()
  expect(screen.getByLabelText('linkedin')).toBeInTheDocument()
})

test('calls onChange with updated sources when checkbox toggled', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.click(screen.getByLabelText('linkedin'))
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, sources: ['linkedin'] })
})

test('calls onChange when remote filter changes', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remote' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, remote: 'remote' })
})

test('calls onChange when min score slider moves', () => {
  const onChange = vi.fn()
  render(<FilterBar sources={SOURCES} filters={FILTERS} onChange={onChange} />)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '6' } })
  expect(onChange).toHaveBeenCalledWith({ ...FILTERS, minScore: 6 })
})
```

- [ ] **Step 2: Run to verify test fails**

```bash
npm test -- --run tests/client/FilterBar.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/FilterBar.jsx`**

```jsx
export default function FilterBar({ sources, filters, onChange }) {
  function toggleSource(source) {
    const next = filters.sources.includes(source)
      ? filters.sources.filter(s => s !== source)
      : [...filters.sources, source]
    onChange({ ...filters, sources: next })
  }

  return (
    <div style={{ padding: '12px 16px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
      {/* Source checkboxes */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Sources</span>
        {sources.map(src => (
          <label key={src} htmlFor={`src-${src}`} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <input
              id={`src-${src}`}
              type="checkbox"
              checked={filters.sources.includes(src)}
              onChange={() => toggleSource(src)}
            />
            {src}
          </label>
        ))}
      </div>

      {/* Remote filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Remote</span>
        <select
          value={filters.remote}
          onChange={e => onChange({ ...filters, remote: e.target.value })}
          style={{ fontSize: 13, padding: '2px 6px', borderRadius: 4, border: '1px solid #d1d5db' }}
        >
          <option value="all">All</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
      </div>

      {/* Min score slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>Min Score</span>
        <input
          type="range"
          min={0} max={10} step={1}
          value={filters.minScore}
          onChange={e => onChange({ ...filters, minScore: Number(e.target.value) })}
        />
        <span style={{ fontSize: 13, minWidth: 16 }}>{filters.minScore}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run tests/client/FilterBar.test.jsx
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/FilterBar.jsx tests/client/FilterBar.test.jsx
git commit -m "feat: add FilterBar with source checkboxes, remote toggle, and score slider"
```

---

## Task 14: JobDetail Component

**Files:**
- Create: `src/components/JobDetail.jsx`
- Create: `tests/client/JobDetail.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `tests/client/JobDetail.test.jsx`:

```jsx
import { test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import JobDetail from '../../src/components/JobDetail.jsx'

const JOB = {
  id: 'abc123',
  title: 'Product Manager',
  company: 'Acme',
  location: 'New York, NY',
  remote: 'hybrid',
  source: 'weworkremotely',
  url: 'https://example.com/job/1',
  score_aggregate: 7.5,
  score_dimensions: JSON.stringify({
    core_mechanism: { score: 8, reasoning: 'Influence-based role.' },
    product_depth: { score: 7, reasoning: 'Owns product.' },
    regulated_complexity: { score: 9, reasoning: 'Fintech.' },
    bd_track_record: { score: 6, reasoning: 'BD mentioned.' },
    mba_preference: { score: 5, reasoning: 'Preferred.' },
    domain_gap: { score: 4, reasoning: 'No crypto.' },
    gap_bridgeability: { score: 7, reasoning: 'Learnable.' },
    summary: 'Strong fit overall.',
  }),
  posted_at: '2026-03-28',
}

test('renders job title and company', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText('Product Manager')).toBeInTheDocument()
  expect(screen.getByText('Acme')).toBeInTheDocument()
})

test('renders all 7 dimension labels', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText(/core.mechanism/i)).toBeInTheDocument()
  expect(screen.getByText(/product.depth/i)).toBeInTheDocument()
  expect(screen.getByText(/gap.bridgeability/i)).toBeInTheDocument()
})

test('renders dimension scores', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText('8 / 10')).toBeInTheDocument()
})

test('renders link to original listing', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  const link = screen.getByRole('link', { name: /view listing/i })
  expect(link).toHaveAttribute('href', 'https://example.com/job/1')
})

test('renders AI summary', () => {
  render(<JobDetail job={JOB} onClose={vi.fn()} />)
  expect(screen.getByText('Strong fit overall.')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify test fails**

```bash
npm test -- --run tests/client/JobDetail.test.jsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/JobDetail.jsx`**

```jsx
const DIMENSION_LABELS = {
  core_mechanism: 'Core Mechanism',
  product_depth: 'Product Depth',
  regulated_complexity: 'Regulated Complexity',
  bd_track_record: 'BD Track Record',
  mba_preference: 'MBA Preference',
  domain_gap: 'Domain Gap',
  gap_bridgeability: 'Gap Bridgeability',
}

const DIMENSION_ORDER = Object.keys(DIMENSION_LABELS)

export default function JobDetail({ job, onClose }) {
  const dims = job.score_dimensions ? JSON.parse(job.score_dimensions) : {}
  const summary = dims.summary || null

  return (
    <div style={{ padding: 20, borderLeft: '1px solid #e5e7eb', overflowY: 'auto', height: '100%' }}>
      <button
        onClick={onClose}
        style={{ float: 'right', background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' }}
        aria-label="close"
      >
        ✕
      </button>

      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{job.title}</h2>
      <p style={{ margin: '0 0 8px', color: '#6b7280', fontSize: 14 }}>
        {job.company} · {job.location} · {job.source}
      </p>

      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 13, color: '#3b82f6' }}
      >
        View listing →
      </a>

      {summary && (
        <p style={{ marginTop: 16, padding: 12, background: '#f0fdf4', borderRadius: 6, fontSize: 13, lineHeight: 1.5 }}>
          {summary}
        </p>
      )}

      <div style={{ marginTop: 20 }}>
        <strong style={{ fontSize: 13, color: '#374151' }}>Fit Score: {job.score_aggregate?.toFixed(1) ?? '–'} / 10</strong>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {DIMENSION_ORDER.map(key => {
            const d = dims[key]
            if (!d) return null
            const pct = (d.score / 10) * 100
            const barColor = d.score >= 7 ? '#22c55e' : d.score >= 4 ? '#eab308' : '#ef4444'
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{DIMENSION_LABELS[key]}</span>
                  <span style={{ color: '#6b7280' }}>{d.score} / 10</span>
                </div>
                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                </div>
                {d.reasoning && (
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>{d.reasoning}</p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --run tests/client/JobDetail.test.jsx
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobDetail.jsx tests/client/JobDetail.test.jsx
git commit -m "feat: add JobDetail component with dimension score bars and reasoning"
```

---

## Task 15: Header Component + App.jsx — Wire Everything Together

**Files:**
- Create: `src/components/Header.jsx`
- Modify: `src/App.jsx`
- Modify: `src/index.css` (reset + global styles)

- [ ] **Step 1: Create `src/components/Header.jsx`**

```jsx
export default function Header({ lastRefreshed, refreshing, onRefresh }) {
  const formatted = lastRefreshed
    ? lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <header style={{
      padding: '12px 20px',
      borderBottom: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      background: '#fff',
    }}>
      <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Job Search</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {formatted && (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Last updated {formatted}</span>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            padding: '6px 14px',
            background: refreshing ? '#e5e7eb' : '#3b82f6',
            color: refreshing ? '#6b7280' : '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            cursor: refreshing ? 'default' : 'pointer',
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Replace `src/App.jsx`**

```jsx
import { useState } from 'react'
import { useJobs } from './hooks/useJobs.js'
import Header from './components/Header.jsx'
import FilterBar from './components/FilterBar.jsx'
import JobCard from './components/JobCard.jsx'
import JobDetail from './components/JobDetail.jsx'

export default function App() {
  const { jobs, allJobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh } = useJobs()
  const [selectedId, setSelectedId] = useState(null)

  const selectedJob = allJobs.find(j => j.id === selectedId) || null
  const sources = [...new Set(allJobs.map(j => j.source))].sort()

  function handleSelect(id) {
    setSelectedId(prev => prev === id ? null : id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <Header lastRefreshed={lastRefreshed} refreshing={refreshing} onRefresh={refresh} />
      <FilterBar sources={sources} filters={filters} onChange={setFilters} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Job list */}
        <div style={{ flex: selectedJob ? '0 0 420px' : 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>Loading jobs…</p>}
          {error && <p style={{ color: '#ef4444', textAlign: 'center', marginTop: 40 }}>Error: {error}</p>}
          {!loading && !error && jobs.length === 0 && (
            <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40 }}>
              No jobs found. Click Refresh to scrape listings.
            </p>
          )}
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onSelect={handleSelect}
              selected={job.id === selectedId}
            />
          ))}
        </div>

        {/* Detail panel */}
        {selectedJob && (
          <div style={{ flex: 1, overflowY: 'auto', borderLeft: '1px solid #e5e7eb' }}>
            <JobDetail job={selectedJob} onClose={() => setSelectedId(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Replace `src/index.css` with minimal reset**

```css
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: #f9fafb; }
```

- [ ] **Step 4: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Start the dev server and verify the UI loads**

```bash
# In one terminal:
node server/index.js

# In another terminal:
npm run dev
```

Open `http://localhost:5173`. Expected: app loads with empty state and "No jobs found" message. Click Refresh — server should log `[pipeline] Starting scrape...`.

- [ ] **Step 6: Edit `server/profile.json`** with your actual background before running for real.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/components/Header.jsx src/index.css
git commit -m "feat: wire up full UI with Header, FilterBar, job list, and detail panel"
```

---

## Task 16: Final Smoke Test

- [ ] **Step 1: Run full test suite**

```bash
npm test -- --run
```

Expected: all tests pass, 0 failures.

- [ ] **Step 2: Trigger a live scrape via the API**

```bash
curl -X POST http://localhost:3001/api/refresh
# Expected: {"status":"refresh started"}
```

Watch server logs for `[pipeline] Done.` — note how many jobs were scraped and scored.

- [ ] **Step 3: Verify jobs appear in the UI**

Open `http://localhost:5173`. Jobs should appear sorted by fit score with color-coded badges.

- [ ] **Step 4: If any scraper returns 0 results**, open that site in a browser, inspect the HTML structure, and update the CSS selectors in the corresponding `parse()` function.

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: final smoke test pass"
```
