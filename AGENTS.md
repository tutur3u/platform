# AGENTS.md – Operating Manual for Autonomous AI Assistants

## 1. Purpose & Audience

Foundational mandates here take absolute precedence. **NEVER** invent ad-hoc behavior.

## 2. Canonical Guardrails & Hard Boundaries

### 2.1 Hard Prohibitions (NEVER DO)
- **Long-Running / Build Commands**: NEVER run `bun dev`, `bun run build`, `bun build`, or equivalent build/compile/bundling operations unless the user **explicitly requests** it.
- **Supabase Production Push**: NEVER run `bun sb:push` or `bun sb:linkpush`. Prepare migrations; the user applies them.
- **Auto-Fixing & Verification**: assistants may run `bun type-check`, `bun check`, `bun format`, and `bun ff` ONLY when the user **explicitly requests** it. However, the end-of-session `bun check` defined in section 2.2 is a **standing mandate** and MUST be executed autonomously before sign-off.
- **Sensitive Data**: NEVER commit secrets, API keys, tokens, or credentials. Reference environment variables by name only.
- **Manual Dependency Edits**: NEVER manually edit `package.json` to add or update dependencies. Always use the CLI.
- **UI Antipatterns**: NEVER use native browser dialogs (alert, confirm), hard-coded color classes (use dynamic-*), or emojis in UI code (use lucide-react via @tuturuuu/icons).
- **Data Fetching (#1 Violation)**: **NEVER use useEffect for data fetching.** TanStack Query (useQuery/useMutation) is the **mandatory** standard. Raw fetch() in client components is forbidden.

### 2.2 Mandatory Actions
- **Type Integrity**: Always run `bun sb:typegen` after schema changes. **Prefer** importing types from `packages/types/src/db.ts`.
- **Bilingual Support**: ALWAYS provide translations for both English (en.json) AND Vietnamese (vi.json) for all user-facing strings.
- **Navigation Parity**: ALWAYS update `navigation.tsx` in the relevant app when adding new routes (aliases + children + icons + permissions).
- **Proactive Refactoring**: Evaluate files >400 LOC and components >200 LOC for extraction into smaller, focused units.
- **Unified Verification**: Always end your session with a `bun check`. Ensure all checks pass (you may ignore ones that were not introduced by you). For mobile-only changes, run `bun check:mobile`.
- **Formatting Workflow**: For fixing formatting issues, try `bun ff` first before making manual edits.
- **Session Retrospective**: Conduct a retrospective at the end of every session to document mistakes and update these guidelines.

## 3. Repository Structure & Semantics

### 3.1 Monorepo Layout
- **`apps/web`**: Main platform (Next.js 16 App Router, Port 7803).
- **`apps/mobile`**: Flutter mobile app (iOS/Android, BLoC/Cubit). **Mandatory**: `flutter gen-l10n` after ARB changes.
- **`apps/database`**: Supabase migrations and configuration.
- **`apps/discord`**: Python Discord utilities.
- **`packages/*`**: Shared logic (ui, ai, types, utils, supabase, auth, payment).

### 3.2 Semantics
- **Workspace Protocol**: Internal packages use `workspace:*`.
- **Server Components**: Default to Server Components; use 'use client' only when state/interactivity is required.
- **Type Inference**: Import extended types from `@tuturuuu/types/db`. Never hand-edit generated type files.

## 4. Canonical Workflows

### 4.1 Database Migrations
1. Create: `bun sb:new` -> Edit SQL (prefer additive).
2. Local Test: `bun sb:up` (agent-allowed for local Docker instance).
3. Typegen: Incorporate types from `packages/types` after user runs `bun sb:typegen`.
4. Usage: Use `normalizeWorkspaceId(wsId)` in API routes to handle "personal" vs UUID.

### 4.2 UI & Navigation
1. **Translations**: Add keys to `en.json` AND `vi.json`.
2. **Navigation**: Add route to `aliases` and `children` in `apps/web/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx`.
3. **Icons**: Use `@tuturuuu/icons` (Lucide wrapper).
4. **Dialogs**: Use `@tuturuuu/ui/dialog`.

### 4.3 Settings Centralization
- **Shell**: Use `SettingsDialogShell` from `@tuturuuu/ui/custom/settings-dialog-shell`.
- **Location**: Add tabs to the app's `SettingsDialog`. **NEVER** create separate settings pages.
- **Extraction**: Extract portable settings to `packages/ui` if they have no @/ imports.

### 4.4 Documentation
- New pages MUST be added to `apps/docs/mint.json` or they will not be visible.

### 4.5 Adding Dependencies
- **Method**: To add a new package to `apps/web`: `cd apps/web && bun add <package>`.
- **UI Package**: To add a new package to `packages/ui`: `cd packages/ui && bun add <package>`.
- **Constraint**: **NEVER** manually edit `package.json` to add a new package. Use the `bun add` command to ensure `bun.lock` remains consistent.

## 5. Engineering Standards

### 5.1 Data Fetching (TanStack Query)
- **Mandatory Wrapper**: All client-side fetching must use `useQuery`/`useMutation`.
- **HTTP Cache Bypass**: Every { fetch } inside a `queryFn` MUST include { cache: 'no-store' }.
- **Realtime (Kanban)**: Use **Supabase Broadcast** via `BoardBroadcastContext`. **NEVER** invalidate queries or use `postgres_changes` for task sync in boards.

### 5.2 Mobile (Flutter)
- **Clean Pass**: `bun check:mobile` is mandatory. It runs format, analyze, and test.
- **API Pattern**: Use `createClient(request)` in web API routes to support mobile Bearer token auth.
- **Widget Consistency**: Preserve per-field validation when refactoring into shared editable widgets.

## 6. Known Gotchas & Patterns
- **PostgREST URL Limit**: Use .eq() or batching instead of .in() with >1000 IDs to avoid 8KB proxy limits.
- **Admin Client**: Use `createAdminClient` (sbAdmin) to bypass triggers checking `auth.uid()`. Validate permissions with user client first.
- **User Email**: Never query `public.users.email` (it doesn't exist). Use `public.user_private_details`.
- **Windows Paths**: Use workspace-relative paths in `apply_patch` to avoid drive-letter resolution issues.

## 7. Continuous Improvement (Session Retrospective)
At the **END** of every session, you MUST:
1. Review mistakes, edge cases, or ambiguities encountered.
2. Update `AGENTS.md` with concrete examples and new rules.
3. Eliminate redundancy—ensure new knowledge isn't already covered by specialized skills.
4. Propose future improvements to the human partner.
