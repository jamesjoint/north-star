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
  status         text        NOT NULL DEFAULT 'saved',
  notes          text,
  follow_up_date date,
  applied_date   date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_invites (
  code              text        NOT NULL PRIMARY KEY,
  created_by        text        NOT NULL REFERENCES "user"("id"),
  used_by           text        REFERENCES "user"("id"),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
