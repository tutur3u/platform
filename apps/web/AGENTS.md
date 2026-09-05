For changes that depend on Next.js behavior, consult the relevant installed guide.
The generated block below concerns framework API/convention changes; it does not
require a framework documentation pass for unrelated copy, styles, or skill edits.

# AGENTS.md - Web Next.js Playbook

This file contains web-app-specific rules for `apps/web`.
The authoritative repo-wide instructions live in [`../../AGENTS.md`](../../AGENTS.md) and apply in full here. This file is additive only; if anything here appears to conflict with the root file, follow the root `AGENTS.md`.

## 1. Inheritance

- **Read Order**: Read [`../../AGENTS.md`](../../AGENTS.md) first, then this file.
- **Scope**: Use this file only for `apps/web`-specific guidance on top of the root rules.

## 2. Web App Standards

- **App Router Defaults**: Default to Server Components; add `'use client'` only when state, browser APIs, or interactivity require it.
- **Data Fetching**: In client components, use TanStack Query via the repo's established helpers. Do not fetch data in `useEffect`, and do not scatter raw client-side `fetch('/api/...')` calls when `@tuturuuu/internal-api` helpers should own that boundary.
- **Translations**: Add every user-facing string to both `messages/en.json` and `messages/vi.json`, and keep shared-package translation keys aligned across app bundles.
- **Navigation Parity**: When adding dashboard routes, update [`src/app/[locale]/(dashboard)/[wsId]/navigation.tsx`](src/app/[locale]/(dashboard)/[wsId]/navigation.tsx) alongside the route itself.
- **Shared UI Contracts**: Use `@tuturuuu/icons` for icons and `@tuturuuu/ui/dialog` for dialog flows unless an existing local pattern already governs the surface.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
