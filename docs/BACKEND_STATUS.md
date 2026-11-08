# Export review — 2026-11-07

Lovable saved the feature code at `9198e16c09f48c3dfa842f248530272e400fd00f`. Lovable reported applying 0019 to its managed backend, passing 61 Vitest tests, 522 local PostgreSQL PASS lines with a stub auth schema, and serving the local Node build. Real signup email delivery and provider sign-in events were not exercised.

The independent review identified ambiguous/racing email lookup, alert failures aborting required denial audits, and retained admin visibility after demotion. The ZIP contains the incremental 0020 correction and regression cases. 0020 was prepared in the exported source only and has not been applied to the managed project. The new regression file passed Node syntax checking. The existing checkpoint suite passed 24 tests. PostgreSQL, the application build, and hosted signup were not rerun against the ZIP after this correction. The upload admission test could not start because TypeScript dependencies are absent in the export environment.

# Backend status — current state

Updated 2026-11-05 UTC. The dated, chronological log of every earlier increment (with its original caveats) is kept unchanged in `docs/history/BACKEND_STATUS_LOG.md`. Older entries there describe the state at their date, not now.

## Current capability
- Migrations 0000–0018 applied to the managed backend in journal order; none rewritten; canonical audit bytes unchanged.
- Implemented: provision-only identity with live session/account checks, roles, metadata/grants/revocation/delete, private quarantine uploads with fenced claims, v2 hash-chained allow/deny audit, administrator `admin_events` investigation.
- Closed: every content route (`delivery_gate_closed`), including owners and any scanner verdict. Reason: `docs/ADR_CONTENT_GATEWAY.md` (2026-11-05).
- No background jobs, publication, GitHub or paid resources.

## Evidence on the current code (author-run unless stated)

Functional code last changed at `16268db6286063c7edfc1bac5139496e9b88d78c` (0018). Commits since then, up to and including this pass, change only documentation, `package.json` script entries and the new `compose.yaml`.

| Command (2026-11-05) | Result |
|---|---|
| Fresh native PostgreSQL 17.11 cluster, superuser `tv` (same shape as `compose.yaml`), `TV_TEST_DATABASE_URL=postgres://tv@127.0.0.1:55432/tv_test bun run test:db` | exit 0. Historical pre-0016: quarantine 44, correction 43, recurring 21, scan-evidence 20. `SCHEMA current`, then checkpoint 13, metadata 132, admin 98 (6 mutants), claims 108 (7 mutants). 458 PASS lines; 479 RESULT assertions (351 current-schema + 128 historical) |
| `bun run test:unit` | 8 files, 59/59 |
| `bun run test:tools` | checkpoint 24/24, admission 4/4 |
| `compose.yaml` parse check | parses (`testdb`, `clamd`). **Not run**: no Docker in this sandbox |
| `python3 tools/rehearse-saved-source.py` on saved `3493fec934895fe703f3c88745f660b2d3fe4e20`, `TV_REHEARSE_WORKTREE` unset, PG 17.11 | **Not run: exit 1 before any step.** The platform now refuses `git archive` in this sandbox; I did not work around it. Last overlay-free pass remains `16268db` (archive sha256 `389905c3…6b872c`, exit 0, 458 PASS lines). Since then: docs, `package.json` script entries (no dependency or lockfile change) and `compose.yaml` only |

Independent evidence (not author): A01–A03 closed at code-review level; READ-ONLY hosted helper probe 10/10 after 0018; parent's 4 pipeline checks at `e7e56b80`. No independent full rerun.

Hosted synthetic checks (author, direct backend calls, not a public deployment): 26 (upload claims), 16 (admin, after 0018). Not rerun in this pass because the code is unchanged.

## Not verified
Docker run of `compose.yaml`; real ClamAV/EICAR; signed-in browser walk of the admin view; public Git clone; fresh Python bootstrap; deployment attack testing.
