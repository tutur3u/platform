# Citation integration boundaries

The product contract is documented in
[Citation helper](../../../../../apps/docs/platform/features/citation-helper.mdx).
Source, executed checks, migration approval and deployed acceptance are separate
receipts. A fail-closed library adapter is not proof of working persistence.

## Editors and output

Workspace Documents uses `packages/ui`'s rich text editor. Keep formatting in the
portable `@tuturuuu/cite` domain package and inject it into the shared editor.
Register citation node schemas wherever stored documents can be read or edited,
even when the insertion UI is disabled. Retain bounded opaque snapshots when a
client cannot interpret their version; do not silently flatten unknown atoms.

Carry rich formatter runs through the adapter and render text with explicit React
marks. A plain-text conversion before bibliography rendering loses required
italics. Group only compatible identifiers that identify the cited work itself.
An ISBN identifies a chapter's container, and conflicting DOI/PMID/arXiv values
must not merge through a transitive bridge. URL-only overlap requires compatible
source type and title. Leave ambiguous and fuzzy matches for explicit review.

Clipboard providers compute against the current document, including its style,
at copy time. HTML and Markdown preservation and readable plain-text copy are
separate contracts. Keep a single derived bibliography block when pasting cited
content, with a coherent undo step and an intentional winning style.

## Lookup and repair

Reserve public lookup capacity before cache or upstream work. A multi-identifier
grounding session shares its request, byte and deadline budgets; creating a new
session for each identifier defeats those caps. Registry existence alone does not
establish that a source belongs to the supplied reference.

AI repair keeps operation identity and the unapplied result across popover closes.
Apply only while the live citation matches the exact base snapshot. Unknown
settlement permits readback, never another deduction. A token-consuming malformed
proposal can be charged; preserve that distinction in errors and messages.
Redis receipt retention does not establish durable exactly-once behavior after
eviction or data loss.

## Database validation

An isolated migration harness needs both a private target fence before connection
and a synthetic-only sentinel tied to the resource admission before mutation.
A database name alone is insufficient: hosted and disposable databases can both
be named `postgres`. Use the real migrated schema and helper ACLs for policy and
account-deletion checks, then generate types through the supported tool. Do not
replace schema inference with handwritten generated types or table casts.

Synthetic regressions cover formatter families/styles, snapshot and clipboard
roundtrips, stale repair, duplicate bibliography normalization, identifier overlap,
request limits and failure paths. Admission and execution must be recorded before
reporting a passing check. Real responsive/theme and signed-in acceptance follow
the qualified deployment rather than an older production alias.
