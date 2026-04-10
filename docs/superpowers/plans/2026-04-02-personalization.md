# Personalization Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four personalization features: live score weight tuning UI, score transparency tooltip on job cards, application activity dashboard in the Tracker, and a macOS daily digest notification after each pipeline run.

**Architecture:** Weights move from hardcoded `profile.json` into a new Settings tab backed by `GET/PATCH /api/profile/weights`. Client-side score preview uses a shared `computeAggregate` utility so the job list reflects slider changes instantly. Dashboard and tooltip are pure client-side additions. Notification hooks into the existing scheduler after scoring completes.

**Tech Stack:** React 18, Express, better-sqlite3, node-notifier (new package)

---

## Codebase Context (read before starting any task)

Key files and what they do:
- `server/profile.json` — candidate profile with `weights` object keyed by dimension ID
- `server/scorer.js` — `computeAggregate(dimensions, weights)` is the scoring formula; `DIMENSION_DESCRIPTIONS` are the Claude prompts
- `server/scheduler.js` — `runPipeline(db)` scrapes + scores; `scoreOneJob(db, id)` scores one job
- `server/index.js` — Express routes; all route handlers follow the pattern: validate → db call → return json
- `src/hooks/useJobs.js` — central state; `jobs` = filtered+sorted, `allJobs` = everything, `updateStatus` patches a job
- `src/components/JobDetail.jsx` — already shows summary (line 82) and dimension bars (line 91). `score_dimensions` is stored as JSON; already parsed to `dims` object with shape `{ core_mechanism: { score, reasoning }, ..., summary: "..." }`
- `src/components/JobCard.jsx` — score circle at top left, `job.score_aggregate` is the number shown
- `src/components/Tracker.jsx` — table of tracked jobs; `tracked` array is derived from `jobs` prop
- `src/components/FilterBar.jsx` — filter controls; each control calls `onChange({ ...filters, key: value })`

Dimension IDs and their labels (used in every feature):
```js
const DIMENSION_LABELS = {
  core_mechanism:      'Connector Fit',      // weight: 3.5
  gap_bridgeability:   'Gap Bridgeability',  // weight: 3.0
  bd_track_record:     'Visibility',         // weight: 2.5
  product_depth:       'Daily Texture',      // weight: 2.5
  regulated_complexity:'Structural Integrity',// weight: 2.0
  mba_preference:      'Pioneering',         // weight: 2.0
  domain_gap:          'Domain Fit',         // weight: 2.0
}
const DIMENSION_ORDER = ['core_mechanism','gap_bridgeability','bd_track_record','product_depth','regulated_complexity','mba_preference','domain_gap']
```

---

## Task 1: Update profile.json weights and domain_gap scorer description

**Files:**
- Modify: `server/profile.json`
- Modify: `server/scorer.js`

- [ ] **Step 1: Update weights in profile.json**

Replace the `weights` object:

```json
"weights": {
  "core_mechanism": 3.5,
  "gap_bridgeability": 3.0,
  "bd_track_record": 2.5,
  "product_depth": 2.5,
  "regulated_complexity": 2.0,
  "mba_preference": 2.0,
  "domain_gap": 2.0
}
```

- [ ] **Step 2: Update domain_gap DIMENSION_DESCRIPTION in scorer.js**

Find the `domain_gap` entry in `DIMENSION_DESCRIPTIONS` (line 19) and replace it:

```js
domain_gap: 'DOMAIN FIT: How well does the role\'s industry align with Ashley\'s target sectors? Ashley targets industries both from experience and from personal passion — both count equally. Score 10 for: creator economy, newsletter/publishing platforms, lifestyle partnerships, cultural media, music, podcasting, sports, entertainment, the arts (museums, galleries, public/private art funds, artist-adjacent orgs), art sales (auction houses, art marketplaces, art advisory, art finance, art sale adjacent). Score 7 for: fintech, healthcare, healthtech, or GenAI at the intersection of creative industries — she has direct experience and is actively targeting these. Score 4 for adjacent consumer platforms (DTC, wellness, food delivery, streaming). Score 2 for generic big-tech PM, B2B SaaS, or enterprise roles with no creator/culture angle. Score 1 for procurement, supply chain, TikTok Shop, Walmart, engineering-first, or data science-first roles.',
```

- [ ] **Step 3: Verify the file is valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('server/profile.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add server/profile.json server/scorer.js
git commit -m "feat: update scoring weights and domain fit target industries"
```

---

## Task 2: Backend — profile API endpoints + rescoreAllJobs

**Files:**
- Modify: `server/index.js`
- Modify: `server/scheduler.js`

The server needs two new endpoints:
- `GET /api/profile` — returns current weights so the Settings UI can initialise sliders
- `PATCH /api/profile/weights` — saves new weights to profile.json, triggers background re-score of all jobs

`rescoreAllJobs` re-scores every job in the DB using the new weights (not just unscored ones).

- [ ] **Step 1: Add rescoreAllJobs to scheduler.js**

Add after `scoreOneJob` (around line 77):

```js
export async function rescoreAllJobs(db) {
  const profile = loadProfile()
  const ids = db.prepare('SELECT id FROM jobs').all().map(r => r.id)
  console.log(`[rescoreAllJobs] Re-scoring ${ids.length} jobs...`)
  for (let i = 0; i < ids.length; i++) {
    await scoreOneJob(db, ids[i])
    if (i < ids.length - 1) await sleep(300)
  }
  console.log('[rescoreAllJobs] Done.')
}
```

- [ ] **Step 2: Add imports and profile path to server/index.js**

At the top of `server/index.js`, after the existing imports, add:

```js
import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROFILE_PATH = path.join(__dirname, 'profile.json')
```

- [ ] **Step 3: Add GET /api/profile route to server/index.js**

Add inside `createApp`, after the existing routes (before `return app`):

```js
app.get('/api/profile', (req, res) => {
  try {
    const profile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
    res.json({ weights: profile.weights })
  } catch (err) {
    res.status(500).json({ error: 'Could not read profile' })
  }
})
```

- [ ] **Step 4: Add PATCH /api/profile/weights route to server/index.js**

Add after the GET /api/profile route:

```js
app.patch('/api/profile/weights', (req, res) => {
  const { weights } = req.body
  if (!weights || typeof weights !== 'object') {
    return res.status(400).json({ error: 'weights object required' })
  }
  try {
    const profile = JSON.parse(readFileSync(PROFILE_PATH, 'utf8'))
    profile.weights = { ...profile.weights, ...weights }
    writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2))
    res.json({ ok: true })
    import('./scheduler.js')
      .then(({ rescoreAllJobs }) => rescoreAllJobs(db))
      .catch(err => console.error('[PATCH /api/profile/weights] rescore failed:', err.message))
  } catch (err) {
    res.status(500).json({ error: 'Could not update profile' })
  }
})
```

- [ ] **Step 5: Restart the server and smoke test**

```bash
# In terminal where server runs: Ctrl+C then:
node server/index.js

# In another terminal:
curl http://localhost:3001/api/profile
```

Expected response:
```json
{"weights":{"core_mechanism":3.5,"gap_bridgeability":3.0,"bd_track_record":2.5,"product_depth":2.5,"regulated_complexity":2.0,"mba_preference":2.0,"domain_gap":2.0}}
```

- [ ] **Step 6: Test PATCH endpoint**

```bash
curl -X PATCH http://localhost:3001/api/profile/weights \
  -H "Content-Type: application/json" \
  -d '{"weights":{"core_mechanism":3.5}}'
```

Expected: `{"ok":true}`

- [ ] **Step 7: Commit**

```bash
git add server/index.js server/scheduler.js
git commit -m "feat: add profile weights API and rescoreAllJobs"
```

---

## Task 3: Scoring utility + API client additions

**Files:**
- Create: `src/utils/scoring.js`
- Modify: `src/api.js`

The client needs to replicate the server's `computeAggregate` formula for live score preview.

- [ ] **Step 1: Create src/utils/scoring.js**

```js
const DIMS = [
  'core_mechanism', 'gap_bridgeability', 'bd_track_record', 'product_depth',
  'regulated_complexity', 'mba_preference', 'domain_gap',
]

/**
 * Replicates server/scorer.js computeAggregate.
 * scoreDimensions: { core_mechanism: { score, reasoning }, ..., summary: "..." }
 * weights: { core_mechanism: 3.5, ... }
 * Returns null if no dimension scores exist.
 */
export function computeAggregate(scoreDimensions, weights) {
  if (!scoreDimensions) return null
  let total = 0
  let weightSum = 0
  for (const dim of DIMS) {
    const score = scoreDimensions[dim]?.score
    if (score == null) continue
    const w = weights[dim] ?? 1
    total += score * w
    weightSum += w
  }
  if (weightSum === 0) return null
  return Math.round((total / weightSum) * 100) / 100
}
```

- [ ] **Step 2: Add fetchProfile and patchWeights to src/api.js**

Add after the existing exports:

```js
export async function fetchProfile() {
  const res = await fetch(`${BASE}/profile`)
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`)
  return res.json()
}

export async function patchWeights(weights) {
  const res = await fetch(`${BASE}/profile/weights`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weights }),
  })
  if (!res.ok) throw new Error(`Failed to save weights: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 3: Verify scoring.js formula manually**

```bash
node -e "
import('./src/utils/scoring.js').then(({ computeAggregate }) => {
  const dims = {
    core_mechanism: { score: 8 },
    gap_bridgeability: { score: 7 },
    bd_track_record: { score: 6 },
    product_depth: { score: 5 },
    regulated_complexity: { score: 9 },
    mba_preference: { score: 4 },
    domain_gap: { score: 3 },
  }
  const weights = { core_mechanism:3.5, gap_bridgeability:3, bd_track_record:2.5, product_depth:2.5, regulated_complexity:2, mba_preference:2, domain_gap:2 }
  console.log('score:', computeAggregate(dims, weights))
  // expected: (8*3.5 + 7*3 + 6*2.5 + 5*2.5 + 9*2 + 4*2 + 3*2) / (3.5+3+2.5+2.5+2+2+2)
  // = (28 + 21 + 15 + 12.5 + 18 + 8 + 6) / 17.5 = 108.5/17.5 = 6.2
})
"
```

Expected: `score: 6.2`

- [ ] **Step 4: Commit**

```bash
git add src/utils/scoring.js src/api.js
git commit -m "feat: add client-side scoring utility and profile API client"
```

---

## Task 4: useJobs — weight state and live score preview

**Files:**
- Modify: `src/hooks/useJobs.js`

Add `savedWeights`, `liveWeights` state. When `liveWeights` is set, `allJobs` maps each job's `score_aggregate` to a client-computed value. Exposes `liveWeights`, `setLiveWeights`, `savedWeights`, `setSavedWeights` for the Settings component.

- [ ] **Step 1: Add imports to useJobs.js**

At the top, add to the existing import line:

```js
import { fetchJobs, triggerRefresh, patchJob, createJob, deleteJob, fetchProfile, patchWeights } from '../api.js'
import { computeAggregate } from '../utils/scoring.js'
```

- [ ] **Step 2: Add weight state inside useJobs**

After the `filters` state declaration, add:

```js
const [savedWeights, setSavedWeights] = useState(null)   // loaded from server
const [liveWeights, setLiveWeights] = useState(null)     // set by slider drag
```

- [ ] **Step 3: Fetch profile weights on mount**

Add after the existing `useEffect(() => { load() }, [load])`:

```js
useEffect(() => {
  fetchProfile()
    .then(({ weights }) => {
      setSavedWeights(weights)
      setLiveWeights(weights)
    })
    .catch(err => console.error('[useJobs] fetchProfile failed:', err.message))
}, [])
```

- [ ] **Step 4: Add saveWeights function**

Add after the `addJob` callback:

```js
const saveWeights = useCallback(async (weights) => {
  await patchWeights(weights)
  setSavedWeights(weights)
}, [])
```

- [ ] **Step 5: Apply live weight override to allJobs**

Add a computed value after the `filteredJobs` block, before the return statement:

```js
const allJobsWithLiveScores = liveWeights
  ? jobs.map(job => {
      if (!job.score_dimensions) return job
      const liveScore = computeAggregate(job.score_dimensions, liveWeights)
      return liveScore === null ? job : { ...job, score_aggregate: liveScore }
    })
  : jobs
```

- [ ] **Step 6: Update the return statement**

Change `allJobs: jobs` to `allJobs: allJobsWithLiveScores` and add the weight state:

```js
return {
  jobs: filteredJobs,
  allJobs: allJobsWithLiveScores,
  loading, refreshing, error, lastRefreshed,
  filters, setFilters,
  refresh, updateStatus, addJob, removeJob,
  savedWeights, liveWeights, setLiveWeights, saveWeights,
}
```

- [ ] **Step 7: Verify in browser**

Start the app (`npm run dev`), open the browser console and run:

```js
// This is a mental check — just confirm the app still loads without errors
// and the job list displays correctly
```

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useJobs.js
git commit -m "feat: add live weight preview to useJobs"
```

---

## Task 5: Settings.jsx component

**Files:**
- Create: `src/components/Settings.jsx`

The Settings tab content. Shows 7 sliders. On drag → calls `setLiveWeights`. On save → calls `saveWeights` and shows status.

- [ ] **Step 1: Create src/components/Settings.jsx**

```jsx
import { useState } from 'react'

const DIMENSIONS = [
  { key: 'core_mechanism',       label: 'Connector Fit' },
  { key: 'gap_bridgeability',    label: 'Gap Bridgeability' },
  { key: 'bd_track_record',      label: 'Visibility' },
  { key: 'product_depth',        label: 'Daily Texture' },
  { key: 'regulated_complexity', label: 'Structural Integrity' },
  { key: 'mba_preference',       label: 'Pioneering' },
  { key: 'domain_gap',           label: 'Domain Fit' },
]

export default function Settings({ liveWeights, setLiveWeights, savedWeights, saveWeights }) {
  const [status, setStatus] = useState(null) // null | 'saving' | 'done' | 'error'

  if (!liveWeights) return <p style={{ padding: 24, color: '#9ca3af' }}>Loading…</p>

  function handleSlider(key, value) {
    setLiveWeights(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await saveWeights(liveWeights)
      setStatus('done')
      setTimeout(() => setStatus(null), 4000)
    } catch {
      setStatus('error')
    }
  }

  function handleReset() {
    setLiveWeights(savedWeights)
  }

  const isDirty = JSON.stringify(liveWeights) !== JSON.stringify(savedWeights)

  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Scoring Weights</h2>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Drag to adjust how much each dimension influences the fit score. Job scores update live as you drag. Hit Save to persist and re-score all jobs.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {DIMENSIONS.map(({ key, label }) => {
          const value = liveWeights[key] ?? 1
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#374151' }}>{label}</span>
                <span style={{ color: '#6b7280', minWidth: 24, textAlign: 'right' }}>{value}</span>
              </div>
              <input
                type="range"
                min={0} max={5} step={0.5}
                value={value}
                onChange={e => handleSlider(key, Number(e.target.value))}
                style={{ width: '100%', accentColor: '#3b82f6' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#d1d5db', marginTop: 1 }}>
                <span>0</span><span>5</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28 }}>
        <button
          onClick={handleSave}
          disabled={!isDirty || status === 'saving'}
          style={{
            fontSize: 13, padding: '8px 20px', borderRadius: 6,
            border: 'none', background: isDirty ? '#3b82f6' : '#e5e7eb',
            color: isDirty ? '#fff' : '#9ca3af',
            cursor: isDirty && status !== 'saving' ? 'pointer' : 'not-allowed',
          }}
        >
          {status === 'saving' ? 'Saving & re-scoring…' : 'Save weights'}
        </button>

        {isDirty && (
          <button
            onClick={handleReset}
            style={{ fontSize: 13, padding: '8px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer' }}
          >
            Reset
          </button>
        )}

        {status === 'done' && (
          <span style={{ fontSize: 13, color: '#22c55e' }}>Saved. Re-scoring in background…</span>
        )}
        {status === 'error' && (
          <span style={{ fontSize: 13, color: '#ef4444' }}>Save failed — check server.</span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Settings.jsx
git commit -m "feat: add Settings component with weight sliders"
```

---

## Task 6: App.jsx — wire Settings tab

**Files:**
- Modify: `src/App.jsx`

Add a "Settings" tab to the nav bar and render the Settings component when active.

- [ ] **Step 1: Import Settings in App.jsx**

Add to existing imports:

```jsx
import Settings from './components/Settings.jsx'
```

- [ ] **Step 2: Destructure weight state from useJobs**

Update the `useJobs` destructuring line:

```jsx
const {
  jobs, allJobs, loading, refreshing, error, lastRefreshed,
  filters, setFilters, refresh, updateStatus, addJob, removeJob,
  savedWeights, liveWeights, setLiveWeights, saveWeights,
} = useJobs()
```

- [ ] **Step 3: Add Settings tab button**

In the tab bar `<div>` (after the Tracker button), add:

```jsx
<button style={tabStyle('settings')} onClick={() => setTab('settings')}>Settings</button>
```

- [ ] **Step 4: Add Settings tab render**

After the closing `}` of the Tracker tab block, add:

```jsx
{tab === 'settings' && (
  <div style={{ flex: 1, overflowY: 'auto' }}>
    <Settings
      liveWeights={liveWeights}
      setLiveWeights={setLiveWeights}
      savedWeights={savedWeights}
      saveWeights={saveWeights}
    />
  </div>
)}
```

- [ ] **Step 5: Verify in browser**

1. Open app, click "Settings" tab
2. Sliders should appear with correct starting values (3.5 for Connector Fit, etc.)
3. Drag a slider — go to Job Search tab and verify scores have changed
4. Click Reset — scores revert
5. Click Save — status shows "Saving & re-scoring…" then "Saved. Re-scoring in background…"
6. Check server terminal — should see `[rescoreAllJobs] Re-scoring N jobs...`

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Settings tab to App"
```

---

## Task 7: JobCard score tooltip

**Files:**
- Modify: `src/components/JobCard.jsx`

Add an `ⓘ` icon next to the score circle. On hover, show the job's summary text in a tooltip. Hidden if no summary exists.

- [ ] **Step 1: Add tooltip state to JobCard**

At the top of the `JobCard` function, after the existing variable declarations, add:

```jsx
const [showTooltip, setShowTooltip] = useState(false)
```

Add the `useState` import if not already present — update the top of the file:

```jsx
import { useState } from 'react'
```

- [ ] **Step 2: Extract summary from score_dimensions**

After `const statusStyle = STATUS_COLORS[status]`, add:

```jsx
const summary = (() => {
  if (!job.score_dimensions) return null
  try {
    const dims = typeof job.score_dimensions === 'string'
      ? JSON.parse(job.score_dimensions)
      : job.score_dimensions
    return dims.summary || null
  } catch { return null }
})()
```

- [ ] **Step 3: Replace the score badge div with a version that includes a tooltip**

Replace the existing score badge `<div>` (lines 46-53 in the original file — the circle with the score number) with:

```jsx
{/* Score badge + tooltip */}
<div style={{ position: 'relative' }}>
  <div style={{
    minWidth: 44, height: 44, borderRadius: '50%',
    background: scoreColor, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 14,
  }}>
    {score !== null ? score.toFixed(1) : '–'}
  </div>
  {summary && (
    <span
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      style={{
        position: 'absolute', top: -4, right: -4,
        width: 14, height: 14, borderRadius: '50%',
        background: '#e5e7eb', color: '#6b7280',
        fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'default', fontWeight: 700, lineHeight: 1,
      }}
    >
      i
    </span>
  )}
  {showTooltip && summary && (
    <div style={{
      position: 'absolute', left: 52, top: 0, zIndex: 10,
      background: '#1f2937', color: '#f9fafb',
      borderRadius: 6, padding: '8px 12px',
      fontSize: 12, lineHeight: 1.5,
      width: 260, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      pointerEvents: 'none',
    }}>
      {summary}
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify in browser**

1. Open Job Search tab
2. Hover over the small `i` badge on a scored job card
3. Summary text should appear in a dark tooltip to the right of the score circle
4. Moving mouse away should hide it
5. Jobs without a score or summary should show no `i` badge

- [ ] **Step 5: Commit**

```bash
git add src/components/JobCard.jsx
git commit -m "feat: add score summary tooltip to JobCard"
```

---

## Task 8: Tracker dashboard panel

**Files:**
- Modify: `src/components/Tracker.jsx`

Add a collapsible stats panel at the top of the Tracker tab. All metrics computed client-side from `jobs` prop.

- [ ] **Step 1: Add showStats state to Tracker**

In the Tracker component, add to the existing `useState` declarations:

```jsx
const [showStats, setShowStats] = useState(false)
```

- [ ] **Step 2: Add computeStats helper inside Tracker (before the return statement)**

```jsx
function computeStats(jobs) {
  const tracked = jobs.filter(j => j.status && j.status !== 'none')
  const now = new Date()
  const msPerDay = 86_400_000
  const weekAgo = new Date(now - 7 * msPerDay).toISOString().slice(0, 10)
  const monthAgo = new Date(now - 30 * msPerDay).toISOString().slice(0, 10)

  const byStatus = {}
  for (const j of tracked) {
    byStatus[j.status] = (byStatus[j.status] || 0) + 1
  }

  const appliedCount = byStatus['Applied'] || 0
  const interviewingCount = byStatus['Interviewing'] || 0
  const offerCount = byStatus['Offer'] || 0
  const appliedThisWeek = tracked.filter(j => j.applied_date && j.applied_date >= weekAgo).length
  const appliedThisMonth = tracked.filter(j => j.applied_date && j.applied_date >= monthAgo).length

  return { byStatus, appliedCount, interviewingCount, offerCount, appliedThisWeek, appliedThisMonth }
}
```

- [ ] **Step 3: Add the stats panel to the JSX**

In the Tracker's `return`, after the toolbar `<div>` (the one with the "+ Add job manually" button and sort dropdown) and before the `{showForm && ...}` block, add:

```jsx
{/* Stats panel */}
<div>
  <button
    onClick={() => setShowStats(s => !s)}
    style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}
  >
    {showStats ? 'Hide stats' : 'Show stats'}
  </button>

  {showStats && (() => {
    const stats = computeStats(jobs)
    const STAT_STATUSES = ['Saved','Applied','Outreach Sent','Interviewing','Offer','Passed','Not Applying']
    const convRate = (num, den) => den === 0 ? '—' : `${Math.round((num / den) * 100)}%`

    return (
      <div style={{ marginTop: 10, padding: 16, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        {/* Pipeline breakdown */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {STAT_STATUSES.map(s => (
            <div key={s} style={{ textAlign: 'center', minWidth: 64 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>{stats.byStatus[s] || 0}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{s}</div>
            </div>
          ))}
        </div>

        {/* Volume + conversion */}
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <span><strong>{stats.appliedThisWeek}</strong> <span style={{ color: '#6b7280' }}>applied this week</span></span>
          <span><strong>{stats.appliedThisMonth}</strong> <span style={{ color: '#6b7280' }}>applied this month</span></span>
          <span><strong>{convRate(stats.interviewingCount, stats.appliedCount)}</strong> <span style={{ color: '#6b7280' }}>Applied → Interviewing</span></span>
          <span><strong>{convRate(stats.offerCount, stats.appliedCount)}</strong> <span style={{ color: '#6b7280' }}>Applied → Offer</span></span>
        </div>
      </div>
    )
  })()}
</div>
```

- [ ] **Step 4: Verify in browser**

1. Open Tracker tab
2. "Show stats" link should appear at the top
3. Click it — stats panel expands showing pipeline counts, applied this week/month, conversion rates
4. Click "Hide stats" — panel collapses

- [ ] **Step 5: Commit**

```bash
git add src/components/Tracker.jsx
git commit -m "feat: add collapsible activity dashboard to Tracker"
```

---

## Task 9: macOS daily digest notification

**Files:**
- Modify: `package.json` (server deps)
- Modify: `server/scheduler.js`

After the pipeline runs and scoring completes, send a macOS notification if there are new jobs.

- [ ] **Step 1: Install node-notifier**

```bash
npm install node-notifier
```

- [ ] **Step 2: Add import to scheduler.js**

At the top of `server/scheduler.js`, add:

```js
import notifier from 'node-notifier'
```

- [ ] **Step 3: Add sendDigestNotification helper to scheduler.js**

Add before `startScheduler`:

```js
function sendDigestNotification(db, newIds) {
  if (newIds.length === 0) return
  try {
    // Find the top-scored new job
    const placeholders = newIds.map(() => '?').join(',')
    const topJob = db.prepare(
      `SELECT title, company, score_aggregate FROM jobs WHERE id IN (${placeholders}) ORDER BY score_aggregate DESC NULLS LAST LIMIT 1`
    ).get(...newIds)

    const scoreStr = topJob?.score_aggregate != null ? ` (${topJob.score_aggregate.toFixed(1)})` : ''
    const topLine = topJob ? `Top: ${topJob.title} at ${topJob.company}${scoreStr}` : ''

    notifier.notify({
      title: `Job Search — ${newIds.length} new job${newIds.length !== 1 ? 's' : ''} today`,
      message: topLine,
      sound: false,
    })
  } catch (err) {
    console.error('[notify] Failed to send notification:', err.message)
  }
}
```

- [ ] **Step 4: Call sendDigestNotification at the end of runPipeline**

In `runPipeline`, after the scoring loop and `console.log('[pipeline] Done...')`, add:

```js
sendDigestNotification(db, newIds)
```

The full end of `runPipeline` should now look like:

```js
  console.log(`[pipeline] Done. ${newIds.length} scraped, ${scored}/${toScore.length} scored.`)
  sendDigestNotification(db, newIds)
  return { scraped: newIds.length, scored }
}
```

- [ ] **Step 5: Test notification manually**

```bash
node -e "
import notifier from 'node-notifier'
notifier.notify({ title: 'Job Search — 3 new jobs today', message: 'Top: Creator Solutions Manager at Substack (8.4)' })
" --input-type=module
```

Expected: macOS notification popup appears in top-right corner.

- [ ] **Step 6: Commit**

```bash
git add server/scheduler.js package.json package-lock.json
git commit -m "feat: add macOS daily digest notification after pipeline"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Settings tab with 7 sliders | Task 5, 6 |
| Live score preview while dragging | Task 4 (liveWeights in useJobs) |
| Save → PATCH profile + background re-score | Task 2 (rescoreAllJobs), Task 5 (save button) |
| Update profile.json weights to new values | Task 1 |
| Update domain_gap target industry list | Task 1 |
| Score summary in JobDetail | Already exists (JobDetail.jsx line 82) |
| Score dimension bars in JobDetail | Already exists (JobDetail.jsx line 91) |
| Score tooltip on JobCard | Task 7 |
| Collapsible dashboard in Tracker | Task 8 |
| Pipeline breakdown by status | Task 8 |
| Applied this week / this month | Task 8 |
| Conversion rates | Task 8 |
| macOS notification after pipeline | Task 9 |
| Notification only fires if new jobs | Task 9 (newIds.length === 0 guard) |
| Notification fires after scoring (top job has score) | Task 9 (sendDigestNotification called after scoring loop) |

All spec requirements covered. No placeholders found.
