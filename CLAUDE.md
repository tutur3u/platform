# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tuturuuu is a Turborepo monorepo containing multiple Next.js applications and shared packages. The platform provides workspace management, AI integration, finance management, user management, inventory management, and more.

## Technology Stack

- **Package Manager**: Bun (v1.3.0+)
- **Monorepo Tool**: Turborepo
- **Runtime**: Node.js v22+
- **Framework**: Next.js 16 with App Router and Turbopack
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS v4.1+ (dynamic color tokens required)
- **Type Checking**: TypeScript
- **Linting/Formatting**: Biome (primary), ESLint, Prettier
- **Testing**: Vitest
- **State Management**: Jotai, TanStack Query
- **API**: tRPC, Vercel AI SDK

## Monorepo Structure

### Applications (`apps/`)

- **web**: Main platform application (port 7803)
- **docs**: Documentation website (Mintlify)
- **rewise**: AI-powered chatbot
- **nova**: Prompt engineering platform (learn, practice, compete)
- **calendar**: Calendar scheduling and management
- **finance**: Finance management features
- **tudo**: Task management with hierarchical structure
- **tumeet**: Meeting management
- **shortener**: URL shortener service
- **mobile**: Flutter mobile app (iOS/Android) — BLoC/Cubit architecture, GoRouter, Supabase Flutter
- **db**: Supabase database configuration and migrations
- **discord**: Python Discord bot/utilities

### Packages (`packages/`)

- **ui**: Shared UI components (Shadcn)
- **ai**: AI integration utilities and schemas
- **apis**: API clients and utilities
- **auth**: Authentication utilities
- **payment**: Payment processing (Polar, Dodo Payments)
- **google**: Google API integrations
- **supabase**: Supabase client and utilities
- **transactional**: Transactional email handling
- **trigger**: Background job processing
- **types**: Shared TypeScript types (includes generated Supabase types)
- **utils**: Shared utility functions
- **typescript-config**: Shared TypeScript configurations

## Common Commands

### Development

```bash
# Start all apps in development mode
bun dev

# Start specific app
bun dev:web          # Main web app only
bun dev:calendar     # Calendar + web
bun dev:rewise       # Rewise + web
bun dev:nova         # Nova + web
bun dev:finance      # Finance + web
bun dev:tudo         # Tudo + web
bun dev:tumeet       # Tumeet + web
bun dev:shortener    # Shortener + web

# Start with Supabase (stops, starts fresh, then runs dev)
bun devx             # All apps
bun devx:web         # Specific app with DB

# Start with clean database reset
bun devrs            # All apps with fresh DB seed
bun devrs:web        # Specific app with fresh DB seed
```

### Database (Supabase)

```bash
# Start local Supabase instance (requires Docker)
bun sb:start         # Access Studio at http://localhost:8003
                     # Access InBucket (email) at http://localhost:8004

# Stop Supabase
bun sb:stop

# Check status
bun sb:status

# Database migrations
bun sb:new           # Create new migration
bun sb:diff          # Generate migration from local changes
bun sb:up            # Apply migrations locally (safe for agents)
bun sb:reset         # Reset DB to seed state
bun sb:push          # Push local schema to remote (USER-ONLY, NEVER agents)
bun sb:pull          # Pull remote schema to local

# Type generation (after schema changes)
bun sb:typegen       # Generates types to packages/types/src/supabase.ts

# Link to remote project (USER-ONLY)
bun sb:link
bun sb:linkpush      # Link and push (USER-ONLY, NEVER agents)
```

**CRITICAL for Agents**: NEVER run `bun sb:push` or `bun sb:linkpush`. Prepare migrations and instructions; the user applies them.

### Building & Testing

```bash
# Build all apps and packages (USER-ONLY - NEVER run unless explicitly requested)
bun run build

# Build with linting and testing (USER-ONLY - NEVER run unless explicitly requested)
bun run buildx

# Run tests (agents CAN and SHOULD run after implementing features)
bun run test         # Run all tests
bun run test:watch   # Watch mode

# Run tests for specific package (RECOMMENDED for agents)
bun --filter @tuturuuu/utils test
```

**CRITICAL for Agents**:

- **BUILD**: NEVER run `bun run build`, `bun build`, or `bun run buildx` unless the user explicitly requests it
- **TEST**: ALWAYS add test cases after implementing new features and run them to verify functionality

### Code Quality (USER-ONLY)

```bash
# Format code (USER runs, agent identifies issues)
bun format           # Check formatting
bun format:fix       # Fix formatting

# Lint code (USER runs, agent identifies issues)
bun lint             # Check linting
bun lint:fix         # Fix linting issues

# Both format and lint
bun format-and-lint
bun format-and-lint:fix
```

**CRITICAL for Agents**: NEVER run `bun lint`, `bun lint:fix`, `bun format`, or `bun format:fix`. Identify issues and request user to run these commands.

**Verification**: `bun check` includes Biome steps and is user-only. Agents must request it for web/TS changes. For mobile-only changes, agents must run `bun check:mobile`.

### Type Checking (Agent-Safe)

```bash
# Type check the entire monorepo (REQUIRED command)
bun type-check
```

**CRITICAL for Agents**: Always use the exact command `bun type-check` for type checking. Do NOT use `npx tsgo`, `bunx tsgo`, or other alternatives. This is the only accepted type checking command.

### UI Components

```bash
# Add Shadcn components to the ui package
bun ui:add

# Check for Shadcn component updates
bun ui:diff
```

### Background Jobs

```bash
# Trigger.dev development
bun trigger:dev

# Deploy Trigger.dev jobs
bun trigger:deploy
```

## Critical Guardrails for Agents

### Hard Boundaries (NEVER)

1. **NEVER** run `bun dev`, `bun run build`, `bun build`, or equivalent long-running/build commands unless the user **explicitly requests** it - this includes any build, compile, or bundling operations
2. **NEVER** run `bun sb:push` or `bun sb:linkpush` - prepare migrations; user applies
3. **NEVER** run `bun lint`, `bun lint:fix`, `bun format`, or `bun format:fix` - suggest fixes; user runs
4. **NEVER** run Modal commands (`modal run`, `modal deploy`) - prepare code; user executes
5. **NEVER** commit secrets, API keys, tokens, or URLs containing credentials
6. **NEVER** use native browser dialogs (`alert()`, `confirm()`, `prompt()`) - use `@tuturuuu/ui/dialog`
7. **NEVER** use hard-coded Tailwind color classes (`text-blue-500`, `bg-purple-300`) - use `dynamic-*` tokens
8. **NEVER** hand-edit generated type files in `packages/types/src/supabase.ts`
9. **NEVER** import from `@tuturuuu/ui/toast` (deprecated) - use `@tuturuuu/ui/sonner`
10. **NEVER** use emojis in UI code - use lucide-react icons via `@tuturuuu/icons`
11. **NEVER** use `useEffect` for data fetching - THIS IS THE #1 VIOLATION - use TanStack Query's `useQuery`/`useMutation` instead
12. **NEVER** use raw `fetch()` in client components without TanStack Query wrapper

### Dart/Flutter Usage Lookup

When searching for Dart symbol usages, prefer workspace-scoped searches (e.g., `apps/mobile/**`) instead of tools that can scan the global Pub cache. Pub cache hits are outside the repo and can mislead refactors.


### Mandatory Actions

1. **Touch ONLY** files required for the change (Least Privilege)
2. **Always** run `bun sb:typegen` after schema changes
3. **Always** validate external inputs with Zod schemas
4. **Always** add tests for new functionality - after implementing a feature, create test cases and run them using `bun --filter @tuturuuu/<package> test` or `bun run test` for the affected scope
5. **Always** update documentation when changing public APIs
6. **Always** use Server Components by default; add `'use client'` only when necessary
7. **Always** reference environment variables by name only (never echo values)
8. **Always** add new documentation pages to `apps/docs/mint.json` navigation
9. **Always** update main navigation (`apps/web/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx`) when adding new routes - add to both `aliases` array and `children` navigation items with proper icons and permissions
10. **Always** provide translations for both English AND Vietnamese when adding user-facing strings to `apps/web/messages/{locale}.json`
11. **Always** infer types from `packages/types/src/db.ts` (only after user runs migrations via `bun sb:push` and typegen via `bun sb:typegen`) - never attempt to run these commands yourself
12. **Always** refactor files >400 LOC and components >200 LOC into smaller, focused units
13. **Always** apply best practices to both old and new code - code quality is never optional
14. **Always** break down components following single responsibility principle and extract complex logic to utilities/hooks
15. **Always** use TanStack Query for ALL client-side data fetching - raw fetch/useEffect patterns are forbidden
16. **Always** implement new settings within `apps/web/src/components/settings/settings-dialog.tsx` - never create separate settings pages
17. **Always** run the appropriate check command at the end of your work: `bun check` for web/TS/JS changes (formatting, tests, type-checking, i18n), `bun check:mobile` for Flutter/Dart changes. Run both if a task touches both web and mobile code. All checks MUST pass.
18. **Always** add new GitHub Actions workflows to `tuturuuu.ts` configuration - when creating or modifying workflows in `.github/workflows/`, add an entry to the `ci` object in `tuturuuu.ts` and ensure the workflow includes the `check-ci` job dependency
19. **Always** conduct a **Session Retrospective** at the END of every co-working session - review `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`, document mistakes made and lessons learned, and update these files with new rules or clarifications to prevent repeating errors in future sessions. This is NON-NEGOTIABLE.
20. **Never** add session logs, empty notes, or observations to these files unless they introduce new reusable knowledge not already covered — these files are shared with all agents and must stay concise and actionable. Redundancy degrades signal quality.

### Escalate When

1. Migration requires data backfill logic >30 lines
2. Refactor impacts >3 apps or >5 packages simultaneously
3. Introducing new third-party service dependency
4. Changing security/auth flows or environment variable contract

## Architecture Overview

### Web Application Structure

The main web app (`apps/web`) uses Next.js App Router with internationalization:

- **`src/app/[locale]/(dashboard)/[wsId]/`**: Workspace-scoped pages
- **`src/components/`**: Reusable React components
- **`src/lib/`**: Utility libraries and configurations
- **`src/hooks/`**: Custom React hooks
- **`src/trpc/`**: tRPC client and server setup
- **`src/types/`**: TypeScript type definitions
- **`src/constants/`**: Application constants

### Database Schema

Supabase migrations are located in `apps/db/supabase/migrations/`. The database includes:

- User and workspace management with row-level security (RLS)
- Granular permission system with roles
- Multi-tenant architecture using workspace IDs
- AI chat history and message tracking
- Finance, inventory, and task management tables
- External migration support tables
- Nova platform tables (challenges, submissions, test cases)
- Hierarchical task management (Workspaces → Initiatives → Projects → Boards → Lists → Tasks)

**CRITICAL Schema Note**: The `public.users` table does NOT contain an `email` field. User email addresses are stored in `public.user_private_details` for privacy and security reasons. When querying user email information, always use the `user_private_details` table, not the `users` table.

### Task Management Hierarchy

1. **Workspaces** - Top-level container with multiple members
2. **Task Initiatives** - Strategic initiatives grouping projects
3. **Task Projects** - Cross-functional projects coordinating tasks across boards
4. **Task Boards** - Workspace-scoped boards (`workspace_boards` table)
5. **Task Lists** - Columns within boards
6. **Tasks** - Individual work items

**Bucket Dump Feature**: Notes can be converted to tasks or projects; projects coordinate tasks across multiple boards.

### Authentication & Authorization

- Supabase Auth for user authentication
- Workspace-based multi-tenancy
- Role-based permissions with granular controls
- Row-level security (RLS) policies throughout database
- Admin client operations server-side only (never client-exposed)

### AI Integration

- Multi-provider support (OpenAI, Anthropic, Google Vertex AI, Gemini)
- Prefer `gemini-2.0-flash-*` for speed; escalate to `gemini-2.0-pro-*` for complex tasks
- Use Vercel AI SDK `generateObject`/`streamObject` with Zod schemas
- Chat history persistence with token tracking
- Enforce auth, feature flags, and input validation on all AI endpoints
- Never log secrets or raw provider responses

### Data Fetching Strategy (Prefer Earlier)

**CRITICAL: TanStack Query (React Query) is MANDATORY for ALL client-side data fetching.**

**🚫 ABSOLUTELY FORBIDDEN: NEVER USE `useEffect` FOR DATA FETCHING 🚫**

Raw `fetch()`, `useEffect` with manual state, or custom hooks without React Query are BANNED. The pattern `useEffect(() => { fetch(...).then(setData) }, [])` will result in immediate code rejection.

1. **Pure Server Component (RSC)** - for read-only, cacheable, SEO-critical data
2. **Server Action** - for mutations returning updated state to RSC
3. **RSC + Client hydration** - when background refresh needed
4. **TanStack Query client-side (REQUIRED)** - for ALL client-side data fetching including: interactive state, rapidly changing data, mutations with optimistic UI, paginated/infinite lists, dependent queries, shared client state, any API calls needing caching/refetching
5. **Realtime subscriptions** - only when live updates materially improve UX

**React Query Guidelines (MANDATORY)**:

- **#1 RULE: NEVER use `useEffect` for data fetching - NO EXCEPTIONS**
- Use stable array query keys: `[domain, subdomain?, paramsHash, version?]`
- Set `staleTime` > 0 for rarely-changing data
- Implement optimistic updates with rollback on error
- Narrow invalidations (avoid global `invalidateQueries()`)
- Hydrate initial cache from RSC to prevent double fetches
- If you see `useEffect` + API calls in existing code, REFACTOR to React Query immediately
- **CRITICAL:** The only acceptable pattern is `useQuery`/`useMutation`/`useInfiniteQuery` from TanStack Query

**Kanban Task Realtime Sync (CRITICAL):**

Tasks in kanban boards (`task.tsx`, `task-edit-dialog.tsx`, components in `packages/ui/src/components/ui/tu-do/`) use **Supabase Broadcast** (client-to-client messaging) to sync across clients. Broadcast is preferred over `postgres_changes` for scalability and security — it has no WAL dependency, no RLS evaluation by the Realtime server, and lower latency.

**Architecture:** Every mutation site (after writing to DB) sends a broadcast event via `BoardBroadcastContext`. Other clients receive the event and update the TanStack Query cache directly. The sending client already has optimistic updates and uses `self: false` to prevent redundant processing.

- ❌ **NEVER** call `invalidateQueries()` or `refetch()` for task queries in kanban components
- ❌ **NEVER** use `postgres_changes` for new board realtime features — use Broadcast instead
- ✅ **DO** use optimistic `setQueryData` for immediate UI feedback in the mutating client
- ✅ **DO** call `broadcast?.('task:upsert', { task: { id, ...fields } })` after successful DB mutations
- ✅ **DO** call `broadcast?.('task:relations-changed', { taskId })` after toggling labels/assignees/projects

**Banned Patterns (Will Cause Code Rejection):**

```typescript
// ❌ NEVER DO THIS
useEffect(() => {
  fetch("/api/data")
    .then((r) => r.json())
    .then(setData);
}, []);

// ❌ NEVER DO THIS
useEffect(() => {
  const fetchData = async () => {
    const data = await fetch("/api/data");
    setData(data);
  };
  fetchData();
}, []);

// ✅ ONLY DO THIS
const { data } = useQuery({
  queryKey: ["data"],
  queryFn: () => fetch("/api/data").then((r) => r.json()),
});
```

### Workspace Management

- Each user can belong to multiple workspaces
- Workspace-scoped resources and permissions
- Invitation system with pending/accepted states
- User groups and tags for organization

### Workspace ID Resolution (CRITICAL)

**Database `ws_id` columns ALWAYS store UUIDs.** Route parameters may contain special identifiers like `"personal"` that must be resolved.

**Resolution Pattern:**

- `"personal"` → User's personal workspace UUID (DB lookup)
- `"internal"` → `ROOT_WORKSPACE_ID` constant
- Valid UUID → Pass through unchanged

**Client Component Pattern (Preferred):**

Components should receive the `workspace` object and use `workspace.id` directly:

```typescript
// ❌ WRONG - Using raw wsId
const { data } = await supabase.from("table").eq("ws_id", wsId);

// ✅ CORRECT - Use workspace.id from props
type MyComponentProps = {
  workspace?: Workspace | null;
};

export function MyComponent({ workspace }: MyComponentProps) {
  useEffect(() => {
    if (!workspace?.id) return;

    const { data } = await supabase.from("table").eq("ws_id", workspace.id);
  }, [workspace?.id]);
}
```

**Why:** Parent components already fetch workspace data. Using `workspace.id` directly avoids redundant resolution calls and improves performance.

**API Routes:** Use `normalizeWorkspaceId(wsId)` helper:

```typescript
import { getWorkspace } from "@tuturuuu/utils/workspace-helper";
import {
  resolveWorkspaceId,
  PERSONAL_WORKSPACE_SLUG,
} from "@tuturuuu/utils/constants";

const normalizeWorkspaceId = async (wsId: string) => {
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const workspace = await getWorkspace(wsId);
    return workspace.id;
  }
  return resolveWorkspaceId(wsId);
};
```

## Local Development Setup

1. **Install dependencies**: `bun i`
2. **Start Supabase**: `bun sb:start` (requires Docker)
3. **Create `.env.local`**: Copy from `.env.example` in each app directory
4. **Add Supabase credentials**: Use URLs/keys from `bun sb:start` output
5. **Run development server**: `bun dev` or app-specific variant

### Test Accounts (Local)

Five seed accounts are available:

- <local@tuturuuu.com>
- <user1@tuturuuu.com>
- <user2@tuturuuu.com>
- <user3@tuturuuu.com>
- <user4@tuturuuu.com>

## Important Development Notes

### Working with Supabase

- After schema changes, always run `bun sb:typegen` to update TypeScript types
- Use `bun sb:diff` to generate migrations from local changes
- Migrations are auto-applied when starting Supabase locally with `bun sb:up`
- **Agents**: Can run `bun sb:up` for local testing; NEVER run `bun sb:push`
- **Type Inference**: After user runs migrations and typegen, always import types from `packages/types/src/db.ts` for convenient type aliases (e.g., `Workspace`, `WorkspaceTask`, `TaskProjectWithRelations`). Never attempt to infer types before migrations are applied.
- RLS policies are critical - test permissions thoroughly
- Prefer additive migrations; document destructive changes with reversible notes

### Turborepo Workspace Dependencies

- Apps import packages using workspace protocol: `workspace:*`
- Changes to packages trigger rebuilds in dependent apps
- Use Turbo filters: `bun --filter @tuturuuu/web test`
- Use `...` suffix to include dependents: `bun --filter @tuturuuu/ui... build`

### Internationalization

- Uses `next-intl` for i18n
- Messages are in `apps/web/messages/{locale}.json`
- All routes are prefixed with locale: `/[locale]/...`
- **CRITICAL**: Always provide translations for both English (`en.json`) AND Vietnamese (`vi.json`)
- When adding new user-facing strings, add entries to both language files simultaneously
- Never add translations only for English - Vietnamese translations are mandatory
- Use consistent translation keys across both language files
- For new features, ensure all UI text, error messages, and user communications are bilingual

### Code Style & Conventions

#### TypeScript

- Prefer explicit return types for exported functions
- Narrow `unknown`/`any` at boundaries; justify with comments if needed
- Use discriminated unions over enums
- Keep React Server Components default; add `'use client'` only when necessary
- Avoid deep relative imports; expose via package `index.ts`
- Use Zod for runtime validation of external inputs
- **Type Inference from Database**: Always prefer importing types from `packages/types/src/db.ts` (e.g., `Workspace`, `WorkspaceTask`, `TaskWithRelations`) rather than manually defining database types. Only use these types AFTER migrations have been applied by the user via `bun sb:push` and types regenerated via `bun sb:typegen`. Never attempt to run these commands yourself.

#### Code Quality & Refactoring Policy

**Core Principle**: Code quality and developer experience (DX) are top priorities. Proactively maintain high standards for ALL code—both new and existing.

**Mandatory Refactoring Thresholds**:

- Files >400 LOC → Extract utilities, sub-modules, or components
- Components >200 LOC → Break down into focused sub-components
- Functions >50 LOC → Decompose into smaller functions
- Duplicated logic (≥2 locations) → Extract to shared utilities/hooks

**Best Practices (Apply to Old AND New Code)**:

- **Single Responsibility**: Each component/function does ONE thing well
- **Composition**: Build from small, reusable pieces
- **Extract Logic**: Move complex state management to custom hooks
- **Meaningful Names**: Names should reveal intent without comments
- **DRY Principle**: Zero tolerance for copy-paste code

**React Component Guidelines**:

- Keep JSX templates <100 LOC; extract sub-components for complex sections
- Define explicit TypeScript interfaces for all props (no `any`)
- Extract complex event handlers to separate functions or hooks
- For >3 conditional branches, extract to separate rendering functions
- Co-locate state with usage; lift only when truly shared

**Opportunistic Improvement**:
When touching existing code, you MUST:

1. Assess if the file/component meets current standards
2. Refactor if it exceeds size thresholds (>400 LOC files, >200 LOC components)
3. Extract utilities if writing similar logic twice
4. Migrate deprecated patterns encountered during work
5. Leave code better than you found it (Boy Scout Rule)

**Quality Over Speed**:

- NEVER ship poorly structured code "to move fast"
- NEVER skip refactoring "because it's old code"
- ALWAYS consider: "Would a new developer understand this in 6 months?"
- ALWAYS extract reusable logic immediately when you write it twice

**When to Extract**:

- Function used ≥2 times → Extract to `src/lib/` or `src/utils/`
- Component used ≥2 times → Extract to shared components
- Complex state logic → Extract to custom hook in `src/hooks/`
- Pure computations → Extract and make testable

**DX Considerations**:

- Can new developers find and understand components quickly?
- Are component boundaries clear for debugging?
- Can features be modified without touching unrelated code?
- Are utilities/hooks in expected, discoverable locations?

#### Tailwind Dynamic Color Policy

**FORBIDDEN**: Hard-coded palette classes like `text-blue-500`, `bg-purple-300/10`, `border-green-600/20`

**REQUIRED**: Dynamic color tokens like `text-dynamic-blue`, `bg-dynamic-purple/10`, `border-dynamic-green/20`

Rules:

1. Never introduce static color classes referencing raw palette names
2. Use `dynamic-*` token namespace for all color utilities
3. Opacity suffixes remain allowed: `bg-dynamic-red/15`
4. For gradients: `from-dynamic-pink via-dynamic-indigo to-dynamic-cyan`

#### Dialog Components

**FORBIDDEN**: Native browser dialogs (`alert()`, `confirm()`, `prompt()`)

**REQUIRED**: `@tuturuuu/ui/dialog` components

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@tuturuuu/ui/dialog";

<Dialog open={show} onOpenChange={setShow}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* content */}
  </DialogContent>
</Dialog>;
```

#### Icons

**FORBIDDEN**: Emojis in UI code (e.g., `"📋"`, `"✅"`, `"🔒"`)

**REQUIRED**: lucide-react icons via `@tuturuuu/icons` wrapper

```tsx
import { CheckCircle, Lock, Clipboard } from "@tuturuuu/icons";

<CheckCircle className="h-5 w-5" />;
```

**Rationale**: Emojis render inconsistently across platforms, lack semantic meaning for screen readers, and don't respect theme/color customization.

#### Toast Notifications

**FORBIDDEN**: `@tuturuuu/ui/toast` (deprecated)

**REQUIRED**: `@tuturuuu/ui/sonner`

```ts
import { toast } from "@tuturuuu/ui/sonner";
```

#### Centralized Settings Architecture

**Location**: `apps/web/src/components/settings/settings-dialog.tsx`

ALL application settings MUST be implemented within the centralized settings dialog. This single component handles:

- **User Profile Settings** - Avatar, display name, email
- **User Account Settings** - Security, sessions, devices
- **Preferences** - Appearance, theme, notifications
- **Workspace Settings** - General info, members, billing
- **Product-Specific Settings** - Calendar hours, colors, integrations, smart features

**Rules:**

- ❌ **NEVER** create separate settings pages outside this dialog
- ❌ **NEVER** create standalone modals for settings that belong here
- ✅ **ALWAYS** add new settings as tabs within `settings-dialog.tsx`
- ✅ **ALWAYS** group settings logically (user, preferences, workspace, product-specific)
- ✅ **ALWAYS** pass `workspace` prop to child components (not raw `wsId`)

**Adding New Settings:**

1. Create settings component in `apps/web/src/components/settings/`
2. Add navigation item to `navItems` array with `name`, `label`, `icon`, `description`
3. Add conditional rendering block for the new tab
4. Use TanStack Query for data fetching; pass `workspace.id` for DB queries

**Rationale**: Centralizing settings improves discoverability, ensures consistent UX, and prevents fragmentation across the codebase.

#### Error Handling

- Validate inputs early; return 400/401/403 for bad requests
- Never leak stack traces to client
- Wrap external service calls; surface sanitized error messages
- Log detailed errors server-side only

### Git Conventions

- Follow Conventional Commits: `type(scope): description`
- Scope = package/app name: `feat(ui): add button variant`
- Add `!` or `BREAKING CHANGE:` footer for breaking changes
- Keep PR title aligned with primary commit
- **ALWAYS ask for user approval before creating commits** – never commit without explicit confirmation
- **Prefer atomic commits by scope** – offer to commit changes separately when spanning multiple areas

### API Patterns

#### Creating API Routes

1. Location: `apps/<app>/src/app/api/<segment>/route.ts`
2. Export runtime if edge: `export const runtime = 'edge'`
3. Implement handlers: `export async function GET/POST(...)`
4. Use `@tuturuuu/supabase` for auth
5. Validate input with Zod; reject early with 4xx
6. Add test or example documentation

#### API Rate Limiting

All SDK APIs (routes using `withApiAuth`) have automatic rate limiting:

**Default Limits:**

- General operations: 100 requests/minute
- Storage uploads: 20 requests/minute
- Storage downloads: 50 requests/minute
- Signed upload URLs: 30 requests/minute

**Workspace-Specific Configuration:**

Workspaces can override default rate limits via `workspace_secrets` table:

| Secret Name               | Description                 | Example |
| ------------------------- | --------------------------- | ------- |
| `RATE_LIMIT_WINDOW_MS`    | Time window in milliseconds | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window     | `500`   |

**Adding Custom Rate Limits:**

```typescript
// Custom rate limit for specific operation
export const POST = withApiAuth(
  async (request, { context }) => {
    // Handler code
  },
  {
    permissions: ["manage_drive"],
    rateLimit: { windowMs: 60000, maxRequests: 10 }, // 10 req/min
  },
);

// Disable rate limiting (use sparingly)
export const GET = withApiAuth(
  handler,
  { rateLimit: false }, // Not recommended
);
```

**Rate Limit Infrastructure:**

- Uses Upstash Redis for distributed rate limiting
- Falls back to in-memory if Redis unavailable
- Returns standard HTTP 429 with `X-RateLimit-*` headers
- Tracked per API key across all requests

#### AI Endpoints

1. Define schema in `packages/ai/src/object/types.ts` (Zod)
2. Enforce auth: get user via `createClient()`; return 401 if absent
3. Check feature flags in `workspace_secrets`
4. Use `streamObject`/`generateObject` with selected model
5. Set `maxDuration` for long-running operations
6. Never log secrets or raw provider responses

### Testing

- Vitest for unit and integration tests
- Tests in `src/__tests__/` or alongside source files
- Use `@testing-library/react` for component tests
- Add happy path + failure/edge case tests
- Run specific tests: `bun --filter @tuturuuu/utils test`

### Documentation

- Update `.mdx` files in `apps/docs` when changing public APIs
- **CRITICAL**: Add new pages to `apps/docs/mint.json` navigation
- Include frontmatter: `title`, `description`, `updatedAt`
- Use proper heading hierarchy (H1 → H2 → H3)
- Cross-link related documentation

### Package Extraction

Extract to `packages/*` when:

- Logic duplicated in ≥2 apps
- > 150 LOC multi-module complexity
- Security/auth logic that needs single point of maintenance
- Stable interface ready for reuse

Steps:

1. Create `packages/<name>/` with `package.json` (`@tuturuuu/<name>`)
2. Add `tsconfig.json` extending root config
3. Export via `src/index.ts`
4. Add README with purpose, usage, stability level
5. Add minimal tests
6. Run filtered build + tests

### Mobile App (Flutter)

Located at `apps/mobile/`, the Flutter app uses:

- **State Management:** `flutter_bloc` (Cubits for feature state)
- **Navigation:** `go_router` with auth-aware redirects (ShellRoute for bottom tabs)
- **Auth:** `supabase_flutter` + `flutter_secure_storage` for token persistence
- **Linting:** `very_good_analysis` (strict ruleset)
- **Build Flavors:** development, staging, production (separate `main_*.dart` entry points)
- **Localization:** ARB files in `lib/l10n/arb/` (English + Vietnamese), generated files tracked in git
- **CI:** `mobile.yaml` uses `VeryGoodOpenSource/very_good_workflows` for format check, analysis, tests

**Verification (MANDATORY):** Always run `bun check:mobile` after making changes to `apps/mobile/`. This runs `dart format --set-exit-if-changed lib test && flutter analyze && flutter test` — the mobile equivalent of `bun check`. All three checks MUST pass. Note: `bun format` / Biome does NOT cover Dart files.

If `bun check:mobile` reports a Dart format failure because it formatted files, rerun it to confirm a clean pass.

**API Integration & Cross-App Dependencies:** The mobile app connects to `apps/web` API routes (e.g., `/api/v1/calendar/*`, `/api/v1/auth/mobile/*`) returning Supabase session tokens (not cookies). Agents may propose updates to these web API routes when working on mobile features, provided: (1) backward compatibility is maintained, (2) `createClient(request)` is used in all routes so Bearer token auth works for mobile, (3) good design patterns are followed (Zod validation, proper error codes, consistent response shapes).

### Known Gotchas

- **Flutter Editable Fields:** When extracting shared editable text widgets, preserve per-field validation and success messaging. Email fields should keep the `@` check and any email-specific success note (use `TextInputType.emailAddress` or an explicit parameter).
- **Flutter Analyzer Hygiene:** Prefer `on Exception catch (e)` (or a specific type) over bare `catch`, avoid catching `Error` subclasses like `TypeError`, guard `BuildContext` usage after `await` with `if (!context.mounted) return;`, and never `return` from a `finally` block.
- **Flutter Async Actions:** For mutation-driven UI actions (approve/reject/update), use `Future<void> Function()` callbacks (not `VoidCallback`), await them before closing dialogs/sheets, and surface failures in the UI (e.g., `SnackBar`). If a Cubit catches repository errors, rethrow after emitting error state so the UI can handle failures.
- **Flutter Widget Tests (shadcn):** Any widget test rendering `shadcn_flutter` components must wrap the widget with `shad.ShadcnApp` (and include `shad.ShadcnLocalizations.delegate`) so `shad.Theme.of(context)` is available.
- **apply_patch Pathing (Windows):** Prefer workspace-relative paths (e.g. `apps/web/...`). Absolute Windows paths like `C:\...` can fail to resolve during patch apply.

## Quick Reference

| Goal                     | Command                                       | Notes                                |
| ------------------------ | --------------------------------------------- | ------------------------------------ |
| Install deps             | `bun install`                                 | Deterministic via lockfile           |
| Dev (all apps)           | `bun dev`                                     | No DB required if gated              |
| Full stack dev           | `bun devx`                                    | Starts Supabase + apps               |
| Reset + seed             | `bun devrs`                                   | Destructive local DB reset           |
| Build all                | `bun run build`                               | USER-ONLY; uses Turbo cache          |
| Test all                 | `bun run test`                                | USER-ONLY; Vitest workspaces         |
| Scoped test              | `bun --filter @tuturuuu/ui test`              | Add `...` for dependents             |
| Lint                     | `bun lint`                                    | USER-ONLY; agent suggests fixes      |
| Format                   | `bun format`                                  | USER-ONLY; agent suggests fixes      |
| Type check               | `bun type-check`                              | REQUIRED; do NOT use `npx tsgo`      |
| Verify all checks        | `bun check`                                   | REQUIRED; runs ff, test, tc, i18n    |
| Verify mobile            | `bun check:mobile`                            | REQUIRED for `apps/mobile/` changes  |
| New migration            | `bun sb:new`                                  | Edit generated SQL file              |
| Apply migrations locally | `bun sb:up`                                   | Safe for agents                      |
| Apply migrations remote  | `bun sb:push`                                 | USER-ONLY; NEVER agents              |
| Regenerate types         | `bun sb:typegen`                              | Commit resulting changes             |
| Add dep to pkg           | `bun add <dep> --workspace=@tuturuuu/<scope>` | Internal: `workspace:*`              |
| Edge runtime             | `export const runtime = 'edge'`               | Only if required                     |

## Pre-PR Verification Checklist

Before requesting review:

1. ✅ Scope limited to intended change (no stray edits)
2. ✅ Build passes (user ran `bun run build`)
3. ✅ Lint clean (user ran `bun lint`; agent suggested fixes)
4. ✅ Tests added/updated & passing (user ran tests)
5. ✅ For DB changes: migration added; user ran `bun sb:push`
6. ✅ Types regenerated if schema changed
7. ✅ Docs updated for public API/env var changes
8. ✅ **Long files (>400 LOC) and components (>200 LOC) refactored into focused units**
9. ✅ **Code follows best practices (both old and new code touched)**
10. ✅ **Components follow single responsibility; complex logic extracted to utilities/hooks**
11. ✅ **ALL client-side data fetching uses TanStack Query (ZERO `useEffect` for fetching; no raw fetch patterns)**
12. ✅ **Database types imported from `packages/types/src/db.ts` (only after user runs migrations + typegen)**
13. ✅ No secrets, tokens, or API keys committed
14. ✅ Edge runtime export added where required
15. ✅ All external inputs validated with Zod
16. ✅ All user-facing strings have both English and Vietnamese translations
17. ✅ **New settings implemented within centralized `settings-dialog.tsx` (not separate pages)**

## Reference

For comprehensive operational guidelines, see **[AGENTS.md](./AGENTS.md)** - the canonical operating manual for AI assistants working in this repository.
