# Google Careers Scraper + Manual Job Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google Careers scraper (stealth Playwright) and a manual job entry form in the Tracker tab so jobs found anywhere can be tracked.

**Architecture:** The Google scraper follows the same pattern as the existing LinkedIn/Playwright scrapers — it uses `server/scrapers/browser.js` (stealth Playwright) to render Google Careers search results and extract job cards. Manual job entry adds a `POST /api/jobs` endpoint, an `insertManualJob` DB helper, a `scoreOneJob` scheduler export, and a form component inside `Tracker.jsx`. Manual jobs use `source: 'manual'`, get auto-scored in the background after insertion, and show up immediately in the Tracker with `status: 'Saved'`.

**Tech Stack:** Node.js/Express, better-sqlite3, playwright-extra + puppeteer-extra-plugin-stealth (CJS via createRequire), React 18 + Vite, existing `browser.js` launch helper.

---

## File Map

| File | Change |
|------|--------|
| `server/scrapers/google.js` | **Create** — stealth Playwright scraper for Google Careers |
| `server/scheduler.js` | **Modify** — import google scraper, add to ALL_SCRAPERS, export `scoreOneJob` |
| `server/db.js` | **Modify** — add `insertManualJob` function |
| `server/index.js` | **Modify** — add `POST /api/jobs` endpoint |
| `src/api.js` | **Modify** — add `createJob` function |
| `src/hooks/useJobs.js` | **Modify** — add `addJob` callback, expose in return |
| `src/components/Tracker.jsx` | **Modify** — add "Add Job" button + inline form |

---

## Codebase Context (read before starting)

- `server/scrapers/browser.js` exports `launch()` — stealth Playwright chromium browser. Use this, don't create a new browser setup.
- `server/scrapers/utils.js` exports `detectRemote(locationStr)` — returns `'remote'|'hybrid'|'onsite'`.
- `server/db.js` exports `upsertJob(db, job)`, `makeId(source, url)`, `getJobById(db, id)`. The `upsertJob` ON CONFLICT clause preserves `score_aggregate` and `score_dimensions`.
- `server/scheduler.js` exports `runPipeline(db)`. It calls `loadProfile()` internally. You need to also export `scoreOneJob(db, id)`.
- `server/index.js` — `createApp(db, pipeline)` — add the POST route inside this function.
- `src/hooks/useJobs.js` — the `jobs` state is an array of job objects. `setJobs` is available in scope.
- `src/components/Tracker.jsx` — currently renders a table; the add-job form goes above the table, toggled by a button.

---

### Task 1: Google Careers Scraper

**Files:**
- Create: `server/scrapers/google.js`

The scraper navigates to Google Careers search for each of 5 queries, waits for job cards, and extracts title/company/location/URL. It uses one shared browser for all queries to avoid launching/closing repeatedly.

Google Careers DOM as of 2025: job cards are `<li>` elements inside `<ul>` containers. Each card has `<h3>` for title, an `<a href="/jobs/results/...">` for the link, and `<span>` elements for company and location. The class names are obfuscated and change with deployments — use structural selectors (`li a[href*="/jobs/results/"] closest li`) rather than class names.

- [ ] **Step 1: Create the scraper file**

```js
// server/scrapers/google.js
import { launch } from './browser.js'
import { detectRemote } from './utils.js'

const QUERIES = [
  'chief of staff',
  'creator partnerships',
  'music partnerships',
  'strategic partnerships manager',
  'business development manager',
]

export async function scrape() {
  const browser = await launch()
  const all = []

  try {
    for (const query of QUERIES) {
      const page = await browser.newPage()
      try {
        const url = `https://careers.google.com/jobs/results/?q=${encodeURIComponent(query)}&company=Google&company=YouTube&src=Online/Job+Board/google_jobs`
        console.log(`[google] Searching: "${query}"`)
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

        // Wait up to 8s for at least one job link to appear
        await page.waitForFunction(
          () => document.querySelector('a[href*="/jobs/results/"]') !== null,
          { timeout: 8000 }
        ).catch(() => console.warn(`[google] No results loaded for "${query}"`))

        const jobs = await page.evaluate(() => {
          // Find all job links (each links to an individual job posting)
          const links = Array.from(document.querySelectorAll('a[href*="/jobs/results/"]'))
          // Deduplicate by href
          const seen = new Set()
          return links
            .filter(a => {
              if (seen.has(a.href)) return false
              seen.add(a.href)
              return true
            })
            .map(a => {
              // Walk up to find the card container (li or article)
              let card = a
              for (let i = 0; i < 6; i++) {
                if (!card.parentElement) break
                card = card.parentElement
                if (card.tagName === 'LI' || card.tagName === 'ARTICLE') break
              }
              const title = card.querySelector('h3')?.textContent?.trim() || a.textContent?.trim()
              // Collect all short text spans in the card — company and location
              const textNodes = Array.from(card.querySelectorAll('span, p'))
                .map(el => el.textContent.trim())
                .filter(t => t && t.length < 80 && t !== title)
              const company = textNodes[0] || 'Google'
              const location = textNodes.find(t =>
                t.match(/,|\bNew York\b|\bRemote\b|\bCA\b|\bNY\b|\bWA\b/i)
              ) || textNodes[1] || ''
              return { title, url: a.href, company, location }
            })
            .filter(j => j.title && j.url)
        })

        console.log(`[google] "${query}" → ${jobs.length} jobs`)
        all.push(...jobs.map(j => ({
          title: j.title,
          company: j.company,
          location: j.location,
          remote: detectRemote(j.location),
          url: j.url,
          source: 'google',
          posted_at: null,
          description: '',
        })))
      } catch (err) {
        console.error(`[google] Failed query "${query}":`, err.message)
      } finally {
        await page.close()
      }

      // Polite delay between queries
      await new Promise(r => setTimeout(r, 2000))
    }
  } finally {
    await browser.close()
  }

  // Deduplicate by URL before returning
  const seen = new Set()
  return all.filter(j => {
    if (seen.has(j.url)) return false
    seen.add(j.url)
    return true
  })
}
```

- [ ] **Step 2: Smoke-test the scraper in isolation**

```bash
cd /Users/ashleyb/job-search-app
node --input-type=module <<'EOF'
import { scrape } from './server/scrapers/google.js'
const jobs = await scrape()
console.log('Total jobs:', jobs.length)
jobs.slice(0, 5).forEach(j => console.log(j.title, '|', j.company, '|', j.url.slice(0, 60)))
EOF
```

Expected: 5–30 unique jobs printed. If 0 jobs: Google may have changed their DOM. Run the script with `headless: false` in `browser.js` temporarily to inspect what loads. Common fix: change `waitUntil: 'domcontentloaded'` to `waitUntil: 'networkidle'` in the page.goto call.

- [ ] **Step 3: Register the scraper in scheduler.js**

Open `server/scheduler.js`. Add the import and add `google` to `ALL_SCRAPERS`:

```js
// Add this import after the existing scraper imports (around line 17):
import * as google from './scrapers/google.js'

// Change ALL_SCRAPERS (line 21) to:
const ALL_SCRAPERS = [weworkremotely, nyfa, ixda, themuse, backstage, web3career, staffmeup, creatoreconomyjobs, linkedin, jsearch, google]
```

- [ ] **Step 4: Verify scheduler starts without errors**

```bash
cd /Users/ashleyb/job-search-app
node -e "import('./server/scheduler.js').then(() => { console.log('imports OK'); process.exit(0) }).catch(e => { console.error(e); process.exit(1) })"
```

Expected: `imports OK`

- [ ] **Step 5: Commit**

```bash
cd /Users/ashleyb/job-search-app
git add server/scrapers/google.js server/scheduler.js
git commit -m "feat: add Google Careers stealth Playwright scraper"
```

---

### Task 2: Manual Job Backend

**Files:**
- Modify: `server/db.js` (add `insertManualJob`)
- Modify: `server/scheduler.js` (export `scoreOneJob`)
- Modify: `server/index.js` (add `POST /api/jobs`)

**Context:** Manual jobs need a slightly different insert than `upsertJob`: if the same URL is submitted twice, don't overwrite the user's title/company edits. The `insertManualJob` uses `INSERT OR IGNORE` (skip on conflict). After insert, the server triggers background scoring via `scoreOneJob`.

- [ ] **Step 1: Add `insertManualJob` to db.js**

Open `server/db.js`. Add this function after `upsertJob`:

```js
export function insertManualJob(db, { title, company, location, url, status }) {
  const id = makeId('manual', url)
  db.prepare(`
    INSERT OR IGNORE INTO jobs (id, title, company, location, remote, url, source, posted_at, description, fetched_at, seen, status)
    VALUES (@id, @title, @company, @location, @remote, @url, 'manual', NULL, '', @fetched_at, 1, @status)
  `).run({
    id,
    title: title.trim(),
    company: (company || '').trim(),
    location: (location || '').trim(),
    remote: (() => {
      const l = (location || '').toLowerCase()
      if (l.includes('remote') || l.includes('flexible')) return 'remote'
      if (l.includes('hybrid')) return 'hybrid'
      return 'onsite'
    })(),
    url: url.trim(),
    fetched_at: new Date().toISOString(),
    status: status || 'Saved',
  })
  return getJobById(db, id)
}
```

- [ ] **Step 2: Export `scoreOneJob` from scheduler.js**

Open `server/scheduler.js`. Add this export after `runPipeline`:

```js
export async function scoreOneJob(db, id) {
  const profile = loadProfile()
  const job = getJobById(db, id)
  if (!job) { console.warn(`[scoreOneJob] job ${id} not found`); return }
  try {
    console.log(`[scoreOneJob] Scoring: ${job.company} — ${job.title}`)
    const result = await scoreJob(job, profile)
    updateScore(db, id, result.aggregate, { ...result.dimensions, summary: result.summary })
    console.log(`[scoreOneJob] Done — score: ${result.aggregate}`)
  } catch (err) {
    console.error(`[scoreOneJob] Failed id=${id}:`, err.message)
  }
}
```

- [ ] **Step 3: Add `POST /api/jobs` to index.js**

Open `server/index.js`. Add the import at the top (alongside existing imports):

```js
import { getAllJobs, getJobById, markSeen, markAllSeen, updateJobTracking, insertManualJob } from './db.js'
```

Then add this route inside `createApp`, after the `PATCH /api/jobs/:id` handler and before `POST /api/refresh`:

```js
  app.post('/api/jobs', async (req, res) => {
    const { title, company, location, url, status } = req.body
    if (!title || !url) return res.status(400).json({ error: 'title and url are required' })
    const job = insertManualJob(db, { title, company, location, url, status })
    if (!job) return res.status(409).json({ error: 'Job with this URL already exists' })
    res.status(201).json(job)
    // Score in background — don't await
    import('./scheduler.js').then(({ scoreOneJob }) => {
      scoreOneJob(db, job.id).catch(err => console.error('[POST /api/jobs] scoring failed:', err.message))
    })
  })
```

- [ ] **Step 4: Manual test the endpoint**

Start the server: `node server/index.js`

In a separate terminal:
```bash
curl -s -X POST http://localhost:3001/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"title":"Strategic Partner Development Manager","company":"YouTube","location":"New York, NY","url":"https://www.google.com/about/careers/applications/jobs/results/124514176524526278-strategic-partner-development-manager-youtube-music-publishing","status":"Saved"}' \
  | python3 -m json.tool
```

Expected: JSON object with `id`, `title`, `company`, `source: "manual"`, `status: "Saved"`, `score_aggregate: null` (scoring is async).

Also verify duplicate protection:
```bash
# Run the same curl again — should return 409
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"title":"Strategic Partner Development Manager","company":"YouTube","location":"New York, NY","url":"https://www.google.com/about/careers/applications/jobs/results/124514176524526278-strategic-partner-development-manager-youtube-music-publishing","status":"Saved"}'
```

Expected: `409`

- [ ] **Step 5: Commit**

```bash
cd /Users/ashleyb/job-search-app
git add server/db.js server/scheduler.js server/index.js
git commit -m "feat: add manual job entry backend (POST /api/jobs, insertManualJob, scoreOneJob)"
```

---

### Task 3: Manual Job Frontend

**Files:**
- Modify: `src/api.js` (add `createJob`)
- Modify: `src/hooks/useJobs.js` (add `addJob`, expose in return)
- Modify: `src/components/Tracker.jsx` (add form UI)
- Modify: `src/App.jsx` (pass `addJob` to `<Tracker>`)

**UX:** A small "+ Add job manually" button sits above the tracker table. Clicking it reveals an inline form with fields: URL (required, full row), Title (required), Company, Location, Status (dropdown, defaults to Saved). Submit adds it optimistically and closes the form. Error shows inline if URL/title missing.

- [ ] **Step 1: Add `createJob` to api.js**

Open `src/api.js`. Add after `patchJob`:

```js
export async function createJob(data) {
  const res = await fetch(`${BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (res.status === 409) throw new Error('A job with this URL is already tracked.')
  if (!res.ok) throw new Error(`Failed to add job: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Add `addJob` callback to useJobs.js**

Open `src/hooks/useJobs.js`. Add the import for `createJob`:

```js
import { fetchJobs, triggerRefresh, patchJob, createJob } from '../api.js'
```

Add the `addJob` callback after `updateStatus`:

```js
  const addJob = useCallback(async (data) => {
    const job = await createJob(data)
    setJobs(prev => [...prev, job])
    return job
  }, [])
```

Add `addJob` to the return value:

```js
  return { jobs: filteredJobs, allJobs: jobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh, updateStatus, addJob }
```

- [ ] **Step 3: Update App.jsx to pass addJob to Tracker**

Open `src/App.jsx`. Change the destructuring on line 10 to include `addJob`:

```js
  const { jobs, allJobs, loading, refreshing, error, lastRefreshed, filters, setFilters, refresh, updateStatus, addJob } = useJobs()
```

Change the `<Tracker>` render (around line 84) to pass `addJob`:

```jsx
          <Tracker jobs={allJobs} onUpdate={updateStatus} onAddJob={addJob} />
```

- [ ] **Step 4: Add the form to Tracker.jsx**

Replace the entire contents of `src/components/Tracker.jsx` with this:

```jsx
import { useState } from 'react'
import { STATUS_COLORS } from './JobCard.jsx'

const STATUS_OPTIONS = ['Saved', 'Applied', 'Outreach Sent', 'Interviewing', 'Offer', 'Passed', 'Not Applying', 'Expired']

const TH = {
  padding: '8px 12px', textAlign: 'left', fontSize: 12,
  fontWeight: 600, color: '#6b7280', textTransform: 'uppercase',
  whiteSpace: 'nowrap', position: 'sticky', top: 0,
  background: '#f9fafb', borderBottom: '2px solid #e5e7eb',
}
const TD = { padding: '8px 12px', fontSize: 13, verticalAlign: 'middle' }

const EMPTY_FORM = { url: '', title: '', company: '', location: '', status: 'Saved' }

function scoreColor(s) {
  if (s == null) return '#9ca3af'
  if (s >= 7) return '#22c55e'
  if (s >= 4) return '#eab308'
  return '#ef4444'
}

export default function Tracker({ jobs, onUpdate, onAddJob }) {
  const today = new Date().toISOString().slice(0, 10)
  const [localNotes, setLocalNotes] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const tracked = [...jobs]
    .filter(j => j.status && j.status !== 'none')
    .sort((a, b) => {
      if (!a.applied_date && !b.applied_date) return 0
      if (!a.applied_date) return 1
      if (!b.applied_date) return -1
      return b.applied_date.localeCompare(a.applied_date)
    })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.url.trim() || !form.title.trim()) {
      setFormError('URL and Title are required.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await onAddJob(form)
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }}>
      {/* Add job button + inline form */}
      <div>
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            style={{
              fontSize: 13, padding: '6px 14px', borderRadius: 6,
              border: '1px solid #d1d5db', background: '#fff', color: '#374151',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            + Add job manually
          </button>
        ) : (
          <form
            onSubmit={handleSubmit}
            style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
              padding: '16px', display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>Add job manually</strong>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null) }}
                style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#9ca3af' }}
              >
                ✕
              </button>
            </div>

            {/* URL — full row */}
            <input
              type="url"
              placeholder="Job listing URL (required)"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', width: '100%' }}
            />

            {/* Title + Company */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Job title (required)"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', flex: 1 }}
              />
              <input
                type="text"
                placeholder="Company"
                value={form.company}
                onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', flex: 1 }}
              />
            </div>

            {/* Location + Status */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Location (optional)"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db', flex: 1 }}
              />
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 4, border: '1px solid #d1d5db' }}
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {formError && (
              <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  fontSize: 13, padding: '6px 16px', borderRadius: 4,
                  border: 'none', background: '#3b82f6', color: '#fff',
                  cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Adding…' : 'Add job'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setFormError(null) }}
                style={{
                  fontSize: 13, padding: '6px 14px', borderRadius: 4,
                  border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {tracked.length === 0 ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: 40, fontSize: 14 }}>
          No tracked jobs yet — use the Track… dropdown on any job card to start tracking, or add one manually above.
        </p>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Title</th>
                <th style={TH}>Company</th>
                <th style={{ ...TH, textAlign: 'center' }}>Score</th>
                <th style={TH}>Status</th>
                <th style={TH}>Applied</th>
                <th style={TH}>Follow-up</th>
                <th style={{ ...TH, minWidth: 200 }}>Notes</th>
                <th style={TH}>Source</th>
              </tr>
            </thead>
            <tbody>
              {tracked.map(job => {
                const st = STATUS_COLORS[job.status]
                const followupOverdue = job.follow_up_date && job.follow_up_date <= today
                const notesVal = job.id in localNotes ? localNotes[job.id] : (job.notes || '')

                return (
                  <tr key={job.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...TD, maxWidth: 260 }}>
                      <a href={job.url} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#1d4ed8', textDecoration: 'none', fontWeight: 500 }}
                        onClick={e => e.stopPropagation()}>
                        {job.title}
                      </a>
                    </td>

                    <td style={TD}>{job.company}</td>

                    <td style={{ ...TD, textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: scoreColor(job.score_aggregate) }}>
                        {job.score_aggregate?.toFixed(1) ?? '–'}
                      </span>
                    </td>

                    <td style={TD}>
                      <select
                        value={job.status}
                        onChange={e => onUpdate(job.id, { status: e.target.value })}
                        style={{
                          fontSize: 12, padding: '3px 6px', borderRadius: 4, border: 'none',
                          background: st?.bg || '#f3f4f6', color: st?.color || '#374151',
                          fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>

                    <td style={TD}>
                      <input
                        type="date"
                        value={job.applied_date || ''}
                        onChange={e => onUpdate(job.id, { applied_date: e.target.value })}
                        style={{ fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid #e5e7eb' }}
                      />
                    </td>

                    <td style={TD}>
                      <input
                        type="date"
                        value={job.follow_up_date || ''}
                        onChange={e => onUpdate(job.id, { follow_up_date: e.target.value })}
                        style={{
                          fontSize: 12, padding: '2px 4px', borderRadius: 4,
                          border: `1px solid ${followupOverdue ? '#ea580c' : '#e5e7eb'}`,
                          color: followupOverdue ? '#ea580c' : undefined,
                          fontWeight: followupOverdue ? 600 : undefined,
                        }}
                      />
                    </td>

                    <td style={TD}>
                      <input
                        type="text"
                        value={notesVal}
                        placeholder="Add notes…"
                        onChange={e => setLocalNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                        onBlur={e => {
                          onUpdate(job.id, { notes: e.target.value })
                          setLocalNotes(prev => { const n = { ...prev }; delete n[job.id]; return n })
                        }}
                        style={{
                          fontSize: 12, padding: '3px 6px', borderRadius: 4,
                          border: '1px solid #e5e7eb', width: '100%', minWidth: 180,
                        }}
                      />
                    </td>

                    <td style={{ ...TD, color: '#9ca3af' }}>{job.source}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify in the browser**

1. Start the dev server: `npm run dev` (in the job-search-app directory) and `node server/index.js`
2. Go to the Tracker tab
3. Click "+ Add job manually"
4. Fill in: URL = `https://www.google.com/about/careers/applications/jobs/results/124514176524526278-strategic-partner-development-manager-youtube-music-publishing`, Title = `Strategic Partner Development Manager`, Company = `YouTube`, Location = `New York, NY`
5. Click "Add job" — the form should close and the job should appear in the tracker table with status "Saved" and score "–"
6. Wait ~30s and refresh — the score should now be populated as the background scorer completes

- [ ] **Step 6: Commit**

```bash
cd /Users/ashleyb/job-search-app
git add src/api.js src/hooks/useJobs.js src/components/Tracker.jsx src/App.jsx
git commit -m "feat: add manual job entry form in Tracker tab"
```

---

## Self-Review

**Spec coverage:**
- ✅ Google Careers scraper using stealth Playwright — Task 1
- ✅ Google scraper registered in scheduler ALL_SCRAPERS — Task 1 Step 3
- ✅ Manual job entry form in Tracker — Task 3
- ✅ Manual jobs get auto-scored in background — Task 2 Step 3
- ✅ Duplicate URL protection (409 + `INSERT OR IGNORE`) — Task 2 Step 1/3
- ✅ Manual jobs appear in Tracker immediately after add — Task 3 Step 2 (optimistic)

**Placeholder scan:** None found.

**Type consistency:**
- `insertManualJob` returns the result of `getJobById(db, id)` — same shape as all other job objects ✅
- `addJob` in hook calls `createJob` (api.js) and pushes result into `jobs` state ✅
- `onAddJob` prop in Tracker calls `addJob` from hook ✅
- `scoreOneJob` uses `loadProfile()`, `scoreJob()`, `updateScore()` — all already imported in scheduler.js ✅
