# Direct Link Field — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user-editable "Direct Link" text field to each tracked job entry in the Constellation table — stored in `tracker_entries.direct_link`, auto-saved on blur, with a clickable `↗` icon when a URL is present.

**Architecture:** Three backend layers (schema migration, db.js, server route) each mirror the existing `salary_range` pattern exactly, then the frontend adds a new table column following the Notes/Salary inline-edit pattern.

**Tech Stack:** PostgreSQL (schema migration), Node.js/Express (route), React (Tracker.jsx), Vitest + Supertest + Testing Library (tests)

---

## File Map

| File | Change |
|------|--------|
| `server/db/schema.sql` | Add idempotent `DO $$` block to add `direct_link text` to `tracker_entries` |
| `server/db.js` | Add `te.direct_link` to two SELECTs; add `direct_link` to `upsertTrackerEntry` |
| `server/index.js` | Destructure + apply `direct_link` in `PATCH /api/jobs/:id` |
| `src/components/Tracker.jsx` | Add `localDirectLink` state, column header, and table cell |
| `tests/server/db.test.js` | Add test: `upsertTrackerEntry` persists and updates `direct_link` |
| `tests/server/routes.test.js` | Add test: `PATCH /api/jobs/:id` accepts and returns `direct_link` |
| `tests/client/Tracker.test.jsx` | Add tests: Direct Link input renders; link icon shows when URL present; blur calls `onUpdate`; icon absent when empty |

---

## Task 1: DB layer — schema + `db.js` + tests

**Files:**
- Modify: `server/db/schema.sql`
- Modify: `server/db.js`
- Modify: `tests/server/db.test.js`

- [ ] **Step 1: Write the failing test**

Open `tests/server/db.test.js`. Inside the `describe('boards and tracker entries', ...)` block (after the existing `upsertTrackerEntry` tests, around line 327), add:

```js
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
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run tests/server/db.test.js --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — column `direct_link` does not exist (PostgreSQL error).

- [ ] **Step 3: Add schema migration**

Open `server/db/schema.sql`. After the existing `salary_range` migration block (around line 115), add:

```sql
-- Idempotently add direct_link column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tracker_entries' AND column_name = 'direct_link'
  ) THEN
    ALTER TABLE tracker_entries ADD COLUMN direct_link text;
  END IF;
END $$;
```

- [ ] **Step 4: Add `direct_link` to `getAllJobs` SELECT in `server/db.js`**

Find the `getAllJobs` function. The SELECT currently reads (around line 61):
```js
te.status, te.notes, te.follow_up_date, te.applied_date,
te.salary_range, te.board_id, te.id AS entry_id
```

Change to:
```js
te.status, te.notes, te.follow_up_date, te.applied_date,
te.salary_range, te.direct_link, te.board_id, te.id AS entry_id
```

- [ ] **Step 5: Add `direct_link` to `getJobById` SELECT in `server/db.js`**

Find the `getJobById` function. The SELECT currently reads (around line 83):
```js
te.status, te.notes, te.follow_up_date, te.applied_date,
te.salary_range, te.board_id, te.id AS entry_id
```

Change to:
```js
te.status, te.notes, te.follow_up_date, te.applied_date,
te.salary_range, te.direct_link, te.board_id, te.id AS entry_id
```

- [ ] **Step 6: Update `upsertTrackerEntry` in `server/db.js`**

Find `upsertTrackerEntry` (around line 195). Make these three changes:

**6a.** Add `'direct_link'` to the `allowed` array:
```js
const allowed = ['status', 'follow_up_date', 'notes', 'applied_date', 'board_id', 'salary_range', 'direct_link']
```

**6b.** Add the variable after `salary_range`:
```js
const salary_range  = updates.salary_range   ?? null
const direct_link   = updates.direct_link    ?? null
```

**6c.** Add `direct_link` to the INSERT and VALUES (column 10):
```js
await pool.query(
  `INSERT INTO tracker_entries (id, board_id, user_id, job_id, status, notes, follow_up_date, applied_date, salary_range, direct_link)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
   ON CONFLICT (job_id, user_id) DO UPDATE SET ${setClauses.join(', ')}`,
  [id, boardId, userId, jobId, status, notes, follow_up, applied_date, salary_range, direct_link]
)
```

- [ ] **Step 7: Run the test to confirm it passes**

```bash
npx vitest run tests/server/db.test.js --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add server/db/schema.sql server/db.js tests/server/db.test.js
git commit -m "feat: add direct_link column to tracker_entries and db layer"
```

---

## Task 2: Server route — `PATCH /api/jobs/:id`

**Files:**
- Modify: `server/index.js`
- Modify: `tests/server/routes.test.js`

- [ ] **Step 1: Write the failing test**

Open `tests/server/routes.test.js`. Inside `describe('PATCH /api/jobs/:id (tracker)', ...)`, after the `salary_range` test (around line 384), add:

```js
test('sets and retrieves direct_link', async () => {
  const id = await upsertJob(pool, SAMPLE_JOB)
  const app = createApp(pool)
  // Must have a tracker entry first
  await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied' })
  const res = await request(app)
    .patch(`/api/jobs/${id}`)
    .set('Cookie', sessionCookie)
    .send({ direct_link: 'https://greenhouse.io/jobs/789' })
  expect(res.status).toBe(200)
  expect(res.body.direct_link).toBe('https://greenhouse.io/jobs/789')
  expect(res.body.status).toBe('Applied') // preserved
})

test('clears direct_link when sent as null', async () => {
  const id = await upsertJob(pool, SAMPLE_JOB)
  const app = createApp(pool)
  await request(app).patch(`/api/jobs/${id}`).set('Cookie', sessionCookie).send({ status: 'Applied', direct_link: 'https://example.com' })
  const res = await request(app)
    .patch(`/api/jobs/${id}`)
    .set('Cookie', sessionCookie)
    .send({ direct_link: null })
  expect(res.status).toBe(200)
  expect(res.body.direct_link).toBeNull()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/server/routes.test.js --reporter=verbose 2>&1 | grep -A 3 "direct_link"
```

Expected: FAIL — `direct_link` not in response body (returns `undefined`).

- [ ] **Step 3: Update `PATCH /api/jobs/:id` in `server/index.js`**

Find the PATCH handler (around line 96–106). The destructuring line currently reads:
```js
const { status, follow_up_date, notes, applied_date, board_id, salary_range } = req.body
```

Change to:
```js
const { status, follow_up_date, notes, applied_date, board_id, salary_range, direct_link } = req.body
```

After the `salary_range` line (around line 105):
```js
if (salary_range !== undefined) updates.salary_range = salary_range
```

Add:
```js
if (direct_link !== undefined) updates.direct_link = direct_link
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/server/routes.test.js --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js tests/server/routes.test.js
git commit -m "feat: accept direct_link in PATCH /api/jobs/:id"
```

---

## Task 3: Frontend — Tracker.jsx

**Files:**
- Modify: `src/components/Tracker.jsx`
- Modify: `tests/client/Tracker.test.jsx`

- [ ] **Step 1: Write the failing tests**

Open `tests/client/Tracker.test.jsx`. The `makeJob` factory (around line 21) needs `direct_link` added:

```js
function makeJob(overrides = {}) {
  return {
    id: 'j1',
    title: 'Head of Partnerships',
    company: 'Acme Corp',
    location: 'Remote',
    status: 'Applied',
    board_id: 'b1',
    score_aggregate: 8.5,
    applied_date: '2026-04-01',
    notes: '',
    salary_range: '',
    direct_link: null,
    follow_up_date: null,
    url: 'https://example.com/job/1',
    description: null,
    score_dimensions: null,
    ...overrides,
  }
}
```

Then add a new `describe` block at the end of the file:

```js
describe('Tracker — Direct Link field', () => {
  test('shows "Direct Link" column header', () => {
    const jobs = [makeJob()]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByText('Direct Link')).toBeInTheDocument()
  })

  test('renders Direct Link input with placeholder when no URL saved', () => {
    const jobs = [makeJob({ direct_link: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByPlaceholderText('Paste link…')).toBeInTheDocument()
  })

  test('populates Direct Link input with saved URL', () => {
    const jobs = [makeJob({ direct_link: 'https://greenhouse.io/jobs/123' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.getByDisplayValue('https://greenhouse.io/jobs/123')).toBeInTheDocument()
  })

  test('shows external link icon when direct_link is set', () => {
    const jobs = [makeJob({ direct_link: 'https://greenhouse.io/jobs/123' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    const link = screen.getByTitle('Open direct link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://greenhouse.io/jobs/123')
    expect(link).toHaveAttribute('target', '_blank')
  })

  test('does not show link icon when direct_link is null', () => {
    const jobs = [makeJob({ direct_link: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} />)
    expect(screen.queryByTitle('Open direct link')).not.toBeInTheDocument()
  })

  test('calls onUpdate with direct_link on blur', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', direct_link: null })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const input = screen.getByPlaceholderText('Paste link…')
    fireEvent.change(input, { target: { value: 'https://lever.co/jobs/abc' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('j1', { direct_link: 'https://lever.co/jobs/abc' })
  })

  test('calls onUpdate with null when cleared', () => {
    const onUpdate = vi.fn()
    const jobs = [makeJob({ id: 'j1', direct_link: 'https://example.com' })]
    render(<Tracker {...DEFAULT_PROPS} jobs={jobs} onUpdate={onUpdate} />)
    const input = screen.getByDisplayValue('https://example.com')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onUpdate).toHaveBeenCalledWith('j1', { direct_link: null })
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npx vitest run tests/client/Tracker.test.jsx --reporter=verbose 2>&1 | grep -E "FAIL|direct|Direct" | head -20
```

Expected: FAIL — "Direct Link" not in document.

- [ ] **Step 3: Add `localDirectLink` state to `Tracker.jsx`**

Find the state declarations at the top of the `Tracker` component (around line 130). After:
```js
const [localSalary, setLocalSalary] = useState({})
```

Add:
```js
const [localDirectLink, setLocalDirectLink] = useState({})
```

- [ ] **Step 4: Add "Direct Link" to the column headers**

Find the header array (around line 424):
```js
{['Title', 'Company', 'Score', 'Status', ...(boards.length > 1 ? ['Board'] : []), 'Applied', 'Follow-up', 'Salary', 'Notes', 'JD', 'Source', 'Link', ''].map(h => (
```

Change `'Notes', 'JD'` to `'Notes', 'Direct Link', 'JD'`:
```js
{['Title', 'Company', 'Score', 'Status', ...(boards.length > 1 ? ['Board'] : []), 'Applied', 'Follow-up', 'Salary', 'Notes', 'Direct Link', 'JD', 'Source', 'Link', ''].map(h => (
```

- [ ] **Step 5: Add the Direct Link table cell**

Find the Notes cell (around line 515–523):
```jsx
<td style={TD}>
  <input type="text" value={notesVal} placeholder="Notes…"
    onChange={e => setLocalNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
    onBlur={e => {
      onUpdate(job.id, { notes: e.target.value })
      setLocalNotes(prev => { const n = { ...prev }; delete n[job.id]; return n })
    }}
    style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--screen-raised)', color: 'var(--text)', width: '100%', minWidth: 140, fontFamily: 'var(--font)' }} />
</td>
```

Insert the following new cell **immediately after** that closing `</td>`:

```jsx
<td style={TD}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <input
      type="text"
      value={job.id in localDirectLink ? localDirectLink[job.id] : (job.direct_link || '')}
      placeholder="Paste link…"
      onChange={e => setLocalDirectLink(prev => ({ ...prev, [job.id]: e.target.value }))}
      onBlur={e => {
        onUpdate(job.id, { direct_link: e.target.value || null })
        setLocalDirectLink(prev => { const n = { ...prev }; delete n[job.id]; return n })
      }}
      style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--divider)', background: 'var(--screen-raised)', color: 'var(--text)', width: 130, fontFamily: 'var(--font)' }}
    />
    {(job.id in localDirectLink ? localDirectLink[job.id] : job.direct_link) && (
      <a
        href={job.id in localDirectLink ? localDirectLink[job.id] : job.direct_link}
        target="_blank"
        rel="noopener noreferrer"
        title="Open direct link"
        style={{ color: 'var(--blue)', opacity: 0.7, flexShrink: 0, lineHeight: 0 }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 2h4v4M14 2 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    )}
  </div>
</td>
```

- [ ] **Step 6: Run the tests to confirm they pass**

```bash
npx vitest run tests/client/Tracker.test.jsx --reporter=verbose 2>&1 | tail -30
```

Expected: all tests PASS.

- [ ] **Step 7: Run the full test suite to check for regressions**

```bash
npx vitest run --reporter=verbose 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/Tracker.jsx tests/client/Tracker.test.jsx
git commit -m "feat: add Direct Link field to Constellation tracker"
```
