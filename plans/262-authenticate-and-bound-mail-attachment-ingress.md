# Plan 262: Authenticate and Bound Mail Draft Attachment Ingress

> **Executor instructions:** Resolve Mail actor, mailbox write role, and draft
> access before parsing either request body; reject gross multipart bodies
> before multipart buffering and reject oversized files before the duplicate
> `arrayBuffer`/`Uint8Array` allocation. Preserve the repository's per-draft
> count/aggregate limits.
>
> **Drift check (run first):**
> `git diff --stat cdef1c5533..HEAD -- 'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/route.ts' 'apps/mail/src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/route.test.ts' apps/mail/src/lib/mail/repository.ts apps/mail/src/lib/mail/repository/attachments.ts apps/mail/src/lib/mail/repository/bootstrap.ts apps/mail/src/lib/mail/route-utils.ts tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED
- **Priority:** P1
- **Effort:** M
- **Risk:** MEDIUM
- **Category:** performance / ingress hardening / tests
- **Depends on:** active Mail exact-path transfer
- **Planned at:** commit `cdef1c5533`, 2026-08-11

## Why this matters

The multipart branch calls `request.formData()` and then duplicates the file
into a `Uint8Array` before `withMailContext` authenticates the actor and
workspace. Mailbox role/draft authorization happens even later in the
repository. The JSON copy branch also parses before auth. The 10 MiB file limit
is checked only after allocation in the repository, so an unauthorized request
can force large multipart parsing and memory pressure. No route test guards the
order or bounds.

## Exact contract

- Enter `withMailContext(request, wsId, handler)` first. Inside it, call a new
  `authorizeDraftAttachmentWrite({ ctx, mailboxId, draftId })` repository helper
  before `request.json`, `request.formData`, `File.arrayBuffer`, or either
  mutation. The helper reuses `requireMailboxAccess` with roles
  `owner/admin/sender`, proves the destination message is a draft in that
  mailbox, returns a boolean/typed access result, and performs no write. Keep
  the existing repository checks as defense in depth. Any mailbox-role denial,
  missing draft, foreign-mailbox draft, or archived/non-draft destination must
  return the same non-disclosing `{ error: 'Not found' }`, status 404 before
  parsing for both upload and JSON-copy branches. Preserve the existing
  session/workspace 401/403 envelopes.
- Keep JSON copy schema/envelopes unchanged.
- For multipart only, if a valid decimal `Content-Length` exceeds
  `MAX_MAIL_ATTACHMENT_BYTES + 1 MiB` (11 MiB), return
  `{ error: 'Request body is too large' }` with 413 before `formData()`.
  Missing Content-Length remains allowed because multipart overhead varies; in
  that case `formData()` may buffer the body, but the File.size check must still
  prevent the second `arrayBuffer`/`Uint8Array` allocation and storage write.
  Malformed, negative, or unsafe-integer Content-Length returns 400.
- After `formData()` but before `arrayBuffer()`, reject `file.size === 0` with
  400 and `file.size > MAX_MAIL_ATTACHMENT_BYTES` with
  `{ error: 'Attachment is too large' }`, 413. Preserve filename, disposition,
  content-id, mailbox/draft, attachment-count, and aggregate-size behavior.
- Export the existing size constant through the repository facade if needed;
  do not duplicate its numeric value in the route.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`, and
`$tuturuuu-commit`. Obtain exact transfer from the nonterminal Mail handoff.
No database, provider, storage, or generated-type change is authorized.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route | `bun --cwd apps/mail vitest run 'src/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/route.test.ts'` | auth-order, header, file-size, JSON-copy, and success cases pass |
| Mail tests/typecheck | `bun --cwd apps/mail vitest run && bun run --cwd apps/mail type-check` | canonical Mail suite and types pass |
| Mail build | `bun run --cwd apps/mail build` | production route compiles under Cache Components |
| Repository | `bun check && git diff --check` | all checks pass and diff is clean |

## Scope

In scope: the attachment route; its new colocated test; the narrow repository
facade/attachment helper needed for mailbox-role and draft preflight plus the
existing size constant export. Read-only evidence: `withMailContext` and
`requireMailboxAccess`; do not redesign either shared primitive.

Out of scope: changing the 10 MiB per-file/per-draft product limit, streaming
multipart infrastructure, storage providers, attachment copy semantics,
download routes, message send limits, or translations.

## Steps

1. Add a focused route test with injectable/mocked context, preflight, copy, and
   upload seams. Prove unauthenticated, workspace-forbidden, mailbox-role-
   forbidden, missing-draft, and foreign-draft requests return the exact
   envelopes above and never invoke body parsing or byte allocation.
2. Add the read-only repository preflight, then move both content-type branches
   after it inside the context callback. Add a small strict Content-Length
   parser and the exact 11 MiB gross-request contract.
3. Check `File.size` before `arrayBuffer()`. Test missing header, exact limits,
   one byte over each limit, malformed/negative/unsafe headers, zero-byte file,
   invalid multipart, invalid JSON copy, not-found, and successful upload/copy.
   Assert rejected cases never call the corresponding repository function.
4. Run focused/full Mail tests, typecheck, real build, repository, whitespace,
   and exact-scope gates.

## Done criteria

- [ ] Actor, workspace, mailbox role, and draft authorization complete before parsing either request body.
- [ ] A present gross multipart length fails before form-data buffering; per-file limits always fail before duplicate byte allocation/storage.
- [ ] Existing aggregate/count, copy, filename, disposition, and content-id contracts remain intact.
- [ ] Focused/full tests, typecheck, build, repository, and scope gates pass.

## STOP conditions

Stop if the deployed proxy supplies a transformed Content-Length that makes the
11 MiB check invalid; if Mail intentionally permits chunked files above 10 MiB;
if early auth requires consuming the body; if exact-path ownership is not
transferred; or if a mandatory gate fails twice.
