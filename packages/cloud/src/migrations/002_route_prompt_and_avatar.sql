-- Routes carry their own prompt text.
--
-- `execution.promptTemplate` named a template compiled into the runner, so
-- rewording what an agent was asked to do meant shipping a release. Routes now
-- store the prompt itself. Existing rows are rewritten in place from the
-- template they referenced, so no route loses its behaviour.

UPDATE routes
SET definition = jsonb_set(
      definition #- '{execution,promptTemplate}',
      '{execution,prompt}',
      to_jsonb(
        CASE definition -> 'execution' ->> 'promptTemplate'
          WHEN 'product-review' THEN
            E'You are reviewing a proposed piece of work for product sense and feasibility.\nDo not write or change any code. This is an assessment, not an implementation.\n\nTicket: {{ticket.ref}}\nTitle: {{ticket.title}}\nLink: {{ticket.url}}\nLabels: {{ticket.labels}}\n\nDescription:\n{{ticket.body}}\n\nAssess and report on:\n- What is actually being asked for, in your own words.\n- Whether it is worth doing, and what it competes with.\n- Rough feasibility and the main technical risks.\n- Anything underspecified that someone must decide before work starts.\n\nBe direct. If this is a bad idea, say so and say why.'
          WHEN 'pr-review' THEN
            E'You have been requested as a reviewer on a pull request.\nReview it as you would a colleague''s work: correctness first, then clarity.\n\nPull request: {{ticket.ref}} (#{{pr.number}})\nTitle: {{ticket.title}}\nLink: {{ticket.url}}\n\nDescription:\n{{ticket.body}}\n\nRead the diff before commenting. Prefer a small number of substantive\nfindings over exhaustive nitpicking, and say plainly when it looks good.'
          WHEN 'implementation' THEN
            E'You are implementing a piece of work end to end.\n\nTicket: {{ticket.ref}}\nTitle: {{ticket.title}}\nLink: {{ticket.url}}\n\nDescription:\n{{ticket.body}}\n\nYou own the whole change: create your own branch, make the edits, run the\nchecks, commit, push, and open the pull request under your own identity.\nKeep the change scoped to what the ticket asks for. If you cannot proceed,\nstop and explain why rather than guessing.'
          ELSE
            E'Ticket: {{ticket.ref}}\nTitle: {{ticket.title}}\nLink: {{ticket.url}}\nLabels: {{ticket.labels}}\n\nDescription:\n{{ticket.body}}'
        END
      ),
      true
    )
WHERE definition -> 'execution' ? 'promptTemplate';

-- Shown beside the agent's Slack notifications.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
