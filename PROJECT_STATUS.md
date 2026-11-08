# TrustVault — project status (current)

Updated 2026-11-07. 0019 adds signup, share by email, sign-in alerts, and Render config. The ZIP adds 0020 review fixes pending database verification. This is an **assessment project**, not a published or commercial product. It is a reviewable package, **not** a claim that the original security assessment has been passed. Statuses are Implemented / Tested / Blocked with evidence paths; no percentages.

"Tested" means author-run tests unless an entry says *independent*. Exact commands and counts: `docs/BACKEND_STATUS.md`. History of earlier increments: `docs/history/`.

## Functional requirements

The original brief (2026-10-31, summarised in `PROMPTS.md`) did not number its requirements. The ten below are derived from that brief and from the later backend authorisation.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Real sign-in (verified self-service signup since 0019, or operator-provisioned), sign-out, live session/account checks on every call | Implemented, tested | `src/routes/auth.tsx`, `src/lib/backend/`, migrations 0001–0005/0018; `tests/backend/run.mjs` metadata suite (132) and admin suite identity cases; hosted synthetic `tests/backend/hosted.mjs` (author) |
| 2 | Roles: viewer, document_creator, administrator; no self-promotion | Implemented, tested | `public.user_roles` (trusted maintenance only, README); 0019 verification trigger viewer→document_creator only; `signup-share-alerts-db.mjs` (64, 2 mutants); metadata + admin suites deny wrong roles |
| 3 | Upload PDF/JPEG/PNG/TXT up to 10 MB with validation | Implemented into **private quarantine** only; tested | `src/lib/backend/file-validation.ts`, `upload-pipeline.ts`, 0008–0016; quarantine/claims suites (44/108), Vitest. Limit: type sniffing only, no parser or antivirus assurance |
| 4 | My documents / Shared with me with search, filter, sort, empty states | Implemented; list scoping tested | `src/routes/documents.tsx`, `shared.tsx`, `DocTable.tsx`; `list` RPC scoping in metadata suite. UI filters run on the loaded list and have no dedicated test |
| 5 | Document detail: metadata, versions, activity, for owner/grantee only | Implemented, tested | `src/routes/doc.$id.tsx`; `detail`/`activity` RPC denial cases (metadata suite) |
| 6 | Share with registered users as Read or Edit; Edit cannot share/delete | Implemented, tested | `grant` RPC (0005); metadata suite incl. authorization mutant; since 0019 owners share by exact verified email (`share_email`, rate 20/h, uniform unavailable reply), no directory listing |
| 7 | Revoke access with confirmation, effective immediately for metadata | Implemented, tested (metadata) | `revoke` RPC; metadata suite; claims suite revokes mid-upload. Content revocation n/a because no content is delivered (#9) |
| 8 | Owner deletes own documents | Implemented (tombstone), tested | `delete` RPC; metadata suite |
| 9 | Preview / download document content | **Blocked — closed by design** | Every content path returns `delivery_gate_closed`. Reasoning and the exact remaining work: `docs/ADR_CONTENT_GATEWAY.md` (2026-11-05 section) |
| 10 | Audit of allowed and denied access; administrator activity and permission-change console with no content access | Implemented, tested; independent anchor **blocked** | v2 hash-chained `audit_events`; `admin_events` (0017/0018), `src/components/tv/SecurityActivity.tsx`; admin suite (98, 6 mutants); A01–A03 closed at code-review level by *independent* monitor. The chain is not anchored outside this database |

| 11 | Sign-in alerts for account holder and administrator | Implemented, tested (local DB) | 0019 `account_notifications`, `/alerts`; accepted sign-ins and refused ended-session use only. Failed passwords are not observable; in-app only, no email |

## Hand-ins

| Hand-in | Status | Location |
|---|---|---|
| Source code (UI, server, migrations) | Present | `src/`, `drizzle/migrations/0000–0020` |
| Setup / start / test instructions | Present | `README.md`, `compose.yaml`, `package.json` scripts, `render.yaml` (Node build verified locally, not deployed) |
| API documentation | Present | `API.md` |
| Threat model and finding map | Present | `THREATS.md`, `docs/MONITOR_FINDINGS.md` |
| Automated tests | Present, author-run | `tests/backend/`, `src/**/*.test.ts*`, `tools/` |
| AI prompt log | Present | `PROMPTS.md` (dated, real commit refs) |
| Evaluation plan | Present | `docs/EVALUATION_PLAN.md` |
| Final write-up | Present | `docs/FINAL_WRITEUP.md` |
| Demo walkthrough | Script present | `docs/DEMO_SCRIPT.md` |
| Demo video | **Absent** | Not recorded; no video is fabricated |
| Demo credentials | **Not supplied** on purpose | Accounts are provisioned by the operator (README) |
| Independent full test rerun | **Not done** | Only code-level reviews and narrow independent probes exist |

## Blocked items at a glance
- **Missing code:** content delivery path (see ADR), external audit anchor exporter.
- **Operator steps:** an approved real malware scanner, a long-lived single-process host for delivery, an independently administered audit retention store, a video recording, attack testing against a deployment.
