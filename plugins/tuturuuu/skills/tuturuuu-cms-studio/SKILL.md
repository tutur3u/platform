---
name: tuturuuu-cms-studio
description: Tuturuuu CMS and external-project content studio guidance. Use when changing apps/cms, external project adapters, CMS landing-page editing, content collections, media workflows, preview delivery, or branded sibling-site content management.
---

# Tuturuuu CMS Studio

## Core Workflow

Use this skill for `apps/cms` and external-project content work, especially when
the request is about making content editing easier for non-technical users.

Start with the repo `AGENTS.md`, `git status --short`, and active
`tmp/agent-coordination/` notes. Keep sibling branded sites as read-only context
unless the task explicitly needs integration changes there.

## Discovery

Map the CMS control plane before editing:

- `apps/cms/src/features/cms-studio/` for editor shells, content model,
  capability grouping, media, workflow, preview, and entry detail behavior.
- `apps/cms/src/features/home/` for the operator landing page.
- `apps/cms/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx` and
  `cms-paths.ts` for new CMS routes and aliases.
- `apps/cms/src/lib/external-projects/access.ts` for CMS workspace gates and
  satellite app-session access.
- sibling `lib/*-external-project-manifest.ts` files only to understand
  collection slugs, profile fields, blocks, and assets consumed by each branded
  site.

Prefer improving the centralized CMS experience over adding new bespoke admin UI
inside each sibling site.

## UX Rules

- Make the default path task-based: landing-page edits, content library,
  preview, and member access should be obvious without knowing CMS internals.
- Treat landing-page content as first-class for branded projects. Group hero,
  profile, section, featured, navigation, and primary-link collections behind a
  simple "Landing page" surface when possible.
- Keep content model, raw JSON, adapter binding, and workflow mechanics out of
  the primary editor path unless the user is doing advanced configuration.
- Use explicit empty, loading, error, and review states that tell editors what to
  do next.
- Add user-facing strings to both `apps/cms/messages/en.json` and
  `apps/cms/messages/vi.json`, then run `bun i18n:sort`.

## Implementation Patterns

- Use TanStack Query and `@tuturuuu/internal-api` for client-side CMS reads and
  mutations. Do not add raw client `fetch('/api/...')`.
- Keep route additions wired through navigation aliases and `cms-paths.ts` so
  entry detail dialogs preserve the correct base surface.
- If a capability should vary by branded adapter, add data-driven selectors or
  blueprints rather than hard-coding branches inside entry/editor components.
- Keep field/schema work compatible with imported manifest schemas; do not
  hand-edit generated DB types.
- When changing CMS Games or media handling, preserve asset-type support and
  same-origin playable routes.

## Verification

Run focused checks before broader repo checks:

```bash
bun test src/features/cms-studio/cms-editor-capabilities.test.ts src/features/cms-studio/cms-content-model.test.ts
bun type-check:cms
bun i18n:sort
bun i18n:check
```

Run `bun check` for TypeScript, JavaScript, messages, or repo config changes
unless an unrelated pre-existing blocker prevents it.
