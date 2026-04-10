# Multi-User Platform Design

**Date:** 2026-04-08
**Status:** Approved — ready for implementation planning

## Overview

Transform the job search app from a single-user local tool into a cloud-hosted, invite-accessible platform where each user gets a fully personalized AI-scored job feed, multiple tracker boards, and a scoring profile shaped by their background, career goals, and personality frameworks.

The app remains invite-accessible (controlled rollout), not fully public. Users can self-signup and join a waitlist, or bypass it with an invite link.

---

## Architecture

**Approach:** PostgreSQL + better-auth + cloud hosting (Railway or Render)

- **Database:** Migrate from SQLite to PostgreSQL. The existing query patterns are simple enough that migration is largely mechanical — replace `better-sqlite3` with `pg` and adjust syntax.
- **Auth:** `better-auth` for magic link (passwordless) auth and session management. Sessions stored as httpOnly cookies, 30-day expiry.
- **Email:** Resend for transactional email (magic links, waitlist confirmation).
- **Deployment:** Railway or Render — single service with the existing Express backend + React frontend served as static files.

---

## Data Model

### Shared tables (no user context)

```sql
jobs (
  id TEXT PRIMARY KEY,           -- hash of source+url (unchanged)
  title, company, location,
  remote, url, source,
  description, posted_at,
  fetched_at, deleted BOOLEAN
)

invites (
  code TEXT PRIMARY KEY,
  created_by_user_id TEXT,
  used_by_user_id TEXT,
  expires_at TIMESTAMPTZ
)
```

### Per-user tables

```sql
users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'user',      -- 'user' | 'admin'
  status TEXT DEFAULT 'pending', -- 'pending' | 'active' | 'deactivated'
  created_at TIMESTAMPTZ
)

profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  background JSONB,              -- answers to onboarding questions
  dimensions JSONB,              -- array of {name, description, cluster}
  weights JSONB,                 -- {dimension_name: weight}
  personality JSONB,             -- astrology + framework results
  profile_summary TEXT,          -- Claude-generated synthesis paragraph
  updated_at TIMESTAMPTZ
)

job_scores (
  job_id TEXT REFERENCES jobs(id),
  user_id TEXT REFERENCES users(id),
  score_aggregate REAL,
  score_dimensions JSONB,        -- {dimension_name: score}
  coherence_signal REAL,         -- cross-dimension reinforcement score
  scored_at TIMESTAMPTZ,
  PRIMARY KEY (job_id, user_id)
)

boards (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  emoji TEXT,
  color TEXT,
  created_at TIMESTAMPTZ
)

tracker_entries (
  id TEXT PRIMARY KEY,
  board_id TEXT REFERENCES boards(id),
  user_id TEXT REFERENCES users(id),
  job_id TEXT REFERENCES jobs(id),
  status TEXT DEFAULT 'saved',   -- saved | applied | interview | offer | rejected
  notes TEXT,
  follow_up_date DATE,
  applied_date DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

### Migration notes

- Existing `jobs` rows → seed the shared `jobs` table (drop `status`, `notes`, `follow_up_date`, `applied_date`, `seen`, `score_aggregate`, `score_dimensions` columns)
- Ashley's existing scores → first row in `job_scores` for her user_id
- Ashley's tracker entries → one default board + all `tracker_entries` rows for that board
- `profile.json` → her `profiles` row

---

## Auth & Invite Flow

### Self-signup (waitlist path)

1. User visits the app → landing page with brief description + "Get early access" CTA
2. User enters email → account created with `status: 'pending'`
3. Confirmation email sent: "You're on the list — we'll be in touch"
4. Admin approves from the admin panel → status flips to `active` → magic link sent to finish onboarding

### Invite link path (bypass waitlist)

1. Admin generates a unique invite URL (expires in 7 days) from the admin panel
2. User visits link → enters email → account created with `status: 'active'` immediately
3. Magic link sent → straight to onboarding

### Returning login

1. User visits app → email field only
2. Enters email → magic link sent (expires 15 min) via Resend
3. Clicks link → session cookie set (30-day httpOnly) → lands on dashboard

Only registered + active emails can log in. Unrecognized emails see a generic "if you have an account, check your inbox" message (no enumeration).

---

## User Onboarding Wizard

Triggered on first login after account activation. Six steps:

### Step 1 — Welcome
Brief screen: what the app does, what they're about to set up.

### Step 2 — Background questions
Four guided prompts (not a freeform text box):
- "What's your professional background in 2–3 sentences?"
- "What kind of work energizes you most?"
- "What do you want in your next role that you don't have now?"
- "Any deal-breakers?" *(optional)*

### Step 3 — Claude generates dimensions
Loading screen while Claude reads their answers and produces:
- 5–8 custom scoring dimensions with names and descriptions
- Dimension cluster assignments (see Scoring Architecture)
- Suggested default weights
- A profile summary paragraph used in all future scoring prompts

Same structure as the existing `profile.json`, generated fresh per user.

### Step 4 — Personality layer *(optional, skippable)*

Two side-by-side sections. User can fill in one, both, or neither.

**Astrology:**
- Option A: Enter sun sign, moon sign, rising sign directly (dropdowns)
- Option B: Enter date of birth, city of birth, time of birth (calculated server-side)
  - Time of birth is optional. Disclaimer shown: *"Your rising sign changes every ~2 hours throughout the day, so birth time significantly affects this calculation. Without it, we'll calculate your sun and moon signs only."*

**Personality frameworks (enter existing results — no quizzes):**
- Myers-Briggs (MBTI) — 4-letter type
- DiSC — primary style
- Enneagram — type + wing (e.g. "3w2")
- Big Five (OCEAN) — trait levels if known
- CliftonStrengths — top 5 themes

All personality data is stored in `profiles.personality` and folded into Claude's dimension generation and scoring prompts to sharpen fit assessment.

### Step 5 — Review & tune dimensions
User sees their Claude-generated dimensions with:
- Inline editing (rename or rewrite any dimension)
- Add / remove dimensions
- Weight sliders (same UI as current Settings tab)
- "Regenerate" button to ask Claude to try again

Weight sliders are editable later from the Settings tab. Dimension names, descriptions, and personality data are editable from avatar menu → Profile.

### Step 6 — Name first board
Simple prompt: "What do you want to call your first tracker board?"
(e.g. "Tech roles", "My job search", "Fall 2026")

### After onboarding
Background job kicks off scoring all current jobs in the shared pool against the new profile. On first Jobs tab visit: "Scoring X jobs for you…" progress indicator. Results populate as they complete.

---

## Scoring Architecture

### Shared job pool
Scrapers run on cron (unchanged) and write to the shared `jobs` table. No user context involved at scrape time. New jobs trigger a background scoring job for all users who have a completed profile.

### Per-user scoring
Each `job_scores` row is computed by calling Claude with:
- The job description
- The user's profile summary + dimensions + weights
- Their personality data (if provided)

Scoring produces a score (1–10) per dimension + an aggregate weighted average.

### Coherence signal
After per-dimension scores are computed, Claude evaluates whether high-scoring dimensions reinforce each other or contradict each other. A job where autonomy, ambiguity tolerance, and early-stage fit all score high reinforces itself (coherence bonus). A job where high autonomy and high work/life balance coexist at an early-stage startup contradicts itself (coherence penalty). The coherence signal is a small additive/subtractive modifier on the aggregate score.

### Dimension clusters
Dimensions are organized into six clusters that together form a complete fit picture:

| Cluster | Description | Example dims |
|---|---|---|
| Core Identity | Skills, domain, track record | core_mechanism, product_depth, domain_gap |
| Growth Arc | Career trajectory, optionality | career_optionality, narrative_coherence, timing_fit |
| Mission & Energy | Belief, vibe, stage fit | mission_resonance, energy_match, stage_fit |
| Scope & Power | Autonomy, influence, exposure | scope_of_impact, autonomy_level, exec_visibility |
| Lifestyle & Values | Day-to-day life, comp | flexibility, work_life_integration, comp_alignment |
| Network & Community | Relationship leverage | network_leverage, community_building |

Users' Claude-generated dimensions are tagged to a cluster. The radar chart on the Profile page renders one axis per cluster.

---

## Multiple Tracker Boards

### Board model
Each user can have unlimited named boards. A job can exist on multiple boards simultaneously. Boards have an optional emoji and color.

### Board operations
- Create board (name, emoji, color)
- Rename / delete board
- Move or copy a tracker entry between boards

### UI — sidebar/drawer
Inside the Tracker section, a slide-in sidebar (triggered by a boards icon in the header) shows all boards with per-board stats (applied count, interview count, saved count). Active board name shows in the Tracker header. Board management (rename, delete, reorder) lives in this sidebar.

---

## UI Shell

### Navigation
Replace the iOS-style bottom nav with a **top header nav**:

```
[JobMatch ✦]    [Jobs]  [Tracker]  [Settings]    [Avatar]
```

- Logo left, nav tabs center, avatar right
- Active tab has an underline indicator
- Full vertical height available for content — no bottom bar eating space

### Avatar menu
Tapping the avatar (initial-based colored circle) opens a dropdown with:

- **Profile** — dimension summary, radar chart, personality frameworks, background answers, "Regenerate dimensions" button
- **Account** — email address, sign out, delete account
- **Admin** *(visible to admin role only)* — waitlist management, invite link generator, user list, scoring queue status

### Settings tab
Unchanged in function — weight sliders for quick dimension weight adjustment. Deeper profile editing lives behind the avatar to keep Settings focused on daily tuning.

---

## Profile / Dimension Summary Page

Accessible via avatar menu → "Profile". Shows:

- Personality frameworks entered (astrology signs, MBTI type, etc.)
- Radar chart — one axis per dimension cluster, shape reflects their weight distribution
- Dimension weight bars — each dimension listed with its weight and current average score across all scored jobs
- Count of jobs scored against this profile + last scored date
- Edit buttons for background answers, dimensions, personality data
- "Regenerate dimensions with Claude" CTA

---

## Admin Panel

Accessible to users with `role: 'admin'` via the avatar menu.

- **Waitlist** — list of pending users, one-click approve/reject, bulk approve
- **Invites** — generate invite link (set expiry), list active/used/expired invites, revoke
- **Users** — list active users, deactivate, see last login
- **Scoring queue** — current background scoring job status (how many jobs pending per user)

---

## Future Feature: Wrapped Lookback

Not in scope for v1, but designed for it from the start.

Triggered quarterly or when a user marks their search as complete. Generates a narrative summary of their job search period:

- Stats: jobs applied, response rate, interview conversion rate
- Score trend over time (avg score of applied jobs, improving or declining)
- How their dimension weights shifted over the period
- The role archetype they kept gravitating toward (Claude-synthesized)
- "Closest call" — highest-scoring job they didn't get
- Shareable card (private by default), PDF export

Requires storing weight history snapshots in `profiles` and timestamped `tracker_entries` — both already in the data model.

---

## Out of Scope (v1)

- Social features (sharing jobs with other users, following)
- Public profiles
- Native mobile app
- Retaking personality assessments in-app (users enter existing results)
- Favorite sports team as personality proxy (noted for future easter egg)
