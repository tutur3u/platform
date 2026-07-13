---
name: tuturuuu-browser-vercel-debugging
description: Tuturuuu browser and Vercel CLI development, production troubleshooting, verification, performance, and product-improvement guidance. Use when reproducing a deployed UI or API bug, correlating browser failures with Vercel runtime/build logs, checking satellite-domain routing and authentication, auditing responsive or i18n behavior, investigating Vercel cost or latency, or verifying a fix without modifying customer data.
---

# Tuturuuu Browser And Vercel Debugging

## Core Workflow

Use browser evidence and Vercel evidence as two views of the same request:

1. Identify the owning app, domain, workspace, route, deployment, and expected
   behavior.
2. Reproduce with the authenticated browser session the user supplied.
3. Capture the final URL, visible state, console errors, failed requests,
   timestamps, status codes, and request IDs without exposing secrets or
   customer records.
4. Use the Vercel CLI to resolve the alias to a deployment and query a bounded
   runtime-log window for the same host, route, time, status, or request ID.
5. Trace the owning route and authentication boundary in source. Add a focused
   regression test before changing behavior when practical.
6. Patch the smallest owning surface, run focused validation, and only claim
   production verification after the fix is deployed.

Read `references/production-debugging-playbook.md` for browser selection,
Vercel CLI commands, common Tuturuuu failure signatures, performance/cost
investigation, and product-improvement checks.

## Production Safety

- Keep production browser and Vercel work read-only by default.
- Do not create, edit, delete, submit, approve, invoice, attend, move, or bulk
  update production data unless the user explicitly authorizes that mutation.
- When mutation is required, prefer a test-owned or personal workspace and
  clearly identify cleanup responsibility. Never reuse customer records as
  test fixtures.
- Never print cookies, authorization headers, session tokens, environment
  values, raw customer payloads, or private logs. Report environment variable
  names and sanitized metadata only.
- Do not use `vercel deploy`, project removal, alias changes, environment
  mutation, rollback, or promotion commands unless the user explicitly asks.
- Bound log queries with `--since`, `--until`, `--limit`, route/status filters,
  or a request ID. Use `--follow` only for an explicit monitoring task.

## Browser Selection

- Prefer the in-app Browser plugin when the user says they logged in there or
  its authenticated state is already available.
- Use the Chrome plugin when Chrome was explicitly requested, the in-app
  session is stale, or the required authenticated state exists only in Chrome.
- Reuse or create a named task tab, leave user-owned tabs alone, and finalize
  only tabs opened for the task.
- Prefer semantic DOM snapshots and targeted console/network inspection over
  repeated screenshots. Use screenshots when visual layout, responsiveness,
  clipping, contrast, or loading state is part of the bug.

## Evidence Standard

Distinguish these states in updates and final reports:

- **Reproduced:** the current deployed behavior was observed.
- **Diagnosed:** browser and server evidence identify the failing boundary.
- **Fixed locally:** source and focused tests support the patch.
- **Deployed:** Vercel resolves the production alias to a deployment containing
  the fix.
- **Verified in production:** the deployed flow was rechecked safely.

Do not collapse “tests pass” into “verified in production.” If safe production
verification would require a mutation that was not authorized, say so.

## Product Improvement Loop

Use the same workflow for proactive improvement, not only break/fix work:

- exercise English and Vietnamese, desktop and narrow/mobile layouts, keyboard
  navigation, empty/loading/error states, and restricted-role behavior
- identify raw translation keys, noisy retries, duplicate fetches, hydration or
  hook-order errors, rewrite hops, and unnecessary server invocations
- correlate high-frequency routes and slow/error-prone requests with the
  owning client polling, cache, or server-rendering behavior
- measure before changing caching; never cache user-specific, permissioned, or
  Supabase-authenticated data as if it were public
- turn every confirmed production regression into a focused automated test

## Verification

Run the smallest source checks that prove the fix, then the repo-required
validation for touched files. Keep browser verification read-only unless the
user authorized a test mutation. Record any unrelated `bun check`, deployment,
or log-retention blocker without widening the patch.
