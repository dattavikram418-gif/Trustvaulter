# TrustVault — Interface Handoff

> **Status: NOT PRODUCTION-READY.** Real authentication, audited metadata and private quarantined uploads are implemented. No content delivery exists; scanner is not provisioned. Legacy synthetic fixtures remain isolated in `src/lib/demo/` and never supply connected identity or permissions. This document is not a security certification. See `API.md` for actual endpoints and `BACKEND_STATUS.md` for evidence.

## 1. Security boundaries

| Concern | Prototype behaviour | Backend must provide |
|---|---|---|
| Identity | Provisioned real Auth accounts, server-derived active identity and role | Continued deployed session-revocation testing |
| Authorization | Live locked DB RPC decision; UI visibility hints only | Scanner/content-gateway authorization in later phases |
| File bytes | Private quarantine, bounded signature checks, no owner read | Real scanner, structural parsing, separately reviewed content gateway |
| Downloads | Disabled and labelled unavailable | Authorised streaming; no public or bearer links |
| Audit | Durable append-only boundary; serialized unanchored SHA-256 chain | Independent retention/checkpoint; DBA/runtime trust remains |
| Admin | Minimal security IDs/action/outcome/time only; no inventory | No implicit ordinary metadata/content/grant bypass |
| Categories | Organisational only | Must never confer or inherit ACLs |

## 2. Role / permission matrix

| Action | Owner | Edit grantee | Read grantee | Admin (no grant) | No grant |
|---|---|---|---|---|---|
| See in ordinary lists | ✓ | ✓ | ✓ | ✗ | ✗ |
| View metadata | ✓ | ✓ | ✓ | ✗ | ✗ (same generic 404 as missing) |
| View / download content | unavailable | unavailable | unavailable | unavailable | unavailable |
| Edit metadata | ✓ | ✓ | ✗ | ✗ | ✗ |
| Upload quarantined version | ✓ | ✓ | ✗ | ✗ | ✗ |
| Manage access (grant/change/revoke) | ✓ | ✗ | ✗ | ✗ | ✗ |
| Delete | ✓ | ✗ | ✗ | ✗ | ✗ |
| Create metadata draft | document_creator role only (becomes owner) | — | — | ✗ | ✗ |
| Own document activity | ✓ | ✗ | ✗ | ✗ | ✗ |
| Admin console | ✗ | ✗ | ✗ | ✓ | ✗ |

"Edit" never implies share or delete. Grants target named registered users only.

## 3. Historical proposed API integration contract (not implemented)

The REST paths below were the original proposal; **none is an implemented endpoint**. The actual single HTTP metadata boundary and DB RPC action matrix are documented in root `API.md`. Permission corrections below also apply to any later implementation.

All endpoints require an authenticated session; caller identity comes from the session, never the body.

| Method | Path | Notes / errors |
|---|---|---|
| GET | `/api/documents?scope=owned\|shared&q&owner&category&from&to&sort` | Returns only documents the caller may read. 401 |
| GET | `/api/documents/:id` | Metadata + versions + caller's effective permission. 404 for both missing and forbidden (no existence leak); audit denied |
| GET | `/api/documents/:id/content` | Streams bytes after authz check; audit allowed+denied. 404/401 |
| POST | `/api/documents` (multipart) | Server validates type (magic bytes) + ≤10 MB. 413, 415, 422 |
| POST | `/api/documents/:id/versions` | Owner or Edit. 403/404 |
| DELETE | `/api/documents/:id` | Owner only. 403/404 |
| GET | `/api/documents/:id/grants` | Owner only; no admin bypass |
| PUT | `/api/documents/:id/grants/:userId` `{permission:"read"\|"edit"}` | Owner only; userId must be a registered user. 403/404/422 |
| DELETE | `/api/documents/:id/grants/:userId` | Owner only; must invalidate existing sessions/links immediately |
| GET | `/api/users?query` | Registered-user lookup for sharing; minimal fields |
| GET | `/api/admin/audit?outcome&actor&action&cursor` | Admin only; no content |

Error envelope: `{ "error": { "code": string, "message": string } }`. UI must never echo server internals.

## 4. Remaining integration checklist

- [ ] Loading skeletons for lists, detail, admin console
- [ ] Empty states (present in prototype) preserved with real data
- [x] Generic authenticated 404 document response without title leakage; real sign-in/sign-out
- [ ] 413/415/422 upload errors mapped to inline field messages
- [ ] Optimistic grant/revoke rolled back on failure; revoke reflected in other tabs
- [ ] Stale detail page after revoke re-checks on focus/next request
- [ ] Network/offline error with retry
- [ ] Download flow emits server audit record before bytes are sent
- [x] Remove DEMO MODE persona selector and simulation banners from connected mode
- [x] Real audit labelled durable but unanchored, never independently verified; legacy simulation stays isolated

## 5. Where things live

- Fixtures + rule mirror: `src/lib/demo/model.ts` (unit tests in `model.test.ts`)
- Demo state: `src/lib/demo/store.tsx` (legacy only, not mounted in connected mode)
- Connected UI: metadata components in `src/components/tv/`; account and transport in `src/lib/backend/`
- Boundary: `src/routes/api/public/metadata.ts`, canonical SQL under `drizzle/migrations/`

## Connected redesign — 2026-11-04 UTC

This section supersedes historical presentation checklist items above, not the backend contract or security evidence.

- **Delivered:** pearl/forest design tokens and branded CSS vault composition; responsive split real sign-in; compact collapsible nav/mobile drawer/account menu and keyboard destination palette; scoped debounced search/server filters/active chips, current-page sort and count; list/grid allowed metadata, separately authorized metadata inspector; skeleton/error retry/empty states; detail/version/owner-activity tabs, preserved real grant/revoke/delete/edit actions and pending errors; upload file/drop selection with honest private-quarantine state; sanitized admin activity, unanchored audit labels and access help.
- **Boundaries unchanged:** existing real auth, verified identity, session/RPC/ACL/revision/audit and quarantine transport; no migrations, permission/storage/scanner/content gateway changes. No demo identity enters connected production code. Inspector calls existing `detail`, never raw tables or content. Admin receives only existing minimal projection. Search filters still go to existing list boundary; sort/count explicitly describe the returned page, not inventory. No signup/OAuth, fake progress, previews, downloads, scan passes, storage graphs or global metadata command search.
- **Motion/access:** 140–220ms (180ms drawers/page, 150–160ms controls), reduced-motion override; 44px buttons and dialog close targets; focus-managed Radix dialogs/drawers; desktop1280x1800/mobile390x844 screenshots and keyboard navigation exercised. Tables scroll horizontally rather than squeezing audit UUIDs. Wider list table uses deliberate horizontal scroll on mobile; grid fits viewport.
- **Tests:** new real-sign-in-flow unit tests mock the auth service only; existing routing and demo permission tests rerun. Browser actual signed-out pages passed. Connected components were exercised with explicitly labeled isolated synthetic browser-only intercepted account module/API responses. These fixtures are under `/tmp/browser/redesign`, not shipped or a production route. Success in them is UI evidence, NOT auth/ACL/upload/audit enforcement proof. No live session was available, and no accounts were provisioned for CSS work.
- **Acceptance still unverified:** real authenticated successful sign-in/global sign-out and upload bytes/share/revoke backend flows, live concurrent stale ACL response handling, tablet-specific screenshots, full assistive-technology audit. No backend suite rerun is claimed. Delivery/scanner/coordinator/external anchors/deployed attack blockers remain unchanged; GitHub/publication/backend development paused.
- **Source checkpoint:** UI implementation through formatting observed at `44e0fd45f44a9c5202fe752f8d2ece818276b7a4`; final navigation assertions, audit column widths, prompt/handoff/roadmap amendments saved afterward. Final exact ref reported after readback, not a fabricated commit.

**Final targeted test run:** `bunx vitest run src/components/tv/SignIn.test.tsx src/test/app-routing.test.tsx src/lib/demo/model.test.ts` — 3 files, 22 tests passed (3 sign-in, 8 route matches, 11 historical demo permission rules), 2026-11-04T03:43:59Z. All are frontend/unit evidence, not hosted authorization evidence.
