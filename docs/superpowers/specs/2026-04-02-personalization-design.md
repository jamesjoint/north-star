# Personalization Features Design

## Goal

Add four personalization features to the job search app: scoring weight tuning UI, score transparency ("why this score?"), application activity dashboard, and daily macOS digest notification.

## Architecture

All features are additive — no existing data model changes required. Score weights move from hardcoded `profile.json` to a UI-editable config with a new API endpoint. Score summaries are already stored in the DB and just need surfacing. The dashboard computes entirely client-side. The notification hooks into the existing scheduler.

## Tech Stack

React 18, Express, better-sqlite3, node-notifier (new), existing Claude scorer

---

## Feature 1: Score Weight Tuning (Settings Tab)

### UI

A new "Settings" tab added to the main nav bar (alongside Job Search, Tracker). Contains 7 sliders, one per scoring dimension:

| Dimension key | Label | Weight |
|---|---|---|
| `core_mechanism` | Connector Fit | 3.5 |
| `gap_bridgeability` | Gap Bridgeability | 3.0 |
| `regulated_complexity` | Structural Integrity | 2.0 |
| `bd_track_record` | Visibility | 2.5 |
| `mba_preference` | Pioneering | 2.0 |
| `domain_gap` | Domain Fit | 2.0 |
| `product_depth` | Daily Texture | 2.5 |

Each slider: range 0–5, step 0.5, labeled with dimension name and current value.

### Live Preview

As the user drags a slider, job scores recalculate client-side using the weighted average formula:

```
score = sum(raw_dimension_score_i * weight_i) / sum(weight_i)
```

Raw dimension scores come from the `score_dimensions` field already loaded in state. Updated scores render immediately on job cards in the background (Job Search tab stays live via shared state).

### Save & Re-score

A "Save weights" button PATCHes to `PATCH /api/profile/weights` with the new weight map. The server:
1. Reads `profile.json`
2. Updates the `weights` object
3. Writes `profile.json`
4. Kicks off background re-score of all jobs (reuses `scoreOneJob` loop)

A status indicator in the Settings tab shows "Re-scoring…" → "Done (N jobs updated)" as it completes.

### Domain Fit Definition

`domain_gap` (Domain Fit) is defined as: **how well the role's industry aligns with Ashley's target sectors**. Target industries:
- Fintech
- Healthcare
- Creator economy
- Media
- Music
- Sports
- Entertainment
- The arts: museums, galleries, public art funds, private art funds, artist-adjacent organizations
- Art sales: auction houses, art marketplaces, art advisory, art finance, and art sale adjacent industries

This replaces the previous definition of "closeness to background." Both experience-based and passion-based industries are equally valid targets.

### profile.json Updates (applied at implementation time)

Update `server/profile.json` weights to reflect the finalized values above, and update the `domain_gap` dimension description in `server/scorer.js` to reflect the new industry list and "targeting" framing.

---

## Feature 2: Score Transparency ("Why this score?")

The scorer already generates a `summary` text field and stores it in `score_dimensions` in the DB. This feature surfaces it.

### JobDetail Panel

Add a "Score breakdown" section near the top of the detail panel (below title/company, above the description):
- Summary paragraph displayed first as plain text
- Below it: 7 dimension rows, each showing label, colored score bar (0–10), and numeric score
- Color coding: green ≥7, yellow ≥4, red <4 (matches existing `scoreColor` logic)

### JobCard

Add a small info icon (`ⓘ`) next to the score number. On hover, show a tooltip containing just the summary sentence. No full breakdown on the card — keeps it compact.

If `score_dimensions.summary` is null/empty, the icon is hidden.

---

## Feature 3: Application Activity Dashboard

A collapsible stats panel at the top of the Tracker tab. Collapsed by default, toggled with a "Show stats / Hide stats" button. All data computed client-side from `allJobs` — no new API endpoints.

### Metrics

**Pipeline breakdown** — count per status, shown as labeled number badges:
- Saved, Applied, Outreach Sent, Interviewing, Offer, Passed, Not Applying

**Volume**
- Applied this week (applied_date within last 7 days)
- Applied this month (applied_date within last 30 days)

**Conversion**
- Applied → Interviewing rate: `(count Interviewing / count Applied) * 100`%
- Applied → Offer rate: `(count Offer / count Applied) * 100`%

### Layout

Single row of stat cards, each a small box with a large number and a label beneath it. No charting library — pure CSS/inline styles consistent with the rest of the app.

---

## Feature 4: macOS Daily Digest Notification

After the scheduled pipeline completes (default 8am via cron), if any new jobs were scraped, send a macOS system notification.

### Implementation

Install `node-notifier`. In `scheduler.js`, after `runAllScrapers` returns `newIds`:

```js
if (newIds.length > 0) {
  const topJob = // get highest-scored new job from DB
  notifier.notify({
    title: `Job Search — ${newIds.length} new job${newIds.length > 1 ? 's' : ''} today`,
    message: `Top pick: ${topJob.title} at ${topJob.company} (${topJob.score_aggregate?.toFixed(1) ?? 'unscored'})`,
  })
}
```

Notification fires after scoring completes so the top job has a real score. If no new jobs, no notification. Clicking the notification dismisses it (no deep linking).

---

## Files to Create/Modify

| File | Change |
|---|---|
| `src/components/Settings.jsx` | New — weight tuning UI |
| `src/App.jsx` | Add Settings tab, pass live weights to score calculation |
| `src/hooks/useJobs.js` | Expose live weight override for client-side score preview |
| `src/components/JobCard.jsx` | Add score info icon + tooltip |
| `src/components/JobDetail.jsx` | Add score breakdown section |
| `src/components/Tracker.jsx` | Add collapsible dashboard panel |
| `server/index.js` | Add `PATCH /api/profile/weights` endpoint |
| `server/profile.json` | Update weights + domain_gap industry list |
| `server/scorer.js` | Update domain_gap dimension description |
| `server/scheduler.js` | Add node-notifier notification after pipeline |
