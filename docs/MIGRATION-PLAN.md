# apps/web → apps/tanstack-web + apps/backend Migration Plan

> **Scope.** This is the strategic, phased plan for moving the platform off the
> legacy Next.js app (`apps/web`, port 7803) onto a dedicated **TanStack Start
> frontend** (`apps/tanstack-web`, dev port 7824) plus a **Rust backend**
> (`apps/backend`, port 7820). It complements two existing documents and does
> not replace them:
> - Architecture contract: `apps/docs/platform/architecture/tanstack-rust-migration.mdx` (coordinator-owned).
> - Operational bring-up + cutover verification: [`docs/CUTOVER-RUNBOOK.md`](./CUTOVER-RUNBOOK.md).
>
> The route migration itself is driven by a fleet of agents against the
> coordinator-owned manifest (`apps/tanstack-web/migration/route-manifest.json`).
> Treat the manifest as the live source of truth; the counts below are a snapshot.

## 1. Current State (snapshot 2026-06-21)

Verified against `apps/tanstack-web/migration/route-manifest.json`:

| Status | Count | Share |
| --- | --- | --- |
| `legacy-next` (not yet migrated) | 1245 | 82.1% |
| `migrated` (terminal in TanStack/Rust) | 189 | 12.5% |
| `accepted-removal` (intentionally not ported) | 83 | 5.5% |
| **Total tracked routes** | **1517** | 100% |

By route kind (migrated share):

| Kind | Migrated | Notes |
| --- | --- | --- |
| API (`/api/**`) | ~12% (978 legacy) | **Dominant bottleneck.** Mostly `/api/v1/*` and `/api/[wsId]/*`. |
| Page | ~27% (223 legacy) | 75 workspace-settings, 48 module, ~20 core dashboard. |
| Layout | ~61% (26 legacy) | Furthest along; app-shell helpers centralized. |
| Cron | ~10% (17 legacy) | Discord/cron proxies; some blocked. |

**Already strong:** public/marketing surface (products, solutions, legal,
landing, ui-docs, utilities) is essentially fully migrated. The Rust backend has
~22 handler modules (`auth_me`, `changelog`, `contact`, `inventory`, `nova`,
`onboarding_progress`, `workspace_limits`, …).

**The long pole** is backend/API parity: authenticated pages cannot terminally
migrate until their data + session endpoints are Rust/TanStack-server owned.

## 2. Migration Tooling (source of truth)

| Command | Purpose |
| --- | --- |
| `bun migration:tanstack:manifest` | Regenerate the route manifest (coordinator-owned). |
| `bun migration:tanstack:routes` | Regenerate `routeTree.gen.ts` (coordinator-owned). |
| `bun migration:tanstack:check` | Validate manifest consistency (`--allow-legacy`). |
| `bun migration:tanstack:gates` | Run cutover gates against the manifest. |
| `scripts/tanstack-cutover-gates.js` | Gate categories + Cloudflare smoke probes. |
| `scripts/benchmark-web-setups.js` | Compare legacy vs new stack performance. |
| `docker-compose.tanstack-dual.yml` | Bring up both stacks for E2E/benchmarks/gates. |

## 3. Phased Plan

Phases overlap in practice (a fleet runs them in parallel), but the **dependency
order** is: backend session/data parity → authenticated pages → API bulk →
cutover. Public/static work and the verification layer run independently.

### Phase 0 — Foundations *(done / in progress)*
- ✅ Scaffold `apps/tanstack-web` (TanStack Start) and `apps/backend` (Rust).
- ✅ Route manifest + cutover-gate tooling + benchmarks.
- ✅ Public/marketing route migration (mostly terminal).
- ✅ Dual-stack `docker-compose.tanstack-dual.yml`, public-route E2E suite, and
  `docs/CUTOVER-RUNBOOK.md` (this contributor's additive verification layer).

### Phase 1 — Backend session & auth parity *(critical path, P0)*
Unblocks every authenticated page. Migrate to Rust/TanStack-server:
- Cross-app session/token validation and `/api/v1/auth/accounts/*`.
- Current-user profile (`/api/v1/users/me/profile`) and core identity reads.
- **Exit criteria:** authenticated requests resolve a session without `apps/web`.

### Phase 2 — Workspace data API parity *(P1)*
- Workspace membership, limits/tier, and the highest-traffic `/api/[wsId]/*`
  read endpoints behind dashboard pages.
- **Exit criteria:** the top dashboard pages can fetch their data backend-owned.

### Phase 3 — Authenticated app shell & providers
- Dashboard layout, next-intl/Nuqs/toast/auth-badge/production-DB-badge parity,
  service-worker decommission (`/serwist/*` is terminally Rust-owned).
- **Exit criteria:** the `/[wsId]` shell renders in TanStack with real session.

### Phase 4 — Module & settings pages
- The 48 module pages and 75 workspace-settings pages, migrated in clusters once
  their Phase 1–2 endpoints exist.
- **Exit criteria:** module/settings pages terminal in the manifest.

### Phase 5 — API bulk migration
- The remaining ~978 legacy API routes, batched by domain, each with backend
  tests (`cargo test`) and OpenAPI updates (coordinator-owned `openapi.yaml`).
- **Exit criteria:** legacy `/api/**` share trends to zero.

### Phase 6 — Cutover & decommission
- All gate categories green; benchmarks within budget; Cloudflare smoke probes
  pass; E2E green against `docker-compose.tanstack-dual.yml`.
- Flip traffic; keep `apps/web` as fallback for one release; then decommission.
- See [`docs/CUTOVER-RUNBOOK.md`](./CUTOVER-RUNBOOK.md) for the operational checklist.

## 4. Verification Layer (cross-cutting, every phase)

- **E2E:** `apps/tanstack-web/e2e/**` — public-route suite exists; extend per
  phase as authenticated routes migrate. Run against the dual-stack compose.
- **Gates:** `bun migration:tanstack:gates` must stay green; wire into CI once a
  dual-stack E2E job exists.
- **Benchmarks:** compare legacy vs new before each cutover decision.

## 5. Coordination & Ownership

- **Coordinator-owned (do not edit ad hoc):** `route-manifest.json`,
  `route-overrides.json`, `routeTree.gen.ts`, `apps/backend/api/openapi.yaml`,
  `apps/docs/platform/architecture/tanstack-rust-migration.mdx`.
- Route/backend migration happens in disjoint lanes coordinated through
  `tmp/agent-coordination/` notes and the `bun git-commit-window`. See the
  `tuturuuu-agent-coordination` skill for the shared-checkout protocol.
- This plan is additive guidance; when it disagrees with the live manifest or the
  architecture contract, those win.
