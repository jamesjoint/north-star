-- better-auth tables (camelCase columns are better-auth's convention)
CREATE TABLE IF NOT EXISTS "user" (
  "id"            text        NOT NULL PRIMARY KEY,
  "name"          text        NOT NULL DEFAULT '',
  "email"         text        NOT NULL UNIQUE,
  "emailVerified" boolean     NOT NULL DEFAULT false,
  "image"         text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedAt"     timestamptz NOT NULL DEFAULT now(),
  "role"          text        NOT NULL DEFAULT 'user',
  "status"        text        NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS "session" (
  "id"          text        NOT NULL PRIMARY KEY,
  "expiresAt"   timestamptz NOT NULL,
  "token"       text        NOT NULL UNIQUE,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  "ipAddress"   text,
  "userAgent"   text,
  "userId"      text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id"                     text        NOT NULL PRIMARY KEY,
  "accountId"              text        NOT NULL,
  "providerId"             text        NOT NULL,
  "userId"                 text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken"            text,
  "refreshToken"           text,
  "idToken"                text,
  "accessTokenExpiresAt"   timestamptz,
  "refreshTokenExpiresAt"  timestamptz,
  "scope"                  text,
  "password"               text,
  "createdAt"              timestamptz NOT NULL DEFAULT now(),
  "updatedAt"              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id"         text        NOT NULL PRIMARY KEY,
  "identifier" text        NOT NULL,
  "value"      text        NOT NULL,
  "expiresAt"  timestamptz NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now()
);

-- Custom app tables
CREATE TABLE IF NOT EXISTS jobs (
  id          text        NOT NULL PRIMARY KEY,
  title       text        NOT NULL,
  company     text,
  location    text,
  remote      text        NOT NULL DEFAULT 'unknown',
  url         text        NOT NULL,
  source      text        NOT NULL,
  posted_at   text,
  description text,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  deleted     boolean     NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS job_scores (
  job_id            text    NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id           text    NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  score_aggregate   real,
  score_dimensions  jsonb,
  coherence_signal  real,
  scored_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, user_id)
);

CREATE TABLE IF NOT EXISTS boards (
  id         text        NOT NULL PRIMARY KEY,
  user_id    text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  name       text        NOT NULL,
  emoji      text,
  color      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracker_entries (
  id             text        NOT NULL PRIMARY KEY,
  board_id       text        NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  user_id        text        NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  job_id         text        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'Saved',
  notes          text,
  follow_up_date date,
  applied_date   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, user_id)
);
-- Idempotently add the unique constraint in case the table already exists without it
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'tracker_entries'::regclass
    AND conname = 'tracker_entries_job_id_user_id_key'
  ) THEN
    ALTER TABLE tracker_entries ADD CONSTRAINT tracker_entries_job_id_user_id_key UNIQUE (job_id, user_id);
  END IF;
END $$;
-- Idempotently add salary_range column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tracker_entries' AND column_name = 'salary_range'
  ) THEN
    ALTER TABLE tracker_entries ADD COLUMN salary_range text;
  END IF;
END $$;
-- Idempotently add direct_link column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tracker_entries' AND column_name = 'direct_link'
  ) THEN
    ALTER TABLE tracker_entries ADD COLUMN direct_link text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS profiles (
  user_id          text        NOT NULL PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  background       text,
  weights          jsonb       NOT NULL DEFAULT '{}',
  dimensions       jsonb,
  personality      jsonb,
  profile_summary  text,
  onboarding_done  boolean     NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS app_invites (
  code              text        NOT NULL PRIMARY KEY,
  created_by        text        NOT NULL REFERENCES "user"("id"),
  used_by           text        REFERENCES "user"("id"),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_version (
  id         integer PRIMARY KEY DEFAULT 1,
  sha        text    NOT NULL DEFAULT 'unknown',
  whats_new  text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes
-- Partial index so "WHERE deleted = false" scans only live jobs
CREATE INDEX IF NOT EXISTS idx_jobs_live ON jobs(fetched_at DESC) WHERE deleted = false;
-- Per-user score lookups (complementary to the PK index which covers job_id+user_id together)
CREATE INDEX IF NOT EXISTS idx_job_scores_user_id ON job_scores(user_id);
-- Per-user tracker lookups
CREATE INDEX IF NOT EXISTS idx_tracker_user_id ON tracker_entries(user_id);
-- Per-user board lookups
CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
