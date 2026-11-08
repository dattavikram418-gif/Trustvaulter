# TrustVault final operator handoff — current state

## Docs-only evidence amendment — 2026-11-04 UTC (reviewed ref `cf8c0816691136498be2cee61817758d594c001b`)

- **Code-review closure:** independent plan_monitor CLOSED A01/A02/A03 at code-review level. The parent verified that the diff from clean-rehearsed functional `16268db6286063c7edfc1bac5139496e9b88d78c` to `cf8c081` is documentation only, so the exact functional source is covered by the author-run overlay-free rehearsal. No independent full-suite rerun happened.
- **A01 rounding hypothesis corrected:** before 0018, the primary independently ran a READ-ONLY hosted helper SELECT using `jsonb_populate_record(NULL::audit_events, …)` with a synthetic grant/allowed/v2 row (synthetic recipient UUID, prior 1.2, new 2.2). Actual output: SQLSTATE 22P02 `invalid input syntax for type bigint: "1.2"` inside `tv_admin_change`. `text::bigint` rejects fractions; it did not round. The real defect was a query exception with no unavailable result, not fabricated rounded values. The monitor retracted its initial rounding claim. The earlier "rounded" wording in prompts and the author's notes is kept as history and marked here as an AI-review error.
- **Post-0018 hosted helper proof (independent, narrow):** the primary ran READ-ONLY pure-helper cases on synthetic composite values: valid grant, fractional, overflow (max+1), maximum valid pair (9223372036854775806→9223372036854775807), negative, scalar, array, JSON null, string revision, boolean permission. 10/10 gave the correct recorded value or NULL/unavailable, and the max case returned `9223372036854775807`. This is not auth/RPC/HTTP/UI/scanner/security certification and is separate from the author's 16 hosted RPC checks. No real ledger rows were read or modified by these probes. The parent also re-read the actual 0018 SQL and the exact-string UI/types with the monitor. No parent role-privilege probe result was supplied, so none is recorded.
- **Pipeline:** the parent's 4 independent pipeline checks at `e7e56b80` still apply; the core pipeline is unchanged since.
- **Author counts (ref `16268db`, from the RESULT lines):** current schema 13+132+98+108 = 351; historical pre-0016 44+43+21+20 = 128; 479 assertions in total. 458 PASS lines is a separate count, not the assertion total.
- **Not done:** real authenticated admin UI/HTTP browser proof.
- **Release still blocked by:** a fenced runtime gateway, a real scanner, an independent audit sink, and attacks against a public deployment.
- **Next operator choice:** provide an existing controlled hosting/runtime target for the real gateway and scanner, plus an independent retention account/sink. Engineering implementation and integration are still required after that; this is not only a matter of adding secrets. Background automation stays disabled and no jobs are started or scheduled.


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

### Deliverable checklist (8 pending gates)
1. [~] Upload admission/concurrency: source review GO; current-schema PG, pinned-17.11 rehearsal and hosted synthetic 26/26 done. Awaiting independent rerun of the verification pass.
2. [ ] Real malware scanner provisioned: needs an operator host, TLS, HMAC key in secure config and a confidential-handling approval.
3. [ ] Authoritative fenced egress/revoke coordinator: engineering work (see ADR_CONTENT_GATEWAY).
4. [ ] Independently administered retention-locked audit sink with protected latest state: operator configuration.
5. [ ] PDF/JPEG structural validation: refused today; only an offline PNG reference exists.
6. [ ] Deployed adversarial/load testing: engineering work plus a deployment.
7. [~] Clean-source rehearsal: passed on the pinned 17.11 worktree copy; a public Git clone is still unrun because GitHub is paused.
8. [ ] Demo recording and seed accounts: the script exists; no video has been recorded and no credentials have been issued.

**Next action:** independent rerun of the gate-1 verification; then resolve the gateway runtime authority and the admin permission investigation. Credentials alone do not close the remaining gates.


2026-11-01 America/Chicago (actual UTC checks2026-11-02 01:10–01:16). Last planned bounded increment; background window ends2026-11-02T05:37:46Z. No indefinite work/job configured. GitHub/publication/paid provisioning paused; all byte delivery disabled.

## Revision and independently reviewed evidence
- Input reviewed ref: `a197bc40e6b492c51825ff72e7f87822ca5805ec`.
- Final functional saved source actually rehearsed: `d070a7bf10a9b0b676c19ae8c765a01ab4253a18`. Reporting-only changes follow; final observed ref is reported separately, never fabricated as a self-covering hash.
- Q01/Q02/Q03 CLOSED code-level by parent; their PG/hosted tests remain implementation-reported.
- **C01 CLOSED code-level by independent plan_monitor.** Primary independently fetched exact saved checkpoint signer/verifier/format/export/sink/tests and reran24/24 including both real source mutants, as supplied in current prompt. No independent PG/hosted rerun; historical273 PG remains historical.
- Current implementation tests: checkpoint24/24; admission4/4 incl. actual retained-chunks/repeated-race/fragment mutants and GC-enabled collection; Vitest27/27 (12 scanner mocks,6 shallow prefilter cases,8 stream/body tests,1 route test); offline structure7/7 including real Pillow subprocess and trailing mutant; scanner protocol5/5 mocks. Exact commands in BACKEND_STATUS.
- Frozen Bun1.4.4 saved-source install545 packages, Node22.23.4 checkpoint/admission and Vitest passed under nobody/empty child environment. **Overall rehearsal exit1:** exact PostgreSQL17.9 absent,17.11 explicitly refused (fresh-local exit2). No local PG or hosted suite rerun, no silent version substitution. Saved-copy Python7+5 also passed using existing system Pillow12.1.1, not fresh Python dependency bootstrap.

## Completed bounded capability
Canonical migrations0000–0015/auditv1-v2 unchanged. Provisioned live identity/DB authorization; metadata/Read-Edit/owner-only ACL/tombstones; unreadable digest-bound quarantine; recurring service-only claimed cleanup with historical receipts; private signed scanner evidence boundary (real service missing); fixed service-only head snapshot and isolated pinned checkpoint test tooling. No public raw log export or storage read.

Final correction: byte-bounded readers previously retained every transport chunk and had no fragment/deadline bound. One capped buffer, upload10MiB/65536 fragments/30s and JSON4096 fragments/10s now apply. An initial AI repeated-race fix retained deadline reactions; actual GC regression failed, single whole-task race corrected it and source mutant is killed. Actual provider admission/aggregate concurrency remains unverified.

Optional offline maintained Pillow reference supports only static8 PNG with bounded framing/CRC/expansion and full decode. PDF/JPEG explicitly unsupported for exact-consumption/expansion; TXT absent. Existing connected PDF/PNG/JPEG/TXT quarantine contract is unchanged, **not** structural-pass certified. Local evidence binds exact digest/size/media/parent/version/policy but UUID labels are operator supplied, not ACL-verified or persisted. No parser service/evidence migration or release switch.

## Engineering work still required (not merely credentials)
1. **Fenced content gateway implementation and independent protocol review:** current RPCauthorize→Workerfetch/emission is TOCTOU. Implement single authoritative mutation/identity/egress coordinator with externally enforceable fencing, restart/multi-replica/direct-RPC revoke/delete/grant/session-disable authority and durable audit ordering, bounded enqueue and documented already-queued-buffer exclusion. No direct DB mutation bypass. Design-only ADR is not implementation. Deterministic all-method/version/range/preview mid-transfer tests required before any emission.
2. **Approved scanner real-engine integration:** reference transport exists but actual ClamAV/definitions/EICAR/benign/stale/missing/error/timeouts/concurrency/TLS tests UNRUN. Harden/pin isolated engine and supervision, then exercise real signed result binding. Every verdict still quarantined until all other gates pass.
3. **Structural capability integration:** independently review narrow PNG containment; develop defensible PDF/JPEG whole-file/dimension/aggregate-expansion capability or documented narrower product contract with explicit user-visible refusal. No homemade PDF parser, no false safe verdict. Reviewed server-only ingestion must bind trusted reservation/parent/version/digest/size and atomic audit if integrated; offline result is not that boundary.
4. **Production independent checkpoint export/retention protocol:** mutable file-test sink is not WORM/independent protection. Implement separately administered retention receipt/readback/CAS predecessor acceptance, protected latest-state, one signing/retention authority, crash/fork/recovery/rotation and malicious-sink tests. C01 closure does not implement this.
5. **Deployed adversarial/operational testing:** published runtime/auth/HTTP/storage attacks, rate/admission/load, full mutation/fault campaign, sustained cleanup and all delivery-order paths. No publication is authorized now. Existing safe hosted backend evidence does not cover published runtime.
6. **Reproduction/submission:** rerun exact PostgreSQL17.9 disposable suite; fresh pinned Python validator install/security build record; approved synthetic seed accounts and clean-source setup. Demo script exists; actual video and usable seed credentials absent. No public Git clone (GitHub paused).

## Precise operator requirements
- Scanner: independently approved owned isolated host/container with maintained pinned ClamAV and current definition updates, no public clamd, limited noexec/quota scratch/no app mounts/no execution; reviewed supervision/time/CPU/memory/threads; authenticated HTTPS endpoint with verified TLS and no redirects; confidentiality/retention/deletion/no logging approval before any confidential transfer; private random HMAC secret securely configured on host and Project Settings → Secrets along with approved URL/marker. No invented endpoint/key or paid service provisioning.
- Coordinator: approved runtime that supports one fenced authority for **all** byte enqueue and relevant mutations/identity disable, persistent crash/restart fencing and multi-replica exclusion. Engineering protocol/tests above must first prove ordering; credentials or flags do not suffice.
- Audit: separately administered retention-locked external sink/account, verified retention period/readback/receipt and CAS protocol; independently pinned chain/system/genesis/public keys, protected signing-key custody/rotation/counter windows; protected last accepted checkpoint backup/recovery independent of tested DB and mutable sink. No production anchor configured; existing ledger is **not externally protected**.
- Tests: supply exact PostgreSQL17.9 distribution on approved disposable local host, then `TV_LOCAL_PG_BIN=/absolute/pinned/17.9/bin python3 tools/rehearse-saved-source.py`. Never relax version check or target hosted production for fault injection. Approve synthetic accounts privately for later hosted tests/video; no working credentials supplied.

## Precise next action
Independent review of final admission/PNG changes, then exact17.9 saved-source rehearsal on approved disposable host. Continue gateway/scanner/retention engineering only under a separately bounded authorization; configure real hosts/keys/sink only after operator approval. No remaining action runs after this turn, and no deadline promises completion. See SUBMISSION_CHECKLIST fail gates, API endpoint role matrix, THREATS test map, and truthful PROMPTS history.


## 2026-11-04 — after admin investigation (0017)
Done (author evidence): admin permission-change investigation; overlay-free exact-ref rehearsal at `a6bd5d5`. Pending: independent review of 0017.
Still blocked, needs engineering and operator work:
- **Runtime / gateway:** we need a single egress coordinator with fencing that owns every byte emission and serializes it against revoke, delete, new versions, session revocation and account disable, including direct RPC. The current Nitro/Cloudflare fetch runtime cannot provide one. We also need crash and replica fencing, and deterministic mid-transfer revocation tests on every route. Delivery stays off.
- **Scanner:** a provisioned, self-hosted engine (for example ClamAV) on an approved private host with TLS and pinned identity, an authenticated, signed and nonce-bound verdict, and a confidential-handling agreement. Real EICAR integration is UNRUN.
- **Independent audit sink:** an externally administered, append-only or WORM retention store with its own pinned verifier key, a protected latest-head state outside this database, and an operator signing ceremony. Today the hash chain is unanchored, and the DBA can rewrite it.
- **Deployed adversarial testing:** against a published deployment over HTTP. Not run, because publication is paused.


## 2026-11-04 — after 0018
A01/A02/A03 corrected at `16268db`. Pending: independent review. Blockers are unchanged: fenced egress runtime, provisioned scanner, independent audit sink, deployed attacks.
