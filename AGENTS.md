<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- All demo data and UI permission checks live in `src/lib/demo/`; they are display hints only, never a security boundary — real enforcement belongs to a separately reviewed backend.
- Docs for the backend handoff live in `docs/`; append honest dated entries to `PROMPTS.md` (never fabricate history).
- Connected application data uses locked, audited RPC boundaries; raw table privileges stay denied so direct Data API access cannot bypass authorization or audit.
- Real routes render through the connected account shell, never the demo provider; legacy demo modules are isolated and cannot provide real identity.
- Backend boundary tests run on disposable PostgreSQL with explicit authenticated database contexts; hosted authentication and HTTP checks require separately provisioned test accounts.
- Database migrations are canonical in `drizzle/migrations/` and applied in journal order; do not separately apply copied SQL because it would duplicate schema changes.
- Audit canonical encoding is versioned; preserve legacy bytes and derive session identity and per-operation correlation at the database boundary so direct RPC has the same evidence as HTTP.
- Quarantine uploads use a server-only storage bridge with reservation-bound preflight/stage/finalisation and persisted digest readback; storage is nontransactional, so failed/expired reservations retain opaque keys for idempotent trusted reconciliation.
- Scanner adapters are server-only, approved-endpoint and signature/digest/nonce bound; their verdict never changes quarantine state or enables delivery because delivery needs a separately demonstrated revoke/emission ordering protocol.
- Optional antivirus reference processes stay outside the web import graph; evidenced connected finalisation atomically retains bounded private validated response and audit hash, because engine processes cannot run in the hosted app runtime.
- Cleanup is service-only claim-before-side-effect maintenance with durable attempt/receipt history; eligible unfinalised keys recur even after successful receipts and uncertain outcomes retry after claim expiry, because late external writes and database commits are not atomic.
- Audit checkpoint operator modules stay outside the web import graph; fixed service-only snapshots use the ledger mutex, while signing, independently pinned verification and mutable test retention remain separate to prevent same-database self-attestation or accidental key exposure.
- Request admission uses one capped application buffer with fragment and total-deadline bounds; byte limits alone do not constrain tiny-chunk memory/work or stalled readers.
- Optional structural validation stays in isolated operator processes outside the web graph; native parser capability failures never imply passed structure, and offline evidence cannot promote or deliver connected content.

- Connected interface presentation uses shared WorkspaceVisuals, semantic global tokens, and authorized metadata-only inspector calls; navigation commands never search or disclose document data.

- Upload bodies are read only after a per-isolate slot and an exclusive fenced DB receiving claim; unfenced upload mutators are not service-executable, because per-request limits alone cannot bound aggregate concurrent buffering.

- Administrator investigation goes only through the audited `admin_events` projection of validated v2 change fields; admins never receive ordinary document, grant or content access, because security oversight must not become a data bypass.
- The supported reproducible baseline is local single-instance: Compose provides only the disposable test DB and optional scanner engine, while the app uses managed auth, because no local Auth server exists.
- Current status lives in PROJECT_STATUS.md and current docs/*.md; dated history moves unchanged to docs/history/, so reviewers see one current state without losing evidence.
- Self-service accounts get document_creator only through the email-verification trigger, sharing resolves only verified addresses via owner-checked rate-bounded `share_email` that reuses the audited grant path, and sign-in alerts derive only from auth-written sign-in columns or attributed audit denials, because client input must never set roles or create alerts.
- Self-hosted Node builds use `NITRO_PRESET=node-server` (render.yaml); a missing backend URL/key renders a configuration screen instead of throwing, because browser values are build-time inlined.
