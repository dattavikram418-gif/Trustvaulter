# Phase-one changed files

Manually authored/modified:
- `AGENTS.md`
- `.env.example`
- `roadmap.md`
- `README.md`
- `API.md`
- `THREATS.md`
- `PROMPTS.md`
- `docs/INTERFACE_HANDOFF.md`
- `docs/EVALUATION_PLAN.md`
- `docs/BACKEND_STATUS.md`
- `docs/CHANGESET.md`
- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/routes/documents.tsx`
- `src/routes/shared.tsx`
- `src/routes/doc.$id.tsx`
- `src/routes/admin.tsx`
- `src/routes/access-denied.tsx`
- `src/routes/auth.tsx`
- `src/routes/api/public/metadata.ts`
- `src/components/tv/bits.tsx`
- `src/components/tv/ConnectedShell.tsx`
- `src/components/tv/SignIn.tsx`
- `src/components/tv/MetadataList.tsx`
- `src/components/tv/MetadataDetail.tsx`
- `src/components/tv/SecurityActivity.tsx`
- `src/lib/backend/account.tsx`
- `src/lib/backend/client.ts`
- `src/lib/backend/bounded-body.ts`
- `src/lib/backend/bounded-body.test.ts`
- `tests/backend/run.mjs`
- `tests/backend/http.mjs`
- `tests/backend/provision.mjs`
- `tests/backend/hosted.mjs`

Dependency / migration-tool changes:
- `package.json`, `bun.lock` (auth client, PostgreSQL test client and managed migration dependencies)
- `drizzle/schema.ts`
- `drizzle/migrations/0000_trustvault_phase1.sql`
- `drizzle/migrations/0001_trustvault_session_failure_audit.sql`
- `drizzle/migrations/0002_trustvault_boundary_hardening.sql`
- `drizzle/migrations/0003_trustvault_role_variable_fix.sql`
- `drizzle/migrations/0004_trustvault_audit_column_qualification.sql`
- `drizzle/migrations/meta/_journal.json`
- `drizzle/migrations/meta/0000_snapshot.json` through `0004_snapshot.json`
- `src/integrations/supabase/types.ts` (generated from schema)
- `src/routeTree.gen.ts` (generated routes)

Temporary duplicate `supabase/phase1.sql` was created while authoring the first migration then removed; canonical migration is 0000. No standalone credential fixture is committed. Generated build output is not part of authored changes. Platform-generated auth files existed at turn start and were not manually modified.

Read-only HEAD observed before final documentation edits: `ce54278885f7f3343cffa466587ce9d09f8a4a78`. No agent-created commit or final immutable commit SHA can be supplied before platform autosave completes; this observed SHA is not claimed as the final phase-one commit. Published history untouched. No publication.
