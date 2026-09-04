# Plan 125: Characterize the Storage Unzip Extraction Boundary

> **Executor instructions:** Separate the production Bun startup from an
> injectable request/extraction handler and add integration tests for the full
> authentication, parsing, archive-limit, path, and upload-failure boundary.
> Preserve production behavior; this is characterization and testability work,
> not a redesign of partial-extraction semantics.
>
> **Drift check (run first):**
> `git diff --stat 60e33aebd95581573338156364ea9cf9d77aa931..HEAD -- apps/storage-unzip-proxy/package.json apps/storage-unzip-proxy/src apps/storage-unzip-proxy/README.md apps/storage-unzip-proxy/Dockerfile`
> Stop if service startup, authentication, limit defaults, callback protocol,
> or extraction behavior has changed materially.

## Status

- **Execution status:** DONE
- **Verified implementation:** commit `7e86d057827882b694ee42dd9c66534d0d7e7928`
  on branch `chore/storage-unzip-extraction-tests`; all 35 package tests,
  `bun check`, whitespace, and hooks passed
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** Test coverage / security boundary
- **Depends on:** none
- **Planned at:** commit `60e33aebd9`, 2026-08-10

## Why this matters

The storage unzip proxy downloads and expands untrusted archives, then writes
their entries through privileged callback-provided upload destinations. Its
production handler contains authentication, request validation, archive and
decompression limits, path filtering, and sequential side effects, but the
existing tests cover only limit parsing and upload-destination helpers. A
regression in the executable boundary can therefore weaken resource controls or
leave a partially materialized tree without any test failing.

## Current state

- `apps/storage-unzip-proxy/src/server.js:45-49` fails closed at startup when
  `DRIVE_UNZIP_PROXY_SHARED_TOKEN` is absent.
- `server.js:308-363` downloads the ZIP into memory while enforcing both
  declared and streamed archive-byte limits, then opens it with `unzipper` and
  caps entry count.
- `server.js:370-435` filters entry paths, enforces declared and actual per-file
  and total extracted-byte limits, and uploads entries serially.
- `server.js:445-518` installs `Bun.serve` at module import time; its callback
  owns health routing, bearer authentication, JSON/schema/URL validation,
  extraction dispatch, and response mapping. Importing it in Vitest would start
  the service.
- `limits.test.js:12-46` proves only configuration parsing/defaults.
- `upload-destination.test.js:8-135` proves destination and header filtering,
  not `/extract`, archive parsing, or failure-stop behavior.
- `apps/storage-unzip-proxy/package.json:5-8` provides the canonical
  `bun run --cwd apps/storage-unzip-proxy test` suite and has no build or
  typecheck script.

## Required skills and preflight

Load `$tuturuuu-platform` and `$tuturuuu-agent-coordination`. Confirm no active
note claims `apps/storage-unzip-proxy/**`. Do not install a ZIP-fixture library
or edit the manifest/lockfile; use dependency injection and in-memory test
doubles around the already-installed parser and `fetch` seams.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused boundary | `bun --cwd apps/storage-unzip-proxy vitest run src/handler.test.js` | all new request/extraction cases pass |
| Service suite | `bun run --cwd apps/storage-unzip-proxy test` | all existing and new tests pass |
| Workspace gate | `bun check` | exit 0 |
| Whitespace | `git diff --check` | no output |

## Scope

**In scope:**

- `apps/storage-unzip-proxy/src/server.js`
- `apps/storage-unzip-proxy/src/handler.js` (create)
- `apps/storage-unzip-proxy/src/handler.test.js` (create)
- `plans/README.md` only for the executor's status update

**Out of scope:**

- dependency manifests and `bun.lock`
- limit values, authentication scheme, public request/response envelopes, and
  callback/upload protocol
- durable extraction jobs, rollback of already uploaded entries, streaming ZIP
  redesign, or changes to Drive callers
- Docker/deployment configuration

**Read-only drift evidence (inspect, do not edit):**

- `apps/storage-unzip-proxy/package.json`
- `apps/storage-unzip-proxy/README.md`
- `apps/storage-unzip-proxy/Dockerfile`
- existing `apps/storage-unzip-proxy/src/**` files other than the three named
  in-scope implementation/test files

## Git workflow

Use isolated branch `chore/storage-unzip-extraction-tests`, run `bun setup`,
and commit `test(storage): cover unzip extraction boundary`. Claim and release
the commit window. Do not push unless instructed.

## Steps

### Step 1: Extract an injectable handler without changing startup

Move request routing and extraction orchestration into
`src/handler.js`. Export a factory such as `createUnzipProxyHandler` that
receives the shared token, resolved limits, fetch function, archive parser, and
upload/callback functions as explicit dependencies. Export only the minimal
helpers the tests require.

Keep `src/server.js` as the fail-closed composition root: read environment
configuration, reject a missing shared token exactly as today, resolve limits,
construct the handler with production dependencies, and call `Bun.serve` once.
Do not add a test-only environment branch to production code.

**Verify:** run
`bun -e "await import('./apps/storage-unzip-proxy/src/handler.js')"`.
Expected: exit 0 without starting or binding a server; then the existing
service suite still passes.

### Step 2: Cover request authentication and validation

Create `src/handler.test.js`. Model existing Vitest style from
`upload-destination.test.js`. Exercise the handler directly with `Request`
objects and injected spies:

- unauthenticated and wrong-bearer `/extract` requests return 401 and never
  call fetch/parser/upload dependencies;
- health remains available without credentials;
- wrong method/path returns 404;
- malformed JSON, missing required fields, non-HTTP source/callback URLs, and
  invalid destination prefixes return 400 before any download;
- a valid request forwards normalized URLs/prefix and maps successful counts.

Use inert synthetic credentials and example domains only. Never read or log a
real environment token.

**Verify:** run
`bun --cwd apps/storage-unzip-proxy vitest run src/handler.test.js -t 'request boundary'`.
Expected: the health/auth/routing/body cases pass and every rejected request
asserts zero download/parser/upload calls.

### Step 3: Cover every archive and extraction limit

Inject controlled response streams and archive-entry doubles so tests do not
need a new ZIP-writing dependency. Cover:

- oversized declared archive length before body consumption;
- absent/misleading content length followed by streamed overflow and reader
  cancellation;
- missing response body, failed source response, and parser failure;
- entry-count overflow;
- declared per-entry and cumulative overflow before buffering;
- actual per-entry and cumulative overflow after buffering;
- invalid/traversal entry paths are never uploaded;
- directories and valid multiple files produce the expected counts and MIME
  types.

Assert no later entry is processed after a terminal limit failure.

**Verify:** run
`bun --cwd apps/storage-unzip-proxy vitest run src/handler.test.js -t 'archive and extraction limits'`.
Expected: every declared/streamed/parser/path/size case passes and terminal
failures prove later entries are untouched.

### Step 4: Characterize callback/upload partial failure

Inject a failure for the callback or upload of a middle entry. Assert the
handler returns the current mapped error status, does not process later entries,
and does not claim extraction success. Explicitly document in the test name
that already completed earlier uploads are not rolled back; durable atomic
extraction remains out of scope rather than being accidentally promised.

**Verify:** run
`bun --cwd apps/storage-unzip-proxy vitest run src/handler.test.js -t 'partial upload failure'`.
Expected: callback and upload failures retain the characterized status, stop
later processing, and never report success.

### Step 5: Run complete verification

Run the focused test, full service suite, `bun check`, and
`git diff --check`. Only the three in-scope source/test files and advisor status
row may differ.

## Test plan

- Authentication: missing/wrong/correct bearer.
- Routing/body: health, wrong route, malformed and schema-invalid payloads.
- Download: non-success, missing body, declared and streamed overflow.
- Archive: parser failure, entry-count, path, declared/actual size, total size.
- Upload: directory, file, callback failure, signed upload failure, stop-after-
  failure, successful multi-entry counts.
- Existing limit and destination suites remain green.

## Done criteria

- [ ] `server.js` is a thin fail-closed Bun composition root and importing the
      handler never starts a server.
- [ ] Tests execute the same request and extraction functions used in
      production.
- [ ] Invalid authentication cannot reach download/parser/upload dependencies.
- [ ] Every configured archive/extraction limit and path boundary has a named
      regression test.
- [ ] Partial upload failure is characterized without promising rollback.
- [ ] Focused/full tests, `bun check`, and `git diff --check` pass.
- [ ] No dependency, public protocol, limit, or deployment behavior changed.

## STOP conditions

Stop if production startup cannot be separated without changing service
semantics, the current parser cannot be injected without a dependency change,
tests require real network/storage, a discovered behavior needs a product-level
partial-extraction decision, or any mandatory gate fails twice after one
reasonable correction.

## Maintenance notes

Keep the fail-closed token check in the production composition root. Future
streaming or durable-job work must extend these boundary tests and explicitly
define cleanup/retry semantics for entries uploaded before a failure.
