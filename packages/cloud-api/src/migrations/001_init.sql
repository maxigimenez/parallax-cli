-- Sentinel0 cloud control plane, initial schema.

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keys are stored only as SHA-256 hashes; `prefix` is the displayable stub so a
-- human can tell two keys apart without the secret being recoverable.
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL CHECK (scope IN ('runner', 'user')),
  key_hash    TEXT NOT NULL UNIQUE,
  prefix      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);

CREATE TABLE IF NOT EXISTS runners (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  hostname     TEXT,
  version      TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

-- Derived from Hermes discovery; replaced wholesale on each inventory push.
CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  runner_id    TEXT NOT NULL REFERENCES runners(id) ON DELETE CASCADE,
  profile      TEXT NOT NULL,
  display_name TEXT,
  role         TEXT,
  model        TEXT,
  provider     TEXT,
  toolsets     JSONB NOT NULL DEFAULT '[]'::jsonb,
  skills       JSONB NOT NULL DEFAULT '[]'::jsonb,
  github_login TEXT,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (runner_id, profile)
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK (provider IN ('linear', 'github')),
  filters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, id)
);

CREATE TABLE IF NOT EXISTS routes (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  definition  JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_routes_org ON routes(org_id, priority DESC);

CREATE TABLE IF NOT EXISTS runs (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  runner_id       TEXT REFERENCES runners(id) ON DELETE SET NULL,
  route_id        TEXT,
  route_name      TEXT,
  agent_profile   TEXT NOT NULL,
  project_id      TEXT,
  trigger_type    TEXT NOT NULL,
  trigger_ref     TEXT NOT NULL,
  trigger_url     TEXT,
  title           TEXT NOT NULL,
  status          TEXT NOT NULL,
  hermes_run_id   TEXT,
  summary         TEXT,
  error           TEXT,
  usage           JSONB,
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_org_updated ON runs(org_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS run_events (
  id         BIGSERIAL PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  title      TEXT,
  message    TEXT NOT NULL,
  icon       TEXT,
  level      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  source     TEXT NOT NULL,
  group_id   TEXT,
  ts         BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, ts, id);

-- Work queued by a human for a runner to pick up on its next long poll.
CREATE TABLE IF NOT EXISTS runner_commands (
  cursor      BIGSERIAL PRIMARY KEY,
  id          TEXT NOT NULL UNIQUE,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  runner_id   TEXT REFERENCES runners(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('run', 'cancel', 'resync')),
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_runner_commands_pending ON runner_commands(org_id, cursor);

CREATE TABLE IF NOT EXISTS slack_integrations (
  org_id      TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  webhook_url TEXT NOT NULL,
  events      TEXT[] NOT NULL DEFAULT ARRAY['run.started','run.completed','run.failed','run.needs_approval','run.canceled','runner.stale'],
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (run, event) uniqueness is what makes a delivery retry safe to run.
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id           BIGSERIAL PRIMARY KEY,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  run_id       TEXT,
  event        TEXT NOT NULL,
  status       TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, event)
);
