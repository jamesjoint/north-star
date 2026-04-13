# Design: Name Fields + Claude Text Removal

**Date:** 2026-04-13
**Status:** Approved

## Overview

Two independent changes shipped together:

1. **Claude text removal** — strip all user-facing "Claude" brand mentions from UI copy (3 occurrences, 2 files). Server-side references stay.
2. **First/last name** — add `first_name` / `last_name` to the profile, collect them in onboarding and profile settings, and use the first name to personalize the Header avatar and dropdown.

---

## Part 1: Claude Text Removal

Three string changes, no logic changes:

| File | Line | Old | New |
|------|------|-----|-----|
| `src/components/Profile.jsx` | 502 | `Regenerate with Claude` | `Refresh Dimensions` |
| `src/components/Onboarding.jsx` | 129 | `Claude is reading your background and generating custom scoring dimensions.` | `Reading your background and generating custom scoring dimensions.` |
| `src/components/Onboarding.jsx` | 304 | `Claude generated these from your background. Adjust weights to match what matters most.` | `Generated from your background. Adjust weights to match what matters most.` |

Server-side references in `scorer.js`, `dimension-generator.js`, and `server/index.js` are internal and unchanged.

---

## Part 2: First/Last Name Feature

### Architecture

Three backend layers + two frontend layers, all following existing patterns.

### 2a. Database — `server/db/schema.sql`

Add two idempotent `DO $$` migration blocks after the `direct_link` block:

```sql
-- Idempotently add first_name column to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'first_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN first_name text;
  END IF;
END $$;

-- Idempotently add last_name column to profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'last_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN last_name text;
  END IF;
END $$;
```

### 2b. DB Layer — `server/db.js`

**`getProfile`** already returns `SELECT * FROM profiles`, so `first_name` and `last_name` come through automatically once the columns exist.

**New function `upsertProfileName`:**

```js
export async function upsertProfileName(pool, userId, firstName, lastName) {
  await pool.query(
    `INSERT INTO profiles (user_id, first_name, last_name, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET first_name = $2, last_name = $3, updated_at = now()`,
    [userId, firstName || null, lastName || null]
  )
}
```

### 2c. Server Routes — `server/index.js`

**`GET /api/profile`** — add `first_name` and `last_name` to the response object (both existing profile response paths):

```js
return res.json({
  weights: dbProfile.weights || {},
  background: dbProfile.background,
  onboarding_done: dbProfile.onboarding_done,
  dimensions: dbProfile.dimensions || null,
  personality: dbProfile.personality || null,
  first_name: dbProfile.first_name || null,
  last_name: dbProfile.last_name || null,
})
```

**New `PATCH /api/profile/name`** route:

```js
app.patch('/api/profile/name', async (req, res) => {
  const { first_name, last_name } = req.body
  await upsertProfileName(pool, req.user.id, first_name, last_name)
  res.json({ ok: true })
})
```

### 2d. Client API — `src/api.js`

New function:

```js
export async function patchName(firstName, lastName) {
  const res = await apiFetch(`${BASE}/profile/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: firstName, last_name: lastName }),
  })
  if (!res.ok) throw new Error(`Failed to save name: ${res.status}`)
  return res.json()
}
```

### 2e. AuthContext — `src/contexts/AuthContext.jsx`

AuthContext already calls `fetchProfile()` on startup. Extract `first_name` and expose it:

```js
const [firstName, setFirstName] = useState(null)
const [lastName, setLastName]   = useState(null)

// inside the existing fetchProfile() block:
setFirstName(profile?.first_name || null)
setLastName(profile?.last_name || null)
```

Expose `firstName`, `lastName`, and a `setFirstName` / `setLastName` updater (so Profile and Onboarding can update context immediately after saving, without requiring a full page reload):

```js
<AuthContext.Provider value={{
  user, loading, logout, onboardingDone, completeOnboarding,
  firstName, lastName, setFirstName, setLastName,
}}>
```

### 2f. Onboarding — `src/components/Onboarding.jsx`

Add `'name'` as the first step. Update `STEPS`:

```js
const STEPS = ['name', 'background', 'generating', 'personality', 'review', 'board']
```

New `NameStep` component (first name required, last name optional):

- Two text inputs: First Name (required), Last Name (optional)
- "Continue" button enabled when first name is non-empty
- On submit: calls `patchName(firstName, lastName)`, then calls `onNext(firstName, lastName)`
- Root `Onboarding` receives `firstName`/`lastName` from `NameStep` and calls `setFirstName`/`setLastName` from AuthContext so the header updates immediately

Step flow:
```
name → background → generating → personality → review → board
```

### 2g. Profile — `src/components/Profile.jsx`

Add a "Your Name" section at the top (before "Your Background"), with two inputs and a "Save" button. Reads initial values from `fetchProfile()` (already called in the component). Saves via `patchName()`. On success, calls `setFirstName`/`setLastName` from AuthContext.

```
[First Name input]  [Last Name input]   [Save]
```

Inline save with ✓ Saved feedback, no page reload needed.

### 2h. Header — `src/components/Header.jsx`

Receives `firstName` and `lastName` from `useAuth()`.

**Avatar initials (`abbr`):**
```js
const abbr = firstName
  ? `${firstName[0]}${lastName?.[0] || ''}`.toUpperCase()
  : initials(user?.email)
```

**Avatar button title:**
```js
title={firstName ? `Hi, ${firstName}` : user?.email}
```

**Dropdown user info section:**
```jsx
<div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--divider)' }}>
  {firstName ? (
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
      Hi, {firstName}
    </div>
  ) : (
    <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>Signed in as</div>
  )}
  <div style={{ fontSize: 12, color: 'var(--text-3)', wordBreak: 'break-all' }}>
    {user?.email}
  </div>
  {/* admin badge stays as-is */}
</div>
```

---

## Data Flow

```
Onboarding NameStep
  → patchName(firstName, lastName)
  → PATCH /api/profile/name
  → upsertProfileName() → profiles table
  → setFirstName/setLastName in AuthContext
  → Header re-renders with new initials + "Hi, First"

Profile name section save
  → same PATCH /api/profile/name
  → same context update
  → Header updates immediately

App startup
  → AuthContext fetchProfile()
  → setFirstName(profile.first_name)
  → Header renders with correct name
```

---

## Files Changed

| File | Change |
|------|--------|
| `server/db/schema.sql` | Add 2 idempotent migrations for `first_name`, `last_name` on `profiles` |
| `server/db.js` | Add `upsertProfileName()` |
| `server/index.js` | Expose `first_name`/`last_name` in `GET /api/profile`; add `PATCH /api/profile/name` |
| `src/api.js` | Add `patchName()` |
| `src/contexts/AuthContext.jsx` | Add `firstName`/`lastName` state, expose in context |
| `src/components/Onboarding.jsx` | Add `NameStep` as first step; fix 1 Claude string |
| `src/components/Profile.jsx` | Add name section; fix 1 Claude string |
| `src/components/Header.jsx` | Use `firstName`/`lastName` for initials, tooltip, dropdown |

---

## Edge Cases

- **No name set**: all name-based UI falls back to email (initials from email, "Signed in as" label). No empty strings shown.
- **First name only**: avatar shows single initial, greeting shows "Hi, [First Name]", `lastName` is null.
- **Existing users** (pre-migration): columns are nullable, profile returns `null` for both — same as no-name-set fallback.
- **Onboarding skip**: the NameStep "Continue" requires only first name; last name is optional. Skipping name entirely is not allowed (first name required to proceed).
