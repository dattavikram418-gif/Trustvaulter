# TrustVault evidence status — current lead

## Docs-only evidence amendment — 2026-11-04 UTC (reviewed ref `cf8c0816691136498be2cee61817758d594c001b`)

- **Code-review closure:** independent plan_monitor CLOSED A01/A02/A03 at code-review level. The parent verified that the diff from clean-rehearsed functional `16268db6286063c7edfc1bac5139496e9b88d78c` to `cf8c081` is documentation only, so the exact functional source is covered by the author-run overlay-free rehearsal. No independent full-suite rerun happened.
- **A01 rounding hypothesis corrected:** before 0018, the primary independently ran a READ-ONLY hosted helper SELECT using `jsonb_populate_record(NULL::audit_events, …)` with a synthetic grant/allowed/v2 row (synthetic recipient UUID, prior 1.2, new 2.2). Actual output: SQLSTATE 22P02 `invalid input syntax for type bigint: "1.2"` inside `tv_admin_change`. `text::bigint` rejects fractions; it did not round. The real defect was a query exception with no unavailable result, not fabricated rounded values. The monitor retracted its initial rounding claim. The earlier "rounded" wording in prompts and the author's notes is kept as history and marked here as an AI-review error.
- **Post-0018 hosted helper proof (independent, narrow):** the primary ran READ-ONLY pure-helper cases on synthetic composite values: valid grant, fractional, overflow (max+1), maximum valid pair (9223372036854775806→9223372036854775807), negative, scalar, array, JSON null, string revision, boolean permission. 10/10 gave the correct recorded value or NULL/unavailable, and the max case returned `9223372036854775807`. This is not auth/RPC/HTTP/UI/scanner/security certification and is separate from the author's 16 hosted RPC checks. No real ledger rows were read or modified by these probes. The parent also re-read the actual 0018 SQL and the exact-string UI/types with the monitor. No parent role-privilege probe result was supplied, so none is recorded.
- **Pipeline:** the parent's 4 independent pipeline checks at `e7e56b80` still apply; the core pipeline is unchanged since.
- **Author counts (ref `16268db`, from the RESULT lines):** current schema 13+132+98+108 = 351; historical pre-0016 44+43+21+20 = 128; 479 assertions in total. 458 PASS lines is a separate count, not the assertion total.
- **Not done:** real authenticated admin UI/HTTP browser proof.
- **Release still blocked by:** a fenced runtime gateway, a real scanner, an independent audit sink, and attacks against a public deployment.
- **Next operator choice:** provide an existing controlled hosting/runtime target for the real gateway and scanner, plus an independent retention account/sink. Engineering implementation and integration are still required after that; this is not only a matter of adding secrets. Background automation stays disabled and no jobs are started or scheduled.


## A01/A02/A03 admin correction (0018) — 2026-11-04 UTC

Status: **corrected and tested by the author; independent review pending.**
- Exact code ref: `16268db6286063c7edfc1bac5139496e9b88d78c`. Archive sha256: `389905c30a65b909a556334d53832b5d877499f7245267a591a91019cf6b872c`. Any later commit is docs only.
- Overlay-free rehearsal (`TV_REHEARSE_WORKTREE` unset, clean tree, frozen deps, PostgreSQL 17.11) exit 0:
  - install 545; checkpoint 24/24; admission 4/4; rehearsal Vitest 45/45
  - all migrations through 0018 applied, then: checkpoint 13, metadata 132, admin 98 (6 mutants), claims 108 (7 mutants)
  - historical pre-0016 suites: 44/43/21/20
  - 458 PASS lines
- Hosted synthetic direct RPC: 16/16. This is not the HTTP route and not a public deployment. No hostile rows were written to hosted history.
- A01 fixtures used for "unavailable" exist only in the disposable local DB.
- `tv_operation` now parses `auth.uid()` in a guarded block, so a malformed subject claim gives an audited 401 for every action.

## Admin permission-change investigation (0017) — 2026-11-04 UTC

Status: **implemented and tested by the author; independent review pending.** Not complete overall.

- Code ref: `a6bd5d55685f1574c2888357a03ded6d4fccefc7` (git archive sha256 `0062e631355fd10aa9a75e06bac7d164494a74b2a21e16a0add4b53fcfda6459`). Caveat: after the rehearsal, a type-only fix changed `SecurityActivity.tsx` (bracket property access, identical runtime, not covered by DB tests). The next saved ref therefore differs from `a6bd5d5` in that file plus docs. Exact-final-source rehearsal for that next ref is still pending.
- Overlay-free rehearsal: `TV_REHEARSE_WORKTREE` unset, clean tree, `TV_LOCAL_PG_BIN=<17.11 bin> python3 tools/rehearse-saved-source.py` → exit 0. Frozen install 545; checkpoint 24/24; admission 4/4; rehearsal Vitest 45/45. All migrations through 0017 applied, then: checkpoint 13, metadata 132, **admin 41 (2 mutants killed)**, claims 108 (7 mutants). Pre-0016 historical suites: 44/43/21/20. 401 PASS lines (was 360; +41 admin).
- Full app Vitest 59/59 (author). Hosted synthetic `tests/backend/admin-hosted.mjs`: 12/12 against hosted DB via direct RPC (not HTTP route, not public deployment).
- Admin gets security metadata and validated permission transitions only; there is still no ordinary detail, grants, activity, edit, share, delete or byte access.
- Earlier caveats still apply: current-schema 253 plus historical 128 from the earlier pass; hosted 26 was local handler plus hosted DB/storage; the bfe1720+overlay rehearsal is not exact-source closure.

## Upload admission gate 1 — author rerun at exact saved ref — 2026-11-04 09:5x UTC

Status: **NOT COMPLETE — independent confirmation pending.** This rerun was performed by the authoring agent, so it is not independent review.

- Ref: `77a0f804766136d4360edc3129d2b200acd41fe7`, clean worktree (no overlay, unlike the earlier pass).
- `tools/rehearse-saved-source.py` with PostgreSQL 17.11 (pinned): exit 0; frozen install 545 packages; checkpoint node 24/24; admission 4/4; rehearsal Vitest 45/45.
- Current schema ("all migrations applied"): checkpoint 13, metadata/auth/audit 132 (mutant killed), claims 108 + chain verified (7 mutants killed). Pre-0016 suites: quarantine 44, correction 43, recurring 21, scan-evidence 20. 360 PASS lines, matching the earlier pass.
- Not rerun in this pass: hosted synthetic HTTP/RPC/storage (earlier run 2: 26 checks, agent-reported only); public Git clone; full-app Vitest 59/59 (agent-reported).
- Blockers before marking the gate complete: an independent reviewer rerunning these exact commands; a hosted rerun with provisioned synthetic accounts; the open items below.

## Upload admission gate 1 — verification pass — 2026-11-04 UTC (supersedes the evidence table in the 0016 entry below)

Input: independent source review GO at `e7e56b8037b609fe7ba6b3180b14d65ece54afb3`. The parent independently reran its own 4 Node checks on `upload-pipeline.ts`: denial reads 0 and does not fail or release the winner; full ordering and secret stripping; storage-failure release in `finally`; local-cap loser before claim. Those 4 are the parent's own checks, not the author's mutants. The monitor closed the duplicate-buffer/loser-mutation defect at code level and found test gaps, which this pass addresses. 0016 and the UI are unchanged. No new migration.

**Count reconciliation (from actual output).** The earlier "307" was the number of PASS lines: 255 from the legacy suites plus 52 from claims. The legacy RESULT sum, 44+43+21+20+13+132 = 273, ran entirely on 0000–0015. That 307 was never a full post-migration pass. Now:
- **Pre-0016, historical inner suites** (they call the now-revoked unfenced bridge): quarantine 44, correction 43, recurring 21, scan-evidence 20 = 128.
- **Current full schema** (all migrations incl. 0016, asserted by a `SCHEMA current` check): checkpoint 13, metadata/auth/audit 132, claims 108 = 253.
- Total RESULT-counted assertions 381; PASS lines 360. The difference of 21 is assertions counted silently through `assert.rejects`/`n++`.

**New current-schema claims regressions (108; previously 55):**
- Revocation after a successful claim, both before stage and after stage before finish: grant revoke, account disable, session revoke (6 scenarios). Each checks:
  - the denial identity: verified actor/session for 404, NULL for 401;
  - no version is created and the reservation state is not corrupted;
  - the claim stays active until a fenced release.
- A real release-audit fault (trigger on `upload_release` only) rolls back and leaves the claim active; release succeeds afterwards.
- Global cap under concurrent different actors/tickets with a deterministic advisory-lock barrier: all 6 claimants are confirmed queued in `pg_stat_activity` before release. Result: exactly 4 winners and 2 audited `global_pipeline_cap` denials. The global-cap source mutant (`>=4` changed to `>=1000`) is killed by this concurrent round.
- No automatic expiry recycling: expired leases still hold the cap. Recovering one frees exactly one slot, and the recovered fence is dead.
- The duplicate-read test now uses a deterministic gate (the winner's read is held until every loser has returned) instead of a 20 ms sleep.
- Real handler-source mutants: the actual `upload-pipeline.ts` text is rewritten and imported. Both are killed: read-before-claim and claim-bypass. Total mutants killed: 7 (5 DB-function, 2 handler).

**PostgreSQL pin intentionally upgraded 17.9 -> 17.11** (an engineering decision on 2026-11-04; 17.9 was our own choice, not a challenge requirement). Official sources:
- Source: https://ftp.postgresql.org/pub/source/v17.11/postgresql-17.11.tar.bz2, sha256 `dd27f2b3c59e73ed14aa3324901242bf69a032a6347805f274e6260322d42979`, fetched from the official .sha256 file.
- Container: `postgres:17.11@sha256:3b0cda93be7c8dba2ed484d19393d93845dc3dafb88973e248ba8e6d99d784e1` (index digest read from the registry).
- Release notes checked: https://www.postgresql.org/docs/17/release-17-11.html (HTTP 200).

This run used a nix-store 17.11 build; that build was not checksum-compared to the tarball. Historical 17.9 runs and the failed missing-17.9 rehearsals stay as recorded. They are not retroactively passes. The hosted database was not upgraded.

| Command | Actual result |
|---|---|
| `TV_TEST_DATABASE_URL=… bun tests/backend/run.mjs` (fresh cluster, 17.11) | exit 0; RESULT lines as above |
| `TV_REHEARSE_WORKTREE=1 TV_LOCAL_PG_BIN=<17.11 bin> python3 tools/rehearse-saved-source.py` | exit 0. Source: saved `bfe1720fa9f82dcfcae4d062ba9aa6ffef7b3133` + an explicitly labelled 1-file worktree overlay; nobody user, `env -i`, frozen Bun 1.4.4 (545 packages); checkpoint 24/24, admission 4/4, Vitest 6 files 45/45; `fresh-local.sh` pinned 17.11: all 7 RESULT lines passed. Not a public Git clone. Fresh Python bootstrap not run. |
| `bunx vitest run` | 59/59 (8 files) |
| `bun tests/backend/claims-hosted.mjs` (new synthetic accounts; current dev-server handler + hosted DB/storage) | Run 1: exit 1 after 9 checks. My test expected 3 parallel duplicate PUTs to all return 400; under parallelism the per-process cap returned 503 for some, which is correct behaviour (audited as `process_pipeline_cap`). That run left one claim stranded; it was recovered through the operator procedure (below). Run 2 (fresh accounts, sequential duplicates): **26/26 PASS**. Covered: raw table reads denied for authenticated and service; authenticated cannot claim; old unfenced `tv_upload_transition`/`tv_upload_finish_evidenced` refused for service_role; user storage list empty; duplicate PUTs against a held winner give generic 400 and the winner still stages/finishes/releases; a 5-PUT burst gives exactly one 200 (quarantined), others 400/503; GET still 423; grant revoke before stage and after stage give 404; account ban before stage gives 401; global session revoke after stage gives 401; every case fenced-released. Hosted audit read back: denials carry verified actor/session for `not_found` and NULL for `invalid_session`. |

**Still open:** independent rerun of this pass; byte-level "zero reads" is proven only locally, because the network cannot observe server reads; no hosted audit-outage injection (no production fault injection); next gate (secure gateway runtime authority) unresolved; admin permission investigation gap pending. Admission is verified to this level, not "complete".


## Upload admission gate 1 — fenced receiving claims (0016) — 2026-11-04 UTC

Interactive scope renewed 2026-11-04 (not background automation). Input ref `a474f9032f653cacc87638b2685c15c30736d47e`. Canonical migrations 0000–0015 and v1/v2 audit bytes unchanged; new migration `0016_trustvault_fenced_receiving_claims.sql` applied to the project database via the migration tool (hosted grants re-read afterwards: `tv_upload_transition`/`tv_upload_finish_evidenced` no longer executable by service_role, anon or authenticated; new fenced RPCs service_role only).

**Defect (confirmed by parent):** PUT ran `tv_upload_transition('inspect')`, which left the reservation `reserved`, then buffered up to 10 MiB. N parallel PUTs on one valid ticket each passed inspect and each buffered before one stage won; a loser's later `inspect`/`fail` could also fail the winner. Per-request limits did not bound aggregate memory.

**Correction (implemented, locally tested):**
- `tv_upload_claim` takes the ledger mutex, verifies live bridge identity, ticket actor/session, parent ACL/lifecycle/revision and reservation state, then inserts ONE claim per reservation (UNIQUE, never reusable) with an unpredictable server-side fence stored only as SHA-256. Caps: 1 active pipeline per verified actor, 4 global. Denials are audited and never mutate the reservation or the winning claim.
- Handler (`upload-pipeline.ts`): per-isolate slot (cap 2) -> DB claim -> body read. Losers read zero bytes; body cancel is best-effort and never awaited. Stage/finish/fail require the matching fence (`tv_upload_*_fenced`), still re-run the existing live identity/ACL/revision checks, and stage/finish refuse expired leases. Release (`tv_upload_release_fenced`) runs in `finally` on every path and is idempotent; if its audit fails the slot stays occupied (fail closed). Fence and object key never leave the server.
- Crash/expiry: leases do NOT auto-free capacity. Expired active claims keep occupying slots until the fenced worker releases or an operator calls `tv_upload_claim_recover(claim_id,'worker_terminated_verified')` after independently confirming termination; recovery only works on expired leases, fails the reservation (no finalisation possible, reservation never re-claimable) and leaves any late object to recurring cleanup.
- Limits: the DB cap bounds pipelines that hold claims, and the per-isolate guard bounds buffers in one process. Neither is a hard cross-process memory cap, since provider isolate count is not controlled. A paused old worker can still write to external storage after recovery; the fence blocks only metadata finalisation, and cleanup reconciles the write later. No new read path: GET still returns `delivery_gate_closed`, and the claim table and fence are not readable by any API role.

**Actual commands/results (this turn):**
| Command | Result / level |
|---|---|
| `TV_TEST_DATABASE_URL=postgres://tv@127.0.0.1:55432/tv_test bun tests/backend/run.mjs` on a fresh disposable cluster | exit 0: legacy suites 44+43+21+20+13+132 (run on 0000–0015, since they call the now-revoked unfenced bridge), then 0016 applied and claims suite 55 assertions + full audit chain verified; 4 claim-boundary mutants killed (exclusivity, actor cap, fence, ticket binding). Real concurrent pool connections; storage/scanner in-memory spies. **PostgreSQL 17.11 (nix store), NOT the pinned 17.9** — this is a run on a stated substitute version, not a pinned rehearsal. `/usr/bin` 17.11 initdb was broken (missing dict_snowball); 17.9 was not available. |
| `bunx vitest run` | 8 files, 59/59 pass (incl. 11 new pipeline spy tests). |
| `node --test tools/audit-checkpoints/*.test.mjs tools/admission-mutation.test.mjs` | 28/28 pass. |
| Hosted HTTP/storage | NOT run (no provisioned test accounts this turn). Older hosted scripts that call `tv_upload_transition` directly are superseded and will now get permission denied. |

Independent review by parent and plan_monitor is pending. The gate is not closed.


## Final bounded non-delivery increment — 2026-11-01 America/Chicago

Actual current prompt/clock2026-11-02 01:10 UTC (November1 locally). Reviewed input `a197bc40e6b492c51825ff72e7f87822ca5805ec`; tested saved functional source `d070a7bf10a9b0b676c19ae8c765a01ab4253a18`, later reporting-only amendments platform-managed. No migrations/history/canonical bytes/permissions or byte gates changed. No publication/GitHub/paid services/secrets/confidential external transfers.

**Independent evidence:** C01 CLOSED code-level by independent plan_monitor, and primary independently fetched exact saved checkpoint signer/verifier/format/export/sink/tests and reran24/24 including both real source mutants, as stated in this user's prompt. No independent PG/hosted rerun. Q01/Q02/Q03 closure is code-level only. Historical273 PG remains historical implementation evidence; prior pending C01 and no-storage descriptions below are chronological, superseded by this lead.

**Implemented/tested this increment:** one capped request buffer, fragment/deadline limits and strict JSON UTF-8; optional isolated maintained PNG validator/reference with explicit unsupported PDF/JPEG capability, digest/size/parent/version-bound offline-untrusted results (not database-authorized/persisted). Connected format contract unchanged; all bytes remain quarantined. Structural/AV result never enables delivery.

### Actual commands and results

| Command | Actual result / evidence level |
|---|---|
| `bunx vitest run src/lib/backend/bounded-stream.test.ts src/lib/backend/bounded-body.test.ts src/lib/backend/file-validation.test.ts src/lib/backend/scanner.test.ts src/test/app-routing.test.tsx` | 5 files,27/27 PASS. 12 scanner mocks;6 shallow prefilter cases,8 body/stream cases,1 route test. Not hosted admission or AV proof. |
| `node --test tools/audit-checkpoints/checkpoints.test.mjs tools/audit-checkpoints/ancestry.test.mjs` (also saved rehearsal) | 24/24 PASS; both real signature/ancestry mutants killed. Primary independent rerun24/24 is separately supplied evidence, not claimed performed by this author. |
| `node --expose-gc --test tools/admission-mutation.test.mjs` | 4/4 PASS. Real source restored-retention/removed-fragment mutants killed; consumed first chunk collectible while stream paused; real repeated-deadline-race mutant killed. Requires exposed GC explicitly; no skipped memory assertion. |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s services/structure -p 'test_*.py' -v` | 7/7 PASS. Real installed Pillow12.1.1 verifies/loads synthetic PNG and actual isolated child; trailing/duplicate-IEND/CRC/truncation/expansion/dimension/metadata samples; actual removed-trailing source mutant accepts negative and is killed. Timeout/missing-version branches are mocks. PDF/JPEG explicit unsupported. |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s services/scanner -p 'test_*.py'` | 5/5 mocked protocol contracts PASS. Real engine/definitions/EICAR still UNRUN/unprovisioned. |
| `TV_LOCAL_PG_BIN=/nix/store/fzmhi3m2075fshdhvgzkaa09zwbvmjv2-postgresql-17.11/bin python3 tools/rehearse-saved-source.py` | Saved `d070a7bf10a9b0b676c19ae8c765a01ab4253a18` source under `/tmp/trustvault-source-rehearsal-22b3rdpm`; nobody/empty child env/frozen Bun1.4.4 install545 packages; checkpoint24/admission4/Vitest27 PASS. Fresh PG correctly REFUSED `PostgreSQL 17.9 required`, child exit2, overall rehearsal **exit1**. No PostgreSQL substitution/full-pass claim. |
| Saved-copy Python commands above as `runuser -u nobody -- env -i PATH=/usr/bin:/bin PYTHONDONTWRITEBYTECODE=1 ...` | Offline structure7/7 and scanner5/5 PASS from that saved source. Uses existing system Pillow, not fresh Python package install proof. |
| Platform managed `/tmp/observability/build-errors.log` inspected | Latest observed build OK2026-11-02T01:15:35Z. No manual project build/typecheck, new UI/browser pass or published runtime proof. All7 content route heads inspected; existing unique metadata preserved. |

**Specific discovered/fixed defects:** previous byte-bounded readers retained every chunk allocation (tiny/empty-fragment memory/work growth) and lacked total body deadline. Fixed one capped buffer (upload10MiB), upload65536 fragments/30s; JSON4096 fragments/10s, original byte caps; non-awaited cancel prevents hanging cancel source. Initial AI fix raced each read against the same pending deadline; actual GC regression FAILED because pending reactions retained consumed values. Corrected by one race around whole consume task; test passes and reintroduced real-source mutant fails. First saved rehearsal (`1693de928000b1cdb046671b9553eb52abfe1090`) exited1 at this memory test; after correction final saved rehearsal above passes tests and exits1 only at missing pinned PG. No failed run represented as pass.

**Known limits / accepted bounded scope:** native PNG reference offline-only (narrow static8 PNG, no animation/palette/metadata/interlace); PDF/JPEG exact consumption/expansion unavailable rather than fabricated pass. No app structural ingestion, native sandbox/AV assurance, HTTP authenticated regression rerun or provider concurrent/admission proof. No PG/hosted suites rerun this increment; pinned17.9 missing. Real antivirus host/TLS/privacy/key, authoritative fenced egress/revoke/identity coordinator implementation/all-route tests, separately administered retention-locked sink/CAS/protected latest state, and deployed attacks are release blockers, not a credential checklist. Demo script only; video/seed credentials absent. Detailed precise next action and operator requirements in REMAINING_WORK; this is final planned bounded increment, not an indefinite background job.

## Historical increment evidence (not current-state declarations)

2026-10-31 America/Chicago. Phase-one metadata foundation only; pending independent review. Not full challenge completion. No production publication.

## Evidence levels

| Capability | State | Evidence / exact limitation |
|---|---|---|
| Auth and provision-only configuration | implemented; verified against provisioned hosted test accounts | Email sign-in enabled, signup/anonymous disabled, confirmation not silently relaxed. Random disposable accounts signed in successfully. Real browser login/logout checked. No user bootstrap account supplied. |
| Live session/account validity | implemented; tested local and hosted | DB shares locks on live session/user/profile/role rows. Hosted old unexpired access token denied after actual Auth global signout (RPC 401 and HTTP 401); disabled profile denied. No expiry-only simulation substituted for this test. |
| Metadata/ACL/audit schema | implemented; applied to provisioned backend | migrations 0000–0004 applied successfully; no file storage. These DB changes affect the connected backend, but the app has not been published. |
| Authorization and direct Data API | tested local and against hosted backend | owner A/B, Read, Edit, ungranted, admin negative matrix; raw table privileges denied; direct authenticated RPC tested. |
| Atomic mutation/read/audit | tested locally | real PostgreSQL transactions, document/global locks; forced audit INSERT failure rolled mutation back; concurrent same-revision updates returned 200/409. Fault injection was not performed on shared hosted backend. |
| Durable denials / hash chain | tested local; hosted denial readback | local separate committed denials, canonical-chain continuity/hash recomputation, UPDATE rejection; hosted owner activity includes denied attempts. Unanchored and DBA/runtime trusted, not tamper-proof. |
| Connected UI | browser verified | Actual sign-in → create draft → edit → hard refresh readback → disabled file actions → tombstone → sign-out. Desktop 1280×1800 and mobile 390×844 inspected; no page errors or horizontal overflow. |
| Published app | not verified deployed | No production deployment/publication requested or performed. Hosted backend RPC tests are not published Worker verification. |
| Scanner/content/independent anchors | planned, not implemented | Release blockers below. |

## Actual commands and raw result summaries

1. Local PostgreSQL 17.9 initialized under `/tmp/trustvault-pg` as OS user nobody and started on localhost:55432. Initial `/usr/bin/initdb` invocation failed to resolve `dict_snowball`; retry through full installed distribution path succeeded. Hosted PG defaults required SSL, so local `psql` was explicitly given `PGSSLMODE=disable`.
2. Fresh database setup: `PGSSLMODE=disable PGHOST=127.0.0.1 PGPORT=55432 PGUSER=nobody PGDATABASE=postgres psql -v ON_ERROR_STOP=1 -c 'CREATE DATABASE tv_test'`. Between failed iterations, only this disposable database/test roles were reset.
3. `TV_TEST_DATABASE_URL=postgres://nobody@127.0.0.1:55432/tv_test bun tests/backend/run.mjs`

   Final raw summary: `RESULT 107 assertions passed; mutation killed; real PostgreSQL transactions; auth schema is local contract stub, not hosted JWT HTTP verification`.

   Targeted mutation replaced the detail owner/grant decision with false in disposable DB; the existing ungranted-detail negative assertion failed, marking the mutation killed; original definition restored. Not a full mutation campaign.
4. `bun tests/backend/provision.mjs` — eight real disposable accounts created with random credentials stored only in mode-0600 `/tmp/browser/phase1/fixtures.json`; actual Auth password sign-ins returned sessions. Trusted query tooling assigned creator/admin roles and disabled one profile.
5. `bun tests/backend/hosted.mjs`

   Final raw summaries: `PASS hosted unexpired token after real Auth signout`; `PASS provisioned HTTP IDOR/session and direct Data API checks`; `RESULT 46 hosted assertions passed, plus HTTP harness`.

   HTTP harness tested localhost application handler with real hosted tokens and direct hosted table/RPC HTTP. An earlier HTTP invocation without fixtures correctly reported UNRUN (exit 2); it was subsequently run with provisioned fixtures and passed. No tokens/credentials logged or committed.
6. `python3 /tmp/browser/phase1/check_flow.py`

   Final raw summary: `PASS real UI sign-in, create metadata, edit, hard-refresh readback, disabled bytes, mobile width, tombstone, sign-out; page errors: []`.

   First browser attempt stopped because Category matched both list filter and modal; selector scoped to the dialog, rerun passed. Screenshot evidence inspected. Script/screenshots are temporary, not committed deliverables.
7. `bunx vitest run src/lib/backend/bounded-body.test.ts src/lib/demo/model.test.ts src/test/app-routing.test.tsx`

   Final raw summary: `Test Files 3 passed (3); Tests 15 passed (15)` — three byte-limit tests, one route test, eleven legacy demo regressions (not backend evidence). Initial node-environment test failed due to shared window-based setup; default test environment rerun passed.
8. Harness-managed build/type checks: latest inspected `/tmp/observability/build-errors.log` entries reported `build OK`. No manual project build/typecheck was run because the platform harness handles both.
9. Backend linter: six INFO `RLS Enabled No Policy` (intentional table lockdown) and one WARN authenticated SECURITY DEFINER execution (intentional audited RPC boundary). These are reviewed intentional configurations, not proof of security.

## Defects observed and corrected

- Newly generated Auth imports lacked the auth dependency; installed it, preview build OK.
- RPC optional payload type rejected undefined in strict TS; transport casts defined JSON, no undefined argument.
- SQL NULL payload slipped scalar validation; added explicit object/type check, scalar/size validation; direct local NULL test now 400.
- HTTP oversize path lacked audit and read full body; bounded stream and rejected audited RPC added.
- Service role could directly alter document/grant/version tables or insert audit; revoked those privileges. Trusted profile/role maintenance remains out-of-band DBA/bootstrap trust, explicitly documented.
- PostgreSQL `current_role` collided with a built-in reserved value and denied actual document_creator accounts; variable changed to actor_role; real local + hosted create passed.
- Audit projection had ambiguous `action` variable/column and errored; qualified event columns; local/hosted activity passed.
- Cleanup hard-delete encountered retained grant/profile references. Drafts tombstoned; disposable profiles disabled; accounts removed where possible and remaining referenced accounts Auth-banned. Audit history retained. No working credentials delivered.

## Release blockers and known gaps

- Scanner, sniffing/MIME and byte-size validation, quarantine/clean promotion, secure content gateway, preview/download/version bytes absent.
- Synchronized in-flight stream revocation absent; a committed metadata response may already be in flight when revoke returns. No streaming guarantee claimed.
- External audit retention/checkpoints and independent verification absent; DBA/function-owner/runtime can replace code/history. Hash chain alone is not evidence of independent integrity.
- Published Worker end-to-end and deployed adversarial/fault-injection tests not run; load/rate-limit review and auth brute-force review not complete.
- Direct gateway rejections before RPC (invalid/anonymous JWT, schema parse/transport failures) cannot create app-denial rows; handler can only log fixed unverified-session failure safely. Provider logs remain separate evidence, retention unreviewed.
- Global serialization conservative, potentially low throughput; owner activity limited to active own docs, no viewer activity/recovery/transfer; no directory or password-reset UI. Minimal IDs rather than email lookup for grants.
- Bootstrap/profile/role maintenance trusted and not application-audited; perform it under independent operational change logging. No role escalation endpoint exists.
- More mutations/session edge cases (ban, not_after, auth service interruptions, concurrent disable with long transaction, all audit paths) require broader campaigns. Existing checks are meaningful but not exhaustive.

## Change / commit reporting

Full changed-file inventory: `docs/CHANGESET.md`. The platform manages Git commits; no add/commit/rebase/push was run. A read-only observed HEAD is reported there, but it is not asserted to identify every final edit.

## Targeted independent-review correction — 2026-10-31 America/Chicago

Independent monitor reviewed phase1 `a6d3ed456f1dcf18e25584b2ecc4ebb6d5cfa672` and found (1) HIGH disabled-recipient revoke blocked by active-target validation, allowing reenable resurrection; (2) audit missing recipient, permission/revision before/after, verified session and trusted request correlation. Both corrected by **new ordered migration 0005**; migrations 0000–0004 and legacy audit strings/hashes not rewritten. Schema presence read back from connected database after migration success.

**Implemented/tested locally:** split grant/revoke target checks; DB-generated per-operation UUID returned for success/denial; verified session only after live-session/identity checks; version-2 canonical changes; owner details and minimal admin UUID projection; HTTP `X-Request-ID` forwarding including unverified/oversized denial; error object preserves correlation. No file functionality or publication added.

**Actual commands/results this correction:**
- Fresh disposable reset: `PGSSLMODE=disable psql -h 127.0.0.1 -p 55432 -U nobody -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE tv_test WITH (FORCE)' -c 'DROP ROLE anon,authenticated,service_role' -c 'CREATE DATABASE tv_test'` (local test cluster only).
- `TV_TEST_DATABASE_URL=postgres://nobody@127.0.0.1:55432/tv_test bun tests/backend/run.mjs` → `RESULT 132 assertions passed; mutation killed; real PostgreSQL transactions; auth schema is local contract stub, not hosted JWT HTTP verification`. Wrapper also verifies each normal RPC's committed UUID/action/actor/outcome; these extra assertions are not included in 132. Existing boundary mutation killed; forced audit failure prevented edit AND revoke/revision changes. No hosted fault injection.
- `bun tests/backend/provision.mjs` → eight fresh disposable accounts signed in. Attempted bootstrap through managed PG runner failed `permission denied for table user_roles` (expected lockdown); trusted query tool then assigned test roles/disabled fixture, without changing application permissions.
- `bun tests/backend/hosted.mjs` → `RESULT 46 hosted assertions passed, plus HTTP harness`; `PASS provisioned HTTP IDOR/session and direct Data API checks`. HTTP additionally checked trusted header/body UUID, ignored caller header, invalid-bearer correlation, and owner readback of denied request UUID.
- `TV_HOSTED_CORRECTION=1 bun tests/backend/hosted-correction.mjs` → `RESULT 9 hosted correction assertions passed; same preexisting session replay denied`. Fresh fixture edit recipient was granted Read→Edit, disabled, revoked, reenabled; existing token detail/edit denied. Canonical recipient/permission/session/request evidence read back.
- Cleanup used owner RPCs to tombstone both drafts, trusted maintenance to deactivate all fixture profiles, then `bun /tmp/browser/phase1/cleanup.mjs` to remove or Auth-ban disposable accounts; audit retained.
- Hosted read-only verification after cleanup: `chain_ok=true`, `legacy_events=89`, `new_events=78`, `structured_fields_ok=true`. These are consistency checks, not independent audit anchoring.
- `bunx vitest run src/lib/backend/bounded-body.test.ts src/lib/demo/model.test.ts src/test/app-routing.test.tsx` → `Test Files 3 passed (3); Tests 15 passed (15)`.
- Harness-managed log inspected during correction: `build OK` at 22:27:15 UTC; no manual build/type invocation. Relevant Vitest rerun after owner detail rendering change again passed 15 tests. A presentation-only browser attempt remained at sign-in (no live session after fixture cleanup), so new owner-detail rendering was not visually verified; actual connected HTTP/RPC correction flow was verified above. No browser pass is claimed.

**Actual regression iteration issues:** one session assertion incorrectly expected attribution while fixture remained Auth-banned; cleared ban before independent inactive-profile test. One bigint comparison expected JS number while SQL returned string; normalized in test. Both rerun successfully; no false pass retained. Hosted correction runner uses permitted trusted profile maintenance/audit SELECT, not arbitrary SQL or newly exposed app endpoint.

**Remaining limits:** v1 events lack newly required evidence and are honestly labeled legacy, not backfilled; chain remains unanchored with DBA/runtime trust. No published/deployed adversarial verification, scanner/content gateway, streaming revocation or load/rate-limit completion. Gateway denials before RPC still need separate provider evidence. New changes are empty on denied requests to avoid unauthorized grant enumeration. Independent final review remains pending.

Exact correction file inventory and commit reporting: `docs/CORRECTION_CHANGESET.md`. Observed platform-created correction commit `ab6b15bd166c1a0282ddfc7b6efe2060135de73a` with clean working tree at inspection includes code/tests through ancestry and final docs. This reporting amendment follows it; no fabricated final SHA or agent Git write. Base SHA is not claimed to cover corrections.
## Private quarantine increment — 2026-11-01 America/Chicago

Base supplied/reviewed: `a112e190e245aeec918553b3fa6299115d179171`. Actual local time checked: 2026-11-01 00:36 CDT (05:36 UTC); no fabricated history. Applied ordered 0006–0009, preserving 0000–0005 and historical v1/v2 canonical bytes.

**Implemented and verified against connected backend:** private 10 MB managed bucket; locked reservations/quarantined versions; current caller/session/parent/ACL/revision checks on preflight/stage/finalisation, digest readback; audited reserve/version/read attempts, upload outcomes; opaque non-upsert object keys; new-parent and owner/Edit version UI. All versions stay quarantined; no content gateway or release toggle. Real scanner not provisioned or verified. Lovable security scans are project/code/dependency scans, not file antivirus; sensitive-data scanning is PII/DLP, not antivirus (reviewed docs.lovable.dev/features/security, /features/sensitive-data-scanning, /features/storage). No external confidential-file scanning performed.

**Actual final commands/results:**
- Initialized fresh local PostgreSQL 17.9 under `/tmp/tv-pg/data`, nobody user, `127.0.0.1:55432`; canonical migrations applied by test runner with local Auth/storage contract stubs, not hosted JWT validation.
- `TV_TEST_DATABASE_URL=postgres://nobody@127.0.0.1:55432/tv_test bun tests/backend/run.mjs` → `RESULT quarantine 44 real PostgreSQL assertions passed; mutation killed; scanner verdicts injected only through trusted local test context, no clean delivery`; existing `RESULT 132 assertions passed; mutation killed`. Includes swap/digest/replay, wrong-parent/access matrix, disabled/live-revoked, concurrent <=5 reservations, direct revoke-before-finish, forced version/read audit outage, raw grants denied, mixed legacy/new chain. Two separate authorization mutations killed. Extra correlation assertions are not included in reported totals.
- `bunx vitest run src/lib/backend/file-validation.test.ts src/lib/backend/scanner.test.ts src/lib/backend/bounded-body.test.ts src/lib/demo/model.test.ts src/test/app-routing.test.tsx` → `Test Files 5 passed (5); Tests 26 passed (26)`. Scanner's five cases are mock adapter tests, not a real scanner. Eleven legacy demo cases are not backend evidence.
- `bun tests/backend/provision.mjs` → eight new random disposable accounts; private mode-0600 fixture, no credentials printed. Trusted PG setup failed (locked role table); trusted query tool assigned fixture creator/admin/disabled state. No application permissions widened.
- `bun tests/backend/hosted.mjs` → `RESULT 46 hosted assertions passed, plus HTTP harness`; real Auth global-signout old-token denial still passed.
- Final `bun tests/backend/quarantine-hosted.mjs` → `RESULT 87 hosted quarantine HTTP/RPC/storage assertions passed; actual scanner missing; all bytes quarantined; no delivery`. Real owner upload, version parent evidence, raw reads of **actually existing object** denied for owner/B/Read/Edit/admin/ungranted/disabled/revoked/anon and public URL; raw lists/writes/tables denied; real HTTP oversize/HTML/SVG/executable/archive/bad PDF rejected; direct RPC revoke staged Edit finalise denied; digest/version audit and trusted header correlation read back.
- `python3 /tmp/browser/quarantine/check_upload.py` → `PASS real owner sign-in, version upload, quarantine readback, hard refresh, disabled delivery, mobile width; errors: []`. Desktop 1280×1800/mobile 390×844 screenshots inspected. First attempt navigated before login completed and timed out; wait for Sign out added, rerun passed. No credential screenshots.
- `bun tests/backend/reconcile-quarantine.mjs` first run → `14 private removal requests succeeded; 0 failed`; after final cleanup → `21 private removal requests succeeded; 0 failed`. Counts are idempotent removal requests, not proof 21 objects existed. Reservations retained as retryable evidence.
- `NODE_PATH=/dev-server/node_modules bun /tmp/browser/quarantine/cleanup.cjs` → `both drafts tombstoned; 4 synthetic objects removed; 5 accounts removed, 3 banned; all fixture profiles disabled and audit retained`. All objects were synthetic fixture uploads in this newly created bucket. No user content removed.
- Platform-managed latest inspected build/type log: `build OK`. No manual build/typecheck. Not published Worker verification.

**Observed defects and corrections:** Original metadata-only lifecycle constraint rejected quarantine on first local finalise; new ordered 0007 widened it (old allowed state metadata_draft preserved). Replay correctly returned 409 due original revision rather than test's assumed 400; assertion corrected. Read-only reviewer identified body-before-reservation authorization; 0008 added early inspect while retaining later checks. Durable staged keys already recorded possible orphan candidates; added bounded service-only candidate query and trusted retry remover; removal failures remain retryable, no atomic storage/audit claim. 0009 checks live auth before malformed parameters and adds authorized read-attempt latest version/digest evidence. History not rewritten.

**Remaining/unrun:** Real scanner integration and signed engine/signature evidence retention; full structural validators/polyglot assurance; delivery and deterministic all-route mid-transfer/revoke ordering; independent external anchors; published Worker adversarial/load/rate-limit tests; combined injected audit+storage-cleanup outage and automated reconciliation/retention; browser new-parent creation path not independently exercised (existing-parent upload flow verified); scanner timeout branches not all unit-tested. Scanner clean/malicious local inputs do not certify scans. No paid provisioning, publication, GitHub setup, working seed credentials or video. Exact next handoff in REMAINING_WORK.

## Monitor Q01–Q03 correction — 2026-11-01 America/Chicago

Clock read06:07:22 UTC (01:07 CDT), reviewed base33e13a5e57e6d24f8113107ff6e308fc4f3e4916. Canonical0010 bridge identity/cleanup receipts and0011 least-attempted fairness applied by managed tool; schema/RPC presence/raw table denial read back. Historical0000–0009/v1/v2 bytes unchanged. See MONITOR_FINDINGS for exact corrections and pending parent closure.

**Actual commands/results:**
- PG17.9 initialized as nobody under `/tmp/tv-pg/data`. First start failed missing `/run/postgresql` socket directory; retry `pg_ctl ... -o '-h 127.0.0.1 -p 55432 -k /tmp/tv-pg' start` succeeded.
- Disposable reset: `PGSSLMODE=disable psql -h 127.0.0.1 -p 55432 -U nobody -d postgres -v ON_ERROR_STOP=1 -c 'DROP DATABASE tv_test WITH (FORCE)' -c 'DROP ROLE anon,authenticated,service_role' -c 'CREATE DATABASE tv_test'`.
- `TV_TEST_DATABASE_URL=postgres://nobody@127.0.0.1:55432/tv_test bun tests/backend/run.mjs` → metadata132, quarantine44, correction43 assertions; three targeted mutations killed; real PG transactions, local Auth stub and simulated cleanup storage. Committed identity/state/chain verified, >100/disjoint workers/uncertain fairness/retry/expiry/receipt+audit outages tested. No hosted injected fault claim.
- `bun tests/backend/provision.mjs` → eight fresh synthetic accounts, temp0600 credentials; trusted query fixture role/disabled setup only.
- `bun tests/backend/hosted.mjs` → `RESULT 46 hosted assertions passed, plus HTTP harness`; real global signout denial.
- `bun tests/backend/quarantine-hosted.mjs` → `RESULT 87 hosted quarantine HTTP/RPC/storage assertions passed`; scanner missing, bytes closed.
- `bun tests/backend/quarantine-corrections-hosted.mjs` → final `RESULT 56 hosted correction HTTP/RPC/storage assertions passed; actual committed identities/intents/receipts read; no scanner or delivery`. Expected claims verified with Auth getClaims; second-session logout local only. Only fresh synthetic key removed, intent committed beforehand, API-success receipt afterward; no other claimed keys deleted.
- `bunx vitest run src/lib/backend/file-validation.test.ts src/lib/backend/scanner.test.ts src/lib/backend/bounded-body.test.ts src/lib/demo/model.test.ts src/test/app-routing.test.tsx` → final five files/32 tests passed; eleven scanner mocks and eleven legacy demo tests, not malware/backend certification. Earlier parallel run raced patch and saw31; final32 observed afterward.
- `bun tests/backend/reconcile-quarantine.mjs` → `Dry-run: 0 eligible unfinalised candidates; no storage side effects.` No ordinary apply/cron.
- `NODE_PATH=/dev-server/node_modules bun /tmp/browser/correction/cleanup.cjs` → synthetic drafts tombstoned; five accounts removed/three banned; audit/successful quarantined versions retained, no successful-version purge. Trusted query deactivated all eight fixture profiles.
- Latest platform managed build/type log `build OK` at06:11:58 UTC. No manual build/type or new visual browser claim; central correction tested with real authenticated HTTP/readback. Not published Worker proof.

**Iteration failures:** SQL Result subclass vs plain[] comparison changed to row count. New fairness test completed untouched tail earlier, invalidating old pending expectation; corrected count and inserted fresh eligible synthetic candidate so claim audit-outage assertion can fail. Final43+44+132 passed. Read-only review prompted0011 fairness; late-write concern recorded open, not falsely fixed.

**Saved functional revision:** `1ce45ab48252312a060022cb9bce87ed87194f54` read-only after tests; documentation amendments follow under platform-managed commits. No Git writes.

**Open:** external late-write/cleanup operational fencing/inventory; API success not existence/permanent absence. Optional signed scanner engine/signature retention deferred, real scanner unprovisioned. No gateway/toggle/immutable sink/clean-clone/deployed certification. Parent authorized scheduled follow-up; no Lovable scheduler configured. All routes remain closed.

## Recurring cleanup + scanner reference/evidence — 2026-11-01 America/Chicago
User-reviewed input `142890748ea7bffde67181dd4d001c092ad283bf`; parent CLOSED Q01/Q02 code-level only, implementation tests not independently reviewed. Q03 parent closure remains pending. UTC clock actually read09:11:15 (03:11 CST after DST transition). No overlap/publication/GitHub/paid resources/confidential external transfer.

**Implemented:** canonical0012 reselects eligible completed unfinalised reservations indefinitely using least-attempted ordering; successful quarantined versions excluded even tombstoned. Existing claim fencing/intents before storage, historical immutable attempts/receipts, retries/default dry-run unchanged. New0013 private immutable scanner check and service-only evidenced finish;0014 additive staged/allowlist correction. Connected HTTP finish now retains actual missing/error or validated exact signed body/signature/engine/definitions/nonce/digest/size, backend observation time and upload/check UUID/hash in audit atomically. No raw check access even service. Legacy trusted finish can omit checks, no release path consumes it. Historical evidence not backfilled.

**Actual commands/results:**
- Fresh PostgreSQL17.9 initialized as nobody localhost55432 `/tmp/tv-pg`, followed by disposable reset and `TV_TEST_DATABASE_URL=postgres://nobody@127.0.0.1:55432/tv_test bun tests/backend/run.mjs`: metadata132, quarantine44, correction43, recurring21, scanner-evidence20 assertions passed; four boundary mutations killed. Real DB/audit transactions; Auth/storage contracts stubbed, external late writes/removes Set-simulated, signed scan evidence synthetic. Three repeated late-write sweeps, >100 completed/new/uncertain, simultaneous disjoint cleaners, audit/claim expiry/error receipts. Not hosted faults or real antivirus.
- After stopping that cluster, `runuser -u nobody -- env TV_LOCAL_PG_BIN=/nix/store/9jbbrp6la168fcj3rvbaq5r4kdy3qyvb-postgresql-17.9/bin PATH="$PATH" bash tests/backend/fresh-local.sh`: new cluster/schema all canonical migrations + same132/44/43/21/20 passed, stopped by trap. Bun1.4.4, PostgreSQL17.9 pinned, Python3.13.12. Existing dependency checkout used: clean install/clean clone itself **UNRUN**, no claimed clean-clone proof.
- `bunx vitest run src/lib/backend/scanner.test.ts src/lib/backend/file-validation.test.ts src/lib/backend/bounded-body.test.ts src/lib/demo/model.test.ts src/test/app-routing.test.tsx`: five files33 tests passed,12 scanner mocks,11 historical demo tests not backend security evidence.
- `python3 -m unittest discover -s services/scanner -p 'test_*.py'`:5 passed; transport/auth/digest/HMAC/error/stale/reload mocks, NOT real ClamAV. clamd/clamscan/freshclam/docker absent; actual engine/EICAR integration **UNRUN**. Official ClamAV docs linked in separate reference README; no host/engine configured.
- Fresh `bun tests/backend/provision.mjs` eight synthetic accounts with random temp0600 credentials; trusted query assigned fixture roles/disabled profile. `bun tests/backend/hosted.mjs`:46+HTTP passed including real global-signout replay denial. `bun tests/backend/quarantine-hosted.mjs`:87 passed, actual missing scanner/no bytes. `bun tests/backend/quarantine-corrections-hosted.mjs`:56 passed, attributed malformed/swap denials and actual synthetic removal receipts.
- `bun tests/backend/recurring-hosted.mjs`:10 passed. Absent remove→historical success→actual synthetic late upload→due candidate/claim→redelete→new receipt and immutable old replay; raw check denied; audit hash present. Wait loop uses scheduling defer, never external-write bound. Separate trusted database read confirms current version missing/check time/request IDs/hash_audited=true/parent_bound=true/quarantine_state=quarantined. No permissions widened.
- Synthetic cleanup: `NODE_PATH=/dev-server/node_modules bun /tmp/browser/current/cleanup.cjs`: both drafts tombstoned,5 accounts removed/3 Auth-banned; trusted query deactivated all8 profiles. Successful quarantined versions/bytes/audit retained; only synthetic failed late-writer keys removed, no successful retention purge or real-user deletion. Other batch claims have no side effects and expire normally.
- Managed build/type log inspected: build OK09:11:06 UTC. No manual build/type, publication or new visual-browser pass. Central connected flow verified authenticated real HTTP upload→version/readback/audit and closed delivery, not signed-out/demo-only.

**Specific AI defects/fixes:** initial0013 inspected staged ticket as reserved, fencing it, and had an extra-field branch; observed in source and corrected by new0014 before connected tests, no history rewrite. SQL test double-encoded JSON param: changed to postgres JSON helper; final evidence tests passed. Python error mock omitted third VERSION reply: fixture corrected (no fake pass). Hosted raw private-check read expected success but correctly42501: test fixed to assert deny and inspect audit hash; actual record independently read via trusted database tool. No GRANT bypass added.

**Saved observed functional ref:** `02ad4e33b00784ad2560669c6a18e23971102279` read-only after tested code/API/threat changes; subsequent evidence docs are platform-managed amendments. Read HEAD at next continuation; not a fabricated self-covering final hash.

**Remaining:** real approved ClamAV/HTTPS/shared secret/definitions validation (not provisioned), structural validators, independently challenged coordinator ownership/fencing/direct-RPC+identity disable/emission tests, actual independently administered immutable sink, audit adapter/verifier fork/truncation/replay tests, clean dependency install/reviewed seed/demo recording, published adversarial/load. Design-only ADR/demo script added; audit checkpoint adapter deferred behind completed priorities. Every content route remains closed even clean. No Lovable scheduler configured; parent schedule external.

## Signed checkpoint and saved-source dependency rehearsal —2026-11-01 America/Chicago
Input saved ref `bf406a26fa1cdeee61e6be4d11916460897e7c02`; actual UTC clock checked12:37:16. Parent reports Q01/Q02/Q03 CLOSED **code-level**, not test reruns. No new severe scanner/reference defect reported; real engineEICAR UNRUN and bridge/legacy finish trust unchanged.

**Implemented/applied:** canonical0015 service-only no-arg snapshot under existing ledger mutex, private stable DB-generated chain/deployment IDs/counter, required v2 observation audit, exact bigint-safe string head/counter and trusted request UUID. Raw state denied even service role; no raw log export/HTTP endpoint. Managed schema/RPC/privilege presence read back. Separate operator-local format/signer/pinned offline verifier/guarded mutable file-test retention/integrated explicit test export outside app import graph; production export disabled. No key in source/DB/client/log, ephemeral test keys0600/tmp only. No external independent evidence or WORM claim. See checkpoint ADR exact trust/sequence/suffix/fork/concurrency limits.

**Actual commands/results:**
- `runuser -u nobody -- env -i PATH=/usr/bin:/bin TV_LOCAL_PG_BIN=/nix/store/9jbbrp6la168fcj3rvbaq5r4kdy3qyvb-postgresql-17.9/bin bash tests/backend/fresh-local.sh`:132 metadata+44 quarantine+43 correction+21 recurring+20 scanner evidence+13 checkpoint =273 real PG assertions, four existing authorization mutations killed. Actual migrations/transactions; Auth/storage contract stubs and external storage simulation/signed scanner fixtures, NOT hosted engine/storage-fault proof. Snapshot committed evidence/counters/gaps/concurrency/raw denials/audit outage rollback checked.
- `node --test tools/audit-checkpoints/checkpoints.test.mjs`: final17 tests passed; independent signing/event attack fixtures plus actual verifier source mutation removing signature decision killed wrong-key negative regression. Full-prefix altered/inserted/reordered/deleted/truncated/alternate-chain attacks, replay/rollback/fork/rotation/wrong chain/key, gaps>2^53, zero head/suffix, forged predecessor, Linux directory replacement and explicit integrated file-test export covered. No production key/sink provision.
- `bunx vitest run src/lib/backend/bounded-body.test.ts src/lib/backend/file-validation.test.ts src/lib/backend/scanner.test.ts src/test/app-routing.test.tsx`:4 files22 passed (12 scanner mocks/6 shallow file validation/3 body bounds/1 routing; legacy demo tests excluded).
- `python3 -m unittest discover -s services/scanner -p 'test_*.py'`:5 mocked contracts passed; real engine/EICAR still UNRUN/unprovisioned.
- Temporary head-only script then retained `bun tests/backend/checkpoint-hosted.mjs`: each6 assertions passed; final committed observations request IDs4c655773-96b0-4c24-bd89-ef0f8284b35d and21b5e6f5-2d8e-4a1d-88f9-0cde00a7cf38. Subsequent trusted read confirmed sequences724/725, counter3/4, service NULL actor/session, hash_valid/identity_bound true. Two earlier observations722/723 retained too. No accounts/storage/content deleted, no hosted faults or raw ledger export; audit retained. Existing hosted46/87/56/10 suites NOT rerun in this increment.
- `TV_LOCAL_PG_BIN=/nix/store/9jbbrp6la168fcj3rvbaq5r4kdy3qyvb-postgresql-17.9/bin python3 tools/rehearse-saved-source.py`: successful saved `71b570893497197a3283b9b1bb80c231ec102a56` source archive copy under `/tmp/trustvault-source-rehearsal-pbk4k5_b`. Excluded .git/dependencies/generated output/real .env/temp credentials; retained secret-free .env.example. Non-root nobody, `env -i`, empty private HOME, Bun1.4.4 frozenlock install545 packages; Node22.23.4 checkpoint17 passed; Vitest22 passed; new PG17.9 cluster full273/four mutations passed and stopped by trap. Actual source-copy install/setup rehearsal, **not public Git clone** (GitHub paused). Earlier saved5bdbc54e36efc7ff22c6bd4f23e8a62d7578e59a temporary script rehearsal also passed. No managed env credentials forwarded.
- Managed preview build log build OK12:42:38 UTC. No manual build/typecheck (harness restriction), new browser or published Worker test. Every content route head inspected and existing unique metadata preserved. No UI changes.

**Observed AI defects/fixes:** first toy counterfactual mutation inadequate; replaced with loaded real verifier source mutation and independently signed wrong-key assertion. Read-only challenger found unauthenticated signer predecessor and pathname TOCTOU: signer now authenticates separately pinned retained predecessor; sink anchors writes to held Linux directory descriptor, validates owned0700 and lock inode, raw retention requires active capability; attack regressions passed. Rotation retains old public key/window for historic predecessor, explicit test. Signature base64 canonicalization added to eliminate alternative encoding checkpoint hashes. One multi-file documentation patch failed on partial README line; no changes applied, corrected using exact known file content. No failed result reported as success or new external reviewer closure inferred.

**Limits/next:** actual independent immutable sink/key/retention+CAS/latest-state recovery operator gated; DB IDs/counter and observation clock editable, signer/runtime compromised can fabricate; unanchored suffix/remapped intermediate sequence labels and hidden branches cannot be proven absent. Cross-sink exporters not globally serialized; local lock not distributed protocol. Real scanner engine/TLS/definitions, structural validators, coordinator directRPC/identity+egress fence/order tests, deployed attacks/load and recording remain UNRUN/gated. No external confidential transfer, byte delivery, paid provisioning, GitHub/publication or Lovable-configured scheduler. Final observed saved ref read separately after documentation; source rehearsed ref above is precise, not self-covering report hash.

## 2026-11-01 (America/Chicago) — HIGH checkpoint consistency correction (from e3a50330dae4155875cd8325a4e508c3a34f4658)

**Defect (found by parent monitor, independently reproduced by primary with synthetic ephemeral Ed25519 keys):** signSnapshot accepted head growth on monotonic counter/sequence plus a valid previous-checkpoint pointer, and verifyAnchoredLog only checked that the NEW head appeared in the supplied log. A signed successor over an entirely different ZERO-rooted ledger (events 2,3) that excluded the independently retained prior head (event 1) was signed and verified as anchoredThrough '3'. The earlier alternate-chain test compared a changed log only against the OLD checkpoint, so it missed a validly signed successor with a changed higher prefix.

**Correction:** verifier.mjs: new verifyPrefix (bounded, ZERO-rooted, strict order, exact hash chain) and locateHead; verifyAnchoredLog now requires the current head AND the retained previous checkpoint head (plus any optional extra retained anchors) to be present, by sequence and hash, in the SAME verified prefix, at or before the current head; zero head explicit. signer.mjs: head growth and genesis require an operator-supplied untrusted prefix that verifies, ends exactly at the snapshot head, and contains the retained prior head; missing/malformed/truncated/divergent proof fails closed; genesis requires the explicit 'explicit-pinned-genesis-ceremony' flag; same head has hash-equality-only semantics. export-test.mjs: requires the prefix, signs, then re-verifies the candidate against the prefix and retained predecessor under the held sink lock BEFORE any write; rejected proofs leave the mutable test sink empty.

**Tests:** tools/audit-checkpoints/ancestry.test.mjs (7 tests, independent node:crypto fixture signer): parent repro rejected; signer refuses missing/divergent/truncated/non-rooted/wrong-end/tampered/null/oversize/leading-zero proofs; legitimate PG-gap extension to 9007199254740993; multiple anchors incl. foreign and beyond-head anchors; zero head, explicit genesis, same head; rotation; export leaves sink unwritten; removed-ancestry source mutation reproduces the defect (anchoredThrough '3') and is killed. Existing wrong-signature mutation still killed.

**Actual results:** `node --test tools/audit-checkpoints/checkpoints.test.mjs tools/audit-checkpoints/ancestry.test.mjs`: 24 tests, 24 pass, 0 fail (17 prior + 7 new). Not rerun this correction: PostgreSQL suite (no SQL/migration/DB code changed; prior reported 273 assertions), hosted checks, Vitest, scanner mocks. Saved-source rehearsal: see BACKEND_STATUS (checkpoint+Vitest passed; PG step refused, pinned 17.9 unavailable).

**Limits:** Sequence labels are not inside canonical hashed bytes; only order is checked, so remapped intermediate labels are not proven. Ancestry is proven only relative to independently retained checkpoints the operator supplies; the database snapshot RPC stays head-only and no raw log export/arbitrary SQL was added. No production independent anchor or retention-locked sink is configured, so the existing ledger is NOT externally protected. Independent review of this correction is pending.

Prior reported figures (273 PG assertions, 17 checkpoint tests, 22 unit checks) are historical and were not re-verified here. No migration, app permission, service head scope, content gate, publication or GitHub change.

Saved-source rehearsal of `1560eb9e5edc38fad977f2ef39a63630b65096c8` (2026-11-01, run after the correction was saved): `TV_LOCAL_PG_BIN=<nix postgresql-17.11>/bin python3 tools/rehearse-saved-source.py` → frozen install 545 packages; checkpoint 24/24 pass (incl. ancestry.test.mjs); Vitest 22/22 pass; then `fresh-local.sh` correctly REFUSED with "PostgreSQL 17.9 required" because the pinned 17.9 build is no longer present in this sandbox. The fresh PostgreSQL suite was therefore UNRUN for this correction (no SQL/DB code changed). Overall rehearsal exit status 1 — not a full pass.
