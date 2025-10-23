# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tuturuuu is a Turborepo monorepo containing multiple Next.js applications and shared packages. The platform provides workspace management, AI integration, finance management, user management, inventory management, and more.

## Technology Stack

- **Package Manager**: Bun (v1.3.0+)
- **Monorepo Tool**: Turborepo
- **Runtime**: Node.js v22+
- **Framework**: Next.js 15 with App Router and Turbopack
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
# Build all apps and packages (USER runs, agent requests)
bun run build

# Build with linting and testing
bun run buildx

# Run tests (USER runs, agent requests)
bun run test         # Run all tests
bun run test:watch   # Watch mode

# Run tests for specific package
bun --filter @tuturuuu/utils test
```

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

1. **NEVER** run `bun dev`, `bun run build`, or equivalent long-running commands unless explicitly requested
2. **NEVER** run `bun sb:push` or `bun sb:linkpush` - prepare migrations; user applies
3. **NEVER** run `bun lint`, `bun lint:fix`, `bun format`, or `bun format:fix` - suggest fixes; user runs
4. **NEVER** run Modal commands (`modal run`, `modal deploy`) - prepare code; user executes
5. **NEVER** commit secrets, API keys, tokens, or URLs containing credentials
6. **NEVER** use native browser dialogs (`alert()`, `confirm()`, `prompt()`) - use `@tuturuuu/ui/dialog`
7. **NEVER** use hard-coded Tailwind color classes (`text-blue-500`, `bg-purple-300`) - use `dynamic-*` tokens
8. **NEVER** hand-edit generated type files in `packages/types/src/supabase.ts`
9. **NEVER** import from `@tuturuuu/ui/toast` (deprecated) - use `@tuturuuu/ui/sonner`

### Mandatory Actions

1. **Touch ONLY** files required for the change (Least Privilege)
2. **Always** run `bun sb:typegen` after schema changes
3. **Always** validate external inputs with Zod schemas
4. **Always** add tests for new functionality
5. **Always** update documentation when changing public APIs
6. **Always** use Server Components by default; add `'use client'` only when necessary
7. **Always** reference environment variables by name only (never echo values)
8. **Always** add new documentation pages to `apps/docs/mint.json` navigation
9. **Always** update main navigation (`apps/web/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx`) when adding new routes - add to both `aliases` array and `children` navigation items with proper icons and permissions
10. **Always** provide translations for both English AND Vietnamese when adding user-facing strings to `apps/web/messages/{locale}.json`

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

1. **Pure Server Component (RSC)** - for read-only, cacheable, SEO-critical data
2. **Server Action** - for mutations returning updated state to RSC
3. **RSC + Client hydration** - when background refresh needed
4. **React Query client-side** - for interactive, rapidly changing state
5. **Realtime subscriptions** - only when live updates materially improve UX

**React Query Guidelines**:

- Use stable array query keys: `[domain, subdomain?, paramsHash, version?]`
- Set `staleTime` > 0 for rarely-changing data
- Implement optimistic updates with rollback on error
- Narrow invalidations (avoid global `invalidateQueries()`)
- Hydrate initial cache from RSC to prevent double fetches

### Workspace Management

- Each user can belong to multiple workspaces
- Workspace-scoped resources and permissions
- Invitation system with pending/accepted states
- User groups and tags for organization

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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@tuturuuu/ui/dialog';

<Dialog open={show} onOpenChange={setShow}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    {/* content */}
  </DialogContent>
</Dialog>
```

#### Toast Notifications

**FORBIDDEN**: `@tuturuuu/ui/toast` (deprecated)

**REQUIRED**: `@tuturuuu/ui/sonner`

```ts
import { toast } from '@tuturuuu/ui/sonner';
```

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

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `RATE_LIMIT_WINDOW_MS` | Time window in milliseconds | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `500` |

**Adding Custom Rate Limits:**

```typescript
// Custom rate limit for specific operation
export const POST = withApiAuth(
  async (request, { context }) => {
    // Handler code
  },
  {
    permissions: ['manage_drive'],
    rateLimit: { windowMs: 60000, maxRequests: 10 } // 10 req/min
  }
);

// Disable rate limiting (use sparingly)
export const GET = withApiAuth(
  handler,
  { rateLimit: false } // Not recommended
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
- >150 LOC multi-module complexity
- Security/auth logic that needs single point of maintenance
- Stable interface ready for reuse

Steps:

1. Create `packages/<name>/` with `package.json` (`@tuturuuu/<name>`)
2. Add `tsconfig.json` extending root config
3. Export via `src/index.ts`
4. Add README with purpose, usage, stability level
5. Add minimal tests
6. Run filtered build + tests

## Quick Reference

| Goal | Command | Notes |
|------|---------|-------|
| Install deps | `bun install` | Deterministic via lockfile |
| Dev (all apps) | `bun dev` | No DB required if gated |
| Full stack dev | `bun devx` | Starts Supabase + apps |
| Reset + seed | `bun devrs` | Destructive local DB reset |
| Build all | `bun run build` | USER-ONLY; uses Turbo cache |
| Test all | `bun run test` | USER-ONLY; Vitest workspaces |
| Scoped test | `bun --filter @tuturuuu/ui test` | Add `...` for dependents |
| Lint | `bun lint` | USER-ONLY; agent suggests fixes |
| Format | `bun format` | USER-ONLY; agent suggests fixes |
| New migration | `bun sb:new` | Edit generated SQL file |
| Apply migrations locally | `bun sb:up` | Safe for agents |
| Apply migrations remote | `bun sb:push` | USER-ONLY; NEVER agents |
| Regenerate types | `bun sb:typegen` | Commit resulting changes |
| Add dep to pkg | `bun add <dep> --workspace=@tuturuuu/<scope>` | Internal: `workspace:*` |
| Edge runtime | `export const runtime = 'edge'` | Only if required |

## Pre-PR Verification Checklist

Before requesting review:

1. ✅ Scope limited to intended change (no stray edits)
2. ✅ Build passes (user ran `bun run build`)
3. ✅ Lint clean (user ran `bun lint`; agent suggested fixes)
4. ✅ Tests added/updated & passing (user ran tests)
5. ✅ For DB changes: migration added; user ran `bun sb:push`
6. ✅ Types regenerated if schema changed
7. ✅ Docs updated for public API/env var changes
8. ✅ No secrets, tokens, or API keys committed
9. ✅ Edge runtime export added where required
10. ✅ All external inputs validated with Zod
11. ✅ All user-facing strings have both English and Vietnamese translations

## Reference

For comprehensive operational guidelines, see **[AGENTS.md](./AGENTS.md)** - the canonical operating manual for AI assistants working in this repository.