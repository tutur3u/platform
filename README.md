# Tuturuuu Platform

[![Vercel Platform Production Deployment](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml)
[![CodeQL](https://github.com/tutur3u/platform/actions/workflows/codeql.yml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/codeql.yml)
[![Test](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml)

![Tuturuuu unified workspace marketing hero](/public/tuturuuu-marketing-hero.png)

Tuturuuu is an open-source intelligent workspace platform for modern work and
life. It brings tasks, calendars, meetings, documents, storage, finance,
inventory, learning, automation, and AI-assisted workflows into one connected
operating layer.

The goal is to reduce digital friction: capture what matters, clarify the next
action, keep teams in sync, and let software handle more of the coordination
load. This monorepo contains the apps, shared packages, mobile client, SDK,
CLI, documentation, local services, and deployment tooling behind that system.

## Migration Progress

<!-- tanstack-rust-migration-progress:start -->
_Generated from `apps/tanstack-web/migration/route-manifest.json`. Refresh with `bun migration:tanstack:readme` after route ownership changes._

![Overall migration progress](https://img.shields.io/static/v1?color=fb8c00&label=Overall&message=30.7%25+terminal&style=flat-square) ![Rust backend migration progress](https://img.shields.io/static/v1?color=cf222e&label=Rust+backend&message=13.9%25+terminal&style=flat-square) ![TanStack Start migration progress](https://img.shields.io/static/v1?color=1f6feb&label=TanStack+Start&message=72.5%25+terminal&style=flat-square)

| Track | Progress | Terminal | Migrated | Removed | Remaining |
| --- | --- | ---: | ---: | ---: | ---: |
| Overall | `[######--------------]` 30.7% | 257 / 837 | 243 | 14 | 580 |
| Rust backend | `[###-----------------]` 13.9% | 83 / 597 | 71 | 12 | 514 |
| TanStack Start | `[###############-----]` 72.5% | 174 / 240 | 172 | 2 | 66 |

<details>
<summary>Remaining work by route kind</summary>

| Kind | Progress | Terminal | Remaining |
| --- | --- | ---: | ---: |
| api | `[##--------------]` 13.43% | 78 / 581 | 503 |
| page | `[###########-----]` 68.33% | 123 / 180 | 57 |
| layout | `[#############---]` 83.93% | 47 / 56 | 9 |
| cron | `[###-------------]` 18.18% | 2 / 11 | 9 |
| route-handler | `[############----]` 75% | 3 / 4 | 1 |
| trpc | `[----------------]` 0% | 0 / 1 | 1 |
| loading | `[################]` 100% | 2 / 2 | 0 |
| error | `[################]` 100% | 1 / 1 | 0 |
| not-found | `[################]` 100% | 1 / 1 | 0 |

</details>

<details>
<summary>Next legacy artifacts in the manifest</summary>

| Route | Owner | Methods | Source |
| --- | --- | --- | --- |
| `/api/ai/chat` | Rust backend | `POST` | `apps/web/src/legacy-api-routes/ai/chat/route.ts` |
| `/api/ai/chat/delete-file` | Rust backend | `POST` | `apps/web/src/legacy-api-routes/ai/chat/delete-file/route.ts` |
| `/api/ai/chat/file-urls` | Rust backend | `POST` | `apps/web/src/legacy-api-routes/ai/chat/file-urls/route.ts` |
| `/api/ai/chat/google` | Rust backend | `POST` | `apps/web/src/legacy-api-routes/ai/chat/google/route.ts` |
| `/api/ai/chat/google/new` | Rust backend | `POST` | `apps/web/src/legacy-api-routes/ai/chat/google/new/route.ts` |

</details>
<!-- tanstack-rust-migration-progress:end -->

## What Tuturuuu Builds

| Product layer | What it does | Where to start |
| --- | --- | --- |
| Command Center | Daily workspace view for tasks, appointments, reminders, quick capture, and GTD-style triage | [Command Center docs](https://docs.tuturuuu.com/platform/features/command-center-dashboard) |
| Workspace apps | Tasks, Calendar, Meet, Finance, Inventory, CMS, Track, Shortener, Learn, Teach, Rewise, Nova, Hive, and more | [Platform overview](https://docs.tuturuuu.com/platform/overview) |
| AI and automation | Mira, Nova, Rewise, model routing, structured data, workflow automation, and research surfaces like Hive | [AI docs](https://docs.tuturuuu.com/platform/ai/structured-data) |
| Mobile | Flutter workspace tools for Drive, CRM, Education, QR login approval, MFA approval, and mobile-first modules | [Mobile workspace tools](https://docs.tuturuuu.com/platform/features/mobile-workspace-tools) |
| SDK and CLI | TypeScript SDK plus the native `ttr` CLI for workspace, task, finance, storage, and automation workflows | [SDK reference](https://docs.tuturuuu.com/reference/packages/sdk) |
| Docs and operations | Product docs, architecture notes, local development, Docker, CI, deployment, and runbooks | [Build docs](https://docs.tuturuuu.com/build/overview) |

## Start Here

| Need | Go to |
| --- | --- |
| Product vision and platform architecture | [docs.tuturuuu.com](https://docs.tuturuuu.com) |
| Local development setup | [Development Guide](https://docs.tuturuuu.com/build/development-tools/development) |
| Monorepo architecture | [Monorepo Architecture](https://docs.tuturuuu.com/build/development-tools/monorepo-architecture) |
| Docker and blue/green deployment | [Web Docker Deployment](https://docs.tuturuuu.com/build/devops/web-docker-deployment) |
| Autonomous agent guardrails | [AGENTS.md](./AGENTS.md) |
| Contributor rules | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Security policy | [SECURITY.md](./SECURITY.md) |

## Repository Map

```txt
apps/
  web/                  Main platform app, dashboard, and centralized APIs
  mobile/               Flutter app for iOS and Android
  docs/                 Mintlify documentation site
  database/             Supabase migrations, seeds, tests, and typegen
  calendar|cms|finance|inventory|meet|tasks|track|...  Satellite apps
  hive|hive-realtime    Research world editor and realtime service
  redis|discord|backend|storage-unzip-proxy|...         Supporting services
packages/
  ui|icons|hooks|utils|types|supabase|auth|internal-api  Shared product foundation
  ai|trigger|workflows|sdk|payment|apis|...              AI, automation, SDK, and integrations
scripts/
  check, Docker, CI, local environment, release, and developer tooling
```

Tuturuuu uses a Turborepo monorepo so product changes can move atomically across
apps, database schema, generated types, shared packages, tests, and docs.
Internal packages use `workspace:*`; prefer shared packages before introducing
app-local duplicates.

## Technology Foundation

| Layer | Choices |
| --- | --- |
| Runtime and package manager | Bun 1.3.x, Node.js 22+ |
| Monorepo orchestration | Turborepo |
| Web apps | Next.js 16 App Router, React 19, TypeScript |
| Local app routing | Portless, stable `https://*.tuturuuu.localhost` origins |
| UI | Tailwind CSS 4, Radix/Shadcn patterns, `@tuturuuu/ui`, `@tuturuuu/icons` |
| Data | Supabase PostgreSQL with RLS and generated database types |
| Client state | TanStack Query, Jotai, nuqs |
| APIs | Next.js Route Handlers, tRPC, `@tuturuuu/internal-api` |
| AI | Vercel AI SDK and provider-specific packages |
| Mobile | Flutter, Dart, BLoC/Cubit |
| Tests and checks | Vitest, Playwright, Biome, tsc, Flutter checks |
| Deployment | Vercel, GitHub Actions, Docker blue/green workflow |

## Quick Start

Install the required tools:

- [Bun](https://bun.sh/) 1.3.x
- [Node.js](https://nodejs.org/) 22 or newer
- [Docker](https://www.docker.com/) for Supabase, Redis, and Dockerized web
  workflows
- Flutter SDK for `apps/mobile`
- Rust toolchain for `apps/backend`
- Python and `uv` for `apps/discord`

Clone and install:

```bash
git clone https://github.com/tutur3u/platform.git
cd platform
bun i
```

Create only the environment files needed for the apps you plan to run. Most web
work starts with:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Then fill in Supabase, auth, AI, email, storage, and integration variables as
needed. Keep secrets in local env files or deployment secret stores, never in
git.

## Local Development

The default local experience uses Portless, so apps get stable HTTPS subdomains
instead of relying on fallback ports:

| App | Local URL |
| --- | --- |
| Platform | `https://tuturuuu.localhost` |
| Calendar | `https://calendar.tuturuuu.localhost` |
| CMS | `https://cms.tuturuuu.localhost` |
| External | `https://external.tuturuuu.localhost` |
| Finance | `https://finance.tuturuuu.localhost` |
| Hive | `https://hive.tuturuuu.localhost` |
| Inventory | `https://inventory.tuturuuu.localhost` |
| Learn | `https://learn.tuturuuu.localhost` |
| Meet | `https://meet.tuturuuu.localhost` |
| Nova | `https://nova.tuturuuu.localhost` |
| Rewise | `https://rewise.tuturuuu.localhost` |
| Shortener | `https://shortener.tuturuuu.localhost` |
| Tasks | `https://tasks.tuturuuu.localhost` |
| Teach | `https://teach.tuturuuu.localhost` |
| Track | `https://track.tuturuuu.localhost` |

Run the main platform:

```bash
bun dev:web
```

Start local Supabase first when you need a local database:

```bash
bun sb:start
bun dev:web
```

Use convenience scripts when you want the workflow to manage Supabase:

```bash
bun devx:web     # start Supabase, then run web
bun devrs:web    # reset and seed Supabase, then run web
```

Run a focused app from the root when a matching script exists:

```bash
bun dev:calendar
bun dev:cms
bun dev:finance
bun dev:inventory
bun dev:meet
bun dev:nova
bun dev:rewise
bun dev:shortener
bun dev:tasks
bun dev:track
bun dev:learn
bun dev:teach
bun dev:hive
bun dev:external
```

Use `bun dev:edu` when working on Learn and Teach together with the central web
app for cross-app login. Run mobile and docs separately:

```bash
bun dev:mobile
bun dev:docs
```

Do not run long-lived development servers or build commands in automation unless
the task explicitly calls for them.

## Data And Local Services

Supabase lives in `apps/database` and is exposed through root scripts:

| Command | Purpose |
| --- | --- |
| `bun sb:start` | Start local Supabase |
| `bun sb:stop` | Stop local Supabase |
| `bun sb:reset` | Reset local Supabase and regenerate types |
| `bun sb:new` | Create a migration |
| `bun sb:up` | Apply local migrations and regenerate types |
| `bun sb:typegen` | Regenerate database types |
| `bun redis:start` | Start local Redis and the Serverless Redis HTTP proxy |
| `bun redis:stop` | Stop local Redis services |

Production Supabase pushes are not part of the normal contributor flow. Prepare
migrations in the repo and let the release operator apply them.

## Docker And Deployment

The web app has Docker workflows for development, production-like local runs,
and self-hosted blue/green deployment.

| Command | Purpose |
| --- | --- |
| `bun dev:web:docker` | Run the web development workflow inside Docker |
| `bun devx:web:docker` | Start local Supabase, then run Docker web development |
| `bun devrs:web:docker` | Reset local Supabase, then run Docker web development |
| `bun dev:web:docker:down` | Stop the Docker development stack |
| `bun serve:web:docker` | Run the production web image in place |
| `bun serve:web:docker:bg` | Run blue/green production deployment |
| `bun serve:web:docker:bg:watch` | Poll the tracked branch and deploy new fast-forwards |
| `bun serve:web:docker:down` | Stop the production Docker stack |
| `bun serve:web:docker:bg:down` | Stop blue/green runtime state |

Dockerized web commands read `apps/web/.env.local`. Redis is enabled by default
inside the Docker web flow and can be disabled with `--without-redis` when
testing Redis-unavailable behavior. In that mode, `apps/web` fails open for
Redis-backed route rate limits and IP-block enforcement while preserving normal
auth, authorization, payload-size, Turnstile, suspension, and validation checks.

See the [Web Docker Deployment](https://docs.tuturuuu.com/build/devops/web-docker-deployment)
runbook for flags, lock recovery, BuildKit throttling, blue/green cutover, and
runtime file details.

## SDK And CLI

The `tuturuuu` package in `packages/sdk` ships the public TypeScript SDK and the
native Bun-powered `ttr` CLI.

Use the repo-local CLI during development:

```bash
bun ttr --help
bun ttr whoami --no-update-check
bun ttr tasks --json --no-update-check
```

Use the globally installed `ttr` for normal user workflows, login, and upgrade
management:

```bash
ttr login
ttr workspaces
ttr tasks --compact
ttr finance wallets
```

The SDK covers workspace storage, files, documents, EPM delivery and management,
task workflows, finance workflows, and agent-friendly JSON output.

## Quality Gates

Use the narrowest focused check first, then the repo-level check when your
change touches TypeScript, JavaScript, root scripts, or shared config.

| Command | Purpose |
| --- | --- |
| `bun format:fix <files>` | Format specific files with Biome |
| `bun i18n:sort` | Sort message files after translation edits |
| `bun test` | Run package test tasks through Turbo |
| `bun test:scripts` | Run root script tests |
| `bun type-check` | Run type-check tasks through Turbo |
| `bun check` | Run the repository validation suite |
| `bun check:docker` | Validate Docker web configuration |
| `bun check:mobile` | Run Flutter mobile validation |
| `git diff --check` | Catch whitespace issues before commit |

For Markdown-only changes, keep the file manually formatted and run
`git diff --check`. For product, API, schema, or shared package changes, follow
the focused verification for that surface and the guardrails in `AGENTS.md`.

## Contributor Expectations

Before making broad or automated changes, read [AGENTS.md](./AGENTS.md). It is
the operating manual for this checkout and includes the full guardrail set.

The short version:

- Check `git status --short` before editing and avoid unrelated dirty files.
- Use Conventional Commit style for authored commits.
- Default to Server Components in Next.js; use client components only for
  browser state, browser APIs, or interaction.
- Use TanStack Query for client-side data fetching and mutations.
- Put authenticated app API access behind `packages/internal-api/src/*`.
- Import shared database row shapes from `@tuturuuu/types/db` where possible.
- Update both English and Vietnamese message bundles for user-facing strings.
- Add dashboard routes to the relevant `navigation.tsx` aliases, children,
  icons, and permissions.
- Keep durable workflow, deployment, architecture, debugging, and operations
  knowledge in `apps/docs`.

## CI, Security, And License

GitHub Actions cover branch naming, Biome, type checks, tests, CodeQL, mobile
builds, Supabase checks, Vercel preview and production deployments, package
releases, Docker setup checks, and Discord Modal deployment.

Production web deployments primarily target Vercel. The Docker workflow exists
for local production simulation and self-hosted blue/green operation.

Security issues should be reported through [SECURITY.md](./SECURITY.md).

This project is licensed under the Apache License, Version 2.0. See
[LICENSE](./LICENSE) for details.
