# Design: Direct Link Field in Constellation Tracker

**Date:** 2026-04-13
**Status:** Approved

## Overview

Add a user-editable "Direct Link" field to each tracked job entry in the Constellation (job tracker) view. Users paste the original job description URL here. The field auto-saves on blur and shows a clickable external link icon when a URL is present.

## Architecture

Four layers are touched, each following the exact pattern already established by the `salary_range` field.

### 1. Database — `server/db/schema.sql`

Add an idempotent `DO $$` migration block to add `direct_link text` to `tracker_entries`:

```sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tracker_entries' AND column_name = 'direct_link'
  ) THEN
    ALTER TABLE tracker_entries ADD COLUMN direct_link text;
  END IF;
END $$;
```

### 2. DB Layer — `server/db.js`

Three changes, all mirroring `salary_range`:

- **`getAllJobs` SELECT** (line ~61): add `te.direct_link` to the column list
- **`getJobById` SELECT** (line ~83): add `te.direct_link` to the column list
- **`upsertTrackerEntry`** (line ~195):
  - Add `'direct_link'` to the `allowed` array
  - Add `const direct_link = updates.direct_link ?? null`
  - Add `direct_link` to the INSERT column list, VALUES list, and the variable set

### 3. Server Route — `server/index.js`

In `PATCH /api/jobs/:id` (line ~98):

- Destructure `direct_link` from `req.body`
- Add `if (direct_link !== undefined) updates.direct_link = direct_link`

### 4. Frontend — `src/components/Tracker.jsx`

**State:** Add `const [localDirectLink, setLocalDirectLink] = useState({})` alongside `localNotes` and `localSalary`.

**Table header:** Add `'Direct Link'` to the header array, after `'Notes'`.

**Table cell** (after the Notes cell):

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
        style={{ color: 'var(--blue)', opacity: 0.7, flexShrink: 0 }}
      >
        {/* same external-link SVG icon used in existing Link column */}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 2h4v4M14 2 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    )}
  </div>
</td>
```

## Data Flow

```
User types URL in input
  → localDirectLink[jobId] updated (controlled input)
  → user blurs field
  → onUpdate(jobId, { direct_link: value }) called
  → PATCH /api/jobs/:id { direct_link: "..." }
  → upsertTrackerEntry writes direct_link to tracker_entries
  → response returns updated job with direct_link populated
  → localDirectLink entry cleared (reverts to server value)
```

## Constraints and Edge Cases

- **Empty string on blur** is sent as `null` to clear the field.
- **Link icon** uses the local state value during typing (so the icon appears as soon as a URL is entered, before save).
- **No URL validation** — field accepts any text; invalid URLs will simply not be navigable. This matches the existing `url` field behavior.
- **Column width:** input is 130px — wide enough for typical URLs to be readable without making the table unscrollable.
- **No changes to CSV export** — `direct_link` is not added to the export in this iteration.

## Files Changed

| File | Change |
|------|--------|
| `server/db/schema.sql` | Add idempotent migration for `direct_link` column |
| `server/db.js` | Add `direct_link` to SELECTs and `upsertTrackerEntry` |
| `server/index.js` | Add `direct_link` to PATCH handler |
| `src/components/Tracker.jsx` | Add state, column header, and table cell |
