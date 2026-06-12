# Tuturuuu Platform Checklist

Use this checklist before and after code changes in the current Tuturuuu platform checkout.

## Before Editing

- Run `git status --short` and identify dirty or untracked paths that predate
  your work.
- If `tmp/agent-coordination/` exists, read top-level active notes before
  choosing your write set. Search `tmp/agent-coordination/archive/` only when
  prior context is relevant.
- When overlap is likely, create a coordination note under
  `tmp/agent-coordination/` with intent, owned paths, observed dirty paths,
  status, and needs.
- Use `$tuturuuu-agent-coordination` for dirty worktrees, active overlap,
  archived context, handoff, or path-scoped staging decisions.
- If a commit may be needed in a shared checkout, inspect
  `bun git-commit-window status` before committing and plan to claim or wait for
  the window immediately before changing the staged set. Claims default to 10
  minutes and cannot exceed 10 minutes.
- Read the task-local code and docs before proposing abstractions.
- Check for existing helpers in `packages/internal-api`, `packages/types`, `packages/ui`, and app-local utilities.
- Identify whether the change affects user-facing copy, route navigation, database schema, generated types, docs, or mobile localization.
- Identify whether the task revealed a durable workflow learning that belongs in `apps/docs`, a Tuturuuu plugin skill, a reference checklist, a validation script, or a helper script.
- Do not manually bump release versions for ordinary authored commits. Release
  Please owns package, changelog, and `TUTURUUU_PLATFORM_VERSION` updates.

## Web And Shared Code

- Server Components are the default. Add `'use client'` only for state, effects that are not data fetching, browser APIs, or interactivity.
- Client data fetching and mutation must use TanStack Query.
- Any `fetch` inside a query function should include `{ cache: 'no-store' }`.
- Shared UI or client code should call `packages/internal-api/src/*` helpers for app APIs instead of scattering raw route calls.
- Use `@tuturuuu/icons` for UI icons.
- Use `@tuturuuu/ui/dialog` instead of native browser dialogs.
- Use dynamic color tokens instead of hard-coded Tailwind color classes.

## Translations And Navigation

- Add user-facing strings to both English and Vietnamese bundles.
- Keep shared UI translation keys present in every app-level bundle that ships that shared UI.
- Run `bun i18n:sort` after editing message JSON.
- Add new dashboard routes to the relevant `navigation.tsx` aliases, children, icons, and permissions.

## Database And Types

- Prepare migrations but do not push production Supabase changes.
- Prefer additive migrations and runtime fallbacks when rollout order can vary.
- After schema changes, apply local migrations before `bun sb:typegen` when possible.
- Prefer importing shared DB row aliases from `@tuturuuu/types/db`.
- Do not hand-edit generated type files.

## Completion

- Format touched files with the repo-preferred command.
- Run focused tests for changed behavior.
- Run `bun check` for TypeScript, JavaScript, root script, or repo config changes.
- Update `apps/docs` for durable workflow, deployment, architecture, debugging, or operations knowledge.
- Update the Tuturuuu plugin when agent-facing CLI, validation, setup, or workflow knowledge changes.
- Keep release-please annotations on platform version lines intact; the
  `platform` release component uses them with `platform-version.txt`.
- Use `bun git-release-please` from a clean `main` checkout when merging
  generated release-please branches.
- If you created a coordination note, update it with final status, verification,
  and risks. Archive it before the final response when the status is `done` and
  no active handoff needs it in the top-level directory.
- Release any `bun git-commit-window` lock you claimed after the commit
  operation completes or aborts. Do not hold the 5-10-minute window while doing
  unrelated validation or editing.
- Stage only paths you intentionally changed. Do not fix, format, or stage
  unrelated dirty files owned by a human or another agent.
- Use Conventional Commit style if asked to commit.
