# Plan 221: Batch Form Media URL Signing

> **Executor instructions:** Resolve stored media for one form definition with
> bounded batch signing, preserving every existing fallback and output identity.
>
> **Drift check (run first):**
> `git diff --stat 968bd12018..HEAD -- apps/forms/src/features/forms/server/media.ts apps/forms/src/features/forms/server/media.test.ts apps/forms/src/features/forms/server/definition.ts apps/forms/package.json bun.lock tmp/agent-coordination`

## Status

- **Execution status:** BLOCKED — the nonterminal Forms handoff claims all
  `apps/forms/**`
- **Priority:** P1
- **Effort:** S
- **Risk:** MED
- **Category:** performance / tests
- **Depends on:** exact-path transfer from the Forms satellite handoff
- **Planned at:** commit `968bd12018`, 2026-08-11

## Why this matters

Every form definition load currently makes one Storage signing request for its
cover and one more for every stored section, question, and option image. Rich
forms therefore create user-authored concurrency and latency proportional to
their complete media graph even though Supabase provides a batch signing API.

## Current state and exact contract

- `apps/forms/src/features/forms/server/media.ts:35-63` normalizes one media
  object and calls `createSignedUrl`; lines 65-108 invoke it through three
  unbounded `Promise.all` waves plus the cover.
- `definition.ts:166-214` resolves media on every loaded definition.
- Preserve external URLs without signing, preserve `DEFAULT_FORM_MEDIA`, keep
  section/question/option order and IDs, deduplicate repeated storage paths,
  and fall back to the normalized original media only for entries whose signing
  result is absent or failed.
- Collect all non-empty storage paths first. Sign unique paths with
  `createSignedUrls` in deterministic chunks of at most 100, then map signed
  URLs back to every identity. Do not let one failed chunk erase successful
  chunks or turn external media into stored media.

## Required skills and preflight

Load `$tuturuuu-platform`, `$tuturuuu-agent-coordination`,
`$vercel-react-best-practices`, and `$tuturuuu-commit`. Read root and Forms
instructions. Do not edit until the Forms handoff transfers the exact files.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused | `bun --cwd apps/forms vitest run src/features/forms/server/media.test.ts` | mixed/default/external/duplicate/failure/high-cardinality cases pass |
| Typecheck | `bun run --cwd apps/forms type-check` | exit 0 |
| Build | `bun run --cwd apps/forms build` | production build exits 0 |
| Repository | `bun check && git diff --check` | all gates pass |

## Scope

**In scope:** `apps/forms/src/features/forms/server/media.ts`; create colocated
`media.test.ts`; `definition.ts` only if an injectable seam is required without
changing its public result.

**Out of scope:** schema/database changes, upload/storage policies, editor UI,
response media, dependencies/lockfile, public form response shapes, or changing
the one-hour expiry.

## Steps

1. Add a mocked Storage regression suite covering no stored paths, mixed
   external/stored/default media, duplicate paths, one failed item, one failed
   chunk, stable output identity/order, and 201 unique paths. Assert zero calls
   for external-only input and exactly three batch calls for 201 paths.
   **Verify:** the suite is red on current one-call-per-item behavior.
2. Extract normalization/path collection and bounded batch resolution inside
   `media.ts`. Use one path-to-result map to rebuild the immutable definition;
   preserve failed entries' normalized URL/alt/storagePath. **Verify:** focused
   tests pass and no `createSignedUrl(` call remains in the resolver.
3. Run typecheck, Forms build, repository, whitespace, and exact-scope gates.

## Done criteria

- [ ] Storage signing calls are bounded by `ceil(uniqueStoredPaths / 100)`.
- [ ] Duplicate paths sign once; external/default media trigger no signing.
- [ ] Ordering, IDs, alt text, storage paths, expiry, and per-item fallback are
      preserved under partial failure.
- [ ] Focused/typecheck/build/repository/whitespace gates pass with zero
      manifest or lockfile drift.

## STOP conditions

Stop on active ownership, a batch API result that cannot be correlated safely,
need for schema/UI/public-envelope changes, inability to preserve partial
failure semantics, or any mandatory gate failing twice.
