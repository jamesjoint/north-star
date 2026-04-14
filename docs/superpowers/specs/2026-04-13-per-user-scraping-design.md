# Per-User Scraping + New Job Sources Design

**Date:** 2026-04-13

## Overview

Upgrade the scraper pipeline so query-based job boards (jsearch, LinkedIn, Indeed) run per-user with LLM-generated search queries derived from each user's onboarding profile. Browse-based scrapers (fixed category pages) continue running once globally. Add three new scrapers: Indeed (user, RapidAPI), togethxr (global, Playwright), teamworkonline (global, Playwright).

---

## 1. Scraper Interface

Two scraper types, distinguished by a `type` export on each module.

**Global scrapers** — browse fixed URLs, run once per pipeline, shared job pool:
```js
export const type = 'global'
export async function scrape() { ... }
```

**User scrapers** — query-based, run per-user with profile-derived queries:
```js
export const type = 'user'
export async function scrape({ terms, location }) { ... }
```

`queries` shape:
```json
{
  "terms": ["Head of Partnerships", "Chief of Staff", "Creator Solutions Manager"],
  "location": "New York, NY"
}
```

Each user scraper is responsible for formatting its own API calls from `terms` and `location`. Global scrapers get no logic changes — only a new `type` export.

---

## 2. Query Generation

### `server/query-generator.js`

New file mirroring `dimension-generator.js`. Takes the user's `background` text, makes one Claude API call, returns `{ terms: string[], location: string }`.

The prompt instructs Claude to extract 6–10 optimized job search strings from the profile (target roles, sector context, seniority signals) and the user's preferred location. Output is validated JSON.

Example output:
```json
{
  "terms": [
    "Head of Partnerships creator economy",
    "Chief of Staff media",
    "Creator Solutions Manager",
    "Business Development Manager newsletter platform",
    "Partnerships Manager GenAI"
  ],
  "location": "New York, NY"
}
```

### DB change

Add `scraper_queries JSONB` column to the `profiles` table.

New DB helpers in `server/db.js`:
- `upsertScraperQueries(pool, userId, queries)` — insert/update `scraper_queries`
- `getScraperQueries(pool, userId)` — fetch queries for a user

`getProfile` already returns the full profiles row, so `scraper_queries` is available automatically once the column exists.

### Trigger

`generateAndSaveScraperQueries(pool, userId, background)` — new function in `scheduler.js`, called in parallel with `generateAndSaveDimensions` after onboarding completes.

Also re-triggered whenever a user updates their background text via the Profile page (the existing profile update route).

---

## 3. Pipeline

### Scraper registries in `scheduler.js`

```js
const GLOBAL_SCRAPERS = [
  weworkremotely, nyfa, ixda, backstage, web3career,
  staffmeup, creatoreconomyjobs, builtin, whoishiringintech,
  togethxr, teamworkonline,  // new
]

const USER_SCRAPERS = [jsearch, linkedin, indeed]  // indeed is new
```

### Updated `runPipeline`

```
1. runGlobalScrapers(pool, GLOBAL_SCRAPERS) → globalIds
2. getActiveUsersWithProfiles() → userIds[]
3. For each user (admin-first):
   a. loadProfile(pool, userId) → profile (includes scraper_queries)
   b. If profile.scraper_queries is null → skip USER_SCRAPERS, log warning
   c. runUserScrapers(pool, USER_SCRAPERS, profile.scraper_queries) → perUserIds
   d. getUnscoredJobs(pool, userId) → backlogIds
   e. toScore = dedupe([...globalIds, ...perUserIds, ...backlogIds])
   f. score toScore for this user
4. Send digest notifications
```

### New functions

- `runGlobalScrapers(pool, scrapers)` — same logic as current `runAllScrapers`, no user context
- `runUserScrapers(pool, scrapers, queries)` — passes `queries` to each scraper's `scrape()` call

Because all jobs land in the shared `jobs` table (deduped by `makeId(source, url)`), jobs scraped via user A's queries are automatically available to user B's scoring pass.

The existing `runAllScrapers` export is retired; callers in tests are updated.

---

## 4. New Scrapers

### `server/scrapers/indeed.js` (user, RapidAPI)

- Env vars: `INDEED_RAPIDAPI_KEY`, `INDEED_RAPIDAPI_HOST`
- `scrape({ terms, location })` — one API call per term with location appended, dedupe by URL
- Output shape matches existing scrapers: `{ title, company, location, remote, url, source: 'indeed', posted_at, description }`

### `server/scrapers/togethxr.js` (global, Playwright)

- URL: `https://jobs.togethxr.com/jobs`
- Powered by Getro — selectors confirmed from live page
- Selectors: `.job-card`, `.job-title a` (title + href), `.company-link` (company), `.job-location` (location)
- Single page load; no pagination

### `server/scrapers/teamworkonline.js` (global, Playwright)

- Browse 3 relevant category URLs: `/agency-jobs`, `/sports-technology-jobs`, `/live-event-jobs`
- Parse job cards per page, merge and dedupe results
- Selectors TBD from live page inspection at implementation time

---

## 5. Updated Scrapers

### `jsearch.js`

- Signature: `scrape()` → `scrape({ terms, location })`
- Replace hardcoded `QUERIES` array with `terms`
- Append `location` to each query string before calling the API
- Add `export const type = 'user'`

### `linkedin.js`

- Signature: `scrape()` → `scrape({ terms, location })`
- Replace hardcoded `keywords` and `location` params with values from `queries`
- Add `export const type = 'user'`

### All existing global scrapers

- Add `export const type = 'global'`
- No logic changes

---

## 6. Environment Variables

New vars to document in `.env.example`:
```
INDEED_RAPIDAPI_KEY=      # RapidAPI key for Indeed endpoint
INDEED_RAPIDAPI_HOST=     # e.g. indeed12.p.rapidapi.com
```

---

## 7. Error Handling

- If `scraper_queries` is null for a user, log a warning and skip USER_SCRAPERS for that user (global jobs still scored)
- User scraper failures are caught individually — one scraper failing does not block others or the scoring pass
- Query generation failure is non-fatal: log the error, leave `scraper_queries` null (pipeline handles gracefully per above)

---

## 8. Testing

- Unit tests for `query-generator.js`: mock Claude response, assert output shape
- Unit tests for updated `jsearch.js` and `linkedin.js`: assert they use injected queries instead of hardcoded ones
- Unit tests for new scraper `parse()` functions: `togethxr`, `teamworkonline`, `indeed`
- Integration test for `runPipeline`: mock both scraper types, assert global scrapers called once and user scrapers called per-user with correct queries
