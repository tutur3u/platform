# Recovery Evidence

## Establish the live graph

Audit the affected canonical aliases and their API upstreams using authorized
provider diagnostics. Instant Rollback changes an alias's selected artifact; it
need not move a Git branch or update a GitHub deployment marker. Rolling back
several apps can leave a mixture of compatible and incompatible versions.

Keep a compact evidence table; use current repository metadata and workflows for
app registration and proxy ownership, rather than a hard-coded incident inventory:

| Evidence | Meaning |
| --- | --- |
| Canonical alias → deployment ID → source SHA | What users reach now |
| Immutable deployment URL → source SHA/app/environment | A candidate artifact, possibly not live |
| Git main/production/PR refs | Source intent; not proof of alias assignment |
| Successful deployment marker and workflow SHA | Planner baseline; may predate an out-of-band rollback |
| Satellite proxy → live platform API | The upstream route/auth contract the satellite requires |

Use `tuturuuu.ts`, `scripts/ci/resolve-production-vercel-targets.ts`, the owning
`vercel-production-*.yaml`, and the satellite proxy configuration as maintained
sources. Include platform Web and affected direct aliases such as Calendar or
Infra when their routing matters. Finance, Inventory, Contacts, CMS, Tasks, and
Learn are business-critical consumers; inspect the actual route owner for each.
Do not assume every satellite endpoint is proxied or accepts the same session.

`apps/web` is the live API source until an approved cutover. Rust parity remains
required for changed routes, but an implemented Rust route cannot repair an
absent production Web route. Record migrations separately from deployed code.

## Diagnose the request boundary

Using an existing authorized synthetic/review account, inspect each affected
app's `/api/build-info`, deployment identity, and the failing ordinary API request.
Deployment protection or app authentication can protect metadata; use the
approved provider bypass or per-app session without relaxing either layer. Never
print access tokens, account details, request cookies, or raw customer responses.
Retain status, content type, safe error code, envelope shape, and route presence.
If no authorized session is available, report that limit and use bounded ingress
checks; do not manufacture authenticated evidence. Determine whether the requested
recovery requires signed-in verification before promotion. Signed-in staging QA
is optional when authorized and must stop if the user revokes it. When no extra
pre-promotion QA is required, passing the maintained identity/API gates can support
an already-authorized promotion. Missing required QA blocks that action; ingress
checks alone cannot satisfy a business recovery claim.

Compare the client contract with the **live upstream** source. A newer Learn
sidebar can link to an existing Programming page while an older Web artifact
lacks its catalog API. The API then returns an HTML 404, and the page can render
its own 404. Adding a sidebar entry or unrelated playground implementation does
not repair that catalog dependency. Check the exact API path, JSON shape, auth,
and upstream version before changing the page or concluding that a workspace is missing.

Ordinary reads must remain independent of optional offline-download providers.
Preserve MFA, session validation, verified IP blocks, and baseline rate limits.
Check explicit bulk-export behavior separately; recovery does not authorize
removing its protection. The causal proxy regression is
`packages/utils/src/__tests__/daily-operation-download-isolation.test.ts`.

## Stage and promote only compatible artifacts

Use the [critical rollout runbook](../../../../../apps/docs/build/devops/critical-app-rollout.mdx)
and repository-owned workflows. The critical app sequence is production-configured
`--skip-domain` staging, exact-source/app/environment metadata and ordinary API
probes, promotion of that same artifact, then a successful deployment marker.
A READY artifact whose build metadata says `local`, an unexpected app, or a
mismatched SHA is not an acceptable production candidate. Fix its build provenance;
do not weaken the identity assertion or infer it from the branch name.

The invalid machine-key GET/HEAD canaries in
`scripts/ci/verify-staged-critical-app.js` must reach the normal 401 API boundary.
They carry no valid application identity and cannot verify permissions, business
CRUD, successful provider requests, mobile behavior, or signed-in UI. HTML,
redirects, 404, and optional-protection 503 are different failures from the
expected auth envelope. Use the maintained probe's invalid-token shape; a token
that stops in satellite refresh can test a different boundary.

When Web is selected, **every selected registered Vercel satellite** must depend
on its explicit successful promotion output, not merely a completed build/job.
When Web is not selected, that planner dependency does not establish the existing
upstream's compatibility. Out-of-band rollback can also invalidate a successful
marker. Audit the live Web alias and affected API contracts before declaring a
satellite-only recovery safe. Cloudflare and direct-owned routes retain their own gates.

Before an authorized sync, fetch and inspect the full pinned promotion range,
including intervening commits and schema changes. Confirm authorization for that
full range, successful exact-main-candidate CI, and the applicable staging migration
success before sync. After the authorized sync, verify its production deployment
marker and gated production migration result
separately before declaring delivery complete. The planner can deploy code before
production migrations execute: new code must tolerate the old schema during that interval. Rollback artifacts must
also tolerate already-applied forward migrations. Never reverse an applied
migration file or manually run `bun sb:push`/`bun sb:linkpush`. If compatibility or
migration evidence is missing, retain the rollback and report the actual blocker.
Use CI builds; do not build applications locally to unblock delivery.

After authorized promotion, re-audit canonical aliases and verify the requested
signed-in flows with bounded dedicated QA data. Record restore/cleanup for any
explicitly authorized preference mutation; business writes require their own scope.
Separate successful source/ingress gates from customer workflow recovery. If a
requested production flow fails, pursue a scoped corrective action within the
existing authorization and report the failed proof; do not claim recovery complete.

## Classify CI failures before retrying

Read the failed job's actual log; completed job logs can be available while sibling
jobs remain active. Distinguish a source/test contract failure, infrastructure or
provider failure, and a transient timeout. A stale mock for a moved API boundary
needs a focused regression fix; repeating it does not validate the new source.
A timeout alone does not justify raising timeouts or changing application behavior.

Check owning notes and current E2E jobs before publishing a new head, cancelling,
or rerunning a workflow. Allocated image bundles, cohorts, and synthetic fixture
resources remain protected until successful cleanup or independently verified
resource absence. Failed or cancelled cleanup retains the hold until the owner
verifies the resources are released. Preserve the old failed/cancelled cleanup
conclusion alongside any later read-only absence proof; do not relabel it success.
A queued job can become allocated between observations; do not use a cancel/push race as a gate.
Coordinate with the owner, preserve their resources, then perform only an authorized
bounded rerun justified by failure evidence. Do not forge successful deployment or
E2E markers. Record exact SHA, attempt/job IDs, cleanup proof, and remaining gates.

## Regression and evidence pointers

- `scripts/ci/critical-rollout-workflow.test.js`: selected/unselected Web,
  promotion output, failure/cancellation, and satellite dependencies.
- `scripts/ci/verify-staged-critical-app.test.js`: identity mismatch and API ingress
  probes, including the Learn catalog upstream.
- `packages/utils/src/__tests__/daily-operation-download-isolation.test.ts`:
  ordinary reads versus explicit bulk protection.
- `apps/docs/build/devops/github-actions-runbook.mdx`: marker/range resolution,
  exact-source delivery and E2E infrastructure ownership.

These tests document the intended boundaries; their existence alone is not proof
that a particular candidate passed CI, moved a live alias, or recovered a signed-in flow.
