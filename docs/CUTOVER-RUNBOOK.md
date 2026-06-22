# TanStack/Rust Dual-Stack Cutover Runbook

Operational runbook for bringing up and verifying the **new** migration stack
(`apps/tanstack-web` TanStack Start frontend + `apps/backend` Rust service) as a
self-contained pair, locally or in CI, ahead of the `apps/web` → dual-stack
cutover.

> This runbook is the **operations + verification layer**. It does not restate
> the migration architecture or route-ownership design. For the architecture,
> route taxonomy, and ownership rules, see the coordinator-owned doc
> `apps/docs/platform/architecture/tanstack-rust-migration.mdx`. Do **not**
> duplicate or contradict that doc here.

---

## 1. Purpose and scope

- **In scope:** local and CI bring-up of the two-service dual stack, healthcheck
  verification, running the public-route E2E suite against it, reading the live
  migration-status snapshot, and walking the pre-cutover gate checklist.
- **Out of scope:** the architecture/design narrative, route-ownership policy,
  blue/green production deploy mechanics (`scripts/docker-web.js`), and Supabase
  migration application. Those live in their own owned docs.
- **Audience:** an operator or CI job that needs to prove the shipped dual-stack
  artifact is green before the coordinator flips traffic.

The dual stack is intentionally minimal: two services, no log-drain postgres, no
edge/sidecars. It builds the compiled **production "runner" target** (not the
hot-reload dev server) so benchmarks and gates measure the real shipped
artifact.

---

## 2. Local dual-stack bring-up

The stack is defined in
[`docker-compose.tanstack-dual.yml`](../docker-compose.tanstack-dual.yml) at the
repo root. Run all commands from the repo root.

### 2.1 Services, container names, and ports

| Service        | Container name      | Build target                                   | Published address (loopback only)        |
| -------------- | ------------------- | ---------------------------------------------- | ---------------------------------------- |
| `backend`      | `backend-dual`      | `apps/backend/Dockerfile` (default final stage) | `127.0.0.1:${BACKEND_PORT:-7820}`        |
| `tanstack-web` | `tanstack-web-dual` | `apps/tanstack-web/Dockerfile` target `runner` | `127.0.0.1:${TANSTACK_WEB_PORT:-7824}`   |

- Both ports publish on `127.0.0.1` only (not `0.0.0.0`).
- The `-dual` container-name suffix deliberately avoids collisions with the
  blue/green deploy containers (`web-blue`/`green`, `tanstack-web-blue`/`green`)
  and the log-drain postgres service.
- `tanstack-web` `depends_on` `backend` with `condition: service_healthy`, so it
  only starts once the backend healthcheck passes. They share the bridge network
  `${COMPOSE_PROJECT_NAME:-tuturuuu}-tanstack-dual`.

### 2.2 Required environment (by name — never commit values)

Env is loaded from two optional `env_file` paths (both `required: false`):

- `${DOCKER_WEB_COMPOSE_LEGACY_ENV_FILE:-apps/web/.env.local}`
- `${DOCKER_WEB_COMPOSE_ENV_FILE:-.env.local}`

Variables the compose file references (override via shell or the env files
above; **reference by name only, do not inline secrets**):

| Variable                  | Default                            | Purpose                                                    |
| ------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `TANSTACK_WEB_PORT`       | `7824`                             | Frontend published + in-container port.                   |
| `BACKEND_PORT`            | `7820`                             | Backend published + in-container port (drives the probe). |
| `BACKEND_INTERNAL_URL`    | `http://backend:7820`              | Frontend → backend service URL over the shared network.   |
| `BACKEND_PUBLIC_ORIGIN`   | `http://backend:7820`              | Public-origin hint for the frontend.                      |
| `BACKEND_INTERNAL_TOKEN`  | `platform-local-backend-token`     | Shared internal auth token (override for non-local use).  |
| `BACKEND_ENV`             | `development`                      | Backend runtime mode.                                     |
| `NODE_ENV`                | `production`                       | Frontend runtime mode.                                    |
| `COMPOSE_PROJECT_NAME`    | `tuturuuu`                         | Network-name prefix.                                      |

The defaults match `scripts/benchmark-web-setups.js` (7824 / 7820) and the prod
compose anchors. Any real secret values belong in the (git-ignored) env files,
never in this runbook or the compose file.

### 2.3 Validate, bring up, verify, tear down

```bash
# 1. Validate compose config WITHOUT starting or building anything.
docker compose -f docker-compose.tanstack-dual.yml config

# 2. Build + start, detached.
docker compose -f docker-compose.tanstack-dual.yml up -d --build

# 3. Watch both services reach `healthy`.
docker compose -f docker-compose.tanstack-dual.yml ps

# 4. Tail logs if a service stays unhealthy.
docker compose -f docker-compose.tanstack-dual.yml logs -f backend
docker compose -f docker-compose.tanstack-dual.yml logs -f tanstack-web

# 5. Tear down (add -v only if you also want to drop volumes).
docker compose -f docker-compose.tanstack-dual.yml down
```

### 2.4 Healthcheck semantics

- **`backend-dual`** uses the backend's built-in subcommand
  `["CMD", "/app/backend", "healthcheck"]`, which issues a `GET /healthz` against
  the in-container `PORT` (see `apps/backend/src/main.rs` `run_healthcheck` and
  the `/healthz` route in `apps/backend/src/lib.rs`). This matches the canonical
  container probe used in `docker-compose.web.yml`. The backend also exposes
  `/api/health`, but the subcommand is the authoritative gate.
- **`tanstack-web-dual`** runs a `CMD-SHELL` `bun` fetch against
  `http://127.0.0.1:${PORT}/` and passes only when the response is
  `status < 500` **and** the body contains the marker `Backend reachable`. This
  means the frontend healthcheck also proves frontend → backend reachability.
- Optional manual spot-checks once healthy (loopback only):

  ```bash
  # Backend liveness (HTTP form of the same route the subcommand probes).
  curl -fsS http://127.0.0.1:${BACKEND_PORT:-7820}/healthz

  # Frontend root should render the "Backend reachable" marker.
  curl -fsS http://127.0.0.1:${TANSTACK_WEB_PORT:-7824}/ | grep -q 'Backend reachable' \
    && echo 'frontend↔backend OK'
  ```

> **Dev-path caveat:** this compose file uses the compiled `runner` target, not
> the `dev:app` hot-reload path. If you switch a service to the dev target you
> must also bind-mount the full monorepo at `/workspace` and add the shared
> `node_modules`/`dist` volumes from `docker-compose.web.yml`, or workspace
> package resolution will fail. For cutover verification, keep the `runner`
> target — gates must measure the shipped artifact.

---

## 3. E2E suite against the dual stack

The Playwright suite lives in `apps/tanstack-web/e2e/`. The runner is the
`test:e2e` script in `apps/tanstack-web/package.json` (`playwright test`), using
`apps/tanstack-web/playwright.config.ts` (single `chromium` project, non-parallel,
`workers: 1`).

### 3.1 Base URL

`playwright.config.ts` resolves `baseURL` in this order:

1. `TANSTACK_WEB_E2E_BASE_URL`
2. `BASE_URL`
3. fallback `https://tanstack.tuturuuu.localhost`

To target the local dual stack on the published loopback port, set the base URL
explicitly:

```bash
cd apps/tanstack-web
TANSTACK_WEB_E2E_BASE_URL=http://127.0.0.1:7824 bun run test:e2e
```

(Adjust the port if `TANSTACK_WEB_PORT` was overridden.)

### 3.2 Spec files and coverage

| Spec file                                                   | Routes | What it asserts                                                                 |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `e2e/public-marketing-products.spec.ts`                     | 11     | `/en/products/{ai,calendar,crm,documents,drive,finance,inventory,lms,mail,tasks,workflows}` — `<h1>` + `Coming Soon` + `Contact Sales`. |
| `e2e/public-marketing-legal.spec.ts`                        | 4      | `/en/{acceptable-use,community-guidelines,privacy,terms}` — title heading + `Effective Date: February 6, 2026`. |
| `e2e/public-marketing-solutions.spec.ts`                    | 9      | `/en/solutions/{construction,education,healthcare,hospitality,manufacturing,pharmacies,realestate,restaurants,retail}` — `<h1>`. |
| `e2e/public-marketing-static.spec.ts`                       | 11     | `/en/{about,blog,branding,careers,changelog,contact,contributors,models,partners,women-in-tech}` + `/vi/about`. |

Plus the pre-existing `e2e/migration-shell.spec.ts` and the shared helper
`e2e/helpers/public-routes.ts`, which provides `DEFAULT_LOCALE='en'`,
`expectNoPublicRouteRuntimeError` (visible error-text patterns), and
`attachRuntimeErrorListeners` (captures `pageerror` + `console.error`).

All specs cover **public, no-auth** routes confirmed `migrated` in the manifest
**and** present as real route files under `apps/tanstack-web/src/routes/$locale/`.

> **Backend dependency:** `blog`, `changelog`, `contact`, and `models` hydrate
> from the Rust backend via server functions. Their static hero `<h1>` renders on
> first paint, so heading assertions pass without the backend, but a clean
> **no-console-error** pass requires `backend-dual` to be up and healthy. Always
> run E2E against the full dual stack, not the frontend alone.

### 3.3 Run a single spec or filter

```bash
cd apps/tanstack-web
TANSTACK_WEB_E2E_BASE_URL=http://127.0.0.1:7824 \
  bun run test:e2e public-marketing-products.spec.ts
```

---

## 4. Migration status snapshot

These commands read the coordinator-owned manifest
`apps/tanstack-web/migration/route-manifest.json`. **They are read/check-only as
listed here — none of them mutate the manifest.** (Note: `migration:tanstack:manifest`
*regenerates and formats* the manifest; do not run it from this lane.)

**Live snapshot (verified against the manifest at runbook authoring time):**

| Bucket             | Count |
| ------------------ | ----- |
| Total route artifacts | 1517  |
| `legacy-next`      | 1244  |
| `migrated`         | 190   |
| `accepted-removal` | 83    |

Owner split: `rust-backend` 1138, `tanstack-start` 379.

> This is a **HOT shared checkout** with a concurrent migration fleet; the
> migrated/legacy counts move continuously. Treat the table above as a sample —
> re-derive the live numbers with the check command below before relying on them.
> Terminal cutover requires `legacy-next` to reach **0** (every artifact must be
> `migrated` or `accepted-removal`, summing to the total).

### 4.1 Read/check commands (run from repo root, non-destructive)

```bash
# Generate the route tree (frontend route artifacts).
bun migration:tanstack:routes

# Manifest parity check, tolerant of remaining legacy routes (--allow-legacy).
# Use this for routine progress checks.
bun migration:tanstack:check

# Terminal cutover check: requires every route migrated/accepted (--require-migrated).
# Fails while any legacy-next route remains. Read-only.
bun migration:tanstack:cutover-check

# Full cutover gate aggregation (manifest + benchmark + e2e + cloudflare smoke).
bun migration:tanstack:gates
```

- `migration:tanstack:check` → `tanstack-migration-manifest.js check … --allow-legacy`.
- `migration:tanstack:cutover-check` → same checker with `--require-migrated`.
- `migration:tanstack:gates` → `scripts/tanstack-cutover-gates.js` (section 5).

> Do **not** run `bun migration:tanstack:manifest` from the verification lane:
> it regenerates and reformats the coordinator-owned manifest. Manifest
> regeneration is the coordinator's responsibility.

---

## 5. Pre-cutover checklist

Driven by `scripts/tanstack-cutover-gates.js` (`bun migration:tanstack:gates`).
The script aggregates five gate groups and exits non-zero if any gate is
`blocked`. Evidence reports must be **fresh** (default max age 24h;
`--evidence-max-age-ms` to override) and carry a valid `generatedAt`.

### 5.1 Gate groups

1. **Manifest gates** (always evaluated, from the manifest):
   - `route-manifest-current` — manifest tracks all current route artifacts.
   - `no-legacy-routes` — zero `legacy-next` (enforced unless `--allow-legacy`).
   - `no-unmapped-routes` — zero unmapped / unknown-status routes.
   - `backend-owned-routes-mapped` — every `api`/`cron`/`route-handler`/`trpc`
     artifact targets `rust-backend`.
   - `terminal-migration-statuses` — total = migrated + accepted-removal
     (enforced unless `--allow-legacy`).
2. **`diagnostic-evidence-skips`** — for a terminal cutover (no `--allow-legacy`),
   none of `--skip-benchmark` / `--skip-e2e` / `--skip-cloudflare-smoke` may be
   set. Skips are only tolerated on a non-terminal diagnostic run.
3. **`benchmark-compare`** — consumes `--benchmark-report <path>`. Requires
   `setup=compare`, `profile=full`, distinct Next vs TanStack origins, per-route
   samples with non-failing HTTP status, complete frontend-route coverage, and a
   passing `frontend-route-p95` plus the API/metric comparisons from
   `benchmark-web-setups.js`. Generate with `bun benchmark:web-setups -- --setup compare --profile full`.
4. **`docker-e2e-compare`** — consumes `--e2e-report <path>`. Requires
   `frontend=compare`, both `next` and `tanstack` results passing with non-zero
   executed Playwright tests, no failed tests, distinct origins, and pass-rate /
   wall-time regression within threshold (or an accepted note).
5. **`cloudflare-smoke`** — consumes `--cloudflare-smoke-report <path>`. Requires
   the report be produced by `scripts/smoke-cloudflare-workers.js`, with distinct
   backend vs TanStack origins, and all required probes passing (section 5.3).

### 5.2 Assemble and run the gates

```bash
# Pre-cutover (terminal): every evidence report must be present and fresh.
bun migration:tanstack:gates -- \
  --benchmark-report <path/to/benchmark-report.json> \
  --e2e-report <path/to/e2e-compare-report.json> \
  --cloudflare-smoke-report <path/to/cloudflare-smoke-report.json> \
  --output tmp/tanstack-cutover-gates.json

# Diagnostic (non-terminal) run while legacy routes remain:
bun migration:tanstack:gates -- --allow-legacy --skip-benchmark --skip-e2e --skip-cloudflare-smoke
```

`--output` writes the full gate result JSON; on failure the script prints each
blocked gate's label and detail to stderr.

### 5.3 Cloudflare smoke probes

Generated by `scripts/smoke-cloudflare-workers.js`. Required probe IDs the gate
enforces:

- `backend-health`
- `backend-ready`
- `backend-migration-status`
- `backend-migration-status-missing-token`
- `backend-migration-status-invalid-token`
- `tanstack-root`

```bash
node scripts/smoke-cloudflare-workers.js \
  --backend-origin  "$BACKEND_WORKER_ORIGIN" \
  --tanstack-origin "$TANSTACK_WEB_WORKER_ORIGIN" \
  --token           "$BACKEND_INTERNAL_TOKEN" \
  --output tmp/cloudflare-smoke-report.json
```

- Origins may also be supplied via `BACKEND_WORKER_ORIGIN` /
  `TANSTACK_WEB_WORKER_ORIGIN`. Provide the token **by name** — never inline it.
- Backend and TanStack origins must be **distinct**; non-localhost origins must
  be HTTPS.

### 5.4 Operator checklist

- [ ] Local dual stack builds and both containers reach `healthy` (section 2.3).
- [ ] `bun migration:tanstack:cutover-check` passes (no `legacy-next` remaining).
- [ ] E2E compare report passes for both `next` and `tanstack` frontends.
- [ ] Benchmark compare report (`setup=compare`, `profile=full`) passes all
      regression thresholds.
- [ ] Cloudflare smoke report passes all six required probes.
- [ ] `bun migration:tanstack:gates -- …` exits `0` with all evidence fresh and
      no `--skip-*` flags.

---

## 6. Coordination and ownership

This is a **HOT shared checkout** with a concurrent migration fleet. This
runbook, `docker-compose.tanstack-dual.yml`, and the `apps/tanstack-web/e2e/`
specs form an **additive verification layer** on top of the migration — they do
not own or mutate migration source-of-truth artifacts.

**Off-limits, coordinator/generated artifacts — never edit from a verification
lane:**

- `apps/tanstack-web/migration/route-manifest.json`
- `apps/tanstack-web/migration/route-overrides.json`
- `apps/tanstack-web/src/routeTree.gen.ts`
- `apps/backend/api/openapi.yaml`
- `apps/docs/platform/architecture/tanstack-rust-migration.mdx`

**Operating rules:**

- Run read/check commands (section 4) freely; they do not mutate the manifest.
  Do **not** run `bun migration:tanstack:manifest` (it regenerates the manifest)
  from this lane.
- Do **not** stage or commit from the verification lane. The coordinator owns
  commits.
- Treat any dirty or untracked path you did not create as owned by another agent
  until proven otherwise; run `git status --short` before touching files.
- The migrated/legacy counts in section 4 drift as the fleet works — always
  re-derive live numbers before making cutover decisions.
