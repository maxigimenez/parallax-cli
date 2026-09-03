-- A command that starts an agent on an operator's own prompt, with no route
-- and no trigger behind it.
--
-- Its own type rather than a variant payload on 'run': 'run' means "here is a
-- trigger event, put it through the rule engine", and this deliberately skips
-- the rule engine entirely. A runner too old to know the type ignores it and
-- says so, which is the honest outcome -- where a 'run' carrying an unfamiliar
-- payload would be silently dropped as unroutable.
ALTER TABLE runner_commands DROP CONSTRAINT IF EXISTS runner_commands_type_check;
ALTER TABLE runner_commands ADD CONSTRAINT runner_commands_type_check
  CHECK (type IN ('run', 'cancel', 'resync', 'run-prompt'));

-- `runner_id` has existed since 001 and was never written: every command went
-- to whichever runner polled first, which is correct only while there is one.
-- Choosing the agent means choosing the machine it lives on, so commands are
-- now addressed, and the poll filters on it.
CREATE INDEX IF NOT EXISTS idx_runner_commands_target
  ON runner_commands(org_id, runner_id, cursor);
