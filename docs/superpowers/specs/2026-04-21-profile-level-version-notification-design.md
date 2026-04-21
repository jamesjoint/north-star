# Profile Structured Fields, Level Targeting & Version Notification

**Date:** 2026-04-21
**Status:** Approved

## Problem

1. New users who skip or minimally complete onboarding get scored against Ashley's hardcoded DEFAULT_DIMENSIONS — surfacing director-level, NYC-biased, creator-economy roles regardless of who the user is.
2. Seniority level is never explicitly collected, so the scorer has no hard signal to penalise mismatched roles.
3. Target roles and sectors are collected in onboarding but buried in the freetext `background` blob — the scorer has to infer them from prose.
4. Personality data (MBTI, DiSC, etc.) is a footnote in the scoring prompt, not a shaping input for dimension generation.
5. Users have no way to edit their onboarding answers after the first time.
6. There is no mechanism to notify users when a new version of North Star has deployed.

## Approach

Option C: structured profile fields + re-walkable wizard + version polling. Fixes the immediate scoring bugs, structures data for the scorer, and leaves the door open for multi-profile support without a full schema rethink.

---

## Data Model

### `profiles` table — new columns (all idempotent `ALTER TABLE` migrations)

| Column | Type | Notes |
|---|---|---|
| `target_level` | `text[]` | Array of selected level strings. NULL for existing users — scorer falls back gracefully. |
| `target_roles` | `text` | Promoted out of background blob. |
| `target_sectors` | `text` | Promoted out of background blob. |
| `profile_version` | `integer` | Default 1. Increments on each full "Redo setup" completion. Foundation for future multi-profile. |

`background` column retains the freetext narrative (background, energizes, next_role, dealbreakers). `personality` stays as JSONB — no change to schema.

### `app_version` table — new table

```sql
CREATE TABLE IF NOT EXISTS app_version (
  id         integer PRIMARY KEY DEFAULT 1,
  sha        text NOT NULL,
  whats_new  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Single row, always `id = 1`. `sha` is seeded at server boot from `process.env.RAILWAY_GIT_COMMIT_SHA`. `whats_new` is NULL until a future subagent writes to it.

---

## Onboarding Flow

### Step order

`name → background → level → generating → personality → review → board`

### New `LevelStep` (required)

Inserts between `background` and `generating`. Multi-select checklist — at least one selection required to continue.

Options (in ascending order):
- IC / Individual Contributor
- Senior IC
- Manager
- Senior Manager / Director
- VP / Head of
- C-Suite / Executive

Helper text below checklist: *"Select all that apply — this shapes which roles get surfaced on your Radar."*

### `BackgroundStep` changes

`target_roles` and `target_sectors` are saved via their own API fields (`PATCH /api/profile/target-roles`, `PATCH /api/profile/target-sectors`) rather than concatenated into the background blob. The four freetext narrative fields (background, energizes, next_role, dealbreakers) continue to populate the `background` column.

### `GeneratingStep` changes

Passes `target_level`, `target_roles`, and `target_sectors` as explicit context to `dimension-generator.js` so dimensions are seeded with real signals from the start.

---

## Scorer Changes

### 1. Generic DEFAULT_DIMENSIONS

Replace Ashley's hardcoded criteria with 5 neutral dimensions. Used only when a user has no custom dimensions.

| Key | Label | Description |
|---|---|---|
| `role_alignment` | Role Alignment | How well the role's title and scope match the candidate's target roles. |
| `level_fit` | Level Fit | Whether the seniority level matches the candidate's target level range. |
| `sector_fit` | Sector Fit | How well the role's industry aligns with the candidate's target sectors. |
| `skills_match` | Skills Match | How well the candidate's background covers the role's stated requirements. |
| `growth_potential` | Growth Potential | Whether the role offers meaningful career growth from the candidate's current position. |

### 2. Explicit context block in scorer prompt

When `target_level`, `target_roles`, or `target_sectors` are present, a dedicated block is prepended above the dimensions list:

```
Candidate targets:
- Level: Senior IC, Manager
- Roles: Head of Partnerships, Chief of Staff
- Sectors: creator economy, media
```

### 3. Personality-aware dimension generation

`dimension-generator.js` receives the full personality block and an instruction to let it shape dimension priorities — e.g. high-D DiSC profile weights autonomy/impact dimensions; INFJ weights mission/meaning dimensions. The generator prompt explicitly names this rather than leaving it implicit.

---

## Profile Editing

### Layout

A new **Edit Profile** section on the existing Profile page. Organised into three collapsible cards:

1. **About you** — the 4 freetext narrative fields
2. **Targets** — target roles, target sectors, target level checklist
3. **Personality** — MBTI, Enneagram, DiSC, CliftonStrengths, sun sign, moon sign, rising sign (birth time field kept)

Each card has an inline **Edit** button. Edits are saved per-section.

### Rescore confirmation modal

Saving **About you** or **Targets** triggers a modal before any rescore:

> *"Updating your profile will re-score all jobs on your Radar. This may take a few minutes."*
>
> **[Re-score now]** · **[Save without re-scoring]**

Personality saves silently (fire-and-forget) — it only affects future dimension generation, not the current aggregate formula.

### "Redo setup" button

At the bottom of the Edit Profile section. Re-runs the full onboarding wizard in a modal overlay. On completion, triggers the rescore confirmation modal and increments `profile_version`.

### UX guidance

- Tooltip on the level checklist: *"Used to filter and score roles by seniority. You can change this any time in your profile."*
- Warning banner at top of Radar if `target_level` is NULL: *"✦ Add your target level to get better-matched roles →"* (links to Edit Profile). Dismissible; dismiss timestamp stored in `localStorage` — re-appears after 7 days.
- Inline note above the "Redo setup" button: *"This will regenerate your scoring dimensions and re-score all jobs."*

---

## Version Notification

### Backend

- `/api/version` (GET) — returns `{ sha, whats_new }`. SHA read from `process.env.RAILWAY_GIT_COMMIT_SHA` at server boot and upserted into `app_version`.
- `/api/version/whats-new` (PATCH) — accepts `{ whats_new: string }`. Updates the single `app_version` row. No auth required from internal subagents (protected by a shared secret header `X-Internal-Key`).

### Frontend

On app load, the client stores the current SHA from the initial `/api/version` call. A polling interval (every 5 minutes) re-checks. When SHA differs from the loaded value, a toast appears from the bottom:

- Default copy: *"✦ New signal on your Radar — reload to tune in"*
- With `whats_new`: *"✦ [whats_new] — reload to tune in"*

"Reload to tune in" calls `window.location.reload()`. An `×` dismisses the toast; it does not reappear until the next new deploy (tracked by SHA in `localStorage`).

---

## Action Button Move

The three action buttons — **Add to Constellation**, **View Posting**, **Not Applying** — move from the bottom of `JobDetail` to just below the title/meta row, before the verdict paragraph. No behaviour change.

---

## Out of Scope

- Multi-profile switching (profile_version lays the groundwork; switching UI is a future feature)
- Subagent that writes `whats_new` copy (the endpoint is built; the agent is future work)
- Resume upload / parsing
