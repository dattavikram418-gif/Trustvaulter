# ADR: byte emission and revocation ordering (DESIGN ONLY — delivery closed)

2026-11-01 America/Chicago. Not implemented or independently approved. Every current content path is closed, including owner/clean versions. No release toggle.

## Rejected baseline
Independent `tv_operation(revoke)` plus Worker authorize→storage fetch→emit is TOCTOU. Chunk rechecks, pub/sub, TTL/grace and JWT expiry cannot establish immediate ordering. Existing direct RPC mutation privileges make a coordinator-only emitter insufficient.

## Candidate A: single-owner egress service
One fenced instance owns **all** grant/change/revoke/delete, account disable, live-session revoke and byte enqueue. A single mutex serializes these operations with authoritative DB decisions, required audit and bounded enqueue. Fetch bounded private bytes before acquiring the mutex, but never return bytes/URLs to the fetch caller; fetched data is untrusted pending digest/version/current evidence validation. Under mutex: fresh authenticated live-session/account check, current ACL/lifecycle/version/scan/structural validation, durable allow/deny audit, then bounded enqueue. Revocation waits for mutex, commits DB change and audit, then ACKs under mutex. No enqueue based on old permission after that ACK.

The guarantee excludes **already-queued** transport buffers, not just already-received bytes. Queues must be bounded, tracked and abortable; already-enqueued kernel/proxy/network buffers cannot be recalled. State maximum queue sizes in the eventual contract. Entire 10 MB files must not be queued invisibly if the desired bound is smaller.

## Candidate B: durable actor coordinator
An actor with durable sequenced commands owns the same mutations and emission. Per-document actors are inadequate unless global account/session disable orders across every affected actor before ACK. Actor restarts must not replay emission from persisted authorizations; reauthorize/audit before new enqueue. Durable command IDs prevent duplicate mutation ACKs; duplicate bytes must not be inferred safe from idempotent DB mutation.

## Non-negotiable bypass and fencing changes
- Before release, remove direct authenticated DB grant/revoke/delete bypass; replace with a reviewed coordinator-authorized fixed boundary. Existing metadata direct RPC remains unchanged **until that separate review**. Any emergency DBA/identity-provider session deletion must fence egress or use coordinator ordering; unmediated Auth/session/account changes invalidate the protocol.
- Multiple replicas: leases alone cannot stop an old instance with storage/network access. Use externally enforced monotonic fencing for DB mutations **and actual egress**, revoke old credentials/transport ownership on takeover; otherwise fail closed. A shared SQL lock alone cannot fence a paused process after it loses the lock.
- Crash/restart: no emission while coordinator ownership uncertain; durable mutation/audit commit before ACK. Crash after commit/before ACK retried by trusted command ID. No cached authorization survives restart. Storage fetch does not authorize. Audit outage blocks enqueue/mutation success.
- Proxy/CDN caching, range coalescing and downstream buffering must respect ownership/bounds; no signed bearer/public storage URLs. Administrative content access remains explicit ACL only.

## Required path inventory and deterministic release tests
Currently only quarantine GET/read_attempt exists and emits no bytes. Future methods must enumerate download GET/HEAD, preview/thumbnail, every range/multipart range, explicit and latest versions, retry/resume, redirect, service fetch and cache hit. Unsupported methods/paths must deny, not fall back.

Pause before/after fetch, authorization, audit commit, enqueue and revoke commit/ACK. Exercise direct RPC attempts, all coordinator mutations, session/accountdisable, successful-version tombstone, two replicas, lease expiry, paused old replica, crash/restart/audit and storage faults. Assert no old-ACL enqueue after ACK with bounded already-queued exception on **every** path. Independently challenge this model and demonstrate actual runtime fence/egress behavior before implementation or delivery. Runtime ownership/provisioning and coordinator authority remain exact blockers, not an operator flag.

## 2026-11-05 — single-instance evaluation for the local project baseline

Question: can the smallest secure delivery (one process, no failover, capped small download, lock-bound lifetime) be shipped in this pass? **No; delivery stays closed.**

| Mutation that must be ordered against bytes | Ordered today? |
|---|---|
| `grant`/`revoke`/`delete` via app or direct RPC | Yes, could be: all run through `tv_operation`, which takes global advisory key 81437291 exclusively. A delivery transaction holding the same key *shared* for the transfer would make them wait. |
| Version create/finish, scanner evidence | Yes, could be: same key (0008–0016). |
| Account disable | **No**: raw maintenance `UPDATE public.profiles` takes no lock. Needs a locking function and an operator rule. |
| Auth session revoke / user ban | **No**: performed by the managed auth service outside this database's lock. Needs an app function that takes the key before calling auth administration, and a rule that sessions are never revoked any other way. |
| Process lifetime | **No** on the hosted runtime (Worker isolates; no long-lived owner, streams may be buffered by the platform). A local Node process could hold the DB transaction for the transfer; it does not exist yet. |
| Clean content | **No** eligible version: no approved real scanner, so no version has an evidenced clean verdict. Delivering unscanned files would remove a required check. |

A process mutex alone is rejected: direct RPC and auth changes bypass it. Even with the lock design, bytes already handed to the socket, kernel or proxy before a revoke commits cannot be recalled; the guarantee is only "no new bytes are enqueued after the revoke commits", and revoke waits up to the transfer deadline.

Exact remaining work is listed in `docs/REMAINING_WORK.md` (missing code vs operator steps). Multi-replica fencing (Candidates A/B above) is out of scope for the single-instance baseline.
