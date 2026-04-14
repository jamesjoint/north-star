# Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iPod-aesthetic with a clean editorial design — #dc00ff accent, new score colors, always-on two-pane Radar, full JobDetail rewrite, and targeted component updates.

**Architecture:** One option: `--blue: var(--accent)` CSS alias propagates the accent color to all existing `var(--blue)` usages automatically; only hardcoded hex values need per-file fixes. JobDetail is a complete rewrite with count-up animation and staggered dimension bars. JobCard gets a `compact` prop for the minimal Radar list rows.

**Tech Stack:** React (JSX, inline styles), CSS custom properties, `requestAnimationFrame` for animations, Vitest/Testing Library (no new tests per project convention for this task).

---

## File Map

| File | Change |
|------|--------|
| `src/index.css` | Add `--accent`, alias `--blue`, update score vars, add `@keyframes fadeIn` |
| `src/utils/scoring.js` | Update hardcoded hex in `scoreColor()` |
| `src/components/Header.jsx` | Badge bounce animation; accent sweep via CSS alias |
| `src/components/FilterBar.jsx` | "Min" → "Min fit score"; accent sweep via CSS alias |
| `src/components/Settings.jsx` | Gradient button → accent; weight badge background |
| `src/components/Profile.jsx` | Spider polygon (#dc00ff, 12px labels, vertex dots); gradient buttons → accent; "Recalibrate my score" |
| `src/components/JobCard.jsx` | Add `compact` + `passing` props for Radar rows |
| `src/components/JobDetail.jsx` | Full rewrite — editorial layout, count-up, staggered bars, 3 action buttons |
| `src/App.jsx` | Always-on two-pane Radar (300px); auto-select; passingId; empty state; firstName |

---

## Task 1: CSS tokens + scoreColor utility

**Files:**
- Modify: `src/index.css`
- Modify: `src/utils/scoring.js`

- [ ] **Step 1: Update `src/index.css`**

Replace the block from `/* Brand palette */` through `--blue-text` and `--score-*` lines:

```css
/* === iPod touch / iPhone iOS 4–6 classic === */

/* Screen: the iconic grouped-table-view gray */
--screen:        #efeff4;
--screen-raised: #ffffff;
--screen-dim:    #dddde1;

/* Chrome / bezel */
--chrome:   #1c1c1e;
--chrome-2: #2c2c2e;
--chrome-3: #3a3a3c;

/* Accent — ultraviolet */
--accent: #dc00ff;

/* Primary action — alias for legacy var(--blue) usages */
--blue:       var(--accent);
--blue-light: var(--accent);
--blue-text:  #ffffff;

/* Text hierarchy */
--text:   #000000;
--text-2: #3c3c43;
--text-3: #8e8e93;
--text-4: #c7c7cc;

/* Separator lines */
--divider:     rgba(0,0,0,0.15);
--divider-dim: rgba(0,0,0,0.08);

/* Now Playing panel */
--np-bg:     #1c1c1e;
--np-raised: #2c2c2e;
--np-border: #3a3a3c;
--np-text:   #f2f2f7;
--np-text-2: #aeaeb2;
--np-text-3: #636366;

/* Score — editorial green / amber / gray */
--score-hi:  #1D6F42;
--score-mid: #B07D00;
--score-lo:  #999;

/* Helvetica Neue is the soul of iPod OS */
--font:   'Helvetica Neue', Helvetica, -apple-system, BlinkMacSystemFont, Arial, sans-serif;
--radius: 10px;
```

Also add `@keyframes fadeIn` after the `.row-anim` block:

```css
/* Detail pane fade-in */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Also remove `--brand-blue`, `--brand-green`, `--brand-amber`, `--brand-pink` from the `:root` block if present (they're unused after this change).

The `input[type=range]`, `input[type=checkbox]`, and `.ios-segment` rules already use `var(--blue)` so they pick up `--accent` automatically — no changes needed there.

- [ ] **Step 2: Update `src/utils/scoring.js`**

The `scoreColor()` function uses hardcoded hex. Update:

```js
export function scoreColor(s) {
  if (s == null) return '#c7c7cc'
  if (s >= 7) return '#1D6F42'
  if (s >= 4) return '#B07D00'
  return '#999'
}
```

- [ ] **Step 3: Verify**

Run the dev server (`npm run dev`). Open the app. Check:
- The ✦ logo symbol in the Header is now purple/ultraviolet (it uses `var(--blue)` which now resolves to `#dc00ff`)
- The active tab underline is purple
- Score circles in job cards are now green/amber/gray instead of green/yellow/pink

- [ ] **Step 4: Commit**

```bash
git add src/index.css src/utils/scoring.js
git commit -m "feat: replace --blue with --accent (#dc00ff) and update score colors to editorial palette"
```

---

## Task 2: Header — badge bounce animation

**Files:**
- Modify: `src/components/Header.jsx`

The `var(--blue)` references in Header (✦, tab underline, badges, admin badge) already resolve to `--accent` via the CSS alias from Task 1. The only new work here is the Constellation badge bounce animation when `trackedCount` increases.

- [ ] **Step 1: Add bounce state and useEffect to Header**

In `src/components/Header.jsx`, add `badgeBounce` state and a ref to track the previous `trackedCount`:

After the existing imports and before the TABS array, the component currently starts at line 12. Add `useRef` to the import if not already there (it already is). In the component body, add after the existing state declarations:

```jsx
const prevTrackedRef = useRef(trackedCount)
const [badgeBounce, setBadgeBounce] = useState(false)

useEffect(() => {
  if (trackedCount > prevTrackedRef.current) {
    setBadgeBounce(true)
    setTimeout(() => setBadgeBounce(false), 300)
  }
  prevTrackedRef.current = trackedCount
}, [trackedCount])
```

- [ ] **Step 2: Apply bounce style to the Constellation badge**

Find the Constellation tab badge (currently at ~line 110–121). It renders as:
```jsx
{t.id === 'tracker' && trackedCount > 0 && (
  <span style={{
    marginLeft: 5,
    background: 'var(--blue)',
    ...
  }}>
    {trackedCount}
  </span>
)}
```

Update it to apply the bounce transform:
```jsx
{t.id === 'tracker' && trackedCount > 0 && (
  <span style={{
    marginLeft: 5,
    background: 'var(--blue)',
    color: '#fff',
    borderRadius: 10,
    padding: '1px 5px',
    fontSize: 10,
    fontWeight: 700,
    verticalAlign: 'middle',
    display: 'inline-block',
    transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    transform: badgeBounce && t.id === 'tracker' ? 'scale(1.4)' : 'scale(1)',
  }}>
    {trackedCount}
  </span>
)}
```

Also update the admin badge at ~line 220 to use `var(--accent)` directly (currently `color: 'var(--blue)'` and `background: 'rgba(48,197,255,0.12)'`):
```jsx
color: 'var(--accent)',
background: 'rgba(220,0,255,0.12)',
```

- [ ] **Step 3: Verify**

In the app, add a job to Constellation. The Constellation tab badge should briefly scale up then snap back.

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.jsx
git commit -m "feat: add Constellation badge bounce animation on add"
```

---

## Task 3: FilterBar + Settings accent sweep

**Files:**
- Modify: `src/components/FilterBar.jsx`
- Modify: `src/components/Settings.jsx`

Most `var(--blue)` usages already resolve to `--accent` via Task 1. The remaining work is hardcoded hex values and the label/button text changes.

- [ ] **Step 1: Update `src/components/FilterBar.jsx`**

Change the "Min" label (line 123) to "Min fit score":
```jsx
<span style={{ fontSize: 12, color: '#8e8e93', whiteSpace: 'nowrap' }}>Min fit score</span>
```

Remove the inline `accentColor: 'var(--blue)'` from the min score range input (line 128) — this is now handled by the global CSS rule:
```jsx
<input
  type="range" min={0} max={10} step={1}
  value={filters.minScore}
  onChange={e => onChange({ ...filters, minScore: Number(e.target.value) })}
  style={{ width: 60 }}
/>
```

Remove `accentColor: 'var(--blue)'` from both checkbox inputs (lines 201, 207) for the same reason:
```jsx
<input type="checkbox" checked={!!filters.showExpired}
  onChange={e => onChange({ ...filters, showExpired: e.target.checked })}
  style={{ width: 14, height: 14 }} />
```
```jsx
<input type="checkbox" checked={!!filters.hideNoJD}
  onChange={e => onChange({ ...filters, hideNoJD: e.target.checked })}
  style={{ width: 14, height: 14 }} />
```

- [ ] **Step 2: Update `src/components/Settings.jsx`**

The personalised badge at line 109 uses `var(--blue)` — already handled via alias. No change needed there.

The weight badge background at lines 134–138 uses hardcoded `rgba(48,197,255,0.12)`. Change to `rgba(220,0,255,0.12)`:
```jsx
color: value >= 3 ? 'var(--blue)' : '#8e8e93',
background: value >= 3 ? 'rgba(220,0,255,0.12)' : 'rgba(0,0,0,0.05)',
```

The Save button gradient at lines 181–185 uses hardcoded `#30C5FF`:
```jsx
background: isDirty
  ? 'var(--accent)'
  : 'rgba(0,0,0,0.08)',
color: isDirty ? '#fff' : '#8e8e93',
...
boxShadow: isDirty
  ? '0 1px 0 rgba(255,255,255,0.25) inset, 0 1px 3px rgba(0,0,0,0.2)'
  : 'none',
```

The success message at line 222 uses `color: '#A0CB3B'` (old brand green). Change to `var(--score-hi)`:
```jsx
<span style={{ fontSize: 14, color: 'var(--score-hi)' }}>✓ {doneCount} jobs updated</span>
```

The error message at line 225 uses `color: '#EC5298'` (old brand pink). Change to `var(--score-lo)`:
```jsx
<span style={{ fontSize: 14, color: 'var(--score-lo)' }}>Save failed</span>
```

- [ ] **Step 3: Verify**

Open Settings. Check:
- Sliders are purple (accent)
- "Min fit score" label visible in FilterBar
- Weight badges that are ≥3 show purple background
- Save Weights button is solid purple when dirty

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterBar.jsx src/components/Settings.jsx
git commit -m "feat: update FilterBar label and Settings accent colors"
```

---

## Task 4: Profile spider chart + Recalibrate button

**Files:**
- Modify: `src/components/Profile.jsx`

- [ ] **Step 1: Update spider chart fill, stroke, and labels**

In `src/components/Profile.jsx`, the `RadarChart` component (lines 12–81). Make these changes:

**Line 60** — polygon fill and stroke:
```jsx
<path d={dataPath} fill="rgba(220,0,255,0.12)" stroke="#dc00ff" strokeWidth={2} />
```

**Label font size (line 69)** — change `fontSize={9}` to `fontSize={12}`:
```jsx
<text
  key={key}
  x={lx.toFixed(1)} y={ly.toFixed(1)}
  textAnchor="middle" dominantBaseline="middle"
  fontSize={12} fill="#8e8e93"
  style={{ fontFamily: 'var(--font)' }}
>
```

- [ ] **Step 2: Add vertex dots to spider chart**

Currently the spider has only a center dot. Add vertex dots after the data polygon `<path>` (after line 60), before the labels:

```jsx
{/* Vertex dots */}
{dataPts.map((p, i) => (
  <circle key={i} cx={p[0].toFixed(1)} cy={p[1].toFixed(1)} r={3} fill="#dc00ff" />
))}
```

- [ ] **Step 3: Fix remaining blue references in Profile**

The `SectionLabel` badge at line 89 uses `var(--blue)` — already handled via alias.

The `actionBtn('blue')` helper at line 258 uses the old gradient. Update the `'blue'` variant:
```js
if (variant === 'blue') return { ...base, background: 'var(--accent)', color: '#fff', fontWeight: 600 }
```

Line 226 (name section Save button gradient):
```jsx
background: 'var(--accent)',
```

Line 411 (personality save button `background: 'var(--blue)'`) — already handled via alias.

Line 455 (another button gradient):
```jsx
? 'var(--accent)'
```

Lines 172, 468, 564, 565 — success messages using `color: '#A0CB3B'`. Change to `var(--score-hi)`:
```jsx
color: 'var(--score-hi)'
```

Line 469 — error using `color: '#EC5298'`. Change to `var(--score-lo)`:
```jsx
color: 'var(--score-lo)'
```

Line 381 — `color: 'var(--blue)'` — already handled via alias.

- [ ] **Step 4: Rename "Refresh Dimensions" → "Recalibrate my score"**

Line 560:
```jsx
{regenerating ? 'Regenerating…' : 'Recalibrate my score'}
```

- [ ] **Step 5: Verify**

Open Profile → Coordinates section. Check:
- Spider polygon is purple
- Vertex dots are purple
- Labels are 12px (larger/more readable)
- "Recalibrate my score" button text visible

- [ ] **Step 6: Commit**

```bash
git add src/components/Profile.jsx
git commit -m "feat: update spider chart to accent color, 12px labels, vertex dots; rename Recalibrate button"
```

---

## Task 5: JobCard compact + passing mode

**Files:**
- Modify: `src/components/JobCard.jsx`

- [ ] **Step 1: Add `compact` and `passing` props**

`compact={true}` renders a minimal Radar row. `passing={true}` applies the slide-out animation.

Replace the entire `JobCard.jsx` content with:

```jsx
import { useState } from 'react'
import { formatRelativeDate } from '../utils/date.js'
import { scoreColor, parseDimensions } from '../utils/scoring.js'

const STATUS_OPTIONS = ['none', 'Saved', 'Applied', 'Outreach Sent', 'Interviewing', 'Offer', 'Passed', 'Not Applying', 'Expired']

export const STATUS_COLORS = {
  Saved:           { bg: '#ddf4ff', color: '#0369a1' },
  Applied:         { bg: '#fef9c3', color: '#854d0e' },
  'Outreach Sent': { bg: '#f3e8ff', color: '#7e22ce' },
  Interviewing:    { bg: '#dcfce7', color: '#166534' },
  Offer:           { bg: '#fef08a', color: '#713f12' },
  Passed:          { bg: '#fee2e2', color: '#991b1b' },
  'Not Applying':  { bg: '#f3f4f6', color: '#9ca3af' },
  Expired:         { bg: '#f3f4f6', color: '#9ca3af' },
}


export default function JobCard({ job, onSelect, selected, onStatusChange, onDelete, compact, passing }) {
  const score = job.score_aggregate
  const [hovered, setHovered] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)

  const scoreCol = scoreColor(score)

  // ── Compact mode (Radar left list) ────────────────────────────────────────
  if (compact) {
    const REMOTE_BADGE = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }
    const metaParts = [
      job.company,
      job.location,
      REMOTE_BADGE[job.remote],
      (() => {
        const d = job.posted_at || (job.fetched_at && job.fetched_at.slice(0, 10))
        return d ? formatRelativeDate(d) : null
      })(),
    ].filter(Boolean)

    return (
      <div
        onClick={() => onSelect?.(job.id)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 14,
          padding: '14px 20px',
          borderBottom: '0.5px solid rgba(0,0,0,0.06)',
          cursor: 'pointer',
          borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
          background: selected ? '#f9f9f9' : passing ? 'transparent' : 'transparent',
          transition: passing
            ? 'transform 0.35s ease, opacity 0.35s ease'
            : 'border-left-color 0.25s ease, background 0.15s ease',
          transform: passing ? 'translateX(-110%)' : 'translateX(0)',
          opacity: passing ? 0 : 1,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span style={{
          fontSize: 13, fontWeight: 500, minWidth: 28, paddingTop: 1,
          fontVariantNumeric: 'tabular-nums',
          color: scoreCol,
        }}>
          {score != null ? score.toFixed(1) : '—'}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: '#1a1a1a',
            lineHeight: 1.3, marginBottom: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {job.title}
          </div>
          <div style={{
            fontSize: 11, color: '#999',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {metaParts.join(' · ')}
          </div>
        </div>
      </div>
    )
  }

  // ── Full mode (Constellation / Tracker list) ───────────────────────────────
  const summary = parseDimensions(job.score_dimensions).summary || null
  const status = job.status || 'none'
  const statusStyle = STATUS_COLORS[status]

  return (
    <div
      className="row-anim ios-cell"
      role="article"
      onClick={() => onSelect?.(job.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 54,
        background: selected
          ? 'linear-gradient(180deg, #1b5de8 0%, #0c45cc 100%)'
          : hovered
          ? 'rgba(0,119,237,0.06)'
          : '#ffffff',
        cursor: 'pointer',
        transition: 'background 0.08s',
        position: 'relative',
      }}
    >
      {/* Score column */}
      <div style={{
        width: 54, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 2, gap: 2,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: selected ? 'rgba(255,255,255,0.15)' : `${scoreCol}18`,
          border: `1.5px solid ${selected ? 'rgba(255,255,255,0.35)' : scoreCol}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: selected ? '#fff' : scoreCol,
            letterSpacing: '-0.03em', lineHeight: 1,
          }}>
            {score != null ? score.toFixed(1) : '—'}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: '10px 8px 10px 0', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{
            fontSize: 16, fontWeight: 400,
            color: selected ? '#fff' : '#000',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {job.title}
          </span>
          {!job.seen && (
            <div style={{
              flexShrink: 0, width: 8, height: 8, borderRadius: '50%',
              background: selected ? '#fff' : 'var(--accent)',
            }} />
          )}
        </div>
        <div style={{
          fontSize: 13,
          color: selected ? 'rgba(255,255,255,0.65)' : '#8e8e93',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {job.company}
          {job.location ? ` · ${job.location}` : ''}
          {(() => {
            const d = job.posted_at || (job.fetched_at && job.fetched_at.slice(0, 10))
            return d ? ` · ${formatRelativeDate(d)}` : ''
          })()}
        </div>
      </div>

      {/* Right accessories */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        paddingRight: 10, flexShrink: 0,
      }}>
        <div onClick={e => e.stopPropagation()}>
          <select
            value={status}
            onChange={e => onStatusChange?.(job.id, { status: e.target.value })}
            style={{
              fontSize: 11, padding: '2px 18px 2px 6px',
              borderRadius: 20, border: 'none',
              background: selected
                ? 'rgba(255,255,255,0.2)'
                : statusStyle ? statusStyle.bg : 'rgba(0,0,0,0.06)',
              color: selected
                ? '#fff'
                : statusStyle ? statusStyle.color : '#8e8e93',
              fontWeight: 600, cursor: 'pointer', appearance: 'none',
              fontFamily: 'var(--font)',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%238e8e93'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center',
            }}
          >
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s === 'none' ? 'Track…' : s}</option>
            ))}
          </select>
        </div>

        {summary && (
          <div style={{ position: 'relative' }}>
            <span
              onMouseEnter={e => { e.stopPropagation(); setShowTooltip(true) }}
              onMouseLeave={() => setShowTooltip(false)}
              style={{
                width: 16, height: 16, borderRadius: '50%',
                border: `1.5px solid ${selected ? 'rgba(255,255,255,0.5)' : '#c7c7cc'}`,
                color: selected ? 'rgba(255,255,255,0.6)' : '#c7c7cc',
                fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'default', fontWeight: 600,
              }}
            >
              i
            </span>
            {showTooltip && (
              <div style={{
                position: 'absolute', right: 0, top: 22, zIndex: 20,
                background: '#1c1c1e', color: '#f2f2f7',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 12, lineHeight: 1.5, width: 260,
                boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                pointerEvents: 'none', border: '1px solid #3a3a3c',
              }}>
                {summary}
              </div>
            )}
          </div>
        )}

        {onDelete && hovered && (
          <div onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onDelete(job.id)}
              title="Delete"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, lineHeight: 1, padding: '2px 3px',
                color: selected ? 'rgba(255,255,255,0.45)' : '#c7c7cc',
                transition: 'color 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = selected ? '#fff' : 'var(--score-lo)'}
              onMouseLeave={e => e.currentTarget.style.color = selected ? 'rgba(255,255,255,0.45)' : '#c7c7cc'}
            >
              ✕
            </button>
          </div>
        )}

        <span style={{
          fontSize: 18, lineHeight: 1,
          color: selected ? 'rgba(255,255,255,0.55)' : '#c7c7cc',
          fontWeight: 300, marginLeft: 2,
        }}>
          ›
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Run `npm run dev`. Open the Radar tab. Job cards should now render as compact minimal rows (score + title + meta). The Constellation tab should still show full iOS-style cards.

- [ ] **Step 3: Commit**

```bash
git add src/components/JobCard.jsx
git commit -m "feat: add compact + passing props to JobCard for Radar list"
```

---

## Task 6: JobDetail complete redesign

**Files:**
- Modify: `src/components/JobDetail.jsx`

Replace the entire file:

- [ ] **Step 1: Rewrite `src/components/JobDetail.jsx`**

```jsx
import { useEffect, useRef } from 'react'
import { formatRelativeDate } from '../utils/date.js'
import { parseDimensions } from '../utils/scoring.js'

function scoreColor(s) {
  if (s == null) return '#999'
  if (s >= 7) return '#1D6F42'
  if (s >= 4) return '#B07D00'
  return '#999'
}

const REMOTE_LABELS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }

export default function JobDetail({ job, onAddToConstellation, onNotApplying }) {
  const scoreRef = useRef(null)
  const animRef = useRef(null)
  const barRefs = useRef([])

  const dims = parseDimensions(job.score_dimensions)
  const dimEntries = Object.entries(dims).filter(([k]) => k !== 'summary')
  const score = job.score_aggregate
  const verdict = dims.summary || null

  useEffect(() => {
    // Cancel any running animation
    if (animRef.current) cancelAnimationFrame(animRef.current)

    // Score count-up
    if (scoreRef.current) {
      const el = scoreRef.current
      if (score != null) {
        const target = score
        const duration = 700
        const start = performance.now()
        el.style.color = scoreColor(score)
        function step(now) {
          const p = Math.min((now - start) / duration, 1)
          const e = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p
          el.textContent = (target * e).toFixed(1)
          if (p < 1) animRef.current = requestAnimationFrame(step)
          else { el.textContent = target.toFixed(1); animRef.current = null }
        }
        animRef.current = requestAnimationFrame(step)
      } else {
        el.textContent = '—'
        el.style.color = '#999'
      }
    }

    // Staggered bar fills
    const timers = dimEntries.map((_, i) =>
      setTimeout(() => {
        const bar = barRefs.current[i]
        if (bar) bar.style.width = (dimEntries[i][1].score / 10 * 100) + '%'
      }, 50 + i * 80)
    )

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      timers.forEach(clearTimeout)
    }
  }, [job.id]) // eslint-disable-line

  const metaParts = [
    job.company,
    job.location,
    REMOTE_LABELS[job.remote],
    job.posted_at ? formatRelativeDate(job.posted_at) : null,
  ].filter(Boolean)

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '28px 36px',
      background: '#fff',
      animation: 'fadeIn 0.2s ease',
      fontFamily: 'var(--font)',
    }}>

      {/* Role detail label */}
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#999', marginBottom: 10,
      }}>
        Role detail
      </div>

      {/* Title */}
      <div style={{
        fontSize: 24, fontWeight: 500, color: '#1a1a1a',
        lineHeight: 1.2, marginBottom: 6,
      }}>
        {job.title}
      </div>

      {/* Company · meta */}
      <div style={{ fontSize: 13, color: '#999', marginBottom: 14 }}>
        {metaParts.join(' · ')}
      </div>

      {/* Source badge */}
      {job.source && (
        <span style={{
          display: 'inline-block',
          fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: '#999', border: '0.5px solid rgba(0,0,0,0.12)',
          padding: '3px 8px', borderRadius: 2, marginBottom: 16,
        }}>
          via {job.source}
        </span>
      )}

      {/* Big score + count-up */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div
          ref={scoreRef}
          style={{
            fontSize: 44, fontWeight: 500, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums', color: '#999',
            transition: 'color 0.6s ease',
          }}
        >
          0.0
        </div>
        <div style={{ fontSize: 11, color: '#999', paddingBottom: 6 }}>out of 10</div>
      </div>
      <div style={{
        fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: '#999', marginBottom: 14,
      }}>
        Fit score
      </div>

      {/* Verdict */}
      {verdict && (
        <div style={{
          fontSize: 15, color: '#666', lineHeight: 1.8,
          marginBottom: 20, fontWeight: 400,
        }}>
          {verdict}
        </div>
      )}

      {/* Score breakdown */}
      {dimEntries.length > 0 && (
        <>
          <div style={{ height: '0.5px', background: 'rgba(0,0,0,0.08)', margin: '18px 0' }} />
          <div style={{
            fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#999', marginBottom: 14,
          }}>
            Score breakdown
          </div>
          {dimEntries.map(([key, d], i) => {
            const col = scoreColor(d.score)
            const isLast = i === dimEntries.length - 1
            return (
              <div key={key} style={{
                padding: '10px 0',
                borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.06)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#1a1a1a', flex: 1 }}>
                    {d.label || key}
                  </span>
                  <div style={{
                    flex: 1, height: 3, background: 'rgba(0,0,0,0.08)',
                    borderRadius: 2, overflow: 'hidden', maxWidth: 80,
                  }}>
                    <div
                      ref={el => { barRefs.current[i] = el }}
                      style={{
                        height: '100%', width: 0, borderRadius: 2,
                        background: col,
                        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                      }}
                    />
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 16, textAlign: 'right', color: col,
                  }}>
                    {d.score}
                  </span>
                </div>
                {d.reasoning && (
                  <div style={{ fontSize: 11, color: '#999', lineHeight: 1.5 }}>
                    {d.reasoning}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Action buttons */}
      <div style={{ height: '0.5px', background: 'rgba(0,0,0,0.08)', margin: '18px 0' }} />
      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
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
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Open the app and click a job in the Radar list. Check:
- Clean white editorial detail pane appears (no iOS chrome, no company art tile)
- Score animates from 0.0 to target over ~700ms
- Dimension bars stagger-fill left to right
- Score colors are green/amber/gray
- Verdict text is not italic, 15px, 1.8 line-height
- "Add to Constellation", "View posting", "Not Applying" buttons visible

Open Constellation tab, select a tracked job. Check:
- Same clean detail pane, but only "View posting" button (no Add to Constellation / Not Applying)

- [ ] **Step 3: Commit**

```bash
git add src/components/JobDetail.jsx
git commit -m "feat: replace JobDetail with clean editorial design (count-up, staggered bars, no iOS chrome)"
```

---

## Task 7: App.jsx — Radar two-pane layout

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add passingId state + firstName + auto-select + handlers**

At the top of the `App` component body, add:

```js
const { user, firstName } = useAuth()  // add firstName to existing destructure
const [passingId, setPassingId] = useState(null)
```

Add the auto-select effect after the existing `selectedJob` line:

```js
const selectedJob = allJobs.find(j => j.id === selectedId) || null

// Auto-select first Radar job on load
useEffect(() => {
  if (tab === 'search' && !selectedId && jobs.length > 0) {
    setSelectedId(jobs[0].id)
  }
}, [tab, selectedId, jobs]) // eslint-disable-line
```

Add the two handler functions after `handleSelect`:

```js
function handleNotApplying(jobId) {
  const idx = jobs.findIndex(j => j.id === jobId)
  const nextJob = jobs[idx + 1] || jobs[idx - 1] || null
  setPassingId(jobId)
  setTimeout(() => {
    updateStatus(jobId, { status: 'Not Applying' })
    setSelectedId(nextJob ? nextJob.id : null)
    setPassingId(null)
  }, 350)
}

function handleAddToConstellation(jobId) {
  updateStatusAndRefreshBoards(jobId, { status: 'Saved' })
}
```

- [ ] **Step 2: Replace the Radar (search tab) layout**

Find the `{tab === 'search' && (` block (currently lines ~159–231) and replace with:

```jsx
{/* Job Search / Radar */}
{tab === 'search' && (
  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
    <FilterBar sources={sources} sourceCounts={sourceCounts} filters={filters} onChange={setFilters} />
    <ScoreBanner onDone={reloadJobs} />
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* Left list — always 300px */}
      <div style={{
        width: 300,
        flexShrink: 0,
        borderRight: '0.5px solid rgba(0,0,0,0.08)',
        overflowY: 'auto',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* "All Radar — N roles" counter */}
        <div style={{
          padding: '12px 20px 8px',
          borderBottom: '0.5px solid rgba(0,0,0,0.08)',
          flexShrink: 0,
        }}>
          <span style={{
            fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#999',
          }}>
            All Radar — {jobs.length} roles
          </span>
        </div>

        {refreshing && (
          <p style={{ color: '#999', textAlign: 'center', marginTop: 48, fontSize: 13 }}>
            Scanning…
          </p>
        )}
        {error && (
          <p style={{ color: 'var(--score-lo)', textAlign: 'center', marginTop: 48, fontSize: 13 }}>
            Error: {error}
          </p>
        )}
        {!refreshing && !error && jobs.length === 0 && (
          <p style={{
            color: '#999', textAlign: 'center', marginTop: 60,
            fontSize: 14, padding: '0 24px', lineHeight: 1.6,
          }}>
            hey {firstName || 'you'}, you're a superstar and someday you won't need this
          </p>
        )}
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            compact
            selected={job.id === selectedId}
            passing={job.id === passingId}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* Right detail — always flex:1 */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {selectedJob ? (
          <JobDetail
            key={selectedJob.id}
            job={selectedJob}
            onAddToConstellation={handleAddToConstellation}
            onNotApplying={handleNotApplying}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#999', fontSize: 13,
          }}>
            Select a role
          </div>
        )}
      </div>

    </div>
  </div>
)}
```

- [ ] **Step 3: Update Constellation JobDetail usage**

In the Constellation (tracker) section (~lines 108–123), the current `JobDetail` call passes `onClose`, `onStatusChange`, `onPrev`, `onNext`. Remove all of these — the new JobDetail takes none of them:

```jsx
{selectedJob && (() => {
  return (
    <div style={{ width: 380, flexShrink: 0, overflowY: 'auto' }}>
      <JobDetail
        key={selectedJob.id}
        job={selectedJob}
      />
    </div>
  )
})()}
```

- [ ] **Step 4: Verify end-to-end**

Open the Radar tab. Verify:
- Left pane is 300px, always visible with job list
- First job auto-selected on load, detail pane shows immediately
- Clicking a job: border slides to accent color (#dc00ff), detail fades in
- Score count-up and staggered bars animate on each job click
- "Not Applying" button: job slides left off the list, next job auto-selects
- "Add to Constellation": Constellation badge bounces
- Empty state (if all jobs filtered out): personalized message with first name

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: always-on two-pane Radar layout with auto-select, Not Applying animation, and personalized empty state"
```

---

## Self-Review Checklist

After writing this plan, checked against spec:

- [x] CSS tokens: --accent, --blue alias, score colors, fadeIn keyframe
- [x] scoreColor() updated
- [x] Header: ✦ and badges via alias; badge bounce added
- [x] FilterBar: "Min fit score" label, inline accent removed
- [x] Settings: gradient button, weight badge background, status message colors
- [x] Profile: spider fill/stroke/dots/labels, actionBtn gradient, Recalibrate button
- [x] JobCard: compact + passing props
- [x] JobDetail: complete rewrite with count-up, staggered bars, fadeIn, 3 buttons
- [x] App.jsx: two-pane, 300px list, auto-select, passingId, empty state, firstName
- [x] Constellation JobDetail usage updated (no longer passes removed props)
- [x] No TBD/TODO placeholders
- [x] scoreColor() values consistent: #1D6F42, #B07D00, #999 used throughout
