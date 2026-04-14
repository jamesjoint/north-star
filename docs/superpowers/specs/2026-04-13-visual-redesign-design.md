# Design: Visual Redesign (Sub-project A)

**Date:** 2026-04-13
**Status:** Approved

## Overview

Full visual overhaul of the app — new color system, two-pane Radar layout, clean editorial JobDetail (replaces iPod-style), animations, and targeted component updates. Desktop-only. Minimal new tests.

---

## Part 1: CSS Tokens (`src/index.css`)

Replace the light-blue brand color with an ultraviolet accent and update score colors to an editorial palette:

| Variable | Old | New |
|----------|-----|-----|
| `--accent` | *(new)* | `#dc00ff` |
| `--blue` | `#30C5FF` | **removed** (all usages → `var(--accent)`) |
| `--blue-light` | `#4db8f5` | **removed** |
| `--brand-blue` | `#30C5FF` | **removed** |
| `--score-hi` | `#A0CB3B` | `#1D6F42` |
| `--score-mid` | `#FAB71F` | `#B07D00` |
| `--score-lo` | `#EC5298` | `#999` |

Global rules updated:
- `input[type=range]` → `accent-color: var(--accent)`
- `input[type=checkbox]` → `accent-color: var(--accent)`
- `.ios-segment` border/button colors → `var(--accent)`

---

## Part 2: Radar Two-Pane Layout (`src/App.jsx`)

**Current:** List expands to full width when nothing selected; detail panel appears only on click (380px list when open).

**New:** Always two-pane. List is always 300px fixed. Detail is always `flex: 1` and always visible.

### Auto-select
```js
useEffect(() => {
  if (!selectedId && jobs.length > 0) setSelectedId(jobs[0].id)
}, [jobs, selectedId])
```

### "Not Applying" animation
App.jsx tracks `passingId` state:
1. "Not Applying" clicked → set `passingId = job.id`
2. Compact card CSS: `transform: translateX(-110%)`, `opacity: 0`, `transition: 0.35s ease`
3. After 350ms: call `updateStatus(id, { status: 'Not Applying' })`, auto-select next job in list, clear `passingId`

### "Add to Constellation"
Calls `updateStatus(id, { status: 'Saved' })`. Header watches `trackedCount` via `useEffect`; when it increases, the Constellation badge gets a CSS class that triggers `transform: scale(1.4)` then removes it after 300ms to return to `scale(1)`.

### Empty state (when `jobs.length === 0` after filters)
```
hey {firstName || 'you'}, you're a superstar and someday you won't need this
```

---

## Part 3: JobCard compact mode (`src/components/JobCard.jsx`)

Add `compact` boolean prop for Radar list rows.

**When `compact={true}`:**
- Score: plain number, 13px/500, color = score tier (`--score-hi` / `--score-mid` / `--score-lo`), min-width 28px
- Title: 13px/500, `#1a1a1a`
- Company · location · remote · date: 11px, `#999`
- Active: `border-left: 2px solid var(--accent)`, `background: #f9f9f9`
- Inactive: `border-left: 2px solid transparent`
- Border transition: `transition: border-left-color 0.25s ease, background 0.15s ease`
- Hover: `background: rgba(0,0,0,0.02)`
- Removed: status dropdown, tooltip, delete button, disclosure chevron, iOS blue gradient, score circle
- "Passing" state (when `job.id === passingId`): `transform: translateX(-110%)`, `opacity: 0`, `transition: transform 0.35s ease, opacity 0.35s ease`

**When `compact={false}` (default):** existing behavior (used in Constellation/Tracker).

---

## Part 4: JobDetail — full replacement (`src/components/JobDetail.jsx`)

Unified clean editorial design. Replaces the current iPod-style view everywhere (Radar and Constellation).

**Removed entirely:** iOS chrome nav bar, company art tile, transport controls (⏮⏭), pipeline scrubber, status buttons, notes textarea, salary field, follow-up date.

### Layout
```
padding: 28px 36px
overflow-y: auto
background: #fff
animation: fadeIn 0.2s ease (on job.id change)
```

```
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px) }
  to   { opacity: 1; transform: translateY(0) }
}
```

### Content structure
1. **"Role detail"** — 10px uppercase, #999, margin-bottom 10px
2. **Title** — 24px/500, `#1a1a1a`, line-height 1.2
3. **Company · meta** — 13px, #999 (company · location · remote · posted date)
4. **Source badge** — `via {source}`, 10px uppercase, thin border (`0.5px solid rgba(0,0,0,0.12)`), border-radius 2px, padding 3px 8px
5. **Big score** — 44px/500, tabular-nums, count-up animation (see below), color = score tier
6. **"Fit score"** label — 10px uppercase, #999
7. **Verdict** — 15px, font-weight 400, line-height 1.8, color #666, **no italic**
8. **Divider** — 0.5px, rgba(0,0,0,0.08)
9. **"Score breakdown"** label — 10px uppercase, #999
10. **Dimension rows** — staggered bar animation (see below)
11. **Action buttons** — "Add to Constellation" + "View posting" + "Not Applying"

### Count-up animation
Fires in `useEffect` on `job.id` change, 700ms, ease-in-out quadratic:
```js
function animateCount(el, target, duration) {
  const start = performance.now()
  function step(now) {
    const p = Math.min((now - start) / duration, 1)
    const e = p < 0.5 ? 2*p*p : -1+(4-2*p)*p
    el.textContent = (target * e).toFixed(1)
    if (p < 1) requestAnimationFrame(step)
    else el.textContent = target.toFixed(1)
  }
  requestAnimationFrame(step)
}
```
Implemented via a `useRef` on the score element + `useEffect([job.id])`.

### Staggered bar animation
Each dimension bar starts at `width: 0`. After mount / job change, `useEffect` fires:
```js
dims.forEach((d, i) => {
  setTimeout(() => {
    barRefs.current[i].style.width = (d.val / 10 * 100) + '%'
  }, i * 80)
})
```
Bar CSS: `transition: width 0.8s cubic-bezier(0.4,0,0.2,1)`, height 3px, border-radius 2px, background = score tier color.

### Dimension row structure
```
[dim name 12px/500 #1a1a1a]  [bar max-width 80px]  [score 12px/500 color-coded]
[reasoning text 11px #999 line-height 1.5]
```

### Action buttons (Radar context)
```
[Add to Constellation — dark fill #1a1a1a bg, #fff text]
[View posting — outlined]
[Not Applying — outlined]
```
In Constellation context (when `onNotApplying` / `onAddToConstellation` props are absent): only "View posting" shown.

---

## Part 5: Header (`src/components/Header.jsx`)

| Element | Change |
|---------|--------|
| ✦ logo symbol | `color: var(--accent)` |
| Active tab underline | `background: var(--accent)` |
| Unseen / tracked count badges | `background: var(--accent)` |
| Admin badge | `color: var(--accent)`, `background: rgba(220,0,255,0.12)` |

---

## Part 6: Profile Spider Chart (`src/components/Profile.jsx`)

Spider chart polygon (currently rgba(48,197,255,0.18) fill, var(--blue) stroke):

| Element | New value |
|---------|-----------|
| Polygon fill | `rgba(220,0,255,0.12)` |
| Polygon stroke | `#dc00ff` |
| Vertex dots | `#dc00ff` |
| Label font size | `12px` (from 9px) |

Grid lines and axis lines unchanged (rgba(0,0,0,0.07)).

---

## Part 7: Settings (`src/components/Settings.jsx`)

- Rename button: **"Recalibrate my score"** (was "Refresh Dimensions")
- Slider accent already handled by global CSS change (`input[type=range]`)

---

## Part 8: FilterBar (`src/components/FilterBar.jsx`)

- Score min filter label → **"Min fit score"**

---

## Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Replace `--blue` with `--accent: #dc00ff`; update score colors; update input accent |
| `src/App.jsx` | Always-on two-pane Radar (300px + flex:1); auto-select; passingId animation; empty state |
| `src/components/JobCard.jsx` | Add `compact` prop for minimal Radar rows |
| `src/components/JobDetail.jsx` | Full editorial redesign; remove iOS chrome, art tile, transport, notes, salary, follow-up |
| `src/components/Header.jsx` | ✦ + tabs + badges → `var(--accent)` |
| `src/components/Profile.jsx` | Spider polygon → `#dc00ff`; labels → 12px |
| `src/components/Settings.jsx` | Rename "Recalibrate my score" |
| `src/components/FilterBar.jsx` | Score min label update |

---

## Animations Summary

| Animation | Trigger | Duration | Easing |
|-----------|---------|----------|--------|
| Detail pane fade-in | Job selection | 0.2s | ease |
| Score count-up | Job selection | 700ms | ease-in-out quadratic |
| Dimension bar fill | Job selection | 0.8s + 80ms stagger | cubic-bezier(0.4,0,0.2,1) |
| Not Applying slide-out | Button click | 350ms | ease |
| Constellation badge bounce | Add to Constellation | 300ms | scale 1→1.4→1 |
| Active job border slide-in | Job list click | 0.25s | ease |

---

## Edge Cases

- **No score**: count-up stays at "—", no bar animation
- **No verdict**: verdict section omitted
- **No dimensions**: score breakdown section omitted
- **No jobs in list**: empty state shows with firstName or "you"
- **Last job "Not Applying"**: after slide-out, detail pane shows empty state
- **Jobs load after mount**: auto-select fires when `jobs.length` transitions from 0 to >0
