# Persistent Request Backlog

Use when the user assigns ongoing ownership of idea, bug, feature or improvement
intake. Conversation context is a working cache, not the request database.

## Capture before dispatch

Keep durable private intake outside task worktrees. The standard local store is
`~/.local/share/tuturuuu/orchestration/programs/platform/backlog.sqlite`.
Use an explicit `--db` for another program. Do not commit private user dumps or
transcripts; do not import secrets, credentials or unrelated personal content.
Use the native `ttr` tracker for requested Tuturuuu task creation after confirming
workspace/board/list. This local ledger supports orchestration intake and evidence
history; it does not silently create or replace shared workspace tasks.

For each dump, split independent outcomes into stable request IDs. Preserve a
source pointer, the user's outcome, kind, priority, acceptance and dependencies.
Link related items instead of overwriting them. Repeated imports are idempotent;
a conflicting same-ID scope requires an intentional revision or a new linked ID.
Capture amendments before assigning work, including requests arriving mid-turn.
Never mark a request verified merely because its PR merged.

```bash
python3 plugins/tuturuuu/scripts/program_backlog.py init
python3 plugins/tuturuuu/scripts/program_backlog.py intake /private/intake.json
python3 plugins/tuturuuu/scripts/program_backlog.py snapshot
python3 plugins/tuturuuu/scripts/program_backlog.py update profile-upload --status active --owner profile-worker
python3 plugins/tuturuuu/scripts/program_backlog.py history profile-upload
```

An intake file is a JSON list. Each item needs `id`, `title`, `kind` (`bug`,
`feature`, `improvement`, `idea`, `delivery`), `source`, `acceptance` and nonempty
`requiredEvidence`. Optional `priority` ranges 0 (urgent) to 3 (later);
`dependencies` names other existing or same-batch IDs. New intake starts
`captured`. Duplicate imports preserve existing owners, links and progress.

Statuses are `captured`, `ready`, `active`, `blocked`, `implemented`, `verified`
and `deferred`. Active work needs an owner. Ready/active/verified transitions
require verified dependencies. If a dependency is only source integration, model
that smaller source outcome explicitly instead of pretending runtime delivery
has finished. Deferral preserves the record; it never cancels the user's request.

`verified` requires `--evidence /private/current-evidence.json`, containing the
matching request ID and exactly its declared required gates in the program board
format. The existing checker requires current-head PASS for all gates and a
merged/delivered unit. This validates recorded consistency only: source review,
remote receipts and product acceptance remain the coordinator's responsibility.
Reopening clears the current verdict while retaining its historical event.

## Recovery and scheduling

At each continuation, read the latest checkpoint, backlog snapshot and current
active-unit board, then verify current refs/owners/gates. Classify new intake,
assign the highest-priority unblocked outcome within the authorized concurrency
budget, and keep every other outcome in the backlog. Report implemented and
verified counts separately, with current blockers and the next concrete actions.

The SQLite store uses transactions and a revision event trail. A second capture
cannot silently reset progressed work, and a failed batch leaves no partial
intake. Snapshot/history are read-only and never initialize a missing store.
`init` refuses to replace existing data. Back up the private directory with the
user's normal protected backup system; local persistence is not cloud backup or
cross-machine availability. Never promise unlimited recall from model context.

The program ledger is current request truth; the unit board tracks owned work and
frozen gates; the checkpoint records decisions and handoff context. Store durable
reusable guidance in canonical docs/skills and write memory extension notes only
when the user asks. Update an already-authorized scheduler to read these sources;
do not add duplicate timers, cancel CI or launch agents merely to keep them busy.

## Memory and bounded consolidation

Requests are commitments; lessons are reusable memory. Never consolidate away an
unfinished requirement or turn an inferred pattern into an explicit preference.
Use a separate private memory index with short source-linked notes. Read relevant
notes at startup; avoid loading or repeating every old transcript. Preserve
explicit preferences and source links, surface contradictions, and keep revisions
so parallel writes cannot silently overwrite another session's learning.

An authorized consolidation pass may deduplicate lessons, refresh links and flag
stale claims. It cannot grant new action authority, transfer another user's memory,
change product permissions or declare delivery. Prefer proposals or reversible
supersession over deleting history. Developer-owned memory registries remain
managed: user-requested changes go into their supported extension-note location,
never direct edits to generated indexes. Use the existing authorized cadence;
daily dreaming is not automatically included by installing a memory skill.

The [Devin memory-and-dreaming article](https://devin.ai/blog/memory-and-dreaming)
and [Agent Memory Repo standard](https://cognition.com/agent-memory-repo) inform
this separation. Product memory implementation uses Tuturuuu's existing scoped
service, consent/audit/deletion controls and revision-safe consolidation; local
orchestrator memory does not substitute for that product implementation.

## Installed pstack

The pinned upstream Cursor package was installed through Codex using a local
compatibility marketplace. Upstream skills are unchanged; only Codex manifest and
marketplace metadata were added. Record upstream commit/version and retain its
license. Verify installation with `codex plugin list --marketplace pstack-local
--json`. Installed skills become discoverable on a subsequent turn.

Cursor-only Task, Graphite, cloud placement and store assumptions do not define
Tuturuuu authority. Use the actual T3/native tools and
[program orchestration](program-orchestration.md); repository and user constraints
remain authoritative. Do not execute bundled scripts merely because installation
succeeded. Refresh pinned upstream deliberately after review, never silently from
latest. Managed caches are written by the installer, not patched manually.
