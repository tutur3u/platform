# GEMINI.md

This file provides a comprehensive overview of the Tuturuuu monorepo for Gemini, outlining the project structure, key technologies, and development conventions.

## Project Overview

This is a monorepo for the Tuturuuu platform, a collection of web applications and services. The project is managed using Turborepo and utilizes `bun` as the package manager.

The main application is a Next.js web application located in `apps/web`. The project also includes a documentation site, an AI chatbot, a prompt engineering platform, and other services.

The frontend is built with React, Next.js, and Tailwind CSS, with a component library from `packages/ui` based on shadcn-ui and Radix UI. The backend is powered by Supabase.

### Key Technologies

- **Monorepo:** Turborepo
- **Package Manager:** bun
- **Framework:** Next.js
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn-ui, Radix UI
- **Backend:** Supabase
- **Testing:** Vitest
- **Linting & Formatting:** Biome

## Building and Running

### Prerequisites

- [Node.js](https://nodejs.org/) (v22+)
- [bun](https://bun.sh/) (v1.2+)
- [Docker](https://www.docker.com/) (latest)

### Getting Started

1. **Install dependencies:**

   ```bash
   bun i
   ```

2. **Start the Supabase local development environment:**

   ```bash
   bun sb:start
   ```

3. **Create environment files:**
   Create a `.env.local` file in each app directory (`apps/*/.env.local`) using the corresponding `.env.example` template and add the Supabase URLs and keys from the previous step.

4. **Start all applications in development mode:**

   ```bash
   bun dev
   ```

### Key Commands

- `bun i`: Install dependencies.
- `bun dev`: Start all applications in development mode.
- `bun build`: Build all applications.
- `bun test`: Run tests.
- `bun type-check`: Run type checking for the entire monorepo. **REQUIRED command - do NOT use `npx tsgo` or alternatives.**
- `bun check`: **Unified verification command** - runs formatting, tests, type-checking, and i18n checks. **REQUIRED at the end of your work.**
- `bun sb:start`: Start the local Supabase development environment.
- `bun sb:stop`: Stop the local Supabase development environment.
- `bun format-and-lint:fix`: Format and lint all files.

## Development Conventions

- **Package Management:** All packages are managed with `bun` workspaces.
- **UI Components:** The `packages/ui` directory contains the shared UI component library. New components can be added using the `bun ui:add` command.
- **Code Style:** The project uses Biome for linting and formatting. Use `bun format-and-lint:fix` to automatically fix any issues.
- **Type Checking:** Always use the exact command `bun type-check` for type checking. Do NOT use `npx tsgo`, `bunx tsgo`, or other alternatives. This is the only accepted type checking command.
- **Testing:** Tests are written with Vitest. Run all tests with `bun test`. **CRITICAL**: Always add test cases after implementing new features and run them using `bun --filter @tuturuuu/<package> test` or `bun run test` to verify functionality.
- **Commits:** Commits should follow the Conventional Commits specification. **ALWAYS ask for user approval before creating commits** – never commit without explicit confirmation. Prefer atomic commits by scope when changes span multiple areas.
- **Environment Variables:** Global environment variables are defined in `turbo.json`. Each application can also have its own `.env.local` file for local development.
- **Internationalization:** The project supports multiple languages via `next-intl`. **CRITICAL**: Always provide translations for both English (`en.json`) AND Vietnamese (`vi.json`) when adding user-facing strings to `apps/web/messages/{locale}.json`. Never add translations only for English - Vietnamese translations are mandatory.
- **Type Inference:** Always prefer importing database types from `packages/types/src/db.ts` (only after user runs migrations via `bun sb:push` and typegen via `bun sb:typegen`). Never attempt to run these commands yourself.
- **Code Quality & Refactoring:** Files >400 LOC and components >200 LOC should be refactored into smaller, focused units. Apply best practices to ALL code, regardless of age. Follow single responsibility principle, extract utilities/hooks for complex logic, and leave code better than you found it. Code quality and developer experience are top priorities, not optional.

## Agent Operating Instructions

This section summarizes the key operating procedures for AI agents working in this repository, based on `AGENTS.md`.

### Core Principles

- **Least Privilege:** Only touch files required for the change.
- **Idempotency:** Scripts and migrations should be safe to re-run.
- **Determinism:** Generated artifacts (like types) must come from scripts, not manual edits.
- **Security:** Never output or commit secrets. Reference environment variables by name only.
- **User Intent:** Do not run long-running commands (`bun dev`) or build commands (`bun build`, `bun run build`, `bun run buildx`) unless the user **explicitly asks**. The user is responsible for running commands like `bun sb:push`, `bun lint`, and `bun format`.
- **Verification:** Run `bun check` at the end of your work. This unified command runs formatting, tests, type-checking, and i18n checks (`bun format-and-lint && bun test && bun type-check && bun i18n:check && bun i18n:sort:check`). All checks MUST pass. This is a mandatory requirement.
- **Testing After Features:** Always add test cases after implementing new features and run them to verify functionality. Tests CAN and SHOULD be run by agents.
- **Code Quality First:** Proactively refactor long files (>400 LOC) and components (>200 LOC); maintain high DX standards for ALL code, both old and new. Code quality is never optional.
- **Session Retrospective (MANDATORY):** At the END of every co-working session, ALWAYS review `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`. Document mistakes made, lessons learned, and proposed improvements. Update these files with new rules or clarifications to prevent repeating errors in future sessions. This continuous improvement practice is NON-NEGOTIABLE.

### Prohibited Actions

- Committing secrets, API keys, or credentials.
- Disabling linting, formatting, or type-checking.
- Executing destructive database commands without a reversible strategy.
- Running `bun sb:push`, `bun sb:linkpush`, `bun lint:fix`, or `bun format:fix`. Prepare the changes and ask the user to run these commands.
- **Running `bun run build`, `bun build`, or `bun run buildx` unless the user explicitly requests it.** Build commands are USER-ONLY unless explicitly requested.
- **🚫 USING `useEffect` FOR DATA FETCHING - THIS IS THE #1 MOST CRITICAL VIOLATION 🚫**
- **Using raw `fetch()` without TanStack Query wrapper in client components.**
- **Manual state management (useState + useEffect) for API calls - ABSOLUTELY FORBIDDEN.**

### Data Fetching Strategy (CRITICAL)

**TanStack Query (React Query) is MANDATORY for ALL client-side data fetching.** This is a hard requirement, not a suggestion.

**Decision Order (Prefer Earlier):**

1. **Pure Server Component (RSC)** - for read-only, cacheable, SEO-critical data.
2. **Server Action** - for mutations returning updated state to RSC.
3. **RSC + Client hydration** - when background refresh is needed.
4. **TanStack Query client-side (REQUIRED)** - for ALL client-side data fetching including:
   - Interactive state and rapidly changing data
   - Mutations with optimistic UI updates
   - Paginated or infinite lists
   - Dependent queries (sequential client-side fetching)
   - Shared client state across components
   - Any API calls requiring caching, refetching, or state management
   - Polling or periodic refresh scenarios
5. **Realtime subscriptions** (Supabase channels) - only when live updates materially improve UX.

**ABSOLUTELY FORBIDDEN PATTERNS (Code Will Be REJECTED):**

```typescript
// ❌ NEVER EVER DO THIS - #1 VIOLATION
useEffect(() => {
  fetch("/api/data")
    .then((r) => r.json())
    .then(setData);
}, []);

// ❌ NEVER DO THIS EITHER
useEffect(() => {
  async function fetchData() {
    const response = await fetch("/api/data");
    const json = await response.json();
    setData(json);
  }
  fetchData();
}, [dependency]);

// ❌ NO MANUAL STATE MANAGEMENT FOR DATA FETCHING
const [data, setData] = useState(null);
const [loading, setLoading] = useState(false);
useEffect(() => {
  /* fetch logic */
}, []);

// ✅ ONLY ACCEPTABLE PATTERN
const { data, isLoading } = useQuery({
  queryKey: ["data", dependency],
  queryFn: () => fetch("/api/data").then((r) => r.json()),
});
```

**Key Points:**

- ❌ **`useEffect` is BANNED for data fetching**
- ❌ Raw `fetch()` without React Query wrapper
- ❌ Custom hooks using `useEffect` for fetching
- ✅ **ONLY use TanStack Query's `useQuery`/`useMutation`/`useInfiniteQuery`**

**React Query Best Practices:**

- Use stable array query keys: `[domain, subdomain?, paramsHash, version?]`
- Set `staleTime` > 0 for rarely-changing data to prevent unnecessary refetches
- Implement optimistic updates with rollback on error for better UX
- Use narrow invalidations (avoid global `invalidateQueries()`)
- Hydrate initial cache from RSC to prevent double fetching after SSR
- Define mutations with proper error handling and cache updates
- **If you encounter `useEffect` + fetch in existing code, REFACTOR it to React Query immediately**

**Kanban Task Realtime Sync (CRITICAL):**

Tasks in kanban boards (`task.tsx`, `task-edit-dialog.tsx`, components in `packages/ui/src/components/ui/tu-do/`) use Supabase realtime subscriptions to sync across clients. **NEVER invalidate TanStack Query caches for task data in these components** - it conflicts with realtime sync and causes UI flicker/stale data.

- ❌ **NEVER** call `invalidateQueries()` or `refetch()` for task queries in kanban components
- ✅ **DO** rely on realtime subscriptions; use optimistic `setQueryData` for immediate feedback

**ENFORCEMENT RULES:**

1. **NEVER use `useEffect` for data fetching** - Zero tolerance, no exceptions
2. If writing client-side data fetching without TanStack Query → Code REJECTED
3. If you see the pattern `useEffect(() => { fetch... }, [])` → MUST refactor to `useQuery`
4. The ONLY acceptable client-side data fetching is through TanStack Query hooks

### Key Workflows

- **Dependency Management:** Use `bun add <pkg> --workspace=@tuturuuu/<scope>` to add dependencies. Use `workspace:*` for internal packages.
- **Database Migrations:**
  1. Create a new migration with `bun sb:new`.
  2. Edit the generated SQL file.
  3. Ask the user to apply the migration (`bun sb:push`) and regenerate types (`bun sb:typegen`).
  4. Incorporate the newly generated types from `packages/types` into your changes.
  5. **Type Inference**: After user runs migrations + typegen, prefer importing types from `packages/types/src/db.ts` for convenient type aliases and extended types (e.g., `Workspace`, `WorkspaceTask`, `TaskProjectWithRelations`). Never attempt to infer types before migrations are applied.
- **Adding API Routes:** Create new routes in `apps/<app>/src/app/api/...`. Use Supabase client wrappers for authentication and Zod for input validation.
- **Navigation Updates (CRITICAL):** When adding new pages or routes, **ALWAYS** update the main navigation file (`apps/web/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx` for web app). Add routes to both the `aliases` array and `children` navigation items. Include proper icons, permission checks, and translation keys. **CRITICAL**: Ensure translation keys have entries in both `en.json` AND `vi.json`. Navigation updates are mandatory, not optional.
- **Documentation:** When adding a new feature or changing an existing one, update the corresponding documentation in `apps/docs`. **Crucially, add any new page to `apps/docs/mint.json` to make it visible.**
- **Styling:** Follow the **Tailwind Dynamic Color Policy**. Never use hard-coded color classes like `text-blue-500`. Instead, use the `dynamic-*` tokens, e.g., `text-dynamic-blue`.
- **UI Components:**
  - Use `sonner` for toasts: `import { toast } from '@tuturuuu/ui/sonner';`. Avoid the deprecated `@tuturuuu/ui/toast`.
  - Use the dialog system for modals: `import { Dialog, ... } from '@tuturuuu/ui/dialog';`. **Never** use native browser dialogs like `alert()` or `confirm()`.
- **Refactoring (Proactive):** Break down large files (>400 LOC) and components (>200 LOC) into smaller, focused units. Extract utilities to `src/lib/`, hooks to `src/hooks/`, and sub-components as needed. Apply best practices to BOTH old and new code—when touching existing code, assess and improve it. Follow single responsibility principle, use meaningful names, and eliminate duplication. Code quality is mandatory, not optional.
- **Workspace ID Resolution (CRITICAL):** Database `ws_id` columns ALWAYS store UUIDs. Route parameters (`wsId`) may contain special identifiers like `"personal"` or `"internal"`. **NEVER** use raw `wsId` directly in database queries. **Preferred pattern:** Components should accept a `workspace` prop and use `workspace.id` directly (parent components handle resolution). For API routes, use `normalizeWorkspaceId(wsId)` helper which calls `getWorkspace()` for "personal" or `resolveWorkspaceId()` for others. This prevents "invalid uuid" errors and avoids redundant resolution calls.
- **Centralized Settings (CRITICAL):** ALL application settings MUST be implemented within `apps/web/src/components/settings/settings-dialog.tsx`. This includes user profile, account, workspace, and product-specific settings (e.g., calendar). **NEVER** create separate settings pages or standalone modals. Add new settings as tabs within the centralized dialog, grouping them logically (User Settings, Preferences, Workspace, Product-specific). Pass `workspace` prop to child components instead of raw `wsId`.
- **CI/Workflow Configuration (CRITICAL):** When adding or modifying GitHub Actions workflows in `.github/workflows/`, you **MUST** also update `tuturuuu.ts` at the repository root. Add an entry for the new workflow filename (e.g., `"my-workflow.yaml": true`). The workflow must include a `check-ci` job that calls `.github/workflows/ci-check.yml` and all main jobs must depend on it with `needs: [check-ci]` and `if: needs.check-ci.outputs.should_run == 'true'`. This enables centralized enable/disable control of all CI workflows.

### Database Schema Notes

**CRITICAL**: The `public.users` table does NOT contain an `email` field. User email addresses are stored in `public.user_private_details` for privacy and security reasons. When you need to query or access user email information, always use the `user_private_details` table, not the `users` table.

**Type Inference**: Always prefer importing database types from `packages/types/src/db.ts` (e.g., `Workspace`, `WorkspaceTask`, `TaskWithRelations`, `TaskProjectWithRelations`) rather than manually defining types or directly using the raw generated types. This file provides convenient type aliases and extended types based on the Supabase schema. Only use these types AFTER migrations have been run by the user via `bun sb:push` and types regenerated via `bun sb:typegen`. Never attempt to run migrations yourself.

## Session Retrospective (2026-02-04)

### Mistakes/Issues Encountered
- No automated tests were added for the new mobile auth API routes due to missing route-handler test harness in `apps/web`.

### Lessons Learned
- Mobile auth endpoints should always return Supabase session tokens and include CORS headers, since native clients do not rely on cookies.
- When introducing a new mobile API base URL, add a local `.env.example` and update the app README to keep onboarding clear.

### Documentation Updates Made
- Added this retrospective entry to document the missing-test gap and mobile auth patterns.

### Proposed Future Improvements
- Add a lightweight testing guideline/template for Next.js route handlers so new API endpoints can be covered by unit tests.
- Clarify how to satisfy the `bun check` requirement when lint/format commands are user-only.


