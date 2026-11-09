# Tuturuuu

<p align="center">
  <img src="apps/web/public/media/branding/tuturuuu.svg" alt="Tuturuuu" width="80" />
</p>

[![Vercel Platform Production Deployment](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml)
[![CodeQL](https://github.com/tutur3u/platform/actions/workflows/codeql.yml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/codeql.yml)
[![Test](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml)

![Tuturuuu workspace](public/tuturuuu-marketing-hero.png)

## What is Tuturuuu

Tuturuuu is an open-source workspace for modern work and life. Tasks, calendar, meetings, mail, documents, files, finance, inventory, and learning live in one connected system, so people can capture what matters, see the next action, and keep a team in sync. The goal is to take the coordination load off the people doing the work.

This repository holds the apps, shared packages, mobile client, SDK, CLI, docs, and deployment tooling behind that system.

## Products

Each product is its own app under `apps/`, on its own site. [apps.tuturuuu.com](https://apps.tuturuuu.com) is the launcher. The [product directory](https://docs.tuturuuu.com/platform/applications/overview) is the longer guide.

| Product | What it is for | Open |
| --- | --- | --- |
| Platform | Workspace home for the account and shared tools | [tuturuuu.com](https://tuturuuu.com) |
| Apps | Launcher that sends you to each product | [apps.tuturuuu.com](https://apps.tuturuuu.com) |
| Tasks | Boards, cycles, and task organization | [tasks.tuturuuu.com](https://tasks.tuturuuu.com) |
| Calendar | Events and scheduling | [calendar.tuturuuu.com](https://calendar.tuturuuu.com) |
| Track | Timers, session history, and time requests | [track.tuturuuu.com](https://track.tuturuuu.com) |
| Meet | Plans, rooms, calls, and follow-ups | [meet.tuturuuu.com](https://meet.tuturuuu.com) |
| Chat | Direct messages, groups, and channels | [chat.tuturuuu.com](https://chat.tuturuuu.com) |
| Mail | Team mailboxes | [mail.tuturuuu.com](https://mail.tuturuuu.com) |
| Drive | Workspace files and folders | [drive.tuturuuu.com](https://drive.tuturuuu.com) |
| Mind | Mindboards and knowledge planning | [mind.tuturuuu.com](https://mind.tuturuuu.com) |
| Contacts | Workspace CRM, groups, and attendance | [contacts.tuturuuu.com](https://contacts.tuturuuu.com) |
| Finance | Wallets, transactions, invoices, and budgets | [finance.tuturuuu.com](https://finance.tuturuuu.com) |
| Inventory | Stock, catalog, and checkout | [inventory.tuturuuu.com](https://inventory.tuturuuu.com) |
| Storefront | Published shops and orders (`apps/storefront`) | [store.tuturuuu.com](https://store.tuturuuu.com) |
| Pay | Workspace billing and subscriptions | [pay.tuturuuu.com](https://pay.tuturuuu.com) |
| Forms | Form studio, share links, and responses | [forms.tuturuuu.com](https://forms.tuturuuu.com) |
| CMS | Pages, media, and publishing | [cms.tuturuuu.com](https://cms.tuturuuu.com) |
| Learn | Courses and practice for learners and parents | [learn.tuturuuu.com](https://learn.tuturuuu.com) |
| Teach | Education tools for teachers | [teach.tuturuuu.com](https://teach.tuturuuu.com) |
| Nova | Prompt-engineering lessons and challenges | [nova.tuturuuu.com](https://nova.tuturuuu.com) |
| AI Studio | Model policy, prompts, and runs (`apps/ai`) | [ai.tuturuuu.com](https://ai.tuturuuu.com) |
| Rewise | Private AI conversations | [rewise.tuturuuu.com](https://rewise.tuturuuu.com) |
| Tulletin | Creative notebooks and published worlds (`apps/lettin`) | [lettin.tuturuuu.com](https://lettin.tuturuuu.com) |
| Colab | Collaborative programming workshops | [colab.tuturuuu.com](https://colab.tuturuuu.com) |
| Hive | Voxel research and simulation | [hive.tuturuuu.com](https://hive.tuturuuu.com) |
| Parley | Scenario training sessions | [parley.tuturuuu.com](https://parley.tuturuuu.com) |
| Tools | QR codes and small public utilities | [tools.tuturuuu.com](https://tools.tuturuuu.com) |
| Git | Public repository browser | [git.tuturuuu.com](https://git.tuturuuu.com) |
| Shortener | Short-link redirects, including [ttr.gg](https://ttr.gg) | [shortener.tuturuuu.com](https://shortener.tuturuuu.com) |
| Docs | Product and engineering guides (`apps/docs`) | [docs.tuturuuu.com](https://docs.tuturuuu.com) |
| Mobile | Native workspace client (`apps/mobile`) | [Download](https://tuturuuu.com/download) |

The QR generator is [tools.tuturuuu.com/qr](https://tools.tuturuuu.com/qr).

## Roadmap

The public roadmap is [tuturuuu.com/roadmap](https://tuturuuu.com/roadmap).

## Try it

Open [tuturuuu.com](https://tuturuuu.com). Download the apps for phone, tablet, and computer at [tuturuuu.com/download](https://tuturuuu.com/download).

## Quick start

You need [Bun](https://bun.sh/) 1.4.4 (`packageManager` in the root `package.json`) and Node.js 26.12.1 (`.node-version`). The `engines` floor is Node.js `>=22.13.0`.

```bash
git clone https://github.com/tutur3u/platform.git
cd platform
bun install
cp apps/web/.env.example apps/web/.env.local
bun dev:web
```

`bun dev:web` runs `node scripts/dev-workspaces.js web` and serves the platform at [https://tuturuuu.localhost](https://tuturuuu.localhost). Fill in `apps/web/.env.local` before you expect signed-in flows to work. The [development guide](https://docs.tuturuuu.com/build/development-tools/development) covers the other local app URLs.

## For power users

`apps/web` is the central platform. The other product apps are satellites: each one owns a slice of the product on its own host and shares the account session with the platform. Shared code lives in `packages/`. Turborepo runs the workspace tasks. Bun is the package manager.

- [Platform overview](https://docs.tuturuuu.com/platform/overview)
- [Satellite apps](https://docs.tuturuuu.com/platform/architecture/satellite-apps)
- [Monorepo architecture](https://docs.tuturuuu.com/build/development-tools/monorepo-architecture)
- [Repository catalog](https://docs.tuturuuu.com/reference/repository/catalog)

```txt
apps/web              Platform app
apps/<product>        One directory per product in the table above
apps/mobile           Flutter client
apps/docs             Documentation site
apps/database         Database migrations
packages/             Shared libraries
scripts/              Checks, local environment, and release tooling
```

Other directories under `apps/` are local services and workers. The catalog lists every one.

### Packages on npm

These names resolve on the public npm registry. The SDK package is `tuturuuu` (`packages/sdk`). It is the TypeScript SDK for the platform.

| Package | Directory |
| --- | --- |
| `tuturuuu` | `packages/sdk` |
| `@tuturuuu/ui` | `packages/ui` |
| `@tuturuuu/icons` | `packages/icons` |
| `@tuturuuu/hooks` | `packages/hooks` |
| `@tuturuuu/utils` | `packages/utils` |
| `@tuturuuu/types` | `packages/types` |
| `@tuturuuu/supabase` | `packages/supabase` |
| `@tuturuuu/ai` | `packages/ai` |
| `@tuturuuu/apis` | `packages/apis` |
| `@tuturuuu/internal-api` | `packages/internal-api` |
| `@tuturuuu/typescript-config` | `packages/typescript-config` |
| `@tuturuuu/editor` | `packages/editor` |
| `@tuturuuu/google` | `packages/google` |
| `@tuturuuu/cloudflare` | `packages/cloudflare` |
| `@tuturuuu/devbox` | `packages/devbox` |
| `@tuturuuu/realtime` | `packages/realtime` |
| `@tuturuuu/vercel` | `packages/vercel` |
| `@tuturuuu/games` | `packages/games` |
| `@tuturuuu/masonry` | `packages/masonry` |
| `@tuturuuu/offline` | `packages/offline` |
| `@tuturuuu/workflows` | `packages/workflows` |

`@tuturuuu/supabase` is the Supabase client and SSR helpers. `@tuturuuu/editor` is the rich-text editor. `@tuturuuu/workflows` is the Workflows SDK. Other packages under `packages/` stay inside the workspace.

### API, SDK, and CLI

```bash
bun add tuturuuu
```

The client defaults to `https://tuturuuu.com/api/v1`. Reference: [SDK docs](https://docs.tuturuuu.com/reference/packages/sdk).

The same package ships the `ttr` CLI. `tuturuuu` and `tutur3u` are aliases of that binary. Inside this checkout, `bun ttr` runs `node scripts/trusted-ttr.js`:

```bash
bun ttr --help
ttr login
ttr workspaces
```

### Self-hosting

Notes for running the web app with Docker are in the [Web Docker Deployment](https://docs.tuturuuu.com/build/devops/web-docker-deployment) guide.

## Contributing

Issues labeled [`good first issue`](https://github.com/tutur3u/platform/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) are the place to start.

1. Fork the repository and create a branch.
2. Run `bun install`.
3. Run `bun run build` to confirm the environment.
4. Add tests and docs for the change.
5. Run `bun format` and `bun lint`.
6. Open a pull request that explains the change and names any related issue.

The full guide is [CONTRIBUTING.md](./CONTRIBUTING.md). Community standards are in [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Report security issues through [SECURITY.md](./SECURITY.md).

## For partners

Tuturuuu is building an open-source workspace that keeps the products above in one system, so teams spend less time stitching tools together. Questions and partnerships go through the [contact page](https://tuturuuu.com/contact). That page includes [contact@tuturuuu.com](mailto:contact@tuturuuu.com).

## Community and license

Talk with the community on [Discord](https://discord.gg/tuturuuu). Source and issues live at [github.com/tutur3u/platform](https://github.com/tutur3u/platform).

This repository is licensed under the Apache License, Version 2.0. Copyright 2025 Tuturuuu. See [LICENSE](./LICENSE).
