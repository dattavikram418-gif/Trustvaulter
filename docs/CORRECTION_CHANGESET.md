# Targeted correction inventory

Independent review base: `a6d3ed456f1dcf18e25584b2ecc4ebb6d5cfa672`.
Observed platform-created correction SHA: `ab6b15bd166c1a0282ddfc7b6efe2060135de73a`. Read-only `git status --short` was empty at inspection; this commit includes the correction code/tests through its ancestry and final contract/evidence docs. This reporting amendment will be a later platform-managed commit. No Git write commands run; base SHA is not asserted to cover corrections.

## Exact files
- `drizzle/migrations/0005_trustvault_revoke_and_audit_v2.sql` — new ordered correction; applied history untouched.
- `drizzle/migrations/meta/_journal.json` — tool-appended ordered entry only.
- `src/integrations/supabase/types.ts` — tool-regenerated audit fields/RPC types.
- `src/routes/api/public/metadata.ts` — trusted correlation on normal/auth/oversize responses.
- `src/lib/backend/client.ts` — event evidence types and error request ID.
- `src/components/tv/MetadataDetail.tsx` — owner permission-history details, request correlation display.
- `tests/backend/run.mjs` — real PG boundary/mutation and new targeted regressions.
- `tests/backend/audit-verifier.mjs` — legacy/v2 byte/hash/field consistency verifier.
- `tests/backend/hosted.mjs` — existing hosted tests updated for trusted UUID/minimal projection.
- `tests/backend/http.mjs` — header/body/denial/auth correlation checks.
- `tests/backend/hosted-correction.mjs` — disposable hosted disable/revoke/reenable and audit reconstruction.
- `API.md`, `README.md`, `THREATS.md`, `docs/BACKEND_STATUS.md`, `PROMPTS.md` — corrected contract/bootstrap/evidence and append-only truthful history.
- `AGENTS.md` — versioned audit-boundary invariant.
- `roadmap.md` — correction task completion.
- `docs/CORRECTION_CHANGESET.md` — this inventory.

No byte functionality, buckets, broader scope or publication. See BACKEND_STATUS for exact commands and remaining limits.
