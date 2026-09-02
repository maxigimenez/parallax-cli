# Recorded API payloads

These are responses captured from a running `@parallax/cloud-api` over a real
Postgres, not hand-written examples.

That distinction is the point. Fixtures typed from `routes/user.ts` agree with it by
construction, and would have agreed on the detail that actually broke the browser:
`run_events.ts` is a `bigint` column, and node-postgres returns bigints as **strings**
rather than risk precision loss. `new Date("1788294119795")` is `Invalid Date`, so
every event timestamp rendered as a dash — caught only because these came off the wire.

Identifiers and key prefixes have been replaced with obviously-synthetic values. They
were only ever prefixes, from a throwaway local database, but they read like
credentials at a glance. The substitution is consistent across files, so the
cross-references still hold: the key in `me.json` is a row in `keys.json`.

To re-record, run the stack as described in `docs/dashboard.md` and:

```bash
for p in me runners agents projects routes "runs?limit=100" \
         "runs/run_1" "runs/run_1/events" keys "integrations/slack"; do
  curl -s -H "Authorization: Bearer $USER_KEY" "$API/v1/$p" \
    > "$(echo "$p" | tr '/?=' '___').json"
done
```
