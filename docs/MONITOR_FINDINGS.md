# Quarantine monitor findings

## Current reviewed status — 2026-11-01 America/Chicago (2026-11-02 01:10 UTC prompt)

Input saved ref `a197bc40e6b492c51825ff72e7f87822ca5805ec`. **C01/CK-ANCESTRY CLOSED code-level by independent plan_monitor.** Primary independently fetched exact saved signer/verifier/format/export/sink/tests and reran `node --test checkpoints.test.mjs ancestry.test.mjs`: **24/24 PASS including both real source mutants**, as reported in the user's current prompt. This is independent checkpoint-tool evidence, not an independent PostgreSQL/hosted rerun. Historical 273 PG assertions remain implementation-reported/historical. Old pending C01 text below is historical and superseded by this lead; no production independent anchor is configured.

This final increment's admission and offline PNG changes are **implementation-tested, independent review pending**. No migration, permissions, service head scope, byte gate, real scanner or immutable retention changed. See BACKEND_STATUS current lead for actual commands and limits.

2026-11-01 America/Chicago. Reviewed increment `33e13a5e57e6d24f8113107ff6e308fc4f3e4916`, continuation reviewed ref `142890748ea7bffde67181dd4d001c092ad283bf`. **Parent CLOSED Q01/Q02/Q03 code-level, reported at continuation from bf406a26fa1cdeee61e6be4d11916460897e7c02; tests remain implementation-reported, not monitor reruns.** Severity below is implementation triage, not a supplied monitor rating.

| ID | Severity | Evidence | Correction | Tests | Residual |
|---|---|---|---|---|---|
| Q01 | High: denial evidence missing | JSON null reached indexing/outer503; null payload coerced | Unknown normalization, null preserved, audited400/413 UUID | Hosted malformed HTTP and subsequent committed requester/session/correlation readback | Required audit outage503; provider pre-handler failures separate |
| Q02 | High: attribution lost | Cleared mismatch ticket erased requester actor/session | 0010 independent live bridge identity before ticket; requester on swap/unknown404, NULL unverified, no target evidence/state change | Real PG/HTTP cross-user, other live owner session, unknown/missing/revoked; ticket mutation killed | Auth-derived service bridge/runtime remains trusted |
| Q03 | High: starvation/cleanup evidence and terminal completed exclusion | Late external write after historical success becomes untracked | 0012 recurring eligible completed unfinalised keys; least-attempted fairness; same claim/fail fence/intent-before-effect/new receipt; dry-run CLI unchanged | New PG21 late-writer repeated sweeps/mixed >100/concurrency/outage and terminal-exclusion mutation; hosted10 synthetic late upload/redelete/new receipt | Late writes remain possible but tracked for continued approved sweeps. No permanent absence/atomicity/finite fairness under infinite arrivals. Parent CLOSED Q03 code-level; no terminal completed exclusion, late/repeated-write regression and historical receipts reviewed. |

## Actual evidence
PG metadata132 + quarantine44 + correction43, three targeted mutations killed; Auth/storage local contracts and cleanup storage Set simulation not hosted outage proof. Hosted46+HTTP, quarantine87, correction56 with committed identity/intents/receipts. Unit32 across five files, eleven scanner mocks (signature/digest/nonce mismatch, response replay, oversize, abort), not malware scanning. Historical canonical bytes/chain verified locally. New0010/0011 only; no prior migrations rewritten.

Saved functional revision observed after tests: `1ce45ab48252312a060022cb9bce87ed87194f54`; documentation amendments may have later platform revisions. Detailed commands/failures/cleanup in BACKEND_STATUS.

## Read-only challenge response
Fairness reviewer concern corrected0011 with uncertain-prefix test. Late-write concern remains open, not an atomicity claim. Historical identical receipt replay returns immutable prior evidence without mutation/current-state attestation; conflicting replay rejected, unchanged completion tested. Hosted expected claims now use Auth getClaims verification, not unsigned decoding. No reviewer closure inferred.

## Remaining gates
Approved real scanner and immutable sink configuration, bounded signed engine/version evidence retention, structural validators, independently challenged direct-RPC revoke/emission ADR, anchors, clean-clone/demo rehearsal. Every content route closed even owner/clean. No publication/GitHub/paid resources or successful-version purge. Parent-authorized scheduled follow-up is external coordination, not a Lovable-configured job.

## 09:11 UTC continuation evidence (implementation-reported)
New0012–0014 preserve prior migrations/bytes. PG132+44+43+21+20, four targeted mutations killed; hosted46+HTTP/87/56/10, separate trusted DB read confirmed missing check/hash/parent/quarantine linkage; unit33 and five Python mock contracts. Real engine UNRUN. Optional reference/setup and design-only gateway ADR added; fresh disposable script executed, not clean dependency-clone proof. See BACKEND_STATUS for failures and saved observed ref. No new independent test review or Q03 closure inferred.
## 12:36 UTC parent continuation status
Parent reports Q01/Q02/Q03 CLOSED code-level. Historical pending text is superseded, not fabricated into prior closure. No new severe scanner/reference defect reported; real engine/EICAR remains UNRUN/unprovisioned, service bridge/legacy trusted finish limited. New0015 checkpoint and isolated signed verifier/mutable file-test tooling are not independently closed or external evidence. No bytes/GitHub/publication or configured Lovable job.

## 2026-11-01 (America/Chicago) — HIGH checkpoint consistency correction (from e3a50330dae4155875cd8325a4e508c3a34f4658)

**Defect (found by parent monitor, independently reproduced by primary with synthetic ephemeral Ed25519 keys):** signSnapshot accepted head growth on monotonic counter/sequence plus a valid previous-checkpoint pointer, and verifyAnchoredLog only checked that the NEW head appeared in the supplied log. A signed successor over an entirely different ZERO-rooted ledger (events 2,3) that excluded the independently retained prior head (event 1) was signed and verified as anchoredThrough '3'. The earlier alternate-chain test compared a changed log only against the OLD checkpoint, so it missed a validly signed successor with a changed higher prefix.

**Correction:** verifier.mjs: new verifyPrefix (bounded, ZERO-rooted, strict order, exact hash chain) and locateHead; verifyAnchoredLog now requires the current head AND the retained previous checkpoint head (plus any optional extra retained anchors) to be present, by sequence and hash, in the SAME verified prefix, at or before the current head; zero head explicit. signer.mjs: head growth and genesis require an operator-supplied untrusted prefix that verifies, ends exactly at the snapshot head, and contains the retained prior head; missing/malformed/truncated/divergent proof fails closed; genesis requires the explicit 'explicit-pinned-genesis-ceremony' flag; same head has hash-equality-only semantics. export-test.mjs: requires the prefix, signs, then re-verifies the candidate against the prefix and retained predecessor under the held sink lock BEFORE any write; rejected proofs leave the mutable test sink empty.

**Tests:** tools/audit-checkpoints/ancestry.test.mjs (7 tests, independent node:crypto fixture signer): parent repro rejected; signer refuses missing/divergent/truncated/non-rooted/wrong-end/tampered/null/oversize/leading-zero proofs; legitimate PG-gap extension to 9007199254740993; multiple anchors incl. foreign and beyond-head anchors; zero head, explicit genesis, same head; rotation; export leaves sink unwritten; removed-ancestry source mutation reproduces the defect (anchoredThrough '3') and is killed. Existing wrong-signature mutation still killed.

**Actual results:** `node --test tools/audit-checkpoints/checkpoints.test.mjs tools/audit-checkpoints/ancestry.test.mjs`: 24 tests, 24 pass, 0 fail (17 prior + 7 new). Not rerun this correction: PostgreSQL suite (no SQL/migration/DB code changed; prior reported 273 assertions), hosted checks, Vitest, scanner mocks. Saved-source rehearsal: see BACKEND_STATUS (checkpoint+Vitest passed; PG step refused, pinned 17.9 unavailable).

**Limits:** Sequence labels are not inside canonical hashed bytes; only order is checked, so remapped intermediate labels are not proven. Ancestry is proven only relative to independently retained checkpoints the operator supplies; the database snapshot RPC stays head-only and no raw log export/arbitrary SQL was added. No production independent anchor or retention-locked sink is configured, so the existing ledger is NOT externally protected. Independent review of this correction is pending.

Prior reported figures (273 PG assertions, 17 checkpoint tests, 22 unit checks) are historical and were not re-verified here. No migration, app permission, service head scope, content gate, publication or GitHub change.


Historical correction-time status was PENDING; current C01 closure and independently rerun checkpoint evidence are recorded in the lead above, not retroactively attributed to the correction author.


## A01/A02/A03 (review of a574533) — corrected by the author in 0018 at 16268db; independently CLOSED at code-review level (reviewed cf8c081, docs-only diff from 16268db)
- A01 malformed revision rounding/overflow: the validator is now sequential and typed.
- A02 bigint cursor precision: values are decimal strings in and out.
- A03 admin payload bound and identity attribution: added the 16384-byte bound and verified-identity attribution; the `tv_operation` uid cast is now guarded.
- **Review error corrected (2026-11-04):** the initial A01 hypothesis said fractional revisions were "rounded". An independent READ-ONLY hosted helper probe before 0018 returned SQLSTATE 22P02 (`invalid input syntax for type bigint: "1.2"`) inside `tv_admin_change`. The actual defect was a query exception with no unavailable result. The monitor retracted the rounding claim, and the line above is kept as written for history.
- Post-0018 independent READ-ONLY hosted helper cases: 10/10 correct on synthetic composites. This is narrow helper proof only, not RPC/HTTP/UI certification.
