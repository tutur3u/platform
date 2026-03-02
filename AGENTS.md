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

### 6.1 Database & Supabase

- **PostgREST URL Limit**: Use .eq() or batching instead of .in() with >1000 IDs to avoid 8KB proxy limits.
- **Admin Client**: Use `createAdminClient` (sbAdmin) to bypass triggers checking `auth.uid()`. Validate permissions with user client first.
- **User Email**: Never query `public.users.email` (it doesn't exist). Use `public.user_private_details`.
- **Reset-Only Local Defaults**: If behavior should apply only after `bun sb:reset` (local dev bootstrap), implement it in `apps/database/scripts/*` and wire it into the reset script; do not encode reset-only behavior in migrations.

### 6.2 UI & Rendering Patterns

- **Dashboard Overlay UX**: For compact+expandable dashboard widgets near chat actions, avoid icon-only rails; use labeled compact triggers and reserve layout space to prevent overlap at desktop breakpoints.
- **Local Storage Mirroring**: If UI state is persisted to `localStorage` but displayed outside the owning component tree, do not rely on the `storage` event alone; emit a same-tab custom event or lift the state so in-tab mirrors stay reactive.
- **Render UI Text Fidelity**: Components that display AI-authored prose in `render_ui` (for example `KeyPoints`, `InsightSection` summaries) must render Markdown semantics (bold, emphasis, inline code, links) instead of showing raw markdown tokens.
- **Markdown Table Priority**: For tabular assistant answers, prefer native Markdown tables in normal assistant text. Do not attempt unsupported `render_ui` table components, and do not wrap Markdown tables in fenced code blocks.
- **Special Tag Prompt Rules**: Custom tags like `@<FOLLOWUP>` must not contain internal whitespace, but blank lines between distinct prompt sections are required.
- **PR Maintainability Fixes**: When reviewers flag oversized files, prioritize extracting cohesive submodules (for example `render_ui` blog components or tool-step decision helpers) while keeping the original external APIs and behavior intact.

### 6.3 Security & Validation

- **External URL Safety**: Any URL coming from model/tool output must be validated as `http(s)` before rendering clickable anchors (`href`) in web UI components; never trust raw tool-returned URLs.
- **Chat Attachment Type Parity**: When adding a new attachment type for Mira chat, update all three surfaces together: `chat-input-bar.tsx` accept list, `/api/ai/chat/upload-url` extension allowlist, and `/api/ai/chat/file-urls` extension→MIME mapping.
- **Fresh Chat Reset Integrity**: “New chat” flows in Mira must reset both persisted identifiers and the live chat runtime. If a stateful hook like `useChat` owns in-memory messages, force a remount or explicit runtime reset; also reset queue/pending input, attachment state, generative UI state, and workspace context back to `personal`.
- **Office/Binary Attachment Handling**: For chat uploads that may be rejected by storage MIME checks (for example `.xlsx`/`.docx`), use a safe upload MIME fallback (`application/octet-stream`) and retry once without explicit `Content-Type`. In AI provider routes, never pass unsupported binary MIME types as inline `file` parts; convert them into explicit text notices instead.
- **Client Upload Mutations**: In client components, wrap signed upload/delete flows for chat attachments in TanStack Query `useMutation` handlers instead of ad-hoc inline `fetch` control flow so retries, errors, and cache effects stay centralized.
- **Mira Chat Decomposition**: When `mira-chat-panel.tsx` or similar chat containers exceed size limits, extract by concern: config/transport, attachment mutations, persistence/restore, side-effect watchers, and presentational header/body components. Do not collapse the code into one replacement mega-hook.
- **Mira Workspace Context Sync**: When a Mira tool changes workspace context, update both the mutable server-side `MiraToolContext` used for later tool calls in the same response and the client-persisted chat config used for future turns; otherwise current-turn tools and later user requests will drift to different workspaces.
- **Explicit Workspace Requests**: If a user names a workspace in a task/calendar/finance request (for example "my tasks in Tuturuuu"), planner heuristics must force workspace discovery/switch tools before workspace-scoped data tools. Do not let "my tasks" defaults short-circuit an explicitly named workspace.
- **Workspace Member Queries**: Treat "who's in my workspace" (and similar bare member queries) and "who is in \<workspace name\>" as workspace-context-aware requests. Bare member queries default to the personal workspace. When the user names a specific workspace (e.g. "who is in Tuturuuu"), force workspace discovery/switch before `list_workspace_members`; treat "\<workspace name\>" as a placeholder for the user-supplied workspace identifier.
- **MarkItDown Conversions**: For binary office/docs ingestion in Mira, route through the Discord `/markitdown` endpoint with plugins enabled, enforce fixed per-request credit charging in the tool executor, and pass files via Supabase signed read URLs (never raw multipart upload bytes to the endpoint).
- **Fixed-Cost AI Reservations**: For fixed-price AI operations that call external services (for example MarkItDown conversion), reserve credits atomically before the external call, then commit the reservation on success or release it on every failure path. Do not rely on a soft allowance pre-check plus post-hoc deduction.
- **AI/File Logging Hygiene**: In AI chat and file-processing code, never log raw uploaded file contents, full processed message bodies, or other user-provided payload text. Log only minimal metadata needed for debugging (counts, MIME types, masked identifiers, status).
- **Experimental AI Tool Gating**: When an AI tool like `render_ui` is highly experimental or prone to recursive failure loops in production, conditionally omit it from both the stream tool definitions and the dynamic system prompt directory when `!DEV_MODE`. Do not rely solely on system prompt instructions to stop models from calling unstable tools.

### 6.4 Tooling & CI

- **Discord Python Tooling**: In `apps/discord`, use `uv` as the local environment/package workflow (`uv sync`, `uv run ...`) with `pyproject.toml` + `uv.lock` as the source of truth for local development.
- **Discord CI Parity**: Keep the GitHub Actions workflow `.github/workflows/discord-python-ci.yml` aligned with the `uv` workflow and install dependencies via `uv sync --locked` so CI reproducibly uses `apps/discord/uv.lock`.
- **Discord Modal Deploys**: For `apps/discord` continuous deployment, trigger Modal deploys from GitHub Actions only after the Discord-specific CI workflow succeeds, authenticate with `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`, and run the deploy via `uv run modal deploy ...`.
- **Discord Service Logging**: In `apps/discord`, use module-level `logging` (`logger.exception` / `logger.error(..., exc_info=True)`) for error paths. Avoid ad-hoc `print()` for operational failures.

### 6.5 Type Safety & Platform Details

- **Windows Paths**: Use workspace-relative paths in `apply_patch` to avoid drive-letter resolution issues.
- **Supabase Helper Extraction**: When moving Supabase DB writes into shared helper modules, prefer structural interfaces (or thin generic adapters) over concrete `createAdminClient` return types to avoid cross-package generic incompatibilities during type-check.
- **Type-Safe Group Iteration**: In strict TS files with discriminated unions and `noUncheckedIndexedAccess`, avoid `array[index]` iteration for render groups. Prefer `for (const [i, item] of array.entries())` plus `switch (item.kind)` to preserve narrowing and prevent `"possibly undefined"` regressions.

## 7. Continuous Improvement (Session Retrospective)

At the **END** of every session, you MUST:

1. Review mistakes, edge cases, or ambiguities encountered.
2. Update `AGENTS.md` with durable standards/rules (no chronological logs).
3. Eliminate redundancy—ensure new knowledge isn't already covered by specialized skills.
4. Propose future improvements to the human partner.
