# Version Notification Toast — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a passive toast when a new version of North Star has deployed — auto-populated from the git SHA, with an optional `whats_new` field a future subagent can write to.

**Architecture:** A single-row `app_version` table stores the current SHA (written at server boot) and an optional `whats_new` string. A `/api/version` endpoint exposes both. The frontend polls every 5 minutes, compares SHA to the one it loaded with, and shows a toast when they differ. The toast disappears on dismiss and doesn't reappear until the next new deploy (SHA tracked in localStorage).

**Tech Stack:** PostgreSQL, Express, React (JSX), Vitest, supertest.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `server/db/schema.sql` | Modify | `app_version` table (idempotent `CREATE TABLE IF NOT EXISTS`) |
| `server/db.js` | Modify | `upsertAppVersion`, `getAppVersion`, `patchAppVersionWhatsNew` |
| `server/index.js` | Modify | Boot upsert; GET `/api/version`; PATCH `/api/version/whats-new` |
| `src/api.js` | Modify | `fetchVersion` |
| `src/components/VersionToast.jsx` | Create | Toast UI component |
| `src/App.jsx` | Modify | Version polling; render VersionToast |
| `tests/server/routes.test.js` | Modify | Tests for both version routes |
| `tests/client/App.test.jsx` | Modify | Toast renders when SHA differs |

---

## Task 1: DB Schema — app_version Table

**Files:**
- Modify: `server/db/schema.sql`

- [ ] **Step 1: Write the failing test**

Add to `tests/server/routes.test.js`:

```js
describe('GET /api/version', () => {
  test('returns sha and whats_new', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/version')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('sha')
    expect(res.body).toHaveProperty('whats_new')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/ashleyb/job-search-app
npx vitest run tests/server/routes.test.js -t "GET /api/version" 2>&1 | tail -10
```

Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Add app_version table to schema.sql**

Append after the last `END $$;` block in `server/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS app_version (
  id         integer PRIMARY KEY DEFAULT 1,
  sha        text    NOT NULL DEFAULT 'unknown',
  whats_new  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.sql
git commit -m "feat: add app_version table to schema"
```

---

## Task 2: DB Functions — app_version Reads and Writes

**Files:**
- Modify: `server/db.js`

- [ ] **Step 1: Add three functions to db.js**

Append after `incrementProfileVersion`:

```js
export async function upsertAppVersion(pool, sha) {
  await pool.query(
    `INSERT INTO app_version (id, sha, updated_at)
     VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET sha = $1, updated_at = now()`,
    [sha]
  )
}

export async function getAppVersion(pool) {
  const { rows } = await pool.query('SELECT sha, whats_new FROM app_version WHERE id = 1')
  return rows[0] || { sha: 'unknown', whats_new: null }
}

export async function patchAppVersionWhatsNew(pool, whatsNew) {
  await pool.query(
    `INSERT INTO app_version (id, sha, whats_new, updated_at)
     VALUES (1, 'unknown', $1, now())
     ON CONFLICT (id) DO UPDATE SET whats_new = $1, updated_at = now()`,
    [whatsNew]
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add server/db.js
git commit -m "feat: add upsertAppVersion, getAppVersion, patchAppVersionWhatsNew"
```

---

## Task 3: Server Routes — /api/version Endpoints + Boot Upsert

**Files:**
- Modify: `server/index.js`
- Modify: `tests/server/routes.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `tests/server/routes.test.js`:

```js
describe('GET /api/version', () => {
  test('returns sha and whats_new without auth', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/version')
    expect(res.status).toBe(200)
    expect(typeof res.body.sha).toBe('string')
    expect(res.body).toHaveProperty('whats_new')
  })
})

describe('PATCH /api/version/whats-new', () => {
  test('updates whats_new when correct internal key provided', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key'
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/version/whats-new')
      .set('X-Internal-Key', 'test-internal-key')
      .send({ whats_new: 'New radar filters landed' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const check = await request(app).get('/api/version')
    expect(check.body.whats_new).toBe('New radar filters landed')
  })

  test('returns 401 with wrong internal key', async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key'
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/version/whats-new')
      .set('X-Internal-Key', 'wrong-key')
      .send({ whats_new: 'should fail' })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/server/routes.test.js -t "GET /api/version|PATCH /api/version" 2>&1 | tail -15
```

Expected: FAIL.

- [ ] **Step 3: Update imports in server/index.js**

Add to the db import:

```js
import {
  // ... existing ...
  upsertAppVersion,
  getAppVersion,
  patchAppVersionWhatsNew,
} from './db.js'
```

- [ ] **Step 4: Add boot upsert to createApp in server/index.js**

Near the top of `createApp`, after the pool is available, add:

```js
// Upsert current SHA into app_version on boot
const currentSha = process.env.RAILWAY_GIT_COMMIT_SHA || 'dev'
upsertAppVersion(pool, currentSha).catch(err => console.error('[boot] app_version upsert failed:', err.message))
```

- [ ] **Step 5: Add the two routes to server/index.js**

Add after the `/api/profile/increment-version` route (or near other unauthed routes — `/api/version` is public):

```js
app.get('/api/version', async (req, res) => {
  try {
    const version = await getAppVersion(pool)
    res.json(version)
  } catch {
    res.json({ sha: 'unknown', whats_new: null })
  }
})

app.patch('/api/version/whats-new', async (req, res) => {
  const internalKey = process.env.INTERNAL_API_KEY
  if (!internalKey || req.headers['x-internal-key'] !== internalKey) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  const { whats_new } = req.body
  if (typeof whats_new !== 'string') {
    return res.status(400).json({ error: 'whats_new string required' })
  }
  await patchAppVersionWhatsNew(pool, whats_new.trim())
  res.json({ ok: true })
})
```

Note: `/api/version` (GET) must be placed **before** the `requireAuth` middleware application, or explicitly excluded from auth. Check how existing public routes like `/api/health` are structured and match that pattern.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/server/routes.test.js -t "GET /api/version|PATCH /api/version" 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 7: Run full server suite**

```bash
npx vitest run tests/server/ 2>&1 | tail -5
```

- [ ] **Step 8: Commit**

```bash
git add server/index.js tests/server/routes.test.js
git commit -m "feat: add GET /api/version and PATCH /api/version/whats-new routes"
```

---

## Task 4: Client API — fetchVersion

**Files:**
- Modify: `src/api.js`

- [ ] **Step 1: Add fetchVersion to src/api.js**

Append after `fetchRescoreStatus`:

```js
export async function fetchVersion() {
  const res = await fetch('/api/version')
  if (!res.ok) throw new Error(`Failed to fetch version: ${res.status}`)
  return res.json()
}
```

Note: this uses `fetch` directly (not `apiFetch`) because `/api/version` is a public route — no auth cookie needed and no 401-redirect logic required.

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "feat: add fetchVersion to client API"
```

---

## Task 5: VersionToast Component

**Files:**
- Create: `src/components/VersionToast.jsx`

- [ ] **Step 1: Create the component**

```jsx
export default function VersionToast({ whatsNew, onReload, onDismiss }) {
  const message = whatsNew
    ? `✦ ${whatsNew} — `
    : '✦ New signal on your Radar — '

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 2000,
      background: '#1a1a1a', color: '#fff',
      borderRadius: 12, padding: '12px 18px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      fontFamily: 'var(--font)', fontSize: 13,
      maxWidth: 'calc(100vw - 48px)',
      animation: 'slideUp 0.25s ease',
    }}>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {message}
        <button
          onClick={onReload}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--accent)', fontFamily: 'var(--font)',
            fontSize: 13, fontWeight: 600, padding: 0,
          }}
        >
          reload to tune in
        </button>
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 1,
          padding: '0 2px', flexShrink: 0,
        }}
      >×</button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/VersionToast.jsx
git commit -m "feat: add VersionToast component"
```

---

## Task 6: App.jsx — Version Polling + Toast

**Files:**
- Modify: `src/App.jsx`
- Modify: `tests/client/App.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `tests/client/App.test.jsx` (following the existing mock pattern for `fetchJobs` etc.):

```jsx
import VersionToast from '../../src/components/VersionToast.jsx' // check import path

describe('version toast', () => {
  test('shows toast when polled SHA differs from loaded SHA', async () => {
    // Mock fetchVersion to return { sha: 'abc123', whats_new: null } initially
    // Then mock it to return { sha: 'def456', whats_new: null } on second call
    // Advance timers (vi.useFakeTimers + vi.advanceTimersByTime(5 * 60 * 1000))
    // Assert toast text "New signal on your Radar" is visible
  })
})
```

Check `tests/client/App.test.jsx` for how timers and fetch mocks are handled, then implement the test concretely.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/client/App.test.jsx -t "version toast" 2>&1 | tail -10
```

- [ ] **Step 3: Add version polling to App.jsx**

Add to the imports:
```js
import { fetchVersion } from './api.js'
import VersionToast from './components/VersionToast.jsx'
```

Add state at the top of the `App` component:
```js
const [versionToast, setVersionToast] = useState(null) // { whats_new: string|null } when visible
const loadedShaRef = useRef(null)
```

Add a useEffect for polling (add after the existing useEffects):
```js
useEffect(() => {
  let interval
  fetchVersion()
    .then(({ sha, whats_new }) => {
      loadedShaRef.current = sha
      // Check if we've already dismissed this SHA
      const dismissed = localStorage.getItem('northstar_version_dismissed')
      if (dismissed === sha) return
    })
    .catch(() => {})

  interval = setInterval(() => {
    fetchVersion()
      .then(({ sha, whats_new }) => {
        if (!loadedShaRef.current || sha === loadedShaRef.current) return
        const dismissed = localStorage.getItem('northstar_version_dismissed')
        if (dismissed === sha) return
        setVersionToast({ whats_new })
      })
      .catch(() => {})
  }, 5 * 60 * 1000) // 5 minutes

  return () => clearInterval(interval)
}, [])
```

Add the VersionToast at the bottom of the returned JSX, just before the closing `</div>`:
```jsx
{versionToast && (
  <VersionToast
    whatsNew={versionToast.whats_new}
    onReload={() => window.location.reload()}
    onDismiss={() => {
      fetchVersion()
        .then(({ sha }) => localStorage.setItem('northstar_version_dismissed', sha))
        .catch(() => {})
      setVersionToast(null)
    }}
  />
)}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/client/App.test.jsx 2>&1 | tail -15
```

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all passing.

- [ ] **Step 6: Commit and push**

```bash
git add src/App.jsx src/components/VersionToast.jsx src/api.js tests/client/App.test.jsx
git commit -m "feat: version change toast with polling — passive update notification"
git push
```
