# Operational peer protocol qualification

Use `packages/sdk/src/operational-sync/` only as an inert source foundation. Its
SQLite adapter and injected authority fixtures do not authenticate a network peer,
activate a service or authorize production/private SQL. Existing devbox grants
are execution-runner authority; MCP grant storage remains an interface until its
own reviewed backend exists. Preserve the outcomes/project dependency and the
canonical coordinator's delivery gates.

Every operation binds principal/workspace/project/program and machine/agent/store/
replica identity plus current grant ID/revision. Future adapters must derive these
from authenticated, consented authority and make revocation checks atomic with
writes. Hash chains prove consistency, not authentication. Synthetic callback
success never proves provider permission or an accepted server write.

Retain immutable events, exact operation receipts and explicit conflicts. Reject
stale outcome revisions, wrong ancestry, divergent replay, revoked authority,
foreign/expired leases and tombstone resurrection. Never use timestamps as conflict
precedence. Completion remains user-confirmed; evidence verification is separate.
A remote lease does not replace a local queue, commit window or process audit.

Run focused Node24 tests and noEmit source checks through the canonical resources
queue. Use explicit synthetic stores and two persisted local replicas; never
implicitly import/export the private backlog or operational/personal memory.
Remote SSH/runtime jobs require separate coordination. Actual authentication,
network, two-machine runtime and activation are separate evidence boundaries.

The owning docs section is `apps/docs/build/development-tools/codex-plugin.mdx`.
Preserve the offline layer's frozen head and write set when adding this stack.
