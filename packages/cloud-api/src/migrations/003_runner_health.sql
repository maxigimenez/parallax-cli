-- Runner health, so the dashboard can say more than "a runner exists".
--
-- Before this, `last_seen_at` was written only by POST /v1/runner/hello, which
-- a runner calls once at startup. A runner that had been up and working for
-- three days therefore reported "last seen 3 days ago", and the `stale` flag —
-- last_seen_at older than 90 seconds — was true for every runner that had been
-- running for more than 90 seconds. The indicator was wrong in exactly the case
-- it exists to cover.
--
-- All columns are nullable: a runner on an older build sends none of them, and
-- must keep registering rather than failing an insert.

ALTER TABLE runners ADD COLUMN IF NOT EXISTS started_at    TIMESTAMPTZ;
ALTER TABLE runners ADD COLUMN IF NOT EXISTS hermes_ok     BOOLEAN;
ALTER TABLE runners ADD COLUMN IF NOT EXISTS hermes_detail TEXT;
ALTER TABLE runners ADD COLUMN IF NOT EXISTS active_runs   INTEGER;
ALTER TABLE runners ADD COLUMN IF NOT EXISTS last_error    TEXT;

-- The dashboard's runner list orders by name but filters on liveness.
CREATE INDEX IF NOT EXISTS runners_org_last_seen_idx ON runners (org_id, last_seen_at DESC);
