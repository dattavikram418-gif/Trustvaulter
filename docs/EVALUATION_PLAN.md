# TrustVault — Evaluation Plan (starter)

Status: phase-one evidence added 2026-10-31 America/Chicago. Not a security certification. The original starter matrix below described the initial prototype; current results and remaining gaps are in `BACKEND_STATUS.md`.

## Rubric mapping

| Area | What is evaluated | Evidence required | Prototype status |
|---|---|---|---|
| Authorization correctness | Matrix in `INTERFACE_HANDOFF.md` enforced server-side | Automated API tests per role × action | Not started (UI mirror only) |
| Confidentiality | No bytes or metadata to unauthorised callers | Negative API tests, storage config review | Not started |
| Revocation | Access ends immediately after revoke | Test with open session / cached URL | Not started |
| Auditability | Allowed and denied access recorded, tamper-evident | Log review + integrity anchor verification | Simulated only |
| Upload safety | Allowlist, 10 MB limit, server sniffing | Upload tests incl. spoofed MIME | Client-side demo validation only |
| UX / accessibility | Keyboard, screen-reader labels, mobile | Manual + automated a11y pass | Prototype built; not yet audited |
| Honesty of labelling | No implied security or credentials | Review of UI copy | Prototype labelled; pending review |

## Release blockers (any one blocks release)

1. **Unauthorized bytes or metadata** — any endpoint returns content or metadata (incl. titles) to a caller without a grant.
2. **Stale access after revoke** — a revoked user can still read via an existing session, cache, or link.
3. **Missing denied-access audits** — denied attempts are not recorded server-side.
4. **Mutable audit without independent anchor** — audit records can be altered or deleted without detection by an independent mechanism.
5. **Authorization mutation survives tests** — mutating an authorization check (e.g. removing an owner check) does not cause any test to fail.

## Phase-one executed evaluation

- 107 local real PostgreSQL boundary assertions passed; one targeted authorization mutation killed.
- 46 hosted RPC/Auth assertions passed plus actual HTTP/direct Data API harness; real session-revocation replay denied.
- Browser real account create/edit/readback/delete/logout path verified; 15 Vitest checks passed (11 remain legacy demo regressions only).
- Audit remains unanchored; file safety/content delivery and deployed adversarial verification remain release blockers.

## Next steps

- Extend role × action tests and deployed fault/concurrency campaigns beyond the phase-one suite.
- Expand targeted authorization mutation testing to all action decisions.
- Define audit integrity anchor and verification procedure.
