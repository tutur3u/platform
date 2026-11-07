# Workspace AI policy review

Personal-workspace option A permits only positive owner/admin/teacher/staff roles
in every education workspace. The exact source is the service-role query of
`workspace_role_members`, joined to `workspace_roles(ws_id,name)`, filtered by
server-resolved user ID and workspace IDs. This is workspace administration data,
not a user profile field. Any other role, a missing role, mixed roles, query errors,
or 1000 returned rows fail closed. A learner in any education workspace is blocked.
The server resolves a personal workspace's creator when a system caller omits the
actor. Unknown personal actors fail closed. Education workspace policy itself is
unchanged: `full` disables AI for everyone. Flip `BLOCK_ALL_EDUCATION_MEMBERS` to
`true` for option B.

Run the checks without installing dependencies:

```sh
node scripts/workspace-ai-provider-inventory.mjs
node --experimental-strip-types --test scripts/workspace-ai-*.test.mjs
```

`workspace-ai-provider-inventory.json` lists every detected provider file, its
workspace source, its gate files and SHA-256 source digests. This includes system
Sepay classifiers/taggers, user report generation, embeddings, Supermemory,
cron-invoked helpers, Live tokens and STT/TTS. It also records SDK declarations,
browser token consumers, static strings and offline evaluation adapters so these
cannot silently become production entry points. New provider files and changes
inside an existing provider or gate file fail CI until independently reviewed.
The existing root script CI job runs both the inventory and its regression tests.

This is a conservative source inventory, not a formal call-graph proof. The
reviewer must validate the documented caller/gate relationships before accepting
an inventory refresh. Do not automatically regenerate hashes in CI. Keep policy
checks before provider calls and credit reservations. Private service-binding
transports rely on their admitted caller; the inventory makes that dependency
explicit. Do not approve a transport merely because another file has a gate.

`workspace-ai-secret-writer-inventory.json` pins every source file that both
references the secrets table and contains a mutation. Each row explains either
its fixed secret-name namespace, its verified-staff authorization, or why it only
reads secrets while mutating another table. Both general secrets APIs are tested
against all three reserved names for insert, rename in/out, clear and delete,
even when workspace management access is granted. The web route additionally
requires current verified Auth staff and root-workspace `manage_workspace_roles`;
infrastructure resolves root authorization before its verified staff guard. SQL
trigger protection remains an independent migration acceptance gate.

New runtime checks cover agent response generation and drafts (both hosts),
external chat/speech credential workspaces, mailbox owner personal workspaces,
and Hive's resolved credit workspace. Colab requires workspace-bound sponsored
admission; an unconfigured installation no longer falls back to unscoped Workers
AI. Full application type checks, builds, deployed behavior, independent security
review and migration acceptance remain release-owner gates.
