# Plan 006: Fail Closed on Task Embedding Webhook Authentication

> **Executor instructions:** Treat missing secret configuration as a server
> error, not as authentication bypass. Do not log the configured or supplied
> secret. Follow the exact route/test scope and stop on drift.

## Status

- **Execution status:** TODO
- **Priority:** P0
- **Effort:** S
- **Risk:** LOW
- **Category:** Security / Tasks / AI metering
- **Depends on:** none
- **Planned at:** `68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b`, 2026-08-10

## Why this matters

The public webhook fails open when `SUPABASE_WEBHOOK_SECRET` is absent. An
unauthenticated caller can make an admin client read task billing context,
invoke a metered embedding provider, and admin-update task embeddings. The
generic API proxy guard rate-limits ordinary traffic but does not establish an
authenticated webhook caller.

## Current evidence

`apps/tasks/src/app/api/v1/webhooks/tasks/embedding/route.ts:16-22` currently has:

```ts
const webhookSecret = req.headers.get('x-webhook-secret');
const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;

if (expectedSecret && webhookSecret !== expectedSecret) {
  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
}
```

The same handler calls `createAdminClient()` before this check, calls
`createMeteredTextEmbedding()` at lines 130-140, and admin-updates `tasks` at
lines 158-162. There is no colocated test. The cron embedding route provides the
desired fail-closed precedent: missing secret returns 500 and mismatch returns
401 before privileged work.

For test structure, follow
`apps/inventory/src/app/api/cron/inventory/checkout-expiry/route.test.ts:1-36`:
use `vi.hoisted` module mocks, `vi.stubEnv` in `beforeEach`, direct handler
invocation with a synthetic `Request`, and negative assertions that privileged
dependencies were not called. Restore stubbed environment values after tests.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused route test | `bun --cwd apps/tasks vitest run 'src/app/api/v1/webhooks/tasks/embedding/route.test.ts'` | exit 0; all new authentication-order cases pass |
| Tasks typecheck | `bun type-check:tasks` | exit 0, no TypeScript errors |
| Repository gate | `bun check` | exit 0 |
| Tasks build | `bun --cwd apps/tasks run build` | exit 0; Next compiles the changed route |
| Whitespace | `git diff --check` | exit 0, no output |

## Allowed files

- `apps/tasks/src/app/api/v1/webhooks/tasks/embedding/route.ts`
- New sibling `route.test.ts`
- `apps/tasks/.env.example`
- `apps/docs/platform/applications/tasks.mdx`

Do not change proxy bypass policy, AI metering, task schema, Supabase webhooks,
or the cron route.

## Git workflow

- Use branch `fix/task-embedding-webhook-auth` in an isolated worktree if the
  shared checkout is dirty or overlapping.
- Conventional Commit: `fix(tasks): fail closed on embedding webhook auth`.
- Do not push or open a PR unless instructed. Claim the Git commit window before
  staging/committing and never stage coordination notes.

## Steps

1. **Preflight.** Load `$tuturuuu-platform` and
   `$tuturuuu-agent-coordination`; read `apps/tasks/AGENTS.md`. Run
   `git diff --stat 68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b..HEAD -- apps/tasks/src/app/api/v1/webhooks/tasks/embedding apps/tasks/.env.example apps/docs/platform/applications/tasks.mdx`.

   Expected: no authentication-semantic drift. Any drift is a STOP.

2. **Authenticate before privilege.** Read `SUPABASE_WEBHOOK_SECRET` before
   creating the admin client or parsing the body. If missing/empty, return a
   stable 500 configuration error. If `x-webhook-secret` is absent or unequal,
   return 401. Only after equality may the route create an admin client.

   Verify with
   `bun --cwd apps/tasks vitest run 'src/app/api/v1/webhooks/tasks/embedding/route.test.ts' -t 'rejects'`:
   exit 0; missing configuration returns 500, missing/wrong headers return 401,
   and none calls `createAdminClient`, `req.json`,
   `createMeteredTextEmbedding`, or a task update.

3. **Preserve successful behavior.** Do not change payload/event validation,
   unchanged-text short-circuiting, billing context, embedding dimensions, or
   update responses. Add one correct-secret test proving the current path can
   reach the admin lookup and embedding mock.

   Verify with
   `bun --cwd apps/tasks vitest run 'src/app/api/v1/webhooks/tasks/embedding/route.test.ts' -t 'configured secret'`:
   exit 0; the authorized case reaches the lookup/embedding mocks and a non-task
   event remains 400.

4. **Document configuration.** Add the variable name, required purpose, and
   fail-closed behavior to `apps/tasks/.env.example` and the existing Tasks
   operations section. Use a placeholder only; never include a real secret.

   Verify: `rg -n "SUPABASE_WEBHOOK_SECRET" apps/tasks/.env.example apps/docs/platform/applications/tasks.mdx`
   reports both owned files and no raw secret.

5. **Run gates.** Run:

   ```bash
   bun --cwd apps/tasks vitest run \
     'src/app/api/v1/webhooks/tasks/embedding/route.test.ts'
   bun type-check:tasks
   bun check
   bun --cwd apps/tasks run build
   git diff --check
   ```

   Expected: all Bun commands exit 0 and `git diff --check` has no output.

## Done criteria

- [ ] Missing secret configuration returns 500 before any privileged operation.
- [ ] Missing/wrong supplied secret returns 401 before any privileged operation.
- [ ] Correct-secret behavior and event validation remain covered.
- [ ] Placeholder configuration and operational behavior are documented.
- [ ] Focused tests, Tasks typecheck, `bun check`, the Tasks build, and
  `git diff --check` pass.
- [ ] `git status --short` contains only the four allowed paths plus the plan
  index status update.

## STOP conditions

Stop if the route has moved to a different authentication mechanism, a deployed
Supabase webhook cannot supply the existing header, or correct behavior requires
changing shared proxy policy. Reconcile deployment configuration without
weakening the fail-closed boundary.

## Maintenance notes

Any future Supabase task webhook must authenticate before body parsing, admin
client creation, metered provider calls, or writes. Reviewers should specifically
check negative-call assertions; response-status tests alone do not prove the
privileged code cannot run. A later shared webhook-auth helper is out of scope
until at least two routes require the identical header contract.
