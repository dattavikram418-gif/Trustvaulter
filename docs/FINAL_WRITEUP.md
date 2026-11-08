# TrustVault — final write-up

2026-11-05 UTC. Assessment project; not published, not production-ready.

## What was built
An interface first (synthetic demo, 2026-10-31), then a real backend on the managed database: provision-only accounts, three roles, documents with owner/Read/Edit grants, revocation, tombstone delete, private quarantine uploads with bounded admission and fenced upload claims, and a version-2 hash-chained audit log that records both allowed and denied operations. Administrators get an audited investigation view of activity and permission changes (who granted whom, old → new permission) without any access to documents themselves.

## Security approach
- Every operation goes through one locked database entry point (`tv_operation`) that rechecks the live session, account status, role and ACL, and writes the audit row in the same transaction. Raw table access is denied, so calling the database directly cannot skip checks or audit.
- The UI never decides access; its role hints are display only.
- Uploads are capped (10 MiB, fragment and time limits), claimed under a database fence, and stored privately. No stored file is ever returned to anyone, including its owner.

## Why downloads stay closed
Delivery is only safe if revoking access, deleting, disabling an account or ending a session is ordered against bytes being sent. The hosted runtime has no long-lived owner process, and auth sessions are changed outside the app's database. A smaller single-process design using database row locks is described in `docs/ADR_CONTENT_GATEWAY.md`; it still needs new code, a long-lived host and a real scanner (no file can be marked clean today). Shipping it without those would weaken the revocation guarantee, so it was not done.

## Evidence
Author-run tests on fresh PostgreSQL 17.11 with all migrations (458 PASS lines, 479 assertions, mutants killed in metadata, admin and claims suites), Vitest 59/59, tool tests 24+4, a clean saved-source rehearsal at the last functional code ref `16268db`, and synthetic hosted checks. An independent monitor closed findings A01–A03 at code-review level. No independent full rerun has happened.

## How AI was used
All code and docs were produced with an AI agent under human direction; `PROMPTS.md` lists each prompt, output, and the AI's own mistakes and corrections (for example a wrong "rounding" diagnosis and an unaudited cast found by tests).

## Limits
No preview/download, no real antivirus, type sniffing rather than parsing, audit chain not anchored outside the database (a database administrator could rewrite it), no deployment attack testing, no demo video.
