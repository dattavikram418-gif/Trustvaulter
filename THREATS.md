# TrustVault phase-one threat register

## Current lead — final non-delivery hardening, 2026-11-01 America/Chicago

C01 CLOSED code-level by independent plan_monitor; primary independently retrieved exact saved checkpoint sources/tests and reran 24/24 incl. both source mutants, per current user evidence at `a197bc40e6b492c51825ff72e7f87822ca5805ec`. No independent PG/hosted rerun; historical273 PG remains historical. Later pending-C01 wording is historical. No real external anchor exists.

| Threat | Mitigation / code | Actual test map | Residual / gate |
|---|---|---|---|
| Tiny/empty fragments amplify retained objects; stalled reads/cancel hold admission | `bounded-stream.ts`: one capped buffer, fragment limit, single total-deadline race, nonblocking best-effort cancel; both `fileBody`/`boundedBody` use it | `bounded-stream.test.ts` exact/deadline/empty/cancel; `admission-mutation.test.mjs` real restored-retention and removed-fragment mutants, GC-enabled consumed-chunk collection, repeated-deadline-race mutant | Authenticated/local stream attack reproduced; actual provider chunking/admission/concurrency behavior UNRUN; upstream buffers/native allocations not capped by this module |
| AI fix repeated Promise.race against pending deadline retains a reaction per chunk | Race whole consume task once; cancel on expiry | GC test initially failed actual first implementation; single race passed and real reintroduced repeated-race mutant killed | Timer scheduling not a hard CPU-preemption guarantee; hosting deadline can precede committed audit |
| Marker-valid malformed/truncated/expanded PNG or appended payload | Offline maintained Pillow verify+full load, strict framing/CRC/EOF/limited zlib expansion/static8-only profile | `services/structure/test_reference.py`: real child/decoder, CRC/truncation/duplicate-IEND/polyglot/trailing/deflate tail/dimension/metadata fixtures, real removed-trailing-guard mutant | Offline only, not hooked into app; narrow profile excludes metadata/palette/interlace; mocks for timeout/missing dependency, no production sandbox proof; no universal polyglot/AV safety claim |
| PDF/JPEG falsely declared fully validated | Explicit unsupported capability until exact-consumption/expansion contract is reviewed; no homemade PDF parser | Valid JPEG and marker-PDF unsupported regression; upstream qpdf/Pillow behavior documented | Connected prefilter still accepts unreadable quarantined bytes, structural processing remains engineering work; no delivery flag |
| Offline evidence mistaken for authorization or signed scanner result | Exact digest/size/media/parent/version/policy binding, offline-untrusted labels, no evidence ingestion/DB churn | Real isolated binding assertion; existing scanner schema unchanged | Operator-supplied UUIDs not authorized; any future integration needs reviewed private authenticated evidence boundary |

All historical threat rows below describe their recorded increment, not today's absent/present capability. Current release gates and precise next actions: REMAINING_WORK. Every byte path remains closed.

2026-10-31 America/Chicago. Not a certification. See `docs/BACKEND_STATUS.md` for evidence.

| Threat | Mitigation | Code | Test | Residual |
|---|---|---|---|---|
| IDOR / hidden metadata | Owner or explicit Read/Edit; tombstones denied; same authenticated 404 | `tv_operation`, migration 0000 | local owner A/B, ungranted/admin detail/edit/delete/list; hosted RPC + HTTP | Published Worker adversarial testing not run |
| Client role/actor/owner injection | DB actor from verified gateway claims; roles in locked table; parameter allowlists; immutable owner trigger | 0000, 0002 | local/hosted mass assignment; default viewer trigger | DBA can change roles; bootstrap is trusted maintenance |
| Raw Data API bypass | No raw anon/authenticated table privileges; RLS with no policies; authenticated-only audited definer RPC | 0000, 0002 | 48 local privilege assertions, rejected SELECT, hosted raw reads and direct RPC | Postgres owner/runtime remains trusted |
| Revoked/disabled session replay | Live `auth.sessions` row + `not_after`, JWT expiry, identity banned/deleted/anonymous status, active profile and role; row share locks | `tv_operation` | local removed session/profile disable; hosted real Auth global signout with old JWT + HTTP 401 | Token theft before revoke; Auth schema compatibility; DB outage fails closed |
| Revoke/update race | Global transaction advisory mutex plus document UPDATE lock and required revision; no positive ACL cache | `tv_operation` | local simultaneous updates return 200/409; hosted replay after revoke 404 | Global lock limits throughput; committed responses already in flight cannot be recalled; no file streaming yet |
| Read→Edit / Edit→share/delete | Explicit per-action decision; owner-only grants/activity/delete | `tv_operation` | local and hosted action matrix | Only one targeted authorization mutation exercised |
| Admin inventory leak | Minimal security events only; no implicit ordinary metadata/grants access | `admin_activity`, `SecurityActivity.tsx` | hosted admin IDOR and event projection | UUID/time/action correlation is intentionally visible to admin |
| Admin permission investigation over-disclosure / inferred history | Fixed allowlisted projection from validated v2 allowed grant/revoke changes only; legacy/denied => unavailable; server filters + sequence cursor; audited observation, fail-closed | 0017 `tv_admin_events`, `tv_admin_change`, `SecurityActivity.tsx` | `admin-events-db.mjs` (41 assertions, removed-admin-check and legacy-version mutants killed); `admin-hosted.mjs` 12 checks | Admin sees recipient UUIDs and permission transitions by design; DBA can still alter audit rows (chain unanchored) |
| A01 malformed history fabricated as recorded / query abort | Sequential plpgsql validator: object+exact keys+types before casts; canonical integer text; bigint bound | 0018 `tv_admin_change` | `admin-events-db.mjs` A01 fixtures (17 appended + 4 direct); integer-check mutant killed | Validator trusts that v2 rows were written by the server. Correction 2026-11-04: before 0018 the actual failure was SQLSTATE 22P02 (query exception), not rounding; the initial rounding claim was an AI-review error. Code-review CLOSED; independent post-0018 hosted helper 10/10 (synthetic, READ-ONLY) |
| A02 bigint precision loss in cursor | Decimal-string in/out, regex+bound before cast | 0018 `tv_admin_events`, `SecurityActivity.tsx` | >2^53 gapped sequence walk, 13 bad cursors; numeric-output and cursor-check mutants killed | `admin_activity` still emits numbers |
| A03 unbounded admin payload / identity misattribution | 16384-byte bound, typed ≤40-char fields; guarded claims + `tv_bridge_identity`; `tv_operation` auth.uid() guarded | 0018 | 19 invalid payloads, 9 identity cases; attribution mutant killed | Not network admission control; PostgREST/body limits are upstream |
| Audit rollback / forgery | Return denial envelope, don't raise after audit; mutation+audit one transaction; required append failure aborts; serialized SHA-256 chain, no raw inserts | `tv_append_audit`, 0002 | local durable denial, forced insert failure rollback, chain, append-only UPDATE | Unanchored; DBA/function owner can replace code/history; no external retention/checkpoint |
| Missing authentication-denial log | Fixed service-only failure RPC, no claimed actor/token stored | HTTP metadata handler, migration 0001 | HTTP disabled/revoked response checks | Gateway rejection before RPC isn't in app audit; invalid tokens cannot be attributed reliably; rate limiting pending |
| Parameter/body abuse | Allowlist, scalar types, DB size bound, pagination/date bounds; streaming HTTP byte limit | 0002, `bounded-body.ts` | local malformed filters; unit 16384-byte limits | Provider gateway body limits/rate limits not reviewed; broad exception handling gives generic errors |
| File malware / byte disclosure | No bucket, byte endpoint, content path or upload; disabled controls | Metadata screens / schema | browser disabled download and upload | Scanner, sniffing, quarantine pipeline and synchronized streaming revocation not implemented |
| Audit proof overstated | Explicit unanchored/DBA trust labels | UI + documentation | manual browser inspection | Independent audit integrity verification not implemented |
| Authorization defect survives tests | Remove detail ACL decision in isolated DB; negative assertion must fail; restore definition | `tests/backend/run.mjs` | mutation killed | Not a full mutation campaign or formal verification |

Security owner review remains pending. No external AI calls, bearer links or public storage are implemented.

## Independent monitor correction — 2026-10-31 America/Chicago

| Threat / exact defect | Mitigation | Code | Actual tests | Residual |
|---|---|---|---|---|
| HIGH: shared grant/revoke active-target validation blocked removal from disabled profile; reenable resurrected grant | Split grant validity from revoke; owner/session/revision/locks unchanged; revoke absent recipient idempotent, owner target rejected | ordered migration `0005_trustvault_revoke_and_audit_v2.sql` | PG disable→revoke→reenable same session detail/edit 404; banned/deleted/idempotent revoke; nonowner generic denial; hosted same sequence | Recipient metadata maintenance still trusted; response already committed/in flight cannot be recalled |
| Audit lacked recipient, before/after permission/revision, verified session and correlation | Version-2 canonical includes DB-generated operation UUID, verified live session and lock-captured structured permission changes; HTTP forwards UUID; no caller audit fields | 0005; metadata handler; audit verifier | PG reconstruction, per-RPC durable correlation, rejected caller fields, verified/NULL session assertions; hosted canonical reconstruction and HTTP header/body/denial readback | Legacy evidence cannot be retroactively enriched; session IDs are identifiers, never credentials; DBA/runtime trusted |
| Audit upgrade breaks legacy chain or new fields not hash-bound | Keep v1 canonical bytes and chain algorithm; append v2 objects with new fields included atomically | 0005; `tests/backend/audit-verifier.mjs` | Pre-upgrade legacy append followed by real migration; mixed-version verification; altered-session rejection; hosted chain recomputation and structured field checks | Unanchored, no external independent checkpoint/retention |
| New projection leaks grant/session details to admin | Explicit admin allowlist only adds request UUID; owner-only activity includes structured evidence | 0005; owner event details UI | PG/hosted exact admin key assertions, viewer activity denial | Minimal ID/time/action/request correlation intentionally visible; no titles or raw reasons exposed |
## Quarantine increment — 2026-11-01 America/Chicago

Supersedes the historical no-file-storage mitigation, not its release limitations.

| Threat | Mitigation / code | Actual evidence | Residual |
|---|---|---|---|
| Raw cross-user object/bytea access | Private bucket, restrictive deny policy; no bytea; raw tables revoked; 0006 | Hosted denial using an actually stored object for owner/B/Read/Edit/admin/ungranted/disabled/revoked/anon and public URL; list/write denied | Trusted storage credential/operator bypass remains |
| Stage/finalise swap, wrong parent, stale grant | Server caller/session + opaque ticket parent/digest/size/type/name; DB live ACL/revision on inspect/stage/finish, shared revoke mutex; 0006/0008 | Local/hosted actor swap and direct revoke-before-finish denied, local hash swap/replay/audit rollback | Buffered upload can race after preflight but no reachable bytes; parallel storage writes nontransactional |
| Malware/active format/polyglot | 10 MB bound, extension/type/markers, detected unsafe formats; approved signed scanner adapter; unconditional quarantine | Unit size/type/markers/bad samples; real HTTP bad files rejected; real scanner missing | Shallow sniffing, not structural parser assurance; no real malicious-file scan proof |
| Scanner forgery | HTTPS, no redirects, server secret, signed result bound to digest/size/nonce, timeout and response bound | Five mock unit tests; not real provider | Verdict only persisted; scanner engine/signature evidence retention unimplemented; operator service trusted |
| Partial storage/audit failure/orphans | Durable staged opaque key before write; required audit failure rolls back versions/revision; failed/expired candidates and idempotent trusted remover | Local forced audit rollback; hosted reconciliation 14 removals succeeded | No scheduled cleanup, no combined audit+storage-failure simulation; retries/retention operationally required |
| Content revocation TOCTOU | No content emission on any implemented route, even clean | Local/HTTP owner read 423 and unauthorized 404; no byte response routes | Gateway and deterministic mid-transfer tests are **not implemented**; direct RPC revoke must order with emission, already-emitted buffers unrecoverable |
| New authorization mutation survives | Remove upload ACL helper decision in disposable DB | Negative ungranted reserve assertion kills mutation; original restored | Not exhaustive mutation/parallel-path campaign |

No delivery/promotion, public bucket, signed read URL, paid resource or widened sharing added. Existing metadata admin restriction and disabled-target revoke remain tested.

## Monitor Q01–Q03 correction — 2026-11-01 America/Chicago

| Finding / threat | Correction | Actual test evidence | Residual |
|---|---|---|---|
| Q01 malformed JSON null caused unaudited 503; explicit payload null coerced | Normalize unknown before indexing, preserve explicit null, audited 400/413 with trusted UUID | Real HTTP null/scalars/arrays/malformed/2049-byte envelopes followed by committed identity/correlation readback | Required audit outage fails 503; provider pre-handler failures separate |
| Q02 mismatch erased verified requester audit identity | 0010 independent live bridge identity before ticket lookup; requester actor/session on denial, no target details | Real PG/HTTP cross-user, other live owner session, unknown ticket, missing/revoked identity; unchanged ticket; binding mutation killed | Service-only runtime is trusted to pass Auth-derived identity; no client bridge privilege |
| Q03 old completed candidates starved later keys; no side-effect receipts | 0010 fixed bounded claim/intent before deletion, atomic receipt/completion afterward, defer errors, expire claims; dry-run CLI | Real PG >100, disjoint concurrent claims, completed prefix, retry/crash, receipt/audit+simulated storage failure; real hosted synthetic intent→API remove→receipt readback | Storage not transactional; late writes can outlive removal, API success not existence/permanent-absence proof; operational inventory/quiescence review pending |
| Scanner response forgery/replay/timeout | Existing signed bounded adapter, no clean promotion | Mock signature/digest/nonce mismatch, prior response replay, 4097-byte bound and abort timer | Real scanner unprovisioned; only verdict persisted, signed identity evidence remains blocker |

Independent monitor closure remains pending until parent confirms. All content paths stay closed; no gateway or release toggle.

## Recurring cleanup and evidence — 2026-11-01 America/Chicago
Parent CLOSED Q01/Q02/Q03 code-level at12:36 UTC continuation; tests remain implementation-reported, not monitor reruns. Historical pending text is superseded.

| Threat | Mitigation/code | Actual test map | Residual |
|---|---|---|---|
| Completed removal excludes arbitrarily late external write forever | 0012 retains recurring eligible failed/expired unfinalised opaque keys, least-attempted fairness, same claimed intent-before-remove and fresh receipts | `recurring-cleanup-db.mjs`: paused writer absent removal→success→resume→three sweeps; >100 completed/new/uncertain, simultaneous workers/audit failures, terminal-exclusion mutation killed; `recurring-hosted.mjs`: actual synthetic late upload/remove/new receipt | Needs continued approved sweeps; no permanent absence, bounded delay under unbounded arrivals or DB/storage atomicity; no cron |
| Tombstone mistakenly authorizes successful-version purge | Candidate anti-join and version_id exclusion independent of tombstone | scanner-evidence-db tombstoned successful versions excluded | Retention policy intentionally absent; no real-user content deleted |
| Signed scanner identity lost or evidence swapped | 0013/0014 fixed service-only evidenced finish, immutable private bounded signed body/signature + version/reservation/digest/nonce/engine/definition/time/linkage, hash audited atomically | scanner-evidence-db raw denial/swap/extra/null/oversize/hash/audit rollback; scanner mocks exact HMAC retained; hosted missing check DB readback | Trusted shared-secret bridge/runtime can forge; historical trusted finish omits evidence, no independent signature or release-grade scanner claim |
| Optional reference silently clean on stale/missing engine | Separate isolated clamd INSTREAM, UTC VERSION freshness<=24h, bounded authenticated transport, strict replies, no engine-error verdict | Python protocol tests are mocks, not antivirus; real ClamAV/EICAR integration UNRUN (no engine present) | Operator must pin/install/test actual engine, limit resources/heuristic alerts, approve TLS/confidential handling; no live provisioning |
| Authorize-fetch/revoke gap | No bytes; design-only single-owner coordinator ADR requires mutation/disable/direct-RPC and egress fencing | No transfer tests claimed | Coordinator design/runtime/independent review and structural validators remain blockers |

AI-generated initial evidenced finish incorrectly inspected staged reservations and allowed an extra field; corrected in new0014, regressions cover successful staged finish and extra-field rejection. No migration/audit history rewritten.

## Checkpoint test tooling —2026-11-01
| Threat | Mitigation/code | Actual test mapping | Residual |
|---|---|---|---|
| DBA rewrites valid chain/truncates anchored head | Signed exact head, external public pins/retained predecessor;0015/verifier | alteration/insertion/reorder/deletion/truncation/alternate-chain fixtures | No actual immutable external anchor; DBA/signer before observation can fabricate; lost retained state weakens detection |
| Wrong key/replay/rollback/fork/TOFU | Ed25519 domain/canonical fields, bigint strings, explicit identity/key windows/retained prior | wrong key/identity/replay/fork/rotation; actual removed-signature source mutation killed | Protected keys/pins/latest state/CAS retention still required; hidden branches need comparison |
| Legitimate sequence gaps misreported | Increasing exact sequence and original bytes, no contiguity requirement | fixture head>2^53, PG allocation/outage gaps | Intermediate sequence labels aren't hash-bound; unanchored suffix can disappear |
| Raw log/key exposure | Fixed service-only head RPC, raw state denied, isolated operator modules | PG role denial, hosted observation/committed hash readback | Service/DBA trust; private approved prefix retrieval operational, not new export endpoint |
| Path replacement/overwrite/concurrent exports | Owned0700 held Linux directory/O_NOFOLLOW/O_EXCL0600/fsync/lock inode | replacement/exclusive lock/write/forged predecessor/integrated explicit test export | Mutable same-UID files/crash/stale lock manual recovery; distinct sinks don't globally serialize |

Initial AI code used unauthenticated predecessor/pathname-only sink and inadequate toy mutation; read-only challenge prompted pinned predecessor authentication, held-directory identity and actual verifier source mutation. File sink is not independent/WORM evidence. Structural markers remain shallow sniffing; existing minimal synthetic image/PDF tests are not parser/antivirus assurance. Coordinator ADR remains design-only with directRPC/account/session/egress fencing gates; no byte/authority flag added.

## 2026-11-01 (America/Chicago) — HIGH checkpoint consistency correction (from e3a50330dae4155875cd8325a4e508c3a34f4658)

**Defect (found by parent monitor, independently reproduced by primary with synthetic ephemeral Ed25519 keys):** signSnapshot accepted head growth on monotonic counter/sequence plus a valid previous-checkpoint pointer, and verifyAnchoredLog only checked that the NEW head appeared in the supplied log. A signed successor over an entirely different ZERO-rooted ledger (events 2,3) that excluded the independently retained prior head (event 1) was signed and verified as anchoredThrough '3'. The earlier alternate-chain test compared a changed log only against the OLD checkpoint, so it missed a validly signed successor with a changed higher prefix.

**Correction:** verifier.mjs: new verifyPrefix (bounded, ZERO-rooted, strict order, exact hash chain) and locateHead; verifyAnchoredLog now requires the current head AND the retained previous checkpoint head (plus any optional extra retained anchors) to be present, by sequence and hash, in the SAME verified prefix, at or before the current head; zero head explicit. signer.mjs: head growth and genesis require an operator-supplied untrusted prefix that verifies, ends exactly at the snapshot head, and contains the retained prior head; missing/malformed/truncated/divergent proof fails closed; genesis requires the explicit 'explicit-pinned-genesis-ceremony' flag; same head has hash-equality-only semantics. export-test.mjs: requires the prefix, signs, then re-verifies the candidate against the prefix and retained predecessor under the held sink lock BEFORE any write; rejected proofs leave the mutable test sink empty.

**Tests:** tools/audit-checkpoints/ancestry.test.mjs (7 tests, independent node:crypto fixture signer): parent repro rejected; signer refuses missing/divergent/truncated/non-rooted/wrong-end/tampered/null/oversize/leading-zero proofs; legitimate PG-gap extension to 9007199254740993; multiple anchors incl. foreign and beyond-head anchors; zero head, explicit genesis, same head; rotation; export leaves sink unwritten; removed-ancestry source mutation reproduces the defect (anchoredThrough '3') and is killed. Existing wrong-signature mutation still killed.

**Actual results:** `node --test tools/audit-checkpoints/checkpoints.test.mjs tools/audit-checkpoints/ancestry.test.mjs`: 24 tests, 24 pass, 0 fail (17 prior + 7 new). Not rerun this correction: PostgreSQL suite (no SQL/migration/DB code changed; prior reported 273 assertions), hosted checks, Vitest, scanner mocks. Saved-source rehearsal: see BACKEND_STATUS (checkpoint+Vitest passed; PG step refused, pinned 17.9 unavailable).

**Limits:** Sequence labels are not inside canonical hashed bytes; only order is checked, so remapped intermediate labels are not proven. Ancestry is proven only relative to independently retained checkpoints the operator supplies; the database snapshot RPC stays head-only and no raw log export/arbitrary SQL was added. No production independent anchor or retention-locked sink is configured, so the existing ledger is NOT externally protected. Independent review of this correction is pending.

Prior reported figures (273 PG assertions, 17 checkpoint tests, 22 unit checks) are historical and were not re-verified here. No migration, app permission, service head scope, content gate, publication or GitHub change.


Threat → mitigation → code → test → residual: divergent higher-head ledger signed/accepted → prefix ancestry proof containing retained head → verifier.mjs/signer.mjs/export-test.mjs → ancestry.test.mjs → unanchored suffix, label remapping, compromised signer/operator, no external sink configured.

## 2026-11-04 UTC — Upload concurrency/resource exhaustion (Medium), 0016
| Threat | Mitigation | Code | Test (tests/backend/upload-claims-db.mjs unless noted) | Residual |
|---|---|---|---|---|
| Parallel PUTs on one ticket each buffer 10 MiB | Exclusive DB claim before body read; per-actor 1 / global 4 / per-isolate 2 caps | 0016 `tv_upload_claim`, `upload-pipeline.ts` | exactly one of 8 concurrent winners; 6-worker pipeline read spy = 1; caps 429; process cap zero reads (vitest) | Not a hard cross-process memory cap |
| Loser fails/consumes winner | Denials don't mutate; fenced fail only | `tv_upload_fail_fenced` | winner reservation unchanged; wrong-fence fail 404 | — |
| Unfenced service bypass | Revoked service_role EXECUTE on transition/finish | 0016 REVOKE | permission denied checks; hosted grant query | Superuser/DBA trusted |
| Paused/expired worker finalises after reuse | Lease checked on stage/finish; no automatic reuse; operator-attested recovery fails reservation | `tv_upload_claim_valid`, `tv_upload_claim_recover` | paused finish denied; recovery; old fence denied; cleanup eligibility | Late external storage write possible -> recurring cleanup |
| Audit outage | Claim+audit atomic; release failure keeps slot occupied | 0016 | outage trigger rolls back claim | Requires operator recovery |
| Removed checks | Source mutants | — | exclusivity, actor cap, fence, ticket-binding mutants killed | — |

### 2026-11-04 UTC gate-1 verification additions
| Threat | Test | Level |
|---|---|---|
| Revocation mid-claim (grant/disable/session; before stage and before finish) | claims 9a (6 scenarios); hosted 4 scenarios | local current schema + hosted synthetic |
| Release audit outage frees slot | claims 9b | local |
| Global cap race across actors | claims 9c barrier + `>=1000` mutant killed | local |
| Lease expiry recycling | claims 9d; hosted operator recovery of a stranded run-1 claim | local + hosted |
| Handler reads before claim / skips claim | 2 handler-source mutants killed | local |
| Old unfenced service RPCs | hosted: permission denied | hosted |

## 2026-11-07 UTC — Self-service signup, share by email, sign-in alerts (0019)

| Threat | Control | Evidence / residual |
|---|---|---|
| Role escalation at signup | Signup sends no metadata. Role changes only through a DB trigger, and only from viewer to document_creator. `user_roles` is not writable by clients | `signup-share-alerts-db.mjs`: role checks and direct-write denial |
| Unverified address used to receive shares | Lookup requires `email_confirmed_at`, an active profile and no ban | unverified address gets the same reply as unknown |
| Account enumeration through sharing | Owner-only, checked before lookup. One reply for unknown, unverified and self. 20 checks per owner per hour. Every attempt is audited | **Residual:** an owner can still confirm whether a specific address has an account (inherent to sharing by address), and many free accounts multiply the rate limit. No IP-level limit (the managed runtime has no shared counter) |
| Account enumeration through signup | The managed auth service returns the same success for existing addresses; the UI says "If … can receive mail" | relies on the auth service's behaviour, not tested here |
| Cross-user alert leakage | Read by `recipient_id = verified caller` only; no email or session in the projection | isolation checks; mutant removing the filter killed |
| Alert spoofing | Alerts come only from server-written auth columns and audit rows with a recorded token subject; the client cannot create alerts. Unattributed denials alert no one | forged-session checks |
| Alert flooding | Grouped per recipient, kind, subject and hour | repeat sign-in check (6 grouped into 1) |
| Failed-password visibility | **Not provided.** Password failures happen inside the managed auth service and never reach this database | documented limit, not claimed |
| Alert failure blocking sign-in | The trigger catches its own errors | forced-failure check |


### Export review findings — 2026-11-07

- Duplicate eligible normalized addresses or concurrent address edits can select the wrong recipient. Migration 0020 rejects ambiguous matches and holds locks on matching account and profile rows through the grant transaction. The duplicate regression is included. Concurrent email-change behavior needs a real database run.
- A failed notification write could abort a denial audit. Migration 0020 isolates the notification work in a PL/pgSQL exception block. A fault regression checks the denial audit survives.
- Former administrators could read alerts from their tenure. Migration 0020 gates both list and mark-read on the current role and locks the role row while checking it. The regression exercises demotion with the same session.
- These correction regressions were authored but not executed in the ZIP environment. The hosted password endpoint remains outside app alert coverage.
