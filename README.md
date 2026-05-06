# Tuturuuu Platform

[![Vercel Platform Production Deployment](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml)
[![CodeQL](https://github.com/tutur3u/platform/actions/workflows/codeql.yml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/codeql.yml)
[![Test](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml)

![Tuturuuu Cover](/public/cover.png)

Tuturuuu is an open-source workspace platform for modern work and life. This
repository contains the product apps, mobile app, infrastructure helpers,
shared packages, SDK, documentation, and local development tooling that power
the Tuturuuu ecosystem.

The north star is simple: reduce digital friction so people can spend more
time on meaningful work. The implementation is a Turborepo monorepo centered on
Next.js, Supabase, Bun, Flutter, and a growing set of AI-powered product
surfaces.

## Start Here

| Need | Go to |
| --- | --- |
| Product and architecture docs | [docs.tuturuuu.com](https://docs.tuturuuu.com) |
| Development workflow | [Development Guide](https://docs.tuturuuu.com/build/development-tools/development) |
| Web Docker operations | [Web Docker Deployment](https://docs.tuturuuu.com/build/devops/web-docker-deployment) |
| Agent instructions | [AGENTS.md](./AGENTS.md) |
| Contribution rules | [CONTRIBUTING.md](./CONTRIBUTING.md) |
| Security policy | [SECURITY.md](./SECURITY.md) |

## Repository Map

### Applications

| Path | Runtime | Purpose | Local entry |
| --- | --- | --- | --- |
| `apps/web` | Next.js, port 7803 | Main platform, dashboard, APIs, workspace modules | `bun dev:web` |
| `apps/calendar` | Next.js, port 7806 | Calendar satellite app | `bun dev:calendar` |
| `apps/cms` | Next.js, port 7811 | Content management satellite app | `bun dev:cms` |
| `apps/finance` | Next.js, port 7808 | Finance satellite app | `bun dev:finance` |
| `apps/meet` | Next.js, port 7807 | Meeting satellite app | `bun dev:meet` |
| `apps/nova` | Next.js, port 7805 | Prompt engineering and AI challenge app | `bun dev:nova` |
| `apps/rewise` | Next.js, port 7804 | Multi-model AI chat app | `bun dev:rewise` |
| `apps/shortener` | Next.js, port 3002 | URL shortener | `bun dev:shortener` |
| `apps/tasks` | Next.js, port 7809 | Task management satellite app | `bun dev:tasks` |
| `apps/track` | Next.js, port 7810 | Time tracking satellite app | `bun dev:track` |
| `apps/learn` | Next.js, port 7812 | Learning experience app | `bun dev:learn` |
| `apps/teach` | Next.js, port 7813 | Teacher companion app | `bun dev:teach` |
| `apps/external` | Next.js, port 3000 | SDK and integration demo app | `bun dev:external` |
| `apps/playground` | Next.js, port 3003 | Experimentation sandbox | package-local `bun dev` |
| `apps/mobile` | Flutter | Mobile workspace tools | `bun dev:mobile` |
| `apps/docs` | Mintlify | Public documentation site | `bun dev:docs` |
| `apps/database` | Supabase | Local schema, migrations, seeds, typegen | `bun sb:start` |
| `apps/redis` | Docker | Local Redis and Serverless Redis HTTP proxy | `bun redis:start` |
| `apps/discord` | Python, Modal | Discord bot and MarkItDown service | see `apps/discord/README.md` |
| `apps/backend` | Rust, Axum | Rust backend learning project | see `apps/backend/README.md` |
| `apps/storage-unzip-proxy` | Bun | Storage ZIP extraction helper | package-local `bun start` |
| `apps/pronunciation-assessor` | Python | Pronunciation assessment helper service | Docker workflow |

### Shared Packages

| Area | Packages |
| --- | --- |
| UI and product primitives | `@tuturuuu/ui`, `@tuturuuu/icons`, `@tuturuuu/hooks`, `@tuturuuu/utils`, `@tuturuuu/masonry`, `@tuturuuu/games`, `@tuturuuu/offline` |
| Data, auth, and app boundaries | `@tuturuuu/types`, `@tuturuuu/supabase`, `@tuturuuu/auth`, `@tuturuuu/internal-api`, `@tuturuuu/satellite` |
| AI and automation | `@tuturuuu/ai`, `@tuturuuu/trigger`, `@tuturuuu/workflows`, `tuturuuu` |
| Integrations | `@tuturuuu/apis`, `@tuturuuu/google`, `@tuturuuu/microsoft`, `@tuturuuu/vercel`, `@tuturuuu/turnstile` |
| Business systems | `@tuturuuu/payment`, `@tuturuuu/transactional`, `@tuturuuu/email-service` |
| Tooling | `@tuturuuu/typescript-config` |

## Tech Stack

| Layer | Choices |
| --- | --- |
| Runtime and package manager | Bun 1.3.x, Node.js 22+ |
| Monorepo orchestration | Turborepo |
| Web apps | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS 4, Radix/Shadcn patterns, Tuturuuu UI package |
| Data | Supabase PostgreSQL with RLS, generated database types |
| Client state | TanStack Query, Jotai, nuqs |
| APIs | Next.js Route Handlers, tRPC, internal API package |
| AI | Vercel AI SDK and provider-specific packages |
| Mobile | Flutter, Dart, BLoC/Cubit |
| Tests and checks | Vitest, Playwright, Biome, tsgo, Flutter checks |
| Deployment | Vercel, GitHub Actions, Docker blue/green workflow |

## Prerequisites

- [Bun](https://bun.sh/) 1.3.x
- [Node.js](https://nodejs.org/) 22 or newer
- [Docker](https://www.docker.com/) for local Supabase, Redis, and Dockerized
  web workflows
- Flutter SDK for `apps/mobile`
- Rust toolchain for `apps/backend`
- Python and `uv` for `apps/discord`

## Local Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/tutur3u/platform.git
cd platform
bun i
```

Create environment files from the app-level examples you need. Most web work
starts with:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Then fill in Supabase, auth, AI, email, storage, and integration variables as
needed. Keep secrets in local env files or deployment secret stores, never in
git.

## Development Workflows

### Main Web App

Run the main platform plus the packages it depends on:

```bash
bun dev:web
```

Start local Supabase first when you need a local database:

```bash
bun sb:start
bun dev:web
```

Use the shortcut when you want the script to start Supabase for you:

```bash
bun devx:web
```

Use a clean, seeded database when debugging flows that depend on seed data:

```bash
bun devrs:web
```

### Satellite Apps

Satellite apps run through filtered Turborepo scripts and usually depend on
`apps/web` for protected product APIs.

```bash
bun dev:calendar
bun dev:cms
bun dev:finance
bun dev:meet
bun dev:nova
bun dev:rewise
bun dev:shortener
bun dev:tasks
bun dev:track
bun dev:learn
```

### Mobile

```bash
bun dev:mobile
```

For verification, prefer the mobile checker:

```bash
bun check:mobile
```

### Documentation

```bash
bun dev:docs
```

Documentation source lives in `apps/docs`. New docs pages must be registered in
`apps/docs/docs.json`.

## Database Workflow

Local Supabase is owned by `apps/database` and exposed through root scripts.

| Command | Purpose |
| --- | --- |
| `bun sb:start` | Start local Supabase |
| `bun sb:stop` | Stop local Supabase |
| `bun sb:reset` | Reset local Supabase and regenerate types |
| `bun sb:new` | Create a migration |
| `bun sb:up` | Apply local migrations and regenerate types |
| `bun sb:typegen` | Regenerate database types |

Production Supabase pushes are intentionally not part of the normal contributor
flow. Prepare migrations in the repo and let the release operator apply them.

## Docker Web Workflow

The web app has a Docker workflow for development, production-like local runs,
and self-hosted blue/green deployments.

| Command | Purpose |
| --- | --- |
| `bun dev:web:docker` | Run the web dev workflow inside Docker |
| `bun devx:web:docker` | Start local Supabase, then run Docker web dev |
| `bun devrs:web:docker` | Start and reset local Supabase, then run Docker web dev |
| `bun dev:web:docker:down` | Stop the Docker dev stack |
| `bun serve:web:docker` | Run production web image in place |
| `bun serve:web:docker:bg` | Run blue/green production deployment |
| `bun serve:web:docker:bg:watch` | Poll the tracked branch and deploy new fast-forwards |
| `bun serve:web:docker:down` | Stop the production Docker stack |
| `bun serve:web:docker:bg:down` | Stop blue/green runtime state |

Dockerized web commands read `apps/web/.env.local`. Redis is enabled by default
inside the Docker web flow and can be disabled with `--without-redis` when
testing the memory-only fallback path.

See the [Web Docker Deployment](https://docs.tuturuuu.com/build/devops/web-docker-deployment)
runbook for flags, lock recovery, BuildKit throttling, blue/green cutover, and
runtime file details.

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

Do not use `bun build`, `bun run build`, or long-running dev servers in
automation unless the task explicitly calls for them.

## Engineering Standards

These are the rules most often needed while navigating the repo:

- Default to Server Components in Next.js. Add client components only for state,
  browser APIs, or interaction.
- Use TanStack Query for client-side data fetching and mutations. Do not fetch
  app data from `useEffect`.
- Put authenticated app API access behind `packages/internal-api/src/*` instead
  of scattering raw `fetch('/api/...')` calls.
- Import shared database row shapes from `@tuturuuu/types/db` where possible.
- Update both English and Vietnamese message bundles for user-facing strings.
- Run `bun i18n:sort` after editing message JSON.
- Add dashboard routes to the relevant `navigation.tsx` aliases, children,
  icons, and permissions.
- Use `@tuturuuu/icons` instead of emoji or ad-hoc icon code in UI.
- Use `@tuturuuu/ui/dialog` instead of native browser dialogs.
- Use `serverLogger.*` in `apps/web` server runtime code instead of raw
  server-side `console.*`.
- Keep durable workflow, deployment, architecture, and debugging knowledge in
  `apps/docs`.

Read [AGENTS.md](./AGENTS.md) before making broad or automated changes. It is
the operational manual for this checkout and includes the full guardrail set.

## Tuturuuu CLI

The `tuturuuu` package in `packages/sdk` ships the public TypeScript SDK and the
native `ttr` CLI.

Run the repo-local CLI during development:

```bash
bun ttr --help
bun ttr whoami --no-update-check
bun ttr tasks --json --no-update-check
```

Use the globally installed `ttr` for normal user workflows, login, and upgrade
management.

## CI And Deployment

GitHub Actions cover branch naming, Biome, type checks, tests, CodeQL, mobile
builds, Supabase checks, Vercel preview and production deployments, package
releases, Docker setup checks, and Discord Modal deployment.

Production web deployments primarily target Vercel. The Docker workflow exists
for local production simulation and self-hosted blue/green operation.

## Contributing

1. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and [AGENTS.md](./AGENTS.md).
2. Check `git status --short` before editing.
3. Keep your write set scoped and avoid touching unrelated dirty files.
4. Add or update tests and docs in the same change when behavior or workflow
   changes.
5. Run the focused verification for your area, then `bun check` when required.
6. Use Conventional Commit style for commits.

Security issues should be reported through [SECURITY.md](./SECURITY.md).

## License

This project is licensed under the Apache License, Version 2.0. See
[LICENSE](./LICENSE) for details.
