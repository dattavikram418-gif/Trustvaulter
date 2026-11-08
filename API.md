# Implemented metadata API

Current-state note (2026-11-01 America/Chicago): C01 checkpoint tooling CLOSED code-level by independent plan_monitor; primary independently reran 24/24 checkpoint tests incl. both real source mutants. No independent PG/hosted rerun. Connected uploads remain signature-prefiltered quarantine, never structural/AV-certified or deliverable. No new RPC/migration/permission in the final hardening increment.

Status: phase-one foundation, not production-ready. Actual UI HTTP endpoint:

`POST /api/public/metadata` with `Authorization: Bearer <access-token>` and JSON `{ "action": "detail", "payload": {"id":"UUID"} }`.

The `public` path bypasses site auth but **not handler auth**: handler calls Auth `getUser(token)`; then the publishable-key, user-bearer DB client calls `public.tv_operation(action text, payload jsonb default '{}')`. The DB checks live session/account/role itself, including direct authenticated Data API RPC calls. No handler trusts demo state or owner/actor/role fields.

| Action | Allowed payload fields | Permission | Result |
|---|---|---|---|
| identity | none | current active session/account | id, display_name, DB role |
| list | scope (`all`,`owned`,`shared`), q, owner UUID string, category, from/to timestamps, limit, offset | own or explicit Read/Edit only | accessible metadata array, newest created then UUID |
| create | name, category | document_creator only | metadata draft; owner derived from session |
| detail | id | owner/Read/Edit | metadata + current effective access |
| edit | id, revision, name, category | owner/Edit | updated metadata; incremented revision |
| delete | id, revision | owner | tombstone; no recovery |
| grants | id | owner only | user IDs + read/edit; no directory/email export |
| grant | id, revision, user_id, permission | owner only; registered active target | grant/change, incremented revision |
| revoke | id, revision, user_id | owner only; target cannot be owner | removes grant regardless recipient disabled/banned/deleted state; absent grant/target is idempotent, still increments revision |
| activity | id, limit, offset | owner only | sequence, time, actor/document IDs, action/outcome, canonical_version, verified session_id, request_id, structured changes for own current document |
| admin_activity | limit, offset | administrator only | sequence, time, actor ID, document ID, action, outcome, request_id; no titles/reasons/session IDs/recipient or permission details |
| admin_events (0017) | group(all\|permission_changes), action, outcome(allowed\|denied), actor_id, document_id, recipient_id (permission group), from, to, before (sequence cursor), limit 1–100; string/number values only | administrator only (live session/account/role); others 404, unauthenticated 401, invalid 400 — all audited | `{events,next_before}`: sequence, at, actor_id, document_id, action, outcome, request_id, permission_detail(recorded\|unavailable\|not_applicable), recipient_id, old_permission, new_permission, prior_acl_revision, new_acl_revision. Values only from validated v2 *allowed* grant/revoke changes; v1/denied/malformed => unavailable+nulls. No titles, emails, sessions, reasons, canonical bytes or raw changes. Each call appends an `admin_events` observation event (filter shape + count only) before returning; audit failure fails closed. Inner `tv_admin_events`/`tv_admin_change` not executable by anon/authenticated/service_role; reachable only via `tv_operation`. Admin still has no detail/grants/activity/edit/share/delete/bytes. |
| admin_events correction (0018) | `limit` JSON integer 1–100; other fields JSON strings ≤40 chars; UUIDs lowercase canonical; dates ISO; `before` canonical decimal string 1..9223372036854775807 (no leading zero/sign/exponent/number type). Total payload >16384 bytes => audited 413; anything else invalid => audited 400. Role gate runs first, so a non-admin gets 404 at any size. | as above | `sequence`, `next_before`, `prior_acl_revision`, `new_acl_revision` are exact decimal **strings**. Malformed history (fractional/negative/out-of-range/string/exponent/wrong-type/missing/extra) => unavailable, never rounded and never an exception. Unverified/mismatched/revoked/disabled identity => 401 audited with NULL actor/session. Legacy `admin_activity` unchanged (JSON numbers). |

No ordinary admin metadata/grant bypass. Administrator may read a document only through an explicit grant; cannot create unless role is document_creator (roles are mutually exclusive). Edit does not permit grants, deletion or activity. Categories confer no ACL. Metadata owner_id/id are immutable. Every mutation revision must match current `acl_revision`; edits also increment it.

Envelopes: `{status:200,data:...,request_id:"UUID"}` or `{status:401|400|404|409,error:...,request_id:"UUID"}`. HTTP maps DB status and sends the same trusted UUID as `X-Request-ID`. After authentication, missing/forbidden document actions both return status 404 / `Not found`, with independently generated UUIDs. 409 only after authorization, with `Refresh and retry`; 400 invalid parameters; 503 generic unavailable if required DB/audit processing fails (no committed audit UUID promised). HTTP byte-size rejection returns 413 after an audited rejected RPC and includes its UUID. No raw internal error is returned. Caller `X-Request-ID` is ignored; actor/session/request/outcome fields are not allowed payload fields.

Limits: name 1–200 trimmed characters, category ≤100; HTTP and DB payload ≤16384 bytes (JSON formatting can make DB representation larger); limit 1–100 default 50; offset 0–10000. q uses literal case-insensitive substring, not wildcard SQL. Dates must parse as PostgreSQL timestamps; from ≤ to. UI date end is inclusive UTC end-of-day. DB scalar payload validation rejects explicit null/nested JSON. No arbitrary sort/order identifiers, SQL or object endpoint.

RPC inventory:
- `tv_operation(text,jsonb)` — authenticated execute only. Each invocation rechecks live `auth.sessions` under a share lock, identity ban/delete/anonymous status, active profile, DB role, lifecycle/ACL/revision, then appends durable audit.
- `tv_session_failure()` — service_role execute only, appends a fixed unauthenticated denial with NULL actor/document; no arbitrary audit input.
- `tv_session_failure_correlated()` — service_role execute only; fixed unverified denial with NULL actor/document/session and DB-generated UUID returned to handler. No parameters, no arbitrary bearer decoding. Legacy void helper delegates to it.
- Internal non-callable helpers: `tv_append_audit`, `tv_append_audit_v2`, `tv_provision_profile`, `tv_immutable_owner`, `tv_audit_immutable`. Default PUBLIC/anon execution revoked. Triggers execute internally.

## Versioned audit encoding (correction 0005)

All new appends use canonical version 2: a JSON object with `version`, `at`, `actor_id`, `document_id`, `action`, `outcome`, `reason`, `session_id`, `request_id`, `changes`. Hash remains SHA-256 over UTF-8 `previous_hash || canonical` under the same transaction mutex. Legacy version-1 JSON-array canonical strings and hashes are untouched; legacy added fields remain NULL / empty changes. Never recanonicalize historical strings to verify hashes.

The DB generates one fresh UUID for each direct RPC operation; HTTP forwards it, never accepts a caller correlation UUID as identity. `session_id` is included only after validating the actor's live session, expiry and legitimate Auth user; inactive-profile denials may retain a verified session, but revoked/unverified identity denials have NULL. Successful grant/change/revoke includes `{target_user_id,old_permission,new_permission,prior_acl_revision,new_acl_revision}` captured under document lock, atomically with mutation and hash append; absent permissions use JSON null. Other actions and denials have empty changes, preventing disclosure of unauthorized target/grant state. Grant requires active, non-banned, non-deleted, non-anonymous registered recipient under share locks; revoke does not look up recipient validity. Authorization precedes recipient validation, so nonowners cannot enumerate by revoke. Local verifier: `tests/backend/audit-verifier.mjs`; this is consistency checking, not an independent anchor.

Historical phase-one scope: no byte endpoints existed. The additive quarantine increment below supersedes only upload/version/storage absence. No recovery, ownership transfer, viewer activity or account directory is added. Legacy `document_versions` remains `no_file` only; real quarantined records use a separate locked table.

Boundary serializes phase-one operations with a single advisory transaction mutex and a per-document lock. This is deliberately conservative and not scalable. Row locks also serialize session deletion/account disabling against an operation in progress. A response committed before revocation may already be in flight; no bytes are delivered and no stream-revocation guarantee is claimed.
## Private quarantine increment — 2026-11-01 America/Chicago

Applied additive migrations `0006_trustvault_quarantine_foundation.sql`, `0007_trustvault_quarantine_lifecycle.sql`, `0008_trustvault_quarantine_preflight.sql`, `0009_trustvault_upload_auth_evidence.sql`; metadata revoke correction and canonical v1/v2 bytes unchanged.

`/api/public/quarantine` verifies bearer claims and Auth user, then checks current live session/profile/role/parent ACL/revision in DB. POST JSON `{action,payload}`: `reserve` accepts only id/revision (owner/Edit); `versions` accepts id (owner/Read/Edit; no object keys); `read_attempt` accepts id, audits and always denies delivery. Create new metadata parent via existing creator-only `create`; reserve that parent. Creation and upload are separate, so failed upload can leave a visible metadata draft, never a pretend stored-file success.

PUT `?reservation=UUID`: raw body, `X-Filename` safe ASCII name, exact supported Content-Type; authenticated caller/session must equal reservation. Early `inspect`, bounded read <=10485760 bytes, <=65536 transport fragments (including empty), 30-second total body deadline, one capped application buffer, nonempty, type/signature/extension agreement, SHA-256 stage binding, private opaque-key storage upload without upsert, persisted digest/size readback, optional approved scanner, finalise with original revision/live ACL. No filename/path/key/scan-success fields accepted from clients. Strict rejection of detected HTML/SVG/MZ/ELF/ZIP and PDF active/embedded actions; marker sniffing is **not full structural parsing or polyglot proof**. No connected parser, rendering or delivery is enabled. PUT body timeout/fragment/size/validation failure uses existing audited generic fail transition; required audit failure remains 503. Cancellation is best effort, not awaited indefinitely.

GET `?id=UUID`: audited read attempt only; authorized users get 423 `Content delivery unavailable`, missing/ungranted get 404, invalid live account/session 401. There is no byte response, redirect, signed URL, preview, range, alternate version or content route. Replies use no-store/nosniff, DB-generated X-Request-ID. PUT validation failure returns audited generic 400; DB/auth/required audit outage returns 503. No Content-Disposition is emitted because no delivery exists; filenames are constrained to safe ASCII for future attachment use.

RPC inventory additions:
- `tv_upload_request(text,jsonb)`: authenticated only; reserve/versions/read_attempt, durable v2 allow/deny evidence.
- `tv_upload_transition(uuid,uuid,uuid,text,text,integer,text,text,text)`: service-only trusted bridge, not callable by users. Fixed ticket actor/session binding, inspect/stage/finish/fail; live checks and expiry (also bounded by original JWT expiry); atomically version/revision/audit. Audit changes include reservation ID, digest, byte size, version ID and verdict.
- `tv_upload_access(...)`: internal non-callable live/parent/ACL/revision helper sharing the metadata advisory mutex, so direct RPC revoke participates in finalisation ordering.
- `tv_quarantine_cleanup_candidates(integer)`: service-only dry-run <=100 eligible unfinalised staged keys; includes historically completed cleanup intents when due, excludes successful versions, live claims and deferred retries. No public cleanup endpoint.
- `tv_quarantine_cleanup_claim(integer)`: service-only <=100 fixed candidates; freezes reservations as failed and commits bounded five-minute claims, attempts and v2 intent audits **before** storage deletion. No caller key/parent input.
- `tv_quarantine_cleanup_receipt(uuid,text)`: service-only claim token and fixed `storage_success|storage_error`; appends required v2 result evidence atomically with completion/retry status. Repeated identical receipts are idempotent; conflicting/stale receipts rejected. Raw intents/attempts denied, including service role.

Private bucket `trustvault-quarantine`, 10 MB bucket limit, restrictive anon/authenticated deny-all object policy plus no permissive access. Raw version/reservation tables denied even to service role; fixed definers are the boundary. No bytea is stored. Service storage credentials remain trusted, never browser-visible.

DB and storage cannot commit together. A staged reservation persists its opaque key **before** storage write; finish/audit failure never creates a reachable version. The upload handler no longer issues unreceipted best-effort deletion. Failed or expired staged records retain private keys for claimed maintenance. `bun tests/backend/reconcile-quarantine.mjs` defaults to dry-run; explicit `--apply` requires `TV_CLEANUP_APPROVED=yes` in an approved trusted runtime. API success is recorded as API success, not proof an object existed. Audit/receipt failure leaves an uncertain intent for retry after claim expiry; error receipts defer retry by one minute, preventing old failures from monopolizing ordinary batches. No cron or successful-version retention purge is added. All scanner verdicts, including clean, remain quarantined.

## Q01–Q03 correction — 2026-11-01 America/Chicago

New canonical0010 bridge identity/cleanup receipts and0011 retry fairness; 0000–0009 and stored canonical bytes unchanged. Least-attempted eligible ordering puts untouched work ahead of uncertain prefixes. POST normalizes parsed unknown before indexing and preserves explicit payload null for DB rejection. Null/scalar/array/malformed envelopes commit 400 denial; >2048 streamed bytes commit parameter denial mapped to 413 (invalid live identity still takes precedence). Trusted header/body UUID identifies the committed event; required audit outage remains 503, not a fabricated UUID.

The bridge independently revalidates requester live session/user/active account/role before looking up a ticket. Cross-user, same-user other-session and unknown reservations return identical 404 without state change or target document/reservation/digest evidence; audit uses verified **requester** actor/session. Missing/revoked identity is 401 with NULL actor/session. Unauthorized ACL denials expose no target evidence. Original ticket JWT-expiry bound, current ACL/revision and owner/Edit policies remain. Internal `tv_bridge_identity` is noncallable by all external roles; the transition stays service-only.

Residual: nontransactional storage can complete an already-in-flight write after cleanup; claims block finalisation, not external writes. 0012 recurring least-attempted sweeps no longer exclude completed intents: failed/expired unfinalised opaque keys remain tracked indefinitely, with fresh intent/receipt on each due sweep. One-minute defer is scheduling only. No successful-version purge, arbitrary keys, cron, permanent absence or DB/storage atomicity. Parent closed Q01/Q02/Q03 code-level (tests implementation-reported, not monitor reruns).

Scanner adapter contract/setup is in README; current scanner **missing**, not malware-tested. Delivery gate is unconditional and cannot be turned on by environment flags. No revoke/emission protocol is implemented or claimed: authorise then fetch/send has TOCTOU, chunk rechecks/pubsub/TTL alone are insufficient, and previously emitted network buffers cannot be recalled.

## Private scan evidence — 0013/0014, 2026-11-01
`tv_upload_finish_evidenced(uuid,uuid,uuid,text,jsonb)` is service-only, fixed ticket/caller/session and verdict/optional `{body,signature}`. The server verifies exact response HMAC, size/digest/nonce and strict schema first. SQL independently bounds/parses six fields, matches reservation digest/size/verdict, checks current live binding/ACL, then commits reviewed finish, immutable private check and separate v2 audit hash atomically. `quarantine_scan_checks` denies all raw role access, including service; no public read RPC or owner/admin projection added. Contains version/parent/reservation, DB observation time, upload/check request IDs, exact signed body/signature and engine/definition/nonce, SHA-256 evidence hash. Missing/error stores actual attempt without fabricated signature/engine. Existing versions are not backfilled. Timestamp is backend observation, not signed engine scan time; HMAC establishes trusted shared-secret source, not independent attestation. Legacy trusted-only finish still exists for historical compatibility and can omit checks; no delivery consumes either path.

0013's initial staged `inspect` would fail/fence a staged ticket and had an incorrect extra-field allowance; corrected additively in0014 before connected implementation/test. Prior migration preserved. Separate optional ClamAV reference is not imported by the app; real engine and HTTPS configuration remain unprovisioned. No clean promotion or delivery. Ordering alternatives in `docs/ADR_CONTENT_GATEWAY.md` are design-only.

## Checkpoint observation —0015, 2026-11-01
`tv_audit_checkpoint_snapshot()` — no arguments, service-only EXECUTE; no HTTP/public/admin export. Same ledger mutex, stable DB-generated chain/system UUID configuration, private monotonic counter and required v2 observation audit before returning `{version:1,chain_id,system_id,head_sequence,head_hash,counter,observed_at,request_id}`. Sequence/counter are exact decimal **strings**. Snapshot includes the observation event itself; audit outage rolls state back. Raw checkpoint state denied even service role. IDs/counter are DBA-editable, not independently pinned anchors; preserve on same deployment restore, deliberately repin new deployment. Existing ledger bytes untouched.

Operator modules under `tools/audit-checkpoints/` implement bounded Ed25519 canonical envelope, offline independently pinned verifier and **mutable file test sink only**. No production export, web import, key storage/configuration or external sink. `exportFileTest` requires explicit test mode/trusted prior/pins and Linux held-directory lock; different sinks are not globally coordinated. Head-only hosted test adds no raw log export. Exact signature/hash/key-window/truncation/gap semantics and code/test map: `docs/ADR_AUDIT_CHECKPOINTS.md`. Offline full-prefix input requires independently approved private DBA retrieval; no ordinary user/admin retrieval RPC added.

## 2026-11-01 (America/Chicago) — HIGH checkpoint consistency correction (from e3a50330dae4155875cd8325a4e508c3a34f4658)

**Defect (found by parent monitor, independently reproduced by primary with synthetic ephemeral Ed25519 keys):** signSnapshot accepted head growth on monotonic counter/sequence plus a valid previous-checkpoint pointer, and verifyAnchoredLog only checked that the NEW head appeared in the supplied log. A signed successor over an entirely different ZERO-rooted ledger (events 2,3) that excluded the independently retained prior head (event 1) was signed and verified as anchoredThrough '3'. The earlier alternate-chain test compared a changed log only against the OLD checkpoint, so it missed a validly signed successor with a changed higher prefix.

**Correction:** verifier.mjs: new verifyPrefix (bounded, ZERO-rooted, strict order, exact hash chain) and locateHead; verifyAnchoredLog now requires the current head AND the retained previous checkpoint head (plus any optional extra retained anchors) to be present, by sequence and hash, in the SAME verified prefix, at or before the current head; zero head explicit. signer.mjs: head growth and genesis require an operator-supplied untrusted prefix that verifies, ends exactly at the snapshot head, and contains the retained prior head; missing/malformed/truncated/divergent proof fails closed; genesis requires the explicit 'explicit-pinned-genesis-ceremony' flag; same head has hash-equality-only semantics. export-test.mjs: requires the prefix, signs, then re-verifies the candidate against the prefix and retained predecessor under the held sink lock BEFORE any write; rejected proofs leave the mutable test sink empty.

**Tests:** tools/audit-checkpoints/ancestry.test.mjs (7 tests, independent node:crypto fixture signer): parent repro rejected; signer refuses missing/divergent/truncated/non-rooted/wrong-end/tampered/null/oversize/leading-zero proofs; legitimate PG-gap extension to 9007199254740993; multiple anchors incl. foreign and beyond-head anchors; zero head, explicit genesis, same head; rotation; export leaves sink unwritten; removed-ancestry source mutation reproduces the defect (anchoredThrough '3') and is killed. Existing wrong-signature mutation still killed.

**Actual results:** `node --test tools/audit-checkpoints/checkpoints.test.mjs tools/audit-checkpoints/ancestry.test.mjs`: 24 tests, 24 pass, 0 fail (17 prior + 7 new). Not rerun this correction: PostgreSQL suite (no SQL/migration/DB code changed; prior reported 273 assertions), hosted checks, Vitest, scanner mocks. Saved-source rehearsal: see BACKEND_STATUS (checkpoint+Vitest passed; PG step refused, pinned 17.9 unavailable).

**Limits:** Sequence labels are not inside canonical hashed bytes; only order is checked, so remapped intermediate labels are not proven. Ancestry is proven only relative to independently retained checkpoints the operator supplies; the database snapshot RPC stays head-only and no raw log export/arbitrary SQL was added. No production independent anchor or retention-locked sink is configured, so the existing ledger is NOT externally protected. Independent review of this correction is pending.

Prior reported figures (273 PG assertions, 17 checkpoint tests, 22 unit checks) are historical and were not re-verified here. No migration, app permission, service head scope, content gate, publication or GitHub change.


Operator API (isolated, not web/HTTP): `signSnapshot(snapshot,{keyId,privateKey,previous,trust,prefix,genesis})`, `verifyAnchoredLog(events,envelope,trust,previous,anchors=[])`, `exportFileTest({...,prefix})` (mode `mutable-file-test-only` only).

## Final admission / offline structural contract

JSON envelopes retain 16384-byte metadata / 2048-byte quarantine limits, now also <=4096 fragments and a 10-second total body deadline; strict UTF-8. Read failure returns the existing audited rejected-envelope path (metadata 413; quarantine 413; live authentication checked at the boundary where implemented). These are per-request application limits, not rate limiting, connection admission or provider buffering bounds. No claim of aggregate memory or hosted deadline testing.

Endpoint roles remain: metadata POST action matrix above; quarantine POST reserve owner/Edit, versions owner/Read/Edit, read_attempt owner/Read/Edit but always 423; quarantine PUT reservation-bound owner/Edit; quarantine GET same audited closed read; maintenance/scan finish/checkpoint snapshot fixed service-only, no HTTP/public/admin bridge. Admin has no implicit ordinary access.

Offline-only `services/structure/reference.py` / `run_isolated(data,media,parent_id,version_id,approved=False)` returns unavailable by default. Real maintained Pillow supports only narrow static8 PNG; PDF/JPEG/TXT return unsupported, not passed. Digest/size/parent/version/media/policy are bound in local **untrusted, not persisted** evidence; parent/version UUIDs are operator labels, not authoritative ACL. Output is not accepted by scan RPCs. Exact bounds, refusal and test map: `services/structure/README.md`. Existing connected format allowlist is unchanged and never reports unknown structure as passed.

## Fenced receiving claims — 0016, 2026-11-04 UTC
PUT `/api/public/quarantine?reservation=<id>` (authenticated owner/Edit with a live session; the ticket must belong to the caller's current session). The server-only workflow:
`tv_upload_admission_busy` (process cap; 503) | `tv_upload_claim(ticket,caller,session)` -> 200 / 400 rejected (duplicate, used or expired) / 401 / 404 / 409 / 429 (actor or global cap). Then `tv_upload_stage_fenced`, `tv_upload_fail_fenced`, `tv_upload_finish_fenced` (cid, fence, caller, session, …) -> 404 `invalid_claim` on a fence/identity/lease mismatch, and `tv_upload_release_fenced(cid,fence,outcome)`, which is idempotent.
Operator only: `tv_upload_claim_recover(cid,'worker_terminated_verified')`, for expired leases only. All of these are executable by service_role only; anon, authenticated and admin have no claim access. `tv_upload_transition` and `tv_upload_finish_evidenced` are no longer executable by service_role. Responses never contain the fence or the object key.

**Operator recovery (verified once, hosted, 2026-11-04):** find active expired claims (privileged read-only query, IDs only), confirm the worker has terminated, then call `tv_upload_claim_recover(id,'worker_terminated_verified')` with service authority. Live leases are refused. Under parallel load, duplicate PUTs may return 503 (per-process cap, audited) instead of 400.

## Signup, share by email, sign-in alerts — 0019, 2026-11-07 UTC

All go through the same `POST /api/public/metadata` → `tv_operation` entry point. The new handlers are private functions, so direct execution is refused.

- **Signup** uses the managed auth service (`signUp` sends only email, password and `emailRedirectTo`). The trigger `tv_account_email_verified` (fires when `email_confirmed_at` goes from NULL to set) changes `viewer` to `document_creator` and nothing else. Already-confirmed inserts (operator provisioning) stay `viewer`. No path assigns `administrator`.
- **`share_email`** `{id:uuid, revision:integer, email:string≤254, permission:'read'|'edit'}`, exact keys, payload ≤16384 bytes.
  - 401: unverified identity, recorded with NULL actor and session.
  - 413 / 400: malformed or oversized request.
  - 404 `Not found`: missing document, deleted document or not the owner. Checked before any address lookup.
  - 429: more than 20 address checks per owner per rolling hour.
  - 404 `No eligible account for that address`: unknown, unverified, inactive or banned address, or the owner's own address. One identical reply for all of these.
  - On a match, the existing `grant` path runs: stale revision gives 409, and it writes the normal v2 grant audit. Success returns `{revision, user_id, shared_email}`.
- **`grants`** rows now include `shared_email` (lowercased address the owner typed, or `null` for grants made by account ID).
- **`notifications`** `{limit?:1..50}` returns the caller's own alerts only, as `{id, kind, subject_id, first_at, last_at, occurrences, read_at}`. `kind` is one of `own_sign_in`, `account_sign_in`, `own_session_denied` or `account_session_denied`. **`notifications_read`** `{id?}` marks one alert or all as read; another account's id gives 404. Both are audited.
- **Alert sources:**
  - `auth.users.last_sign_in_at` changes. The auth service sets it only after a verified sign-in, not on token refresh.
  - `audit_events` denials with a recorded token subject and reason `revoked_session`, `disabled_identity` or `inactive_account`.
  - Rows are grouped per recipient, kind, subject and hour.
  - A failed alert write never blocks sign-in (warning only).
