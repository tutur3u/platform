# Plan 321: Retire Crawler-Backed Pipelines and Queues

> **Executor instructions:** Stop presenting Crawlers as two separate workflow
> products. Preserve old deep links with explicit redirects and keep migration
> tracking accurate; do not invent pipeline or queue semantics.
>
> **Drift check (run first):**
> `git diff --stat b68f9f182d..HEAD -- 'apps/web/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/pipelines' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/queues' 'apps/tanstack-web/src/routes/$locale/$wsId/pipelines.tsx' 'apps/tanstack-web/src/routes/$locale/$wsId/queues.tsx' apps/tanstack-web/migration/route-overrides.json apps/tanstack-web/migration/route-manifest.json apps/tanstack-web/src/routeTree.gen.ts tmp/agent-coordination`
> Stop on route, query-parameter, navigation, or active artifact-owner drift.

## Status

- **Execution status:** BLOCKED — obtain G22 route-artifact transfer
- **Priority:** P1
- **Effort:** M
- **Risk:** LOW
- **Category:** architecture / product correctness / tech debt
- **Depends on:** G22 TanStack migration-artifact transfer
- **Planned at:** commit `b68f9f182d`, 2026-08-12

## Why this matters

Navigation and copy promise programmable pipelines and task/job queues, but both
surfaces query `crawled_urls` and their creation forms POST to `/crawlers`.
Users receive mislabeled behavior and maintainers carry three copies of the same
Crawler UI.

## Current state and exact contract

- `apps/web/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx:763-794`
  advertises Pipelines and Queues as separate alpha AI products.
- The Web pipeline page at lines 36-67/93-123 and queue page at lines
  35-63/86-117 render crawler columns/messages and query `crawled_urls`.
  Their `form.tsx` files are byte-identical to the Crawler form and POST/PUT
  `/crawlers`.
- TanStack routes `pipelines.tsx` and `queues.tsx` both render
  `CrawlerListClientPage`; canonical `$locale/$wsId/crawlers.tsx` already owns
  `page`, `pageSize`, `domain`, and `search`.
- Retire the false products: remove both navigation entries; make Web and
  TanStack legacy routes redirect to `/${wsId}/crawlers` (including locale in
  TanStack), preserving compatible `page`, `pageSize`, `domain`, and `search`,
  and map legacy `q` to `search` only when `search` is absent. Drop unrelated
  parameters. Delete dead copied Web components after importer proof.
- Keep both legacy paths registered as redirects. Update override descriptions,
  regenerate the manifest/route tree, and do not claim the routes are deleted.
  No new UI strings are needed; removing copied message keys across the fleet is
  explicitly deferred.

## Commands and expected results

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Source proof | `rg -n 'crawled_urls|CrawlerListClientPage|/crawlers' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/(ai)/pipelines' 'apps/web/src/app/[locale]/(dashboard)/[wsId]/queues' 'apps/tanstack-web/src/routes/$locale/$wsId/pipelines.tsx' 'apps/tanstack-web/src/routes/$locale/$wsId/queues.tsx'` | only intentional redirect destinations/tests remain |
| Manifest | `bun migration:tanstack:manifest` | generated route manifest is current |
| Web tests | `bun --cwd apps/web vitest run 'src/app/[locale]/(dashboard)/[wsId]/workflow-route-redirects.test.ts' 'src/app/[locale]/(dashboard)/[wsId]/navigation-visibility.test.ts'` | both legacy redirects and navigation absence pass |
| TanStack | `bun --cwd apps/tanstack-web vitest run 'src/routes/crawler-workflow-redirects.test.ts' && bun --cwd apps/tanstack-web run build` | redirect tests and build pass |
| Web | `bun run build:web` | navigation and redirect pages compile |
| Repository | `bun check && git diff --check` | canonical and whitespace gates pass |
| Scope | `git status --short` | only declared route/navigation/artifact/test paths changed |

## Scope

**In scope:** the two Web navigation items; both Web route directories;
`apps/web/src/app/[locale]/(dashboard)/[wsId]/workflow-route-redirects.test.ts`
(create) and the existing `navigation-visibility.test.ts`; both TanStack route
modules plus `apps/tanstack-web/src/routes/crawler-workflow-redirects.test.ts`
(create); exact
route overrides, manifest, and generated route tree owned by the coordinator.

**Out of scope:** implementing real pipelines/queues; Crawler behavior/schema;
message-bundle fleet cleanup; unrelated navigation; deleting compatibility
paths; changing permissions; new dependencies.

## Git workflow

- Branch: `refactor/retire-crawler-backed-workflow-surfaces` in an isolated
  worktree; run `bun setup` immediately.
- Commit: `refactor(ai): retire crawler-backed workflow surfaces`.
- Do not push/open a PR unless instructed; claim the commit window before
  staging.

## Steps

1. Add focused tests freezing navigation absence and both redirects, including
   locale/workspace and compatible query mapping.
2. Remove the two Web navigation entries. Replace both Web pages with thin
   server redirects and delete their copied columns/forms/row-actions only after
   `rg` proves no remaining importer.
3. Replace both TanStack crawler renderers with redirect loaders that preserve
   the same mapping and never load crawler data.
4. Update override descriptions and regenerate coordinator-owned artifacts.
   Run all focused, build, manifest, repository, size, and scope gates.

## Done criteria

- [ ] Neither navigation nor either legacy path claims pipeline/queue behavior.
- [ ] Every old URL reaches canonical Crawlers with the frozen query mapping.
- [ ] No pipeline/queue route queries `crawled_urls` or renders the Crawler page.
- [ ] Manifest/route tree, Web/TanStack builds, tests, `bun check`, and scope pass.
- [ ] `plans/README.md` status is updated.

## STOP conditions

Stop if telemetry or a supported external consumer requires distinct behavior,
the canonical Crawler route lacks a compatible filter, redirects would break a
documented API contract, or G22 has not transferred the aggregate artifacts.

## Maintenance notes

A future real Pipelines or Queues product requires its own product/data-model
plan and new routes; do not revive the crawler copies as scaffolding.
