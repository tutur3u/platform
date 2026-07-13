# Production Debugging And Product Improvement Playbook

## Contents

- [Preflight](#preflight)
- [Browser Evidence](#browser-evidence)
- [Vercel CLI Evidence](#vercel-cli-evidence)
- [Correlating The Two](#correlating-the-two)
- [Common Tuturuuu Failure Signatures](#common-tuturuuu-failure-signatures)
- [Performance And Cost](#performance-and-cost)
- [Product Improvement Checklist](#product-improvement-checklist)
- [Handoff Packet](#handoff-packet)

## Preflight

1. Read the nearest `AGENTS.md`, run `git status --short`, and inspect active
   coordination notes.
2. Map the hostname to the owning app and Vercel project. Satellite domains
   should own their migrated pages and APIs; do not assume every `/api/*`
   request belongs to `apps/web`.
3. Record the reproduction window in an unambiguous timezone. Capture the host,
   route, expected outcome, user role, workspace alias, and whether mutation is
   allowed. Do not record customer content.
4. Check Vercel CLI identity and discover the project instead of guessing:

   ```bash
   vercel whoami
   vercel project ls --scope tuturuuu
   vercel inspect <production-domain> --scope tuturuuu --format=json
   ```

5. Keep the production pass read-only unless the user explicitly grants a safe
   mutation scope.

## Browser Evidence

Use the authenticated browser the user made available. If the in-app Browser
session is stale or redirects unexpectedly, inspect available browser sessions
before switching to Chrome. Never ask the user for credentials when an
authenticated browser is already available.

Collect evidence in this order:

1. Final URL and redirects.
2. Semantic DOM snapshot: visible headings, controls, raw translation keys,
   empty/error/loading state, and disabled actions.
3. Console errors and warnings, deduplicated by first line and source.
4. Failed or suspicious requests: method, same-origin path, status, duration,
   request ID, and response shape. Redact bodies and headers.
5. Screenshots only when visual evidence materially helps: responsive
   overflow, clipping, stacking, skeletons, contrast, or an error boundary.
6. A second safe reload/navigation only when necessary to separate transient
   startup noise from a deterministic failure.

Do not click submit, save, delete, approve, attendance, checkout, invoice, or
bulk-action controls on production merely to prove a diagnosis. Prefer source
tests for mutations and verify the deployed UI up to the last non-mutating step.

## Vercel CLI Evidence

Use `vercel inspect` for deployment identity and build logs. Use `vercel logs`
for runtime requests. Query the project explicitly when the checkout is not
linked to the correct Vercel project.

```bash
# Resolve a production alias and inspect deployment metadata.
vercel inspect <production-domain> --scope tuturuuu --format=json

# Inspect build output for the resolved deployment.
vercel inspect <deployment-url-or-id> --scope tuturuuu --logs

# Query a bounded production runtime window.
vercel logs --project <project> --scope tuturuuu \
  --environment production --since 30m --limit 200 --expand

# Narrow by status, route/error text, or request ID.
vercel logs --project <project> --scope tuturuuu \
  --environment production --since 1h --status-code 4xx --json
vercel logs --project <project> --scope tuturuuu \
  --environment production --since 1h --query 'api/v1/workspaces' --json
vercel logs --project <project> --scope tuturuuu \
  --request-id <request-id> --expand
```

Prefer JSON output when filtering or comparing events. Extract only the fields
needed for the diagnosis. Do not paste entire log payloads into notes or final
responses.

If no matching event appears, report the exact time window, project,
environment, query, and retention limitation. Absence of a retained log is not
proof that the browser request never happened.

Use live following only for an explicit monitoring request:

```bash
vercel logs --project <project> --scope tuturuuu \
  --environment production --follow
```

Keep follow sessions bounded and communicate at least once per minute.

## Correlating The Two

Build a compact correlation record:

| Field | Browser | Vercel |
| --- | --- | --- |
| Host | final page/request host | logged host/project alias |
| Route | same-origin path and method | request path and source |
| Time | browser timestamp and timezone | runtime log timestamp |
| Result | status/error boundary | status, message, region |
| Identity | role/workspace alias only | sanitized actor/session outcome |
| Deployment | loaded asset/deployment hint | deployment ID, commit, environment |

Use the correlation to choose the source boundary:

- browser-only failure: client state, hydration, translation, rendering, stale
  asset, service worker, or request construction
- matching 401/403: satellite session bridge, actor resolution, membership, RLS,
  or permission mismatch
- matching 404 with rewrite: route ownership, proxy/fallback rewrite, or a
  dynamic route swallowing `/api/*`
- matching 5xx: handler exception, database/provider failure, missing config, or
  timeout; use the request ID and exact deployment
- no request: disabled control, client exception, wrong origin, service worker,
  or event handler not firing

## Common Tuturuuu Failure Signatures

### Satellite API returns 401

Check whether the satellite route directly re-exports a shared handler that
creates its own Supabase session. Registered satellites must use their
`withSessionAuth`/app-session boundary and inject the authenticated actor/client
into shared logic. Preserve the platform/cookie fallback for callers that still
own it, and add a route-bridge test.

### Satellite API returns 404 or rewrites to `tuturuuu.com`

Check the Vercel rewrite target and the satellite route tree. APIs used by a
migrated satellite surface should be owned by that satellite instead of relying
on a fallback rewrite to `apps/web`. Never add a dynamic catch-all under
`[locale]/[wsId]` that can swallow `/api/v1/...` before fallback rewrites.

### Raw i18n keys in the UI

Deduplicate missing-message console errors, compare the satellite message
bundle with the shared/platform bundle, add English and Vietnamese values, and
run the translation add/sort/parity checks required by the repo.

### React hook-order/minified hook error

Capture the first stack and source chunk, then inspect components that change
from loading/unauthenticated to loaded state. Look for hooks after conditional
returns or hooks called only for one branch. Do not patch a component merely
because it appears in the render tree; reproduce or add a focused test first.

### Service worker script is behind a redirect

Inspect the service-worker URL directly and the satellite proxy ownership. A
service worker must be served without a redirect at its registered scope.
Separate this from the primary page/API failure unless the worker intercepts the
failing request.

### Prerender `HANGING_PROMISE_REJECTION` or fetch after completion

Look for fetch work moved into `setTimeout`, `after`, telemetry, or detached
promises. Keep render-owned fetches inside the render lifecycle and handle any
explicit background work in its own context. For authenticated or
Supabase-backed routes under Cache Components, use the repo-approved
request-time rendering boundary instead of unsupported route segment config.

### `nuqs` adapter missing

Confirm the owning satellite root/layout includes the framework adapter around
every client component using `nuqs`. Test the actual satellite route, not only a
shared component mounted under `apps/web`.

## Performance And Cost

Start with evidence, not blanket caching:

1. Use Vercel observability or bounded CLI logs to identify high-frequency,
   slow, throttled, cold, or error-prone routes.
2. Reproduce one representative navigation and count duplicate requests,
   polling intervals, redirects, and sequential waterfalls in the browser.
3. Trace the owning query/provider and determine whether the data is public,
   workspace-shared, user-specific, permissioned, or mutation-sensitive.
4. Prefer client query deduplication, sensible stale times, request coalescing,
   route-shell reuse, and removal of accidental polling before adding server
   cache complexity.
5. Use Next caching only where data isolation and invalidation are explicit.
   Never cache authenticated Supabase data under a public/global key. Keep
   mutation invalidation and revalidation close to the owning write path.
6. Compare request count, active CPU/duration, error rate, and user-visible
   latency after the change. Document the measurement window and deployment.

Cost reduction must preserve correctness, permissions, freshness, and locale.
Do not optimize by hiding errors, stretching stale data indefinitely, or
removing required security checks.

## Product Improvement Checklist

For each representative surface, inspect:

- English and Vietnamese copy, including placeholders, aria labels, and toasts
- desktop and narrow/mobile layout, scroll containment, sticky actions, dialogs,
  and keyboard reachability
- initial loading, refetching, empty, partial-data, permission-denied, offline,
  provider-unavailable, and server-error states
- role differences: owner/admin/member/guest/manager where relevant
- navigation between satellite domains and preservation of workspace context
- duplicate fetches, raw console errors, failed service workers, noisy retries,
  and unnecessary API rewrites
- safe optimistic updates, partial-success reporting, rollback, and clear next
  actions after failures

Turn confirmed issues into focused route, component, or browser tests. Avoid
large screenshot-only E2E suites when a smaller semantic assertion protects the
failure more reliably.

## Handoff Packet

Report:

- reproduction URL/domain and sanitized workspace/role context
- browser evidence: visible state, console summary, failed route/status/request
  ID, and whether any mutation occurred
- Vercel evidence: project, deployment, environment, bounded time window, and
  matching log result
- diagnosed source boundary and root cause
- changed files and focused tests
- local validation versus deployed production verification
- unresolved log-retention, deployment, permissions, CI, or safety blockers

Never include credentials, cookies, tokens, authorization headers, environment
values, raw customer payloads, or screenshots containing unnecessary private
data.
