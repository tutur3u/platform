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
- **Data Fetching/Mutation (#1 Violation)**: **NEVER use useEffect for data fetching.** TanStack Query (useQuery/useMutation) is the **mandatory** standard. Raw fetch() in client components is forbidden.

### 2.2 Mandatory Actions

- **Type Integrity**: Always run `bun sb:typegen` after schema changes. **Prefer** importing types from `packages/types/src/db.ts`.
- **Bilingual Support**: ALWAYS provide translations for both English (en.json) AND Vietnamese (vi.json) for all user-facing strings.
- **Navigation Parity**: ALWAYS update `navigation.tsx` in the relevant app when adding new routes (aliases + children + icons + permissions).
- **Proactive Refactoring**: Evaluate files >400 LOC and components >200 LOC for extraction into smaller, focused units.
- **Unified Verification**: Always end your session with a `bun check`. Ensure all checks pass (you may ignore ones that were not introduced by you). For mobile changes, run `bun check:mobile`.
- **UI Preflight Hygiene**: For newly added/edited UI files, normalize import ordering and Tailwind class ordering before full checks to reduce avoidable `biome` failures.
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
- **Type Inference**: Import extended types from `@tuturuuu/types/db`. Never hand-edit generated type files. Refrain from ad-hoc type definitions that duplicate DB types; extend them in `packages/types` if necessary.

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

- **Mandatory Wrapper**: All client-side fetching/mutation must use `useQuery`/`useMutation`.
- **HTTP Cache Bypass**: Every { fetch } inside a `queryFn` MUST include { cache: 'no-store' }.
- **Realtime (Kanban)**: Use **Supabase Broadcast** via `BoardBroadcastContext`. **NEVER** invalidate queries or use `postgres_changes` for task sync in boards.

### 5.2 Mobile (Flutter)

- **Clean Pass**: `bun check:mobile` is mandatory. It runs format, analyze, and test.
- **API Pattern**: Use `createClient(request)` in web API routes to support mobile Bearer token auth.
- **Widget Consistency**: Preserve per-field validation when refactoring into shared editable widgets.
- **Mobile API Error Surfacing**: In mobile form submit handlers, catch `ApiException` separately and surface `e.message` (with safe fallback) instead of only a generic toast; this prevents silent failures when backend rejects a request.
- **iOS Lockstep**: After bumping FlutterFire or other iOS-backed Flutter dependencies in `apps/mobile/pubspec.yaml` or `apps/mobile/pubspec.lock`, refresh and commit `apps/mobile/ios/Podfile.lock` so CocoaPods snapshots do not drift and break iOS CI during `pod install`.

## 6. Known Gotchas & Patterns

### 6.1 Database & Supabase

- **PostgREST URL Limit**: Use .eq() or batching instead of .in() with >1000 IDs to avoid 8KB proxy limits.
- **Admin Client**: Use `createAdminClient` (sbAdmin) to bypass triggers checking `auth.uid()`. Validate permissions with user client first.
- **User Email**: Never query `public.users.email` (it doesn't exist). Use `public.user_private_details`.
- **Reset-Only Local Defaults**: If behavior should apply only after `bun sb:reset` (local dev bootstrap), implement it in `apps/database/scripts/*` and wire it into the reset script; do not encode reset-only behavior in migrations.
- **Workspace-Scoped Mutation Follow-Through**: For workspace-scoped `UPDATE`/`DELETE` API handlers, request returning rows (`select(...).maybeSingle()` or equivalent) and stop follow-up side effects when no row matched; never run dependent child-table deletes/updates based only on a requested ID.

### 6.2 UI & Rendering Patterns

- **Dashboard Overlay UX**: For compact+expandable dashboard widgets near chat actions, avoid icon-only rails; use labeled compact triggers and reserve layout space to prevent overlap at desktop breakpoints.
- **Namespaced Query Params for Multi-Tab Tables**: When a page contains multiple server-backed tables or tab-specific filters, give each surface its own URL params (`logPage`, `logStatus`, etc.) instead of sharing generic `page`/`q` keys, or pagination/filter/export state will leak across tabs.
- **Local Storage Mirroring**: If UI state is persisted to `localStorage` but displayed outside the owning component tree, do not rely on the `storage` event alone; emit a same-tab custom event or lift the state so in-tab mirrors stay reactive.
- **In-Place Input Normalization**: If an input rewrites typed text on change (for example replacing ASCII shortcuts with symbols), preserve the caret/selection explicitly after normalization so mid-string edits do not jump the cursor.
- **Shared Text Shortcut Rules**: If a dialog mixes plain text inputs and rich text editors, define typing shortcut replacements in a shared utility/extension and reuse them across both surfaces so title/body behavior does not drift.
- **Recent Sidebar Persistence**: For workspace sidebar “recently visited” UI, persist only stable route data (for example `href` + timestamp) and derive localized titles/icons from current navigation state at render time. Do not store rendered labels in `localStorage`, or locale changes and nav refactors will leave stale sidebar entries.
- **Archived Record Selectors**: In historical/reporting flows, do not hide archived users or records from dropdowns and filters when existing data may still reference them. Fetch archive metadata, keep archived entries selectable, sort them after active entries, and surface their archived state in both the list row and the selected trigger.
- **Archived Record Detail Context**: When a historical/report detail screen can load archived users or records, carry archive metadata all the way into the selected-detail payload and render a primary visible banner/card near the main content. Do not rely on dropdown badges alone, or the archived state disappears once an item is selected.
- **Historical User Queries**: In report, audit, approval, or other history-oriented user pickers backed by `get_workspace_users`, set `include_archived: true` explicitly. Do not rely on the RPC default, because it is optimized for active user management views and will silently hide archived users from historical workflows.
- **Tabbed Server Page Gating**: In App Router pages with heavy per-tab tables, analytics, or dialogs, do not fetch/render every tab branch on each request. Resolve the active tab from URL state on the server and only build the active tab’s data and React subtree; otherwise hidden tabs can still trigger large server work and heavy client hydration.
- **Workspace-Scoped Tab State**: In multi-tab mobile or web views backed by workspace-scoped data, do not keep a single shared loading/error flag across tabs. Reset all tab datasets and invalidate in-flight request tokens when the workspace changes, and keep loading/error state per tab so stale responses from the previous workspace cannot populate an inactive tab.
- **Workspace-Scoped Async State**: In Flutter screens that can switch workspaces while showing workspace-owned collections, store the collection owner `wsId`, scope loading/loaded flags by workspace, and ignore stale async responses with a request token/version check. Do not gate multi-workspace fetches behind a single global `hasLoaded`/`isLoading` boolean.
- **Shared Analytics Time Ranges**: When a report or audit surface supports multiple time granularities (for example monthly and yearly), derive the selected range, picker options, chart buckets, and export interval from one shared helper. Do not duplicate month/year range math across server loaders, client charts, and export dialogs.
- **UI Package Export Coverage**: When adding a new module under `packages/ui/src` that will be imported through the `@tuturuuu/ui/...` package path, update `packages/ui/package.json` exports explicitly if the file extension is not covered by an existing wildcard pattern (for example `.ts` files when the export only matches `*.tsx`). Otherwise Next.js/Turbopack can fail with module resolution errors even though the file exists.
- **Provider Boundary Bridges**: Before calling a context hook from shared surfaces like command palettes, nav popovers, or portals, verify the component is actually rendered inside that provider in the app tree. If not, use a provider-owned event bridge or lift the action instead of importing the hook directly.
- **Markdown Separator Validation**: When detecting Markdown table separator rows, do not use ambiguous regex character ranges like `[\s:-|]`. Escape or reposition `-`, or prefer explicit per-character validation, to avoid false positives and CodeQL `js/overly-large-range` alerts.
- **Special Tag Prompt Rules**: Custom tags like `@<FOLLOWUP>` must not contain internal whitespace, but blank lines between distinct prompt sections are required.
- **Flutter Toast Overlay Context**: In `shadcn_flutter`, call `showToast` with a context captured from `Navigator.of(context, rootNavigator: true).context` (captured before async gaps). Dialog/sheet-local contexts can sit below overlays and trigger `InheritedTheme.capture` ancestor assertions.
- **Module Boundaries**: When file grows beyond roughly 500 LOC, split it by concern and keep the original entrypoint as a thin barrel re-export so dispatcher imports remain stable.

### 6.3 Security & Validation

- **Chat Attachment Type Parity**: When adding a new attachment type for Mira chat, update all three surfaces together: `chat-input-bar.tsx` accept list, `/api/ai/chat/upload-url` extension allowlist, and `/api/ai/chat/file-urls` extension→MIME mapping.
- **Office/Binary Attachment Handling**: For chat uploads that may be rejected by storage MIME checks (for example `.xlsx`/`.docx`), use a safe upload MIME fallback (`application/octet-stream`) and retry once without explicit `Content-Type`. In AI provider routes, never pass unsupported binary MIME types as inline `file` parts; convert them into explicit text notices instead.
- **Mira Workspace Context Sync**: When a Mira tool changes workspace context, update both the mutable server-side `MiraToolContext` used for later tool calls in the same response and the client-persisted chat config used for future turns; otherwise current-turn tools and later user requests will drift to different workspaces.
- **Fixed-Cost AI Reservations**: For fixed-price AI operations that call external services (for example MarkItDown conversion), reserve credits atomically before the external call, then commit the reservation on success or release it on every failure path. Do not rely on a soft allowance pre-check plus post-hoc deduction.
- **AI/File Logging Hygiene**: In AI chat and file-processing code, never log raw uploaded file contents, full processed message bodies, or other user-provided payload text. Log only minimal metadata needed for debugging (counts, MIME types, masked identifiers, status).
- **Experimental AI Tool Gating**: When an AI tool is highly experimental or prone to recursive failure loops in production, conditionally omit it from both the stream tool definitions and the dynamic system prompt directory when `!DEV_MODE`. Do not rely solely on system prompt instructions to stop models from calling unstable tools.
- **AI SDK Tool Part Parsing**: In Mira chat UI code, do not assume tool parts expose `.toolName` or `.toolCallId`. Resolve tool identity with the AI SDK helper first and fall back to the `type`/top-level `toolCallId` fields so visual tools (for example `render_ui`) and context-switch side effects still work with serialized message parts.
- **Mira Retry After Stop**: In Mira chat queueing, do not call `sendMessage` in the same tick as `stop()` while `useChat` is still `submitted`/`streaming`. Queue the retry and flush only after the hook reports an idle status, or follow-up user turns can append locally while the assistant remains stuck in `Thinking...`.

### 6.4 Tooling & CI

- **Mira Tool Name Parity**: Keep Mira system-prompt examples, `MIRA_TOOL_NAMES`, tool definitions, and dispatcher handlers in sync. Never reference a tool name in prompts that is not actually registered/executable.
- **Targeted Test Runs**: For single-package/unit validation, run the package-local test runner directly (for example `bun --cwd packages/ai vitest run src/tools/executors/timer.test.ts`) instead of `bun test <path>` from repo root, which fans out to monorepo-wide `turbo run test`.
- **Discord Python Tooling**: In `apps/discord`, use `uv` as the local environment/package workflow (`uv sync`, `uv run ...`) with `pyproject.toml` + `uv.lock` as the source of truth for local development.
- **Discord CI Parity**: Keep the GitHub Actions workflow `.github/workflows/discord-python-ci.yml` aligned with the `uv` workflow and install dependencies via `uv sync --locked` so CI reproducibly uses `apps/discord/uv.lock`.
- **Discord Service Logging**: In `apps/discord`, use module-level `logging` (`logger.exception` / `logger.error(..., exc_info=True)`) for error paths. Avoid ad-hoc `print()` for operational failures.
- **Global Check Baseline Drift**: If `bun check` fails solely because repo-wide tool versions drift (for example Biome schema/CLI mismatch), do not modify unrelated workspace configs in feature PRs; complete scoped verification (for example `bun check:mobile` for mobile-only work) and report the pre-existing global failure explicitly.
- **Broken Bun CLI Binaries**: If a `bun run` script reports a repo-local CLI as missing but the package is installed, inspect the resolved `node_modules/.bun/*` package payload and the `.bin` symlink target before changing PATH or shell setup. If the published version is missing its built CLI files, pin to a known-good package version with `bun add` instead of adding script-level workarounds.
- **Workspace Subpath Imports**: Before importing a workspace package subpath like `@tuturuuu/pkg/foo`, verify that the target is actually covered by that package’s `exports`. Do not assume a directory `index.ts` is reachable via the bare directory subpath; prefer an explicitly exported file path or a relative import within the same package.

### 6.5 Type Safety & Platform Details

- **Dart Part Imports**: For Dart `part` files, add library imports only in the parent file (the one declaring `part ...`).
- **API Route UUID Params**: In API routes, validate UUID path params with shared `zod` schemas (`z.uuid()` + `safeParse`) instead of ad-hoc null/regex checks.
- **Supabase Helper Extraction**: When moving Supabase DB writes into shared helper modules, prefer structural interfaces (or thin generic adapters) over concrete `createAdminClient` return types to avoid cross-package generic incompatibilities during type-check.
- **Type-Safe Group Iteration**: In strict TS files with discriminated unions and `noUncheckedIndexedAccess`, avoid `array[index]` iteration for render groups. Prefer `for (const [i, item] of array.entries())` plus `switch (item.kind)` to preserve narrowing and prevent `"possibly undefined"` regressions.

## 7. Continuous Improvement (Session Retrospective)

At the **END** of every session, you MUST:

1. Review mistakes, edge cases, or ambiguities encountered.
2. Update `AGENTS.md` with durable standards/rules (no chronological logs).
3. Eliminate redundancy—ensure new knowledge isn't already covered by specialized skills.
4. Propose future improvements to the human partner.
