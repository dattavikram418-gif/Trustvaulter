# Remaining work (current)

Updated 2026-11-05 UTC. Earlier dated versions: `docs/history/REMAINING_WORK_LOG.md`.

## Missing code
1. **Content delivery path** (requirement 9). Smallest acceptable design for the local single-instance baseline, from `docs/ADR_CONTENT_GATEWAY.md`:
   - a migration adding one delivery-begin function that rechecks live identity, ACL, version state and a clean *evidenced* scanner verdict, writes the allow/deny audit, and holds a **shared** transaction lock on the existing global advisory key (81437291) for the whole transfer;
   - every `tv_operation` mutation (`grant`/`revoke`/`delete`) already takes that key exclusively, so it would wait for an in-flight transfer (bounded by a small byte cap and deadline), including direct RPC calls;
   - account disable must go through a function that takes the same key; today it is a raw maintenance `UPDATE public.profiles` that does not;
   - a server route on a long-lived Node process (not the hosted Worker) that holds that DB transaction while streaming a capped body;
   - an app-owned session-revoke/ban function that takes the same lock before calling auth administration, plus an operator rule that auth sessions are never revoked outside it;
   - pause-point tests on every route (fetch, authorise, audit, enqueue, revoke commit) showing no bytes are enqueued under a permission that has been revoked.
2. **Audit anchor exporter** that ships signed checkpoints (`tools/audit-checkpoints/`) to an external store.

## Operator steps (not code)
1. Approve and run a real scanner (pinned ClamAV in `compose.yaml` profile `scanner` + bridge + HTTPS endpoint), then run benign and EICAR tests. Without it no version is ever eligible for delivery.
2. Provide a long-lived single-process host for the delivery route.
3. Provide an independently administered, retention-locked audit store and keep its verifier key outside this database.
4. Run attack testing against a deployment (publication is currently paused).
5. Record the demo video from `docs/DEMO_SCRIPT.md` using operator-provisioned synthetic accounts.
6. Have someone other than the author rerun the full suites.
