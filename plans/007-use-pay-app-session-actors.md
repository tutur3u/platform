# Plan 007: Use Pay App-Session Actors Across Billing APIs

> **Executor instructions:** Consolidate authentication only; preserve each
> endpoint's authorization policy and response contract. Never authorize with a
> request-supplied user ID. Stop if the endpoint inventory or Pay session target
> contract has drifted.

## Status

- **Execution status:** BLOCKED — the non-terminal Pay migration handoff
  `tmp/agent-coordination/20260709-151455-claude-pay-app-migration.md` owns
  `apps/pay/**`
- **Priority:** P1
- **Effort:** M
- **Risk:** MED
- **Category:** Correctness / Authentication / Pay satellite
- **Depends on:** none
- **Planned at:** `68a1457aed77cb9ba4b8b1f3b8f467fa4b04da9b`, 2026-08-10

Do not start until that handoff is reconciled or explicitly transferred. It
records unresolved rollout/cutover ownership for the same billing routes.

## Why this matters

Pay normally authenticates with a registered app-session JWT. Most billing
routes resolve only a Supabase cookie, so a valid Pay-only session is treated as
anonymous. The seats endpoint already documents and solves this exact mismatch,
but the rest of the billing surface does not share it.

## Current evidence and contract

`apps/pay/src/app/api/payment/seats/route.ts` currently prefers:

```ts
getAppSessionUserFromRequest(request, { targetApp: ['pay', 'platform'] })
```

and intentionally falls back to `resolveAuthenticatedSessionUser` on a
cookie-backed Supabase client. By contrast, checkout contains:

```ts
const supabase = await createClient();
const { user } = await resolveAuthenticatedSessionUser(supabase);
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

The same cookie-only actor path appears in subscription preview/change,
customer portal, order/workspace invoice, and workspace billing routes. The
shared contract is: accept app-session targets `pay` and `platform`, fall back
to a valid Supabase cookie, reject wrong-target/invalid/anonymous requests, and
authorize resources using the resolved `user.id`.

## Allowed files

- Add `apps/pay/src/lib/auth/resolve-pay-actor.ts` and its unit test.
- Edit only authenticated route files identified by this command at preflight:
  `rg -l "resolveAuthenticatedSessionUser|createClient\(" apps/pay/src/app/api --glob 'route.ts'`.
- Exclude webhook and cron routes. Keep `payment/seats/route.ts` behavior but
  replace its local resolver with the shared helper.
- Add colocated route tests only for representative route categories: workspace
  billing read, subscription mutation, and invoice/customer-portal access.
- Do not change Polar calls, product eligibility, billing permissions, pricing,
  or database schema.

## Steps

1. **Freeze the route inventory.** Load `$tuturuuu-platform`,
   `$tuturuuu-satellite-app-ux`, and `$tuturuuu-agent-coordination`. Run the
   allowed-file search above and classify each result as user-authenticated,
   webhook/cron, or not an actor lookup. Compare against seats, credit-pack
   checkout, workspace billing, subscription preview/checkout/change, customer
   portal, and both invoice routes.

   Verify: every user-authenticated route is listed in the implementation PR;
   any additional authentication convention is a STOP until this plan is
   reconciled.

2. **Extract the existing correct resolver.** Move the seats resolver into
   `resolve-pay-actor.ts`. It must accept `Request`, use
   `getAppSessionUserFromRequest(request, { targetApp: ['pay', 'platform'] })`,
   then intentionally fall back to the Supabase cookie resolver. Return only the
   authenticated user object; do not accept caller IDs.

   Verify unit tests: Pay target succeeds, platform target succeeds, wrong target
   is rejected, invalid/absent app session falls back to a cookie user, and fully
   anonymous returns null. Expected Vitest exit 0.

3. **Adopt the helper everywhere in inventory.** Pass each handler's actual
   request into the helper. Where app-session callers make the cookie client
   anonymous, perform existing membership/permission/resource queries with an
   injectable admin client filtered by the resolved user ID, following the seats
   endpoint. Preserve status codes and endpoint-specific permission rules.

   Verify representative route tests: app-session-only caller reaches the
   existing authorization query; wrong-target and anonymous return 401; a caller
   lacking the existing workspace/object permission still returns 403/404 as
   before. No test may bypass authorization with the admin client.

4. **Prevent future split behavior.** Remove the local seats resolver and direct
   cookie-only actor resolution from inventoried user routes. Add a narrow test
   or repository check only if an existing Pay test utility can express this
   without brittle source matching.

   Verify:
   `rg -n "async function resolveSeatsActor|resolveAuthenticatedSessionUser" apps/pay/src/app/api --glob 'route.ts'`
   reports no route-local actor resolver; any remaining use is documented as a
   non-user-authenticated exception.

5. **Run gates.** Run the helper test and all newly added representative route
   tests, then `bun check`, `bun --cwd apps/pay run build`, and
   `git diff --check`; expect all Bun commands to exit 0 and no whitespace
   output.

## Done criteria

- [ ] All Pay user APIs accept valid Pay/platform app sessions and the intentional
  Supabase-cookie fallback.
- [ ] Wrong-target, invalid, and anonymous callers remain rejected.
- [ ] Existing workspace/object authorization is evaluated against the resolved
  actor ID; using an admin client does not grant access by itself.
- [ ] Shared helper and representative read/mutation/invoice tests pass with
  `bun check`, the Pay build, and `git diff --check`.

## STOP conditions

Stop if a route requires a different registered target, a route intentionally
supports only platform cookie sessions, authorization cannot be made injectable
without changing product policy, or the inventory expands beyond Pay billing
and invoice APIs. Split or amend the plan rather than silently broadening it.
