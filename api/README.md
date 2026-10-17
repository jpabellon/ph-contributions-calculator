# Public API data (NoCodeBackend)

The public API ([docs/api.md](../docs/api.md)) is served by NoCodeBackend (NCB) from the database `37012_ph_contributions` (US region). This folder holds what is loaded into it:

| File | Contents |
|---|---|
| `seed/funds.json`, `seed/member_types.json`, `seed/laws.json`, `seed/contribution_rates.json` | Exact rows of the four public tables, generated from `data/contributions` by the SDK |
| `seed/ambiguous_amounts.json` | Reverse-lookup amounts that match more than one row (documented in the API docs) |
| `openapi.json` | The OpenAPI spec NCB generated for the database. Only `read` operations are public. |

All four tables have the RLS policy `public_read`: anonymous reads are allowed, and anonymous create, update and delete are rejected by NCB. No secret key is needed or used by API callers. Never commit the database secret key.

## Regenerate and check

```sh
npm run build:api-seed   # rewrite api/seed from data/contributions
npm test                 # includes tests/api-seed.test.mjs (SDK reconciliation, boundaries, reverse lookups, documented URLs)
npm run check:api-seed   # CI: fails if api/seed is stale
```

## Reload NCB after a data change

Use the NoCodeBackend MCP tools (`execute_sql`, `insert_mock_data`, `set_rls_policy`) on `37012_ph_contributions`:

1. Regenerate the seed and run the tests (above).
2. Clear the old rows. `contribution_rates` must be cleared first, since it references the other tables:
   `DELETE FROM contribution_rates; DELETE FROM laws; DELETE FROM member_types; DELETE FROM funds;`
3. Load `funds`, then `member_types`, then `laws` with `insert_mock_data`, using the JSON files as records.
4. Load `contribution_rates` in batches with `execute_sql`. Each batch is about 26 KB of SQL that takes its law details from the `laws` table:
   `node scripts/api-seed-sql.mjs insert <batch> 200` for batches `0`, `1`, `2`, … until it reports `EMPTY_BATCH`.
5. Verify. Run the query printed by `node scripts/api-seed-sql.mjs verify`. Every group's `n` and MD5 `h` must equal the JSON printed below it.
6. Confirm `get_rls_policies` shows `public_read` for all four tables, and run one documented query from [docs/api.md](../docs/api.md) anonymously.

Clearing and reloading briefly empties the API. For a new circular it is usually enough to insert only the new law and its rate rows, then update the replaced law's `valid_until` / `still_in_effect` in both `laws` and `contribution_rates`.

NCB's automatic schema analysis labels some columns as unique or as foreign keys because of their names (`fund`, `member_type`, `law_code`). The load does not depend on this: inserting several member types and laws with the same `fund` succeeds.
