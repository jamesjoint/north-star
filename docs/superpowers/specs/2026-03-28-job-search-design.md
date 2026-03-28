# Job Search App — Design Spec
**Date:** 2026-03-28

## Overview

A personal job discovery app for NYC-based product/partnerships roles. Aggregates listings from LinkedIn and 8 web-based job boards, scores each role against a 7-dimension fit framework using Claude AI, and presents results in a filterable React UI. Built for a single user.

---

## Architecture

Two processes, one machine:

### Backend (`/server`) — Node.js + Express
- **Scraper module:** per-source scrapers implementing a common interface
- **LinkedIn module:** Composio SDK for LinkedIn Jobs Search API
- **Scorer module:** calls Claude API with job description + user profile, returns 7-dimension scores + aggregate
- **Scheduler:** `node-cron` triggers full scrape+score pipeline daily at 8am local time (configurable via `SCRAPE_CRON` env var)
- **Storage:** SQLite via `better-sqlite3` (single file on disk, zero-config)
- **REST API:** `GET /jobs`, `GET /jobs/:id`, `POST /refresh`

### Frontend (`/client`) — Vite React
- Fetches from backend API on load
- Job cards with fit score badges, filtering, and expandable detail view
- Manual refresh button

### Data Flow
```
Cron fires → scrapers collect raw listings → scorer enriches with fit scores → stored in SQLite → frontend reads on load or manual refresh
```

---

## Data Model

SQLite table: `jobs`

| Field | Type | Notes |
|---|---|---|
| `id` | TEXT PK | hash of source + URL |
| `title` | TEXT | |
| `company` | TEXT | |
| `location` | TEXT | |
| `remote` | TEXT | `remote`, `onsite`, `hybrid`, `unknown` |
| `url` | TEXT | original listing URL |
| `source` | TEXT | e.g. `weworkremotely`, `linkedin` |
| `posted_at` | TEXT | ISO date, if available |
| `description` | TEXT | full job description text |
| `score_aggregate` | REAL | 0–10 |
| `score_dimensions` | TEXT | JSON blob of 7 dimension scores + reasoning |
| `fetched_at` | TEXT | ISO datetime of last scrape |
| `seen` | INTEGER | 0/1 |

`score_dimensions` JSON structure:
```json
{
  "core_mechanism": { "score": 8, "reasoning": "..." },
  "product_depth": { "score": 7, "reasoning": "..." },
  "regulated_complexity": { "score": 9, "reasoning": "..." },
  "bd_track_record": { "score": 6, "reasoning": "..." },
  "mba_preference": { "score": 5, "reasoning": "..." },
  "domain_gap": { "score": 4, "reasoning": "..." },
  "gap_bridgeability": { "score": 7, "reasoning": "..." }
}
```

---

## Scraping Strategy

| Source | Method | Notes |
|---|---|---|
| weworkremotely.com | Cheerio | Static HTML |
| nyfa.org/jobs | Cheerio | Static HTML |
| ixda.org/jobs | Cheerio | Static HTML |
| backstage.com/casting | Playwright | JS-rendered |
| web3.career | Playwright | JS-rendered |
| staffmeup.com/jobs | Playwright | JS-rendered, requires `?tab=jobs` |
| creatoreconomyjobs.co | Playwright | JS-rendered |
| themuse.com (product_management) | The Muse public API | Free API, more reliable than scraping |
| LinkedIn | Composio SDK | Uses existing LinkedIn connection |

Each scraper is a module at `server/scrapers/<source>.js` implementing:
```js
async function scrape() {
  // returns [{ title, company, location, remote, url, description, posted_at, source }]
}
```

**Deduplication:** jobs keyed by `hash(source + url)`. Re-scraping updates `fetched_at` without duplicating or re-scoring.

**Rate limiting:** 2–3 second delay between Playwright page loads.

---

## Fit Scoring

Claude API called per job with:
- **System prompt:** user background from `server/profile.json` + 7-dimension definitions + output format instructions
- **User prompt:** raw job description text

**`server/profile.json`** — edited once by the user to describe their background and optionally tune dimension weights. Schema:
```json
{
  "background": "Free-text description of your experience, skills, and preferences used in the scoring prompt.",
  "weights": {
    "core_mechanism": 1,
    "product_depth": 1,
    "regulated_complexity": 1,
    "bd_track_record": 1,
    "mba_preference": 1,
    "domain_gap": 1,
    "gap_bridgeability": 1
  }
}
```
All weights default to 1 (equal). Increase a weight to make that dimension count more toward the aggregate.

Claude returns:
```json
{
  "dimensions": {
    "core_mechanism": { "score": 8, "reasoning": "Role explicitly requires cross-functional influence..." },
    "product_depth": { "score": 7, "reasoning": "..." },
    "regulated_complexity": { "score": 9, "reasoning": "..." },
    "bd_track_record": { "score": 6, "reasoning": "..." },
    "mba_preference": { "score": 5, "reasoning": "..." },
    "domain_gap": { "score": 4, "reasoning": "..." },
    "gap_bridgeability": { "score": 7, "reasoning": "..." }
  },
  "aggregate": 6.6,
  "summary": "One-paragraph fit summary with key reasons."
}
```

**Aggregate** = weighted average of 7 dimensions. Default: equal weights. Configurable in `profile.json`.

---

## Frontend UI

### Header
- App title, last-refreshed timestamp, manual refresh button, loading spinner during scrape

### Job List (main area)
- Sorted by aggregate fit score descending
- Each card: job title, company, location, remote/onsite badge, source tag, aggregate score badge (green 7–10, yellow 4–6, red 1–3), "New" indicator for unseen jobs
- Click card to expand detail

### Expanded Detail (inline)
- Full job info + link to original listing
- AI summary paragraph
- 7 dimension scores with label, score bar, and 1-line reasoning each

### Filters (top of list)
- Source: multi-select checkboxes
- Remote type: remote / onsite / hybrid / all
- Minimum fit score: slider (0–10)

No search, no pagination. Full dataset loaded at once (expected volume: low hundreds of listings).

---

## File Structure

```
job-search-app/
├── client/          # Vite React frontend (already scaffolded)
│   └── src/
├── server/
│   ├── index.js         # Express app + routes
│   ├── scheduler.js     # node-cron daily trigger
│   ├── db.js            # SQLite setup + queries
│   ├── scorer.js        # Claude API scoring
│   ├── profile.json     # User background + dimension weights (edit this)
│   └── scrapers/
│       ├── index.js         # runs all scrapers, deduplicates
│       ├── linkedin.js
│       ├── weworkremotely.js
│       ├── nyfa.js
│       ├── ixda.js
│       ├── backstage.js
│       ├── web3career.js
│       ├── staffmeup.js
│       ├── creatoreconomyjobs.js
│       └── themuse.js
├── package.json     # root-level for running both client + server
└── docs/
    └── superpowers/specs/
        └── 2026-03-28-job-search-design.md
```

---

## Out of Scope
- User authentication (single user, local only)
- Job application tracking (nice-to-have for later)
- Search within results
- Mobile layout
- Cloud hosting
