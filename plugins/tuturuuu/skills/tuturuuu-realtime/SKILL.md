---
name: tuturuuu-realtime
description: "Implement and operate Tuturuuu realtime rooms, collaborative programming, presence, cursors, durable state and private checkpoints."
---

# Tuturuuu Realtime

Use for realtime features across Meet, Learn, Hive, Chat and future services.
Read `references/realtime-services.md` for room boundaries, authorization, CRDT
updates, reconnect recovery, persistence, budget checks and focused verification.
Read the relevant app feature page before changing its product permissions.

Identify the authoritative state owner first: durable shared content belongs in
one room; pointers, cursors and connection health are ephemeral. Reuse
`packages/realtime` protocol/document/token primitives and `packages/internal-api`
HTTP contracts. Put reusable programming UI in `packages/programming-ui`; keep
satellite session resolution in the owning app and service orchestration on the
server. Do not copy an entire app's auth or transport implementation.

Authorize the resource and actor before issuing a short-lived room capability.
Recheck admission and entitlements during refresh. Invite possession alone is not
admission. Scope service/checkpoint capabilities separately from browser joins.
Verified internal Meet hosts may elevate their admitted room only; never persist
that exception as a global feature grant.

Validate state after applying untrusted updates to a candidate document. Bound
payloads, document size, connections and message rates. Persist document updates
separately from presence. Coalesce saves, send changed bytes and skip unchanged
snapshots. Keep Drive revisions optimistic and surface conflicts visibly.

Verify concurrent edits, reconnect convergence, readonly denial, expired tokens,
room isolation, worker restarts, failed saves and entitlement revocation. Queue
heavy checks through `$tuturuuu-cli-resources`; use exact-commit CI builds. This
skill does not authorize worker deployment, production migration or release.
