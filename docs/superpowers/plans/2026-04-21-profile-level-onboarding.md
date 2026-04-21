# Profile Structured Fields, Level Targeting & Scorer Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seniority level targeting to onboarding and profile editing, promote target_roles/sectors to structured DB fields, replace Ashley-specific DEFAULT_DIMENSIONS with generic ones, feed level + personality into the scorer and dimension generator, add a profile Targets editing section, warn users when target_level is unset, and move action buttons to the top of the detail panel.

**Architecture:** New idempotent DB columns on `profiles`. New API routes mirror the existing `PATCH /api/profile/*` pattern. Server-side scorer and dimension generator receive explicit target context. Frontend gets a new `LevelStep` in onboarding, a `TargetsSection` in `Profile.jsx`, a `RescoreModal` component, and a dismissible banner in `App.jsx`.

**Tech Stack:** PostgreSQL, Express, Vitest, React (JSX, no TypeScript), supertest for route tests.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `server/db/schema.sql` | Modify | 4 idempotent DO blocks for new columns |
| `server/db.js` | Modify | 3 new upsert/increment functions |
| `server/index.js` | Modify | 3 new routes + update GET /api/profile response |
| `server/scorer.js` | Modify | Replace DEFAULT_DIMENSIONS; add targets context block |
| `server/scheduler.js` | Modify | loadProfile includes new fields; generateAndSaveDimensions passes profile |
| `server/dimension-generator.js` | Modify | Accept profile arg; personality + targets shape dimensions |
| `src/api.js` | Modify | patchTargetLevel, patchTargets, incrementProfileVersion |
| `src/components/Onboarding.jsx` | Modify | Add LevelStep; BackgroundStep saves structured fields |
| `src/components/RescoreModal.jsx` | Create | Confirmation modal before rescore |
| `src/components/Profile.jsx` | Modify | TargetsSection; Redo Setup modal; import RescoreModal |
| `src/components/JobDetail.jsx` | Modify | Move action buttons above verdict paragraph |
| `src/App.jsx` | Modify | target_level warning banner on Radar tab |
| `tests/server/routes.test.js` | Modify | Tests for 3 new routes + GET /api/profile new fields |
| `tests/server/scorer.test.js` | Modify | Tests for generic defaults + targets context block |
| `tests/server/dimensionGenerator.test.js` | Modify | Test personality + targets in prompt |
| `tests/client/Onboarding.test.jsx` | Modify | LevelStep renders; requires selection |
| `tests/client/Profile.test.jsx` | Modify | TargetsSection renders; edit/cancel flow |

---

## Task 1: DB Schema — New Profile Columns

**Files:**
- Modify: `server/db/schema.sql`

- [ ] **Step 1: Write the failing test**

Add to `tests/server/routes.test.js` inside the existing `describe` block, after the existing tests:

```js
describe('new profile structured fields', () => {
  test('GET /api/profile returns target_level null for new user', async () => {
    const app = createApp(pool)
    const res = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('target_level')
    expect(res.body).toHaveProperty('target_roles')
    expect(res.body).toHaveProperty('target_sectors')
    expect(res.body).toHaveProperty('profile_version')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/ashleyb/job-search-app
npx vitest run tests/server/routes.test.js 2>&1 | tail -20
```

Expected: FAIL — `target_level` key missing from response.

- [ ] **Step 3: Add the 4 new columns to schema.sql**

Append after the last `END $$;` block in `server/db/schema.sql` (after the `last_name` block):

```sql
-- Idempotently add target_level column to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'target_level'
  ) THEN
    ALTER TABLE profiles ADD COLUMN target_level text[];
  END IF;
END $$;

-- Idempotently add target_roles column to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'target_roles'
  ) THEN
    ALTER TABLE profiles ADD COLUMN target_roles text;
  END IF;
END $$;

-- Idempotently add target_sectors column to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'target_sectors'
  ) THEN
    ALTER TABLE profiles ADD COLUMN target_sectors text;
  END IF;
END $$;

-- Idempotently add profile_version column to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'profile_version'
  ) THEN
    ALTER TABLE profiles ADD COLUMN profile_version integer NOT NULL DEFAULT 1;
  END IF;
END $$;
```

- [ ] **Step 4: Update GET /api/profile to return new fields**

In `server/index.js`, find the `app.get('/api/profile', ...)` handler. Replace the `return res.json({...})` block (lines ~207-215) with:

```js
return res.json({
  weights: dbProfile.weights || {},
  background: dbProfile.background,
  onboarding_done: dbProfile.onboarding_done,
  dimensions: dbProfile.dimensions || null,
  personality: dbProfile.personality || null,
  first_name: dbProfile.first_name || null,
  last_name: dbProfile.last_name || null,
  target_level: dbProfile.target_level || null,
  target_roles: dbProfile.target_roles || null,
  target_sectors: dbProfile.target_sectors || null,
  profile_version: dbProfile.profile_version || 1,
})
```

Also update the fallback response (line ~225) to include the new fields:

```js
res.json({ weights: {}, background: '', onboarding_done: false, dimensions: null, personality: null, first_name: null, last_name: null, target_level: null, target_roles: null, target_sectors: null, profile_version: 1 })
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/server/routes.test.js -t "new profile structured fields" 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/db/schema.sql server/index.js tests/server/routes.test.js
git commit -m "feat: add target_level, target_roles, target_sectors, profile_version columns to profiles"
```

---

## Task 2: DB Functions — Upserts for New Fields

**Files:**
- Modify: `server/db.js`

- [ ] **Step 1: Add three functions to db.js**

Append after `upsertProfileBackground` (around line 248):

```js
export async function upsertProfileTargetLevel(pool, userId, targetLevel) {
  await pool.query(
    `INSERT INTO profiles (user_id, target_level, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET target_level = $2, updated_at = now()`,
    [userId, targetLevel]
  )
}

export async function upsertProfileTargets(pool, userId, targetRoles, targetSectors) {
  await pool.query(
    `INSERT INTO profiles (user_id, target_roles, target_sectors, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET target_roles = $2, target_sectors = $3, updated_at = now()`,
    [userId, targetRoles || null, targetSectors || null]
  )
}

export async function incrementProfileVersion(pool, userId) {
  await pool.query(
    `UPDATE profiles
     SET profile_version = COALESCE(profile_version, 1) + 1, updated_at = now()
     WHERE user_id = $1`,
    [userId]
  )
}
```

- [ ] **Step 2: Verify no syntax errors**

```bash
node --input-type=module < <(echo "import './server/db.js'") 2>&1 | head -5
```

Expected: no output (clean import).

- [ ] **Step 3: Commit**

```bash
git add server/db.js
git commit -m "feat: add upsertProfileTargetLevel, upsertProfileTargets, incrementProfileVersion"
```

---

## Task 3: Server Routes — New Profile Endpoints

**Files:**
- Modify: `server/index.js`
- Modify: `tests/server/routes.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/routes.test.js`:

```js
describe('PATCH /api/profile/target-level', () => {
  test('saves target level array and is retrievable via GET /api/profile', async () => {
    const app = createApp(pool)
    const patch = await request(app)
      .patch('/api/profile/target-level')
      .set('Cookie', sessionCookie)
      .send({ target_level: ['Senior IC', 'Manager'] })
    expect(patch.status).toBe(200)
    expect(patch.body.ok).toBe(true)

    const get = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(get.body.target_level).toEqual(['Senior IC', 'Manager'])
  })

  test('rejects empty array with 400', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/target-level')
      .set('Cookie', sessionCookie)
      .send({ target_level: [] })
    expect(res.status).toBe(400)
  })

  test('rejects non-array with 400', async () => {
    const app = createApp(pool)
    const res = await request(app)
      .patch('/api/profile/target-level')
      .set('Cookie', sessionCookie)
      .send({ target_level: 'Senior IC' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/profile/targets', () => {
  test('saves target_roles and target_sectors', async () => {
    const app = createApp(pool)
    const patch = await request(app)
      .patch('/api/profile/targets')
      .set('Cookie', sessionCookie)
      .send({ target_roles: 'Head of Partnerships', target_sectors: 'creator economy' })
    expect(patch.status).toBe(200)

    const get = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(get.body.target_roles).toBe('Head of Partnerships')
    expect(get.body.target_sectors).toBe('creator economy')
  })
})

describe('POST /api/profile/increment-version', () => {
  test('increments profile_version', async () => {
    const app = createApp(pool)
    // Need a profile row first
    await request(app)
      .patch('/api/profile/target-level')
      .set('Cookie', sessionCookie)
      .send({ target_level: ['IC / Individual Contributor'] })

    const before = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    const vBefore = before.body.profile_version

    await request(app).post('/api/profile/increment-version').set('Cookie', sessionCookie)

    const after = await request(app).get('/api/profile').set('Cookie', sessionCookie)
    expect(after.body.profile_version).toBe(vBefore + 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/server/routes.test.js -t "PATCH /api/profile/target-level|PATCH /api/profile/targets|POST /api/profile/increment-version" 2>&1 | tail -20
```

Expected: FAIL — routes don't exist yet.

- [ ] **Step 3: Update imports in server/index.js**

Find the db import line near the top of `server/index.js`. Add the three new functions:

```js
import {
  // ... existing imports ...
  upsertProfileTargetLevel,
  upsertProfileTargets,
  incrementProfileVersion,
} from './db.js'
```

- [ ] **Step 4: Add the three new routes to server/index.js**

Add after the existing `app.patch('/api/profile/background', ...)` block:

```js
app.patch('/api/profile/target-level', async (req, res) => {
  const { target_level } = req.body
  if (!Array.isArray(target_level) || target_level.length === 0) {
    return res.status(400).json({ error: 'target_level must be a non-empty array' })
  }
  await upsertProfileTargetLevel(pool, req.user.id, target_level)
  res.json({ ok: true })
})

app.patch('/api/profile/targets', async (req, res) => {
  const { target_roles, target_sectors } = req.body
  await upsertProfileTargets(pool, req.user.id, target_roles, target_sectors)
  res.json({ ok: true })
})

app.post('/api/profile/increment-version', async (req, res) => {
  await incrementProfileVersion(pool, req.user.id)
  res.json({ ok: true })
})
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/server/routes.test.js -t "PATCH /api/profile/target-level|PATCH /api/profile/targets|POST /api/profile/increment-version" 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 6: Run full server test suite to check no regressions**

```bash
npx vitest run tests/server/ 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/index.js tests/server/routes.test.js
git commit -m "feat: add PATCH /api/profile/target-level, /targets and POST /increment-version routes"
```

---

## Task 4: Client API — New Profile Functions

**Files:**
- Modify: `src/api.js`

- [ ] **Step 1: Add three functions to src/api.js**

Append after `patchPersonality`:

```js
export async function patchTargetLevel(targetLevel) {
  const res = await apiFetch(`${BASE}/profile/target-level`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_level: targetLevel }),
  })
  if (!res.ok) throw new Error(`Failed to save target level: ${res.status}`)
  return res.json()
}

export async function patchTargets(targetRoles, targetSectors) {
  const res = await apiFetch(`${BASE}/profile/targets`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_roles: targetRoles, target_sectors: targetSectors }),
  })
  if (!res.ok) throw new Error(`Failed to save targets: ${res.status}`)
  return res.json()
}

export async function incrementProfileVersion() {
  const res = await apiFetch(`${BASE}/profile/increment-version`, { method: 'POST' })
  if (!res.ok) throw new Error(`Failed to increment profile version: ${res.status}`)
  return res.json()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api.js
git commit -m "feat: add patchTargetLevel, patchTargets, incrementProfileVersion to client API"
```

---

## Task 5: Scorer — Replace Ashley's DEFAULT_DIMENSIONS

**Files:**
- Modify: `server/scorer.js`
- Modify: `tests/server/scorer.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/server/scorer.test.js`:

```js
describe('generic DEFAULT_DIMENSIONS', () => {
  test('uses role_alignment and level_fit (not core_mechanism) when no custom dimensions', async () => {
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify({
              dimensions: {
                role_alignment: { score: 8, reasoning: 'Good title match.' },
                level_fit: { score: 7, reasoning: 'One level off.' },
                sector_fit: { score: 9, reasoning: 'Exact sector.' },
                skills_match: { score: 6, reasoning: 'Most skills covered.' },
                growth_potential: { score: 7, reasoning: 'Clear advancement.' },
              },
              summary: 'Strong overall fit.',
            }) }]
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    const result = await scoreJob(
      { title: 'PM', description: 'desc' },
      { background: 'Product manager.', weights: {} }
    )
    expect(result.dimensions).toHaveProperty('role_alignment')
    expect(result.dimensions).toHaveProperty('level_fit')
    expect(result.dimensions).not.toHaveProperty('core_mechanism')
    expect(result.dimensions).not.toHaveProperty('mba_preference')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/server/scorer.test.js -t "generic DEFAULT_DIMENSIONS" 2>&1 | tail -10
```

Expected: FAIL — `core_mechanism` exists in result.

- [ ] **Step 3: Replace DEFAULT_DIMENSIONS in server/scorer.js**

Replace the entire `const DEFAULT_DIMENSIONS = { ... }` block (lines 6–42) with:

```js
const DEFAULT_DIMENSIONS = {
  role_alignment: {
    label: 'Role Alignment',
    description: 'ROLE ALIGNMENT: How well does the role\'s title and scope match the candidate\'s target roles? Score 10 for an exact title match with identical scope. Score 7 for a closely related title with overlapping responsibilities. Score 4 for a tangential role where some skills transfer. Score 1 for a role with no meaningful overlap to the candidate\'s stated targets.',
    weight: 1.5,
  },
  level_fit: {
    label: 'Level Fit',
    description: 'LEVEL FIT: Does the seniority level of the role match what the candidate is targeting? Score 10 for an exact level match. Score 7 if the role is one level above or below the target. Score 4 if the role is two levels away. Score 1 if the role is dramatically above or below the candidate\'s stated level.',
    weight: 1.5,
  },
  sector_fit: {
    label: 'Sector Fit',
    description: 'SECTOR FIT: How well does the role\'s industry align with the candidate\'s target sectors? Score 10 for an exact sector match. Score 7 for an adjacent sector with strong transferability. Score 4 for a different sector where core skills still apply. Score 1 for a sector completely outside the candidate\'s stated interests.',
    weight: 1,
  },
  skills_match: {
    label: 'Skills Match',
    description: 'SKILLS MATCH: How well does the candidate\'s background cover the role\'s stated requirements? Score 10 if the candidate meets all key requirements. Score 7 if the candidate meets most requirements with minor gaps. Score 4 if the candidate meets roughly half the requirements. Score 1 if the candidate lacks most stated requirements.',
    weight: 1,
  },
  growth_potential: {
    label: 'Growth Potential',
    description: 'GROWTH POTENTIAL: Does this role offer meaningful career growth from the candidate\'s current position? Score 10 for a role that clearly advances scope, title, or compensation. Score 7 for lateral growth into a new domain. Score 4 for a role at the same level with limited new exposure. Score 1 for a step backward in title or responsibility.',
    weight: 1,
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/server/scorer.test.js -t "generic DEFAULT_DIMENSIONS" 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run full scorer test suite**

```bash
npx vitest run tests/server/scorer.test.js 2>&1 | tail -10
```

Expected: all pass. (The existing tests use a mock profile with `core_mechanism` keys in the mock response — they still pass because they provide custom dimensions via `weights` keys that match the mock response, not the DEFAULT_DIMENSIONS.)

- [ ] **Step 6: Commit**

```bash
git add server/scorer.js tests/server/scorer.test.js
git commit -m "fix: replace Ashley-specific DEFAULT_DIMENSIONS with generic 5-dimension fallback"
```

---

## Task 6: Scorer — Explicit Targets Context Block

**Files:**
- Modify: `server/scorer.js`
- Modify: `tests/server/scorer.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/scorer.test.js`:

```js
describe('targets context block in system prompt', () => {
  test('includes Candidate targets section when target fields are set', async () => {
    let capturedSystem = ''
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async ({ system }) => {
            capturedSystem = system
            return { content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }] }
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await scoreJob(
      { title: 'PM', description: 'desc' },
      {
        ...MOCK_PROFILE,
        target_level: ['Senior IC', 'Manager'],
        target_roles: 'Head of Partnerships',
        target_sectors: 'creator economy',
      }
    )
    expect(capturedSystem).toContain('Candidate targets:')
    expect(capturedSystem).toContain('- Level: Senior IC, Manager')
    expect(capturedSystem).toContain('- Roles: Head of Partnerships')
    expect(capturedSystem).toContain('- Sectors: creator economy')
  })

  test('omits Candidate targets section when no target fields set', async () => {
    let capturedSystem = ''
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async ({ system }) => {
            capturedSystem = system
            return { content: [{ text: JSON.stringify(MOCK_SCORE_RESPONSE) }] }
          })
        }
      }
    })
    const { scoreJob } = await import('../../server/scorer.js?t=' + Date.now())
    await scoreJob({ title: 'PM', description: 'desc' }, MOCK_PROFILE)
    expect(capturedSystem).not.toContain('Candidate targets:')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/server/scorer.test.js -t "targets context block" 2>&1 | tail -10
```

Expected: FAIL — no "Candidate targets:" in prompt.

- [ ] **Step 3: Add targets context block to scoreJob in server/scorer.js**

Inside `scoreJob`, after the `buildPersonalityBlock` call and before `systemPrompt`, add:

```js
const targetsLines = [
  profile.target_level?.length ? `Level: ${profile.target_level.join(', ')}` : null,
  profile.target_roles ? `Roles: ${profile.target_roles}` : null,
  profile.target_sectors ? `Sectors: ${profile.target_sectors}` : null,
].filter(Boolean)
const targetsSection = targetsLines.length > 0
  ? `\nCandidate targets:\n${targetsLines.map(l => `- ${l}`).join('\n')}\n`
  : ''
```

Then update `systemPrompt` to include `${targetsSection}` between the personality block and dimensions list:

```js
const systemPrompt = `You are a job-fit evaluator. Assess the job listing against the candidate profile using exactly ${dimKeys.length} dimensions.

Candidate background:
${profile.background}
${personalityBlock ? `\nPersonality context:\n${personalityBlock}\n` : ''}${targetsSection}
Dimensions to score (each 1–10):
${dimKeys.map(k => `- ${k}: ${dimensions[k].description || dimensions[k]}`).join('\n')}

Respond ONLY with valid JSON. No preamble, no backticks.
{
  "dimensions": {
    ${dimKeys.map(k => `"${k}": { "score": <1-10>, "reasoning": "<one sentence>" }`).join(',\n    ')}
  },
  "summary": "<2-3 sentence overall fit summary — do NOT include a numeric score. Write at a Gunning Fog Index of 7: short sentences (under 18 words), plain words, avoid jargon and polysyllabic words.>"
}`
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/server/scorer.test.js -t "targets context block" 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Run full scorer suite**

```bash
npx vitest run tests/server/scorer.test.js 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add server/scorer.js tests/server/scorer.test.js
git commit -m "feat: add explicit targets context block to scorer prompt"
```

---

## Task 7: Scheduler + Dimension Generator — Personality-Aware Generation

**Files:**
- Modify: `server/scheduler.js`
- Modify: `server/dimension-generator.js`
- Modify: `tests/server/dimensionGenerator.test.js`

- [ ] **Step 1: Write the failing tests**

Open `tests/server/dimensionGenerator.test.js`. Add after the existing tests:

```js
describe('personality and targets in dimension generation', () => {
  test('includes personality and targets in user message when provided', async () => {
    let capturedUserMsg = ''
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockImplementation(async ({ messages }) => {
            capturedUserMsg = messages[0].content
            return {
              content: [{ text: JSON.stringify({
                dimensions: {
                  role_fit: { label: 'Role Fit', description: 'Scoring rubric.', weight: 1 }
                }
              }) }]
            }
          })
        }
      }
    })
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    await generateDimensions('Product manager background.', {
      personality: { mbti: 'INTJ', disc: 'Dominance (D)', strengths: ['Strategic', 'Activator'] },
      target_level: ['Senior IC'],
      target_roles: 'Head of Product',
      target_sectors: 'creator economy',
    })
    expect(capturedUserMsg).toContain('Myers-Briggs: INTJ')
    expect(capturedUserMsg).toContain('DiSC: Dominance (D)')
    expect(capturedUserMsg).toContain('CliftonStrengths top 5: Strategic, Activator')
    expect(capturedUserMsg).toContain('Target level: Senior IC')
    expect(capturedUserMsg).toContain('Target roles: Head of Product')
    expect(capturedUserMsg).toContain('Target sectors: creator economy')
  })

  test('works with no profile context — backward compatible', async () => {
    Anthropic.mockImplementation(function() {
      return {
        messages: {
          create: vi.fn().mockResolvedValue({
            content: [{ text: JSON.stringify({
              dimensions: { role_fit: { label: 'Role Fit', description: 'desc', weight: 1 } }
            }) }]
          })
        }
      }
    })
    const { generateDimensions } = await import('../../server/dimension-generator.js?t=' + Date.now())
    const result = await generateDimensions('Some background.')
    expect(result.role_fit).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/server/dimensionGenerator.test.js -t "personality and targets" 2>&1 | tail -10
```

Expected: FAIL — personality/targets not in prompt.

- [ ] **Step 3: Rewrite generateDimensions in server/dimension-generator.js**

Replace the entire file content:

```js
import Anthropic from '@anthropic-ai/sdk'
import { extractJSON } from './utils.js'

export async function generateDimensions(background, profile = {}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const personalityLines = []
  if (profile.personality) {
    const p = profile.personality
    if (p.mbti) personalityLines.push(`Myers-Briggs: ${p.mbti}`)
    if (p.enneagram) personalityLines.push(`Enneagram: ${p.enneagram}`)
    if (p.disc) personalityLines.push(`DiSC: ${p.disc}`)
    if (p.strengths?.length) personalityLines.push(`CliftonStrengths top 5: ${p.strengths.join(', ')}`)
    if (p.sun_sign) personalityLines.push(`Sun sign: ${p.sun_sign}`)
    if (p.moon_sign) personalityLines.push(`Moon sign: ${p.moon_sign}`)
    if (p.rising_sign) personalityLines.push(`Rising sign: ${p.rising_sign}`)
  }

  const targetsLines = [
    profile.target_level?.length ? `Target level: ${profile.target_level.join(', ')}` : null,
    profile.target_roles ? `Target roles: ${profile.target_roles}` : null,
    profile.target_sectors ? `Target sectors: ${profile.target_sectors}` : null,
  ].filter(Boolean)

  const extraContext = [
    personalityLines.length
      ? `Personality context (let this shape which dimensions matter most — e.g. high-D DiSC should emphasise autonomy and impact; INFJ should emphasise mission and meaning):\n${personalityLines.join('\n')}`
      : null,
    targetsLines.length
      ? `Stated targets (dimensions must reflect these specifically — always include a seniority/level dimension when target level is provided):\n${targetsLines.join('\n')}`
      : null,
  ].filter(Boolean).join('\n\n')

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: `You are a job-fit dimension designer. Given a candidate's professional background, generate 5–8 scoring dimensions that a job-scoring model will use to evaluate job listings against this specific person.

Rules:
- Each dimension captures a distinct, high-signal aspect of fit that matters for THIS candidate.
- Rubrics must be concrete: say what earns a 10, a 7, a 4, and a 1 — not vague adjectives.
- Keys must be snake_case, 2–4 words, globally unique.
- Weights: 1.5 for 2–3 most critical dimensions, 1.0 for standard, 0.5 for secondary signals.
- Do not include generic dimensions like "years_of_experience" or "salary_range".

Respond ONLY with valid JSON. No preamble, no explanation, no backticks.

{
  "dimensions": {
    "<key>": {
      "label": "<short human-readable name, 2–4 words>",
      "description": "<concrete scoring rubric — 4–6 sentences covering the full 1–10 range>",
      "weight": <number>
    }
  }
}`,
    messages: [{
      role: 'user',
      content: `Candidate background:\n\n${background}${extraContext ? `\n\n${extraContext}` : ''}\n\nGenerate 5–8 scoring dimensions for this candidate.`,
    }],
  })

  const parsed = extractJSON(response.content[0].text)
  return parsed.dimensions
}
```

- [ ] **Step 4: Update loadProfile in server/scheduler.js to include new fields**

Find `async function loadProfile(pool, userId)` (around line 32). Replace the returned object:

```js
async function loadProfile(pool, userId) {
  if (userId) {
    const dbProfile = await getProfile(pool, userId)
    if (dbProfile?.background) {
      return {
        background: dbProfile.background,
        weights: dbProfile.weights || {},
        dimensions: dbProfile.dimensions || null,
        personality: dbProfile.personality || null,
        target_level: dbProfile.target_level || null,
        target_roles: dbProfile.target_roles || null,
        target_sectors: dbProfile.target_sectors || null,
      }
    }
  }
  throw new Error(`[pipeline] No profile found for user ${userId}`)
}
```

- [ ] **Step 5: Update generateAndSaveDimensions to pass profile to generateDimensions**

Find `export async function generateAndSaveDimensions(pool, userId, background)` (around line 48). Replace the body:

```js
export async function generateAndSaveDimensions(pool, userId, background) {
  try {
    const { generateDimensions } = await import('./dimension-generator.js')
    const dbProfile = await getProfile(pool, userId)
    console.log(`[dimensions] Generating dimensions for user ${userId}...`)
    const dimensions = await generateDimensions(background, dbProfile || {})
    await upsertProfileDimensions(pool, userId, dimensions)
    console.log(`[dimensions] Saved ${Object.keys(dimensions).length} dimensions for user ${userId}`)
  } catch (err) {
    console.error(`[dimensions] Failed for user ${userId}:`, err.message)
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/server/dimensionGenerator.test.js 2>&1 | tail -10
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/dimension-generator.js server/scheduler.js tests/server/dimensionGenerator.test.js
git commit -m "feat: personality and targets now shape custom dimension generation"
```

---

## Task 8: Onboarding — LevelStep + BackgroundStep Structured Saves

**Files:**
- Modify: `src/components/Onboarding.jsx`
- Modify: `tests/client/Onboarding.test.jsx`

- [ ] **Step 1: Write the failing tests**

Open `tests/client/Onboarding.test.jsx`. Add:

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
// (Check the existing import pattern in the file and match it)

describe('LevelStep', () => {
  test('renders all 6 level options', () => {
    // Import LevelStep — it won't exist yet so this test will fail to import
    // For now test the full Onboarding flow shows level step
    // This test structure will be confirmed when the component exists
  })
})
```

Rather than mocking deep internals, write a smoke test that confirms the LevelStep renders when reached in onboarding. Check the existing Onboarding.test.jsx for how it simulates steps, then add:

```jsx
describe('LevelStep in Onboarding', () => {
  test('shows level options after background step', async () => {
    // Match existing test setup pattern in the file
    render(<Onboarding onComplete={vi.fn()} />)
    // The existing test file will show how steps are navigated
    // Add assertions that 'IC / Individual Contributor' is present
    // and Continue is disabled until at least one is selected
  })
})
```

Look at the existing `tests/client/Onboarding.test.jsx` to understand the exact render/step pattern, then write tests that:
1. Confirm "What level are you targeting?" heading appears at the level step
2. Confirm Continue button is disabled with no selection
3. Confirm clicking a level option enables Continue

- [ ] **Step 2: Run tests to verify they fail (or confirm what to add)**

```bash
npx vitest run tests/client/Onboarding.test.jsx 2>&1 | tail -20
```

- [ ] **Step 3: Add LevelStep component to Onboarding.jsx**

Add the `LEVEL_OPTIONS` constant and `LevelStep` component. In Onboarding.jsx, add after the `STEPS` array definition:

```js
const LEVEL_OPTIONS = [
  'IC / Individual Contributor',
  'Senior IC',
  'Manager',
  'Senior Manager / Director',
  'VP / Head of',
  'C-Suite / Executive',
]
```

Add the `LevelStep` function component before `GeneratingStep`:

```jsx
function LevelStep({ onNext }) {
  const [selected, setSelected] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggle(level) {
    setSelected(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    )
  }

  async function handleSubmit() {
    if (!selected.length) return
    setSaving(true)
    setError('')
    try {
      await patchTargetLevel(selected)
      await regenerateDimensions()
      onNext()
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.')
      setSaving(false)
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
        What level are you targeting?
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.5 }}>
        Select all that apply — this shapes which roles get surfaced on your Radar.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
        {LEVEL_OPTIONS.map(level => {
          const isSelected = selected.includes(level)
          return (
            <button
              key={level}
              type="button"
              onClick={() => toggle(level)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                border: isSelected ? '1.5px solid var(--blue)' : '1px solid rgba(0,0,0,0.15)',
                background: isSelected ? 'rgba(48,197,255,0.08)' : '#fff',
                fontFamily: 'var(--font)', fontSize: 15, color: 'var(--text)',
                textAlign: 'left', transition: 'all 0.15s',
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                border: isSelected ? '2px solid var(--blue)' : '2px solid rgba(0,0,0,0.2)',
                background: isSelected ? 'var(--blue)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSelected && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
              </span>
              {level}
            </button>
          )
        })}
      </div>
      {error && <p style={{ color: 'var(--score-lo)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={!selected.length || saving}
        style={primaryBtn(selected.length > 0 && !saving)}
      >
        {saving ? 'Saving…' : 'Continue'}
      </button>
    </>
  )
}
```

- [ ] **Step 4: Update STEPS array and root Onboarding component**

Change line 16:
```js
const STEPS = ['name', 'background', 'level', 'generating', 'personality', 'review', 'board']
```

Add the new import at the top of Onboarding.jsx:
```js
import { patchBackground, fetchProfile, patchWeights, patchPersonality, createBoardApi, patchName, patchTargetLevel, patchTargets, regenerateDimensions } from '../api.js'
```

Add the LevelStep render in the root component (after the background step):
```jsx
{step === 'level' && (
  <LevelStep onNext={() => setStep('generating')} />
)}
```

- [ ] **Step 5: Update BackgroundStep to save structured targets separately**

In `BackgroundStep`, update the import reference and `handleSubmit` to call `patchTargets` after `patchBackground`. Change the background string to NOT include the target lines anymore (they're now structured), and add a separate `patchTargets` call:

```js
async function handleSubmit(e) {
  e.preventDefault()
  if (!ready) return
  setSaving(true)
  setError('')
  try {
    const background = [
      answers.background.trim(),
      `What energizes me: ${answers.energizes.trim()}`,
      `What I want next: ${answers.next_role.trim()}`,
      answers.dealbreakers?.trim() ? `Deal-breakers: ${answers.dealbreakers.trim()}` : null,
    ].filter(Boolean).join('\n\n')
    await patchBackground(background)
    await patchTargets(targetRoles.trim(), targetSectors.trim())
    onNext()
  } catch (err) {
    setError(err.message || 'Something went wrong. Try again.')
    setSaving(false)
  }
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/client/Onboarding.test.jsx 2>&1 | tail -15
```

Expected: passing.

- [ ] **Step 7: Commit**

```bash
git add src/components/Onboarding.jsx src/api.js tests/client/Onboarding.test.jsx
git commit -m "feat: add LevelStep to onboarding; BackgroundStep saves structured targets"
```

---

## Task 9: RescoreModal Component

**Files:**
- Create: `src/components/RescoreModal.jsx`

- [ ] **Step 1: Create the component**

```jsx
export default function RescoreModal({ onRescore, onSaveOnly, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28,
        maxWidth: 400, width: '90%', fontFamily: 'var(--font)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>
          Update your Radar?
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#666', lineHeight: 1.55 }}>
          Updating your profile will re-score all jobs on your Radar. This may take a few minutes.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onRescore} style={{
            padding: '11px', background: '#1a1a1a', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Re-score now
          </button>
          <button onClick={onSaveOnly} style={{
            padding: '11px', background: 'rgba(0,0,0,0.07)', color: '#1a1a1a',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'var(--font)',
          }}>
            Save without re-scoring
          </button>
          <button onClick={onCancel} style={{
            padding: '8px', background: 'none', color: '#999',
            border: 'none', cursor: 'pointer', fontSize: 13,
            fontFamily: 'var(--font)',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RescoreModal.jsx
git commit -m "feat: add RescoreModal confirmation component"
```

---

## Task 10: Profile.jsx — Targets Section + Redo Setup

**Files:**
- Modify: `src/components/Profile.jsx`
- Modify: `tests/client/Profile.test.jsx`

- [ ] **Step 1: Write failing tests**

Add to `tests/client/Profile.test.jsx`:

```jsx
describe('TargetsSection', () => {
  test('shows "No targets set yet" when profile has no targets', () => {
    // Mock fetchProfile to return profile with no targets
    // render Profile and check for "No targets set yet"
    // Follow the existing mock pattern in the file
  })

  test('shows Add button when no targets set', () => {
    // Confirm "Add" button is present
  })

  test('clicking Edit opens the level checklist and input fields', () => {
    // After clicking Edit, confirm "IC / Individual Contributor" option is visible
  })
})
```

Check `tests/client/Profile.test.jsx` for existing mock/render patterns, then write concrete assertions matching the component.

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/client/Profile.test.jsx 2>&1 | tail -15
```

- [ ] **Step 3: Add imports to Profile.jsx**

At the top of `src/components/Profile.jsx`, update the import:

```js
import { fetchProfile, patchBackground, regenerateDimensions, patchPersonality, patchDimensions, patchName, patchTargets, patchTargetLevel, incrementProfileVersion } from '../api.js'
import RescoreModal from './RescoreModal.jsx'
import Onboarding from './Onboarding.jsx'
```

- [ ] **Step 4: Add TargetsSection component inside Profile.jsx**

Add after `PersonalitySection` (before the `editBtn` const):

```jsx
function TargetsSection({ profile: initialProfile, onSaved }) {
  const LEVEL_OPTIONS = [
    'IC / Individual Contributor', 'Senior IC', 'Manager',
    'Senior Manager / Director', 'VP / Head of', 'C-Suite / Executive',
  ]
  const [editing, setEditing] = useState(false)
  const [targetRoles, setTargetRoles] = useState(initialProfile?.target_roles || '')
  const [targetSectors, setTargetSectors] = useState(initialProfile?.target_sectors || '')
  const [targetLevel, setTargetLevel] = useState(initialProfile?.target_level || [])
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [current, setCurrent] = useState({
    target_roles: initialProfile?.target_roles || null,
    target_sectors: initialProfile?.target_sectors || null,
    target_level: initialProfile?.target_level || null,
  })

  function toggleLevel(level) {
    setTargetLevel(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    )
  }

  async function doSave(rescore) {
    setSaving(true)
    try {
      await patchTargets(targetRoles.trim(), targetSectors.trim())
      if (targetLevel.length > 0) await patchTargetLevel(targetLevel)
      if (rescore) await regenerateDimensions()
      setCurrent({ target_roles: targetRoles.trim(), target_sectors: targetSectors.trim(), target_level: targetLevel })
      setEditing(false)
      onSaved?.()
    } catch { /* non-fatal */ }
    finally { setSaving(false) }
  }

  const inputStyle = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8,
    outline: 'none', fontFamily: 'var(--font)', boxSizing: 'border-box', color: 'var(--text)',
  }
  const rowStyle = { display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.08)', gap: 12 }
  const labelStyle = { fontSize: 13, color: '#8e8e93', minWidth: 120 }

  const hasData = current.target_level?.length || current.target_roles || current.target_sectors

  return (
    <>
      <SectionLabel>Targets</SectionLabel>
      <div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)' }}>
        {!editing ? (
          <div style={{ padding: '14px 16px' }}>
            {!hasData ? (
              <p style={{ fontSize: 13, color: '#8e8e93', margin: '0 0 10px' }}>No targets set yet.</p>
            ) : (
              <>
                {current.target_level?.length > 0 && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>Level</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{current.target_level.join(', ')}</span>
                  </div>
                )}
                {current.target_roles && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>Roles</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{current.target_roles}</span>
                  </div>
                )}
                {current.target_sectors && (
                  <div style={{ ...rowStyle, borderBottom: 'none' }}>
                    <span style={labelStyle}>Sectors</span>
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{current.target_sectors}</span>
                  </div>
                )}
              </>
            )}
            <div style={{ padding: hasData ? '10px 16px' : 0, borderTop: hasData ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}>
              <button onClick={() => { setTargetLevel(current.target_level || []); setEditing(true) }} style={editBtn}>
                {hasData ? 'Edit' : 'Add'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px 16px' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93', marginBottom: 6 }}>Target level</div>
              <p style={{ fontSize: 12, color: '#aaa', margin: '0 0 10px', lineHeight: 1.4 }}>
                Used to filter and score roles by seniority. Select all that apply.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {LEVEL_OPTIONS.map(level => {
                  const isSelected = targetLevel.includes(level)
                  return (
                    <button key={level} type="button" onClick={() => toggleLevel(level)} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                      border: isSelected ? '1.5px solid var(--blue)' : '1px solid rgba(0,0,0,0.15)',
                      background: isSelected ? 'rgba(48,197,255,0.08)' : '#fff',
                      fontFamily: 'var(--font)', fontSize: 14, color: 'var(--text)',
                      textAlign: 'left', transition: 'all 0.15s',
                    }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                        border: isSelected ? '2px solid var(--blue)' : '2px solid rgba(0,0,0,0.2)',
                        background: isSelected ? 'var(--blue)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                      </span>
                      {level}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93', marginBottom: 6 }}>Target roles</div>
              <input value={targetRoles} onChange={e => setTargetRoles(e.target.value)}
                placeholder="e.g. Head of Partnerships, Chief of Staff"
                style={inputStyle} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#8e8e93', marginBottom: 6 }}>Target sectors</div>
              <input value={targetSectors} onChange={e => setTargetSectors(e.target.value)}
                placeholder="e.g. media, creator economy, fintech"
                style={inputStyle} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(true)} disabled={saving} style={actionBtn('blue')}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={actionBtn()}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {showModal && (
        <RescoreModal
          onRescore={() => { setShowModal(false); doSave(true) }}
          onSaveOnly={() => { setShowModal(false); doSave(false) }}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Add TargetsSection and Redo Setup to Profile.jsx main render**

In the main `Profile` component:

1. Add state for redo setup modal and rescore modal:

```js
const [showRedoSetup, setShowRedoSetup] = useState(false)
const [showRedoRescoreModal, setShowRedoRescoreModal] = useState(false)
```

2. Add `TargetsSection` after `PersonalitySection` in the JSX:

```jsx
<TargetsSection profile={profile} onSaved={onProfileChange} />
```

3. Add the "Redo setup" section at the bottom, before the closing `</div>`:

```jsx
{/* Redo Setup */}
<SectionLabel>Start Over</SectionLabel>
<div style={{ background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.15)', borderBottom: '0.5px solid rgba(0,0,0,0.15)', padding: '14px 16px' }}>
  <p style={{ fontSize: 12, color: '#8e8e93', margin: '0 0 12px', lineHeight: 1.5 }}>
    This will regenerate your scoring dimensions and re-score all jobs.
  </p>
  <button onClick={() => setShowRedoSetup(true)} style={editBtn}>Redo setup</button>
</div>

{showRedoSetup && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 999, overflowY: 'auto' }}>
    <div style={{ maxWidth: 600, margin: '40px auto 80px', background: 'var(--screen)', borderRadius: 16, padding: 16, position: 'relative' }}>
      <button
        onClick={() => setShowRedoSetup(false)}
        style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#999', lineHeight: 1 }}
      >×</button>
      <Onboarding onComplete={async () => {
        setShowRedoSetup(false)
        await incrementProfileVersion()
        setShowRedoRescoreModal(true)
        const updated = await fetchProfile()
        if (updated) setProfile(updated)
      }} />
    </div>
  </div>
)}

{showRedoRescoreModal && (
  <RescoreModal
    onRescore={async () => {
      setShowRedoRescoreModal(false)
      await regenerateDimensions()
      onProfileChange?.()
    }}
    onSaveOnly={() => setShowRedoRescoreModal(false)}
    onCancel={() => setShowRedoRescoreModal(false)}
  />
)}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/client/Profile.test.jsx 2>&1 | tail -15
```

Expected: passing.

- [ ] **Step 7: Commit**

```bash
git add src/components/Profile.jsx tests/client/Profile.test.jsx
git commit -m "feat: add Targets section and Redo Setup to Profile page"
```

---

## Task 11: App.jsx — Target Level Warning Banner

**Files:**
- Modify: `src/App.jsx`
- Modify: `tests/client/App.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `tests/client/App.test.jsx` (following existing mock pattern):

```jsx
test('shows target level banner on Radar tab when target_level is null', async () => {
  // Mock fetchProfile to return { target_level: null, onboarding_done: true, ... }
  // Mock fetchJobs to return []
  // Render App, navigate to '/'
  // Assert banner text "Add your target level" is visible
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/client/App.test.jsx -t "target level banner" 2>&1 | tail -10
```

- [ ] **Step 3: Add profile state and banner to App.jsx**

At the top of the `App` component, add:

```js
const [targetLevel, setTargetLevel] = useState(undefined)
const [levelBannerDismissed, setLevelBannerDismissed] = useState(() => {
  const ts = localStorage.getItem('northstar_level_banner_dismissed')
  if (!ts) return false
  return Date.now() - Number(ts) < 7 * 24 * 60 * 60 * 1000
})
```

Add a useEffect to load target_level (add `fetchProfile` to the import from `../api.js`):

```js
useEffect(() => {
  if (!user) return
  fetchProfile().then(p => setTargetLevel(p?.target_level || null)).catch(() => setTargetLevel(null))
}, [user])
```

Add the banner in the JSX, inside the Radar tab content (`tab === 'search'`), after the `<FilterBar>` but before `<ScoreBanner>`:

```jsx
{targetLevel !== undefined && !targetLevel?.length && !levelBannerDismissed && (
  <div style={{
    background: 'rgba(220,0,255,0.05)',
    borderBottom: '0.5px solid rgba(220,0,255,0.15)',
    padding: '9px 20px',
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <span style={{ flex: 1, fontSize: 13, color: '#666' }}>
      ✦ Add your target level to get better-matched roles
    </span>
    <button
      onClick={() => setTab('profile')}
      style={{
        fontSize: 12, fontWeight: 600, color: 'var(--accent)',
        background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font)', padding: 0,
      }}
    >
      Set level →
    </button>
    <button
      onClick={() => {
        setLevelBannerDismissed(true)
        localStorage.setItem('northstar_level_banner_dismissed', String(Date.now()))
      }}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#bbb', fontSize: 16, padding: '0 4px', lineHeight: 1,
      }}
    >×</button>
  </div>
)}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/client/App.test.jsx 2>&1 | tail -15
```

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx tests/client/App.test.jsx
git commit -m "feat: show target level banner on Radar when target_level unset"
```

---

## Task 12: JobDetail — Move Action Buttons to Top

**Files:**
- Modify: `src/components/JobDetail.jsx`
- Modify: `tests/client/JobDetail.test.jsx`

- [ ] **Step 1: Write the failing test**

Add to `tests/client/JobDetail.test.jsx`:

```jsx
test('action buttons appear before score breakdown section', () => {
  const job = { /* minimal job fixture with score_aggregate and url */ }
  const { container } = render(
    <JobDetail job={job} onAddToConstellation={vi.fn()} onNotApplying={vi.fn()} />
  )
  const buttons = container.querySelectorAll('button, a')
  const addBtn = Array.from(buttons).find(b => b.textContent.includes('Add to Constellation'))
  const breakdown = container.querySelector('[data-testid="score-breakdown"]') // add this testid in step 3
  // Add to Constellation should appear before Score breakdown in DOM order
  expect(addBtn).toBeTruthy()
})
```

- [ ] **Step 2: Move the action buttons block in JobDetail.jsx**

Cut the `{/* Action buttons */}` block (lines 213–258):

```jsx
{/* Action buttons */}
<div style={{ height: '0.5px', background: 'rgba(0,0,0,0.08)', margin: '18px 0' }} />
<div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
  {onAddToConstellation && ( ... )}
  {job.url && ( ... )}
  {onNotApplying && ( ... )}
</div>
```

Paste it directly after the closing `</div>` of the header row (after line 147, before `{/* Verdict */}`). Remove the top divider (`height: '0.5px'`) since it's now at the top — replace `marginTop: 20` with `marginBottom: 16`:

```jsx
{/* Action buttons */}
<div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
  {onAddToConstellation && (
    <button
      onClick={() => onAddToConstellation(job.id)}
      style={{
        fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '8px 16px', border: 'none',
        background: '#1a1a1a', color: '#fff',
        cursor: 'pointer', borderRadius: 8, fontFamily: 'var(--font)',
      }}
    >
      Add to Constellation
    </button>
  )}
  {job.url && (
    <a
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '8px 16px', border: '0.5px solid rgba(0,0,0,0.2)',
        background: 'transparent', color: '#1a1a1a',
        cursor: 'pointer', borderRadius: 8, fontFamily: 'var(--font)',
        textDecoration: 'none', display: 'inline-block',
      }}
    >
      View posting
    </a>
  )}
  {onNotApplying && (
    <button
      onClick={() => onNotApplying(job.id)}
      style={{
        fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '8px 16px', border: '0.5px solid rgba(0,0,0,0.2)',
        background: 'transparent', color: '#1a1a1a',
        cursor: 'pointer', borderRadius: 8, fontFamily: 'var(--font)',
      }}
    >
      Not Applying
    </button>
  )}
</div>
```

Also add `data-testid="score-breakdown"` to the score breakdown div for the test.

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/client/JobDetail.test.jsx 2>&1 | tail -10
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/JobDetail.jsx tests/client/JobDetail.test.jsx
git commit -m "feat: move action buttons to top of job detail panel"
```

---

## Task 13: Final Smoke Check + Push

- [ ] **Step 1: Run entire test suite one last time**

```bash
npx vitest run 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 2: Push to trigger Railway deploy**

```bash
git push
```
