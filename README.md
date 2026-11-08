# TrustVault

Secure document-sharing **assessment project**. Real sign-in, verified self-service signup, roles, metadata, sharing by verified email, in-app sign-in alerts, revocation, private quarantine uploads and a hash-chained audit log with an administrator investigation view. **File preview/download is deliberately closed** (see `docs/ADR_CONTENT_GATEWAY.md`). Not production-ready and not published.

Start here: `PROJECT_STATUS.md` (requirement map) → `docs/BACKEND_STATUS.md` (current evidence) → `docs/FINAL_WRITEUP.md`.

## Requirements

| Tool | Version | Used for |
|---|---|---|
| Bun | 1.4.4 | install, dev server, DB test runner |
| Node | 22.x | checkpoint/admission tool tests (`node --test`) |
| PostgreSQL | 17.11 (Docker image pinned in `compose.yaml`, or native build) | disposable DB test suite |
| Docker + Compose | any current | optional; runs the test DB (and optional scanner engine) |
| Python | 3.13 | optional scanner/structure reference tests |

The app uses the project's managed Lovable Cloud database and auth (values in `.env`, see `.env.example`; no private keys in the repo). There is no local Auth server, so the app is not runnable fully offline; only the test database is local.

## Start the app

In VS Code, open the folder containing this README and `package.json`. Create `.env` alongside `package.json` from `.env.example`. Use the actual URL and publishable key from the same Supabase project for both browser and server variables. Set the server-only service role key for uploads and signed-out audit. Restart the dev server after changing those values.

```sh
bun install --frozen-lockfile
bun run dev            # http://localhost:8080
```

Anyone can create an account with an email and password; it can sign in only after opening the verification link. If the app shows **Configuration needed**, the backend values from `.env.example` are missing.

## Roles and permissions

| Role | Can |
|---|---|
| viewer (default for operator-created accounts, and for self-registered accounts until they verify their email) | see documents shared with them; Read = metadata only, Edit = also upload new versions |
| document_creator (given automatically when a self-registered account first verifies its email) | everything above, plus create documents, share (Read/Edit), revoke, delete own documents |
| administrator | everything a viewer can, plus the Security activity view (audit events and permission changes). **No** implicit access to other users' document metadata, sharing or content |

Edit never grants share or delete. Categories are labels only. Signup never chooses a role; administrator is set only by the operator.

**Sharing:** the owner types the recipient's address. Only a verified, active account matches. Unknown, unverified and own addresses all get one identical "No eligible account" reply, and non-owners always get "Not found". Each owner can check at most 20 addresses per hour. Revoke uses the current database state.

**Sign-in alerts (in app, page "Sign-in alerts"):** every successful sign-in alerts the account holder and every active administrator. So does use of a token whose session or account has since ended. Repeats are grouped per hour. Wrong-password attempts happen inside the managed sign-in service, which this app cannot observe, so they are **not** alerted. No alert emails are sent, because no sender domain is set up.

## Provisioning accounts and the administrator (operator, trusted maintenance)

1. Create the user with a real email in the backend's user administration. Never publish passwords.
2. A sign-up trigger creates an active profile with role viewer.
3. Promote by verified account ID: `UPDATE public.user_roles SET role='document_creator' WHERE user_id='<uuid>';` (or `administrator`). There is no in-app role endpoint.
4. Disable: `UPDATE public.profiles SET active=false WHERE user_id='<uuid>';` and optionally ban the user in auth administration.

## Tests

```sh
bun run test:unit                     # Vitest: 8 files / 61 tests
bun run test:tools                    # node --test: checkpoint 24 + admission 4

# Disposable DB suite (all migrations 0000–0020 on fresh PostgreSQL 17.11)
bun run db:up                         # docker compose: 127.0.0.1:55432, trust auth, tmpfs
TV_TEST_DATABASE_URL=postgres://tv@127.0.0.1:55432/tv_test bun run test:db
bun run db:down
```

`test:db` refuses any URL that is not `localhost:55432/tv_test`, and needs an empty server (it creates `anon`/`authenticated`/`service_role` and a local stub of the auth schema). Run it again only after `db:down`/`db:up`. Without Docker: `TV_LOCAL_PG_BIN=/path/to/pg17.11/bin bash tests/backend/fresh-local.sh` as a non-root user.

Clean saved-source rehearsal (git archive of HEAD, frozen install, all of the above, as user `nobody`):

```sh
TV_LOCAL_PG_BIN=/path/to/pg17.11/bin python3 tools/rehearse-saved-source.py   # leave TV_REHEARSE_WORKTREE unset
```

Hosted tests (`tests/backend/*-hosted.mjs`, `provision.mjs`) create synthetic accounts in the real backend and need trusted maintenance; see the header of each file. Do not run them against data you care about.

## Deploying yourself on Render (Node)

`render.yaml` is a Render Blueprint. Equivalent manual settings:

```sh
# Build command
npx --yes bun@1.4.4 install --frozen-lockfile && NITRO_PRESET=node-server npx --yes bun@1.4.4 run build
# Start command (Render sets PORT)
node .output/server/index.mjs
```

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` **before the first build**, because the browser values are baked in at build time. You also need `SUPABASE_SERVICE_ROLE_KEY`; without it, signed-out request auditing and the upload bridge answer 503.

On 2026-11-07 the authors verified this build and start locally: the build exited 0, and the server answered HTTP 200 both with and without backend values (without them, it shows the Configuration needed page). Nothing was deployed to Render.

**Backend for a self-hosted copy:** the private service key of this project's managed backend can't be exported. A self-run deployment therefore needs its own Supabase project:
1. Apply `drizzle/migrations/0000…0020` in journal order. For an existing installation, apply only pending migrations. Apply 0020 and run the disposable DB suite before enabling public signup or sharing in this export.
2. Enable email signup and require email confirmation. Verify that a test account receives the confirmation link before opening signup to others.
3. Add your Render URL to the allowed auth redirect URLs.
4. Create the administrator account and promote it with the SQL above.

## Optional scanner engine

`docker compose --profile scanner up clamd` starts a pinned ClamAV engine on a private socket. The bridge (`services/scanner/`) and an operator HTTPS endpoint are still required before the app adapter can use it, and a clean verdict still does **not** enable downloads. Not run in the authoring sandbox (no Docker there).

## Scope and limits

Not implemented: content preview/download, real antivirus integration, parser-level file validation, external audit anchor/retention, password reset, alert emails, failed-password alerts, email directory, deployment attack testing. Details and owners: `docs/REMAINING_WORK.md`. Older detailed setup notes (hosted correction suites, cleanup tooling, checkpoints): `docs/history/`.
