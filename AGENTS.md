## AGENTS.md – Operating Manual for Autonomous AI Assistants

### 1. Purpose & Audience

This document is a concise but complete operating manual for autonomous or semi-autonomous AI coding / documentation / maintenance agents working inside the `tutur3u/platform` monorepo. It defines: 

- Repository mental model (Turborepo + Bun workspaces + mixed Next.js 15 App Router + Python utilities/services)
- Canonical workflows (implement feature, add package, DB migration, AI endpoint, docs update, dependency maintenance)
- Guardrails (security, secrets, data boundaries, idempotency, reproducibility, performance, style)
- Collaboration protocol between multiple concurrent agents and with humans

Primary audiences:
1. Execution Agents – generate / modify code, tests, migrations, docs.
2. Review / Validation Agents – static analysis, lint/type/test/build verification.
3. Architectural / Refactor Agents – cross-cutting improvements (performance, DX, modularity) under constraints.
4. Knowledge / Docs Agents – keep documentation and schemas in sync.

All agents MUST treat this file as source of truth when policy conflicts arise. If a required rule is missing, propose an addition rather than inventing ad‑hoc behavior.

### 2. Canonical Capabilities & Hard Boundaries

Approved capability surface (default-allowed unless explicitly restricted):

| Domain | Allowed Actions | Must Also Do | Never Do |
|--------|-----------------|--------------|----------|
| Code (TS/JS) | Create/modify Next.js App Router routes, React Server/Client Components, shared package code | Add/update minimal tests & types, update relevant docs | Introduce breaking public API changes without `BREAKING` note |
| Code (Python) | Modify scripts/services in `apps/*` (python) respecting virtual env & dependency isolation | Keep requirements pinned / update lock if exists | Mix unrelated refactors with feature PR |
| Database (Supabase) | Create migration SQL in `apps/db/supabase/migrations`, run typegen | Bump generated types in `@tuturuuu/types` | Directly edit generated type files manually |
| AI Endpoints | Add routes under `app/api/...` using Vercel AI SDK & schemas in `packages/ai` | Enforce auth & feature flag checks | Expose raw provider keys or skip validation |
| Tooling | Update configs (`biome.json`, `turbo.json`) | Document rationale in PR description | Remove caching or security settings silently |
| Docs | Update `.md` / `.mdx` for accuracy | Cross-link related guides | Invent undocumented behavior |
| Dependencies | Add/remove workspace deps via `bun add --workspace` | Prefer workspace:* for internal packages | Add duplicate version already satisfied |

Mandatory guardrails:
1. Least Privilege: Touch ONLY files required for the change.
2. Idempotency: Re-running a workflow yields same state (migrations additive, scripts safe to repeat).
3. Determinism: Generated artifacts (types) must result from scripted commands, not manual edits.
4. Reproducibility: Provide succinct steps (bun install → bun dev/build/test) if novel.
5. Security: Never output secret values; reference env var names only.
6. Observability: Add log / comment only where materially aids debugging—avoid noisy console logs committed.
7. Explicit User Intent: Do NOT run `bun dev`, `bun run build`, or equivalent long-running / build commands unless the user explicitly requests it.
8. User-Only Supabase Apply: NEVER run `bun sb:push` or `bun sb:linkpush`. Prepare migrations & instructions; the user applies them.
9. User-Only Biome: NEVER run `bun lint`, `bun lint:fix`, `bun format`, or `bun format:fix`. Surface needed changes; ask user to run.

Prohibited actions (HARD STOP):
- Committing secrets, API keys, tokens, URLs containing credentials.
- Writing binary blobs not required (e.g., screenshots) outside designated `public/` folders.
- Removing or disabling linting, formatting, type checking to “make it pass”.
- Executing destructive DB commands in migrations without `-- reversible` strategy or clear comment.

Escalate (ask for human input) when:
1. A migration requires data backfill logic > 30 lines.
2. A refactor impacts >3 apps or >5 packages simultaneously.
3. Introducing a new third-party service dependency.
4. Changing security/auth flows or environment variable contract.

### 3. Repository Structure & Semantics

Top-level layout (partial):

```
platform/
├── apps/
│   ├── web/          # Main web app (Next.js 15 App Router)
│   ├── docs/         # Documentation (Mintlify / Next.js)
│   ├── rewise/       # App (Next.js)
│   ├── nova/         # App (Next.js)
│   ├── calendar/     # App (Next.js)
│   ├── finance/      # App (Next.js)
│   ├── playground/   # App (Next.js)
│   ├── shortener/    # App (Next.js)
│   ├── tumeet/       # App (Next.js)
│   ├── tudo/         # App (Next.js)
│   ├── db/           # Supabase migrations, scripts, typegen
│   └── discord/      # Python Discord bot/utilities
├── packages/
│   ├── ui/           # Shared UI components
│   ├── ai/           # AI schemas, model config, helpers
│   ├── supabase/     # Supabase client wrappers (server/client)
│   ├── types/        # Central TS types (incl. generated Supabase)
│   ├── utils/        # Cross-cutting utilities
│   ├── dev/          # Dev tooling helpers
│   ├── google/       # Google API integrations
│   ├── payment/      # Payment related abstractions
│   ├── transactional/# Emails / notifications
│   ├── trigger/      # Event / job triggers
│   └── apis/ crawler/ games/ etc.
├── scripts/          # Maintenance & automation scripts
├── public/           # Global static assets (shared docs/marketing)
└── AGENTS.md
```

Semantics & norms:
| Area | Rule |
|------|------|
| Cross-app sharing | Prefer extracting to `packages/*` before duplicating logic. |
| Supabase types | Always regenerate via `bun sb:typegen`—never hand-edit generated files. |
| App isolation | Avoid importing from another app's `src/`; use published workspace packages. |
| Environment config | Each Next.js app consumes root `.env*` plus its own; Python services manage their own `.env`. |
| Naming | Package names follow `@tuturuuu/<name>`; commit scopes mirror these names. |
| Edge/runtime | Explicitly set `export const runtime = 'edge'` when targeting edge execution. |
| Server vs Client Components | Default to Server Components; add `'use client'` only when interactivity/state required. |

Python subdirectory (`apps/discord/`):
- Keep isolated dependencies (requirements file if added later).
- Provide a `README.md` with run instructions; agents updating logic should not break existing entrypoints.

Database directory (`apps/db/`):
- `supabase/migrations` holds versioned SQL migrations (timestamp-based or sequential). Do not reorder.
- Scripts orchestrate Supabase CLI lifecycle (see root `package.json` sb:* scripts).
- After schema change: run migrations → `bun sb:typegen` → commit updated `packages/types` changes in same PR.

### 4. Canonical Workflows

Each workflow must be: minimal, idempotent, documented in PR description.

#### 4.1 Add / Update a Workspace Dependency
1. Determine scope (app vs shared). If reusable → create/update package under `packages/*`.
2. Add dependency:
	- `bun add <pkg>@<version> --workspace=@tuturuuu/<package-or-app>`
	- Internal: reference as `workspace:*`.
3. If types required: ensure `@types/*` present (unless TS ships types).
4. Run `bun run build` (or filtered) to validate.
5. Update relevant docs if public surface exposed.

#### 4.2 Create New Shared Package
1. Scaffold directory `packages/<name>/` with `package.json` (name `@tuturuuu/<name>`; `main` & `types` fields).
2. Add `tsconfig.json` extending root or typescript-config package.
3. Export public API via `src/index.ts` (avoid deep export leakage).
4. Add minimal README (purpose, usage, maintenance notes).
5. Add one smoke test if logic present.
6. Run build + test.

#### 4.3 Add Next.js App Router API Route
1. Choose app: `apps/<app>/src/app/api/<segment>/route.ts`.
2. For edge: `export const runtime = 'edge'` if appropriate.
3. Implement handler(s): `export async function GET/POST(...)`.
4. Use Supabase client wrappers from `@tuturuuu/supabase` for auth.
5. Validate input (Zod if structured JSON) – reject early with 4xx.
6. Add test (unit or integration stub) if feasible; else doc example.
7. Update feature docs (apps/docs) if new public capability.

#### 4.4 Add AI Structured Data Endpoint
1. Define / reuse schema in `packages/ai/src/object/types.ts` (Zod).
2. Create route `app/api/ai/<feature>/route.ts`.
3. Enforce auth: get user via `createClient()`; return 401 if absent.
4. Feature flag: check `workspace_secrets` when required.
5. Use `streamObject` / `generateObject` with selected model.
6. Bound runtime: set `maxDuration` if long-running.
7. Handle & log (server-side) errors → generic user message.
8. NEVER log secrets / raw provider responses containing keys.
9. If storing results, insert via admin client with type-safe types.

#### 4.5 Database Schema Change (Supabase)
1. Create migration: `bun sb:new` (inside root via script) → edit SQL.
2. Prefer additive changes. For destructive ops: comment rationale + reversible notes.
3. (User-only) Application: User runs `bun sb:push` (The agent is allowed to run `bun sb:up` for ephemeral changes, as it only affect local supabase instance in Docker). Agent MUST NOT execute `bun sb:push`.
4. Types: Runs `bun sb:typegen`; agent incorporates updated generated types via terminal command (never hand-edit).
5. Update application code referencing new columns (after user supplies regenerated types in repo state).
6. Add data backfill script (idempotent) if needed (<30 LOC) inside migration or separate script; else escalate.
7. Prepare targeted tests referencing new schema (user executes them).

#### 4.6 Formatting, Linting, Typecheck
Use Biome (user-run only; agent must not execute commands directly).
1. Agent identifies potential lint/format issues (heuristic or static review) and requests user to run `bun lint` / `bun format`.
2. For fixes, agent proposes code edits; user optionally runs `bun lint:fix` / `bun format:fix`.
3. Agent re-checks file content post-user action to confirm resolution.

#### 4.7 Testing
1. `bun run test` (Vitest across workspaces) or filter: `bun --filter @tuturuuu/<pkg> test`.
2. Add at least: happy path + failure/edge case.
3. For new util: prefer pure function structure → easy unit test.

#### 4.8 Performance / Profiling
1. For React performance: consider `react-scan` if integrated.
2. Avoid premature optimization; include micro-benchmark only if regression risk.
3. Document performance-sensitive choices inline (≤3 line comment) + in PR summary.

#### 4.9 Dependency Maintenance
1. Use script `bun update-all` (scripts/package-update.js) for batch when approved.
2. After bump: run build, test, lint.
3. For major version: consult changelog; add BREAKING note if user-facing.

#### 4.10 Python Service (apps/discord)
1. Keep logic modular; avoid cross-import from TS packages directly.
2. If dependency added, update `requirements.txt` (if present) and pin.
3. Provide run instructions or adjust existing README.
4. Respect separate .env – do not mix Node env var assumptions.
5. **NEVER** auto-execute Modal commands (`modal run`, `modal deploy`) without explicit user request.
6. For Modal-based Discord bots: provide deployment commands but let user execute them.

#### 4.11 Scripts in `scripts/`
1. Must be idempotent & side-effect explicit.
2. Accept dry-run flag where feasible.
3. Log concise summary; avoid verbose diff dumps unless necessary.

### 5. Coding Standards & Conventions

#### 5.1 Git Hygiene
Follow Conventional Commits & Branch naming (see `apps/docs/git-conventions.mdx`).
- Commit format: `type(scope): description` in imperative mood.
- Scope = package or app directory name (e.g., `feat(ui): ...`).
- Add `!` or `BREAKING CHANGE:` footer for breaking changes.
- Keep PR title aligned with primary commit.

#### 5.2 TypeScript
- Prefer explicit return types for exported functions & public APIs.
- Narrow unknown/any at boundaries; `any` requires a justification comment.
- Use discriminated unions over enums unless runtime enum needed.
- Keep React Server Components default; add `'use client'` only when necessary.
- Avoid deep relative imports into other packages—expose via their `index.ts`.
- Use Zod for runtime validation of external inputs (API bodies, env-derived config).

#### 5.3 Python (apps/discord)
- Keep modules small; single responsibility.
- Use type hints (PEP 484) where possible.
- Avoid global mutable state; prefer dependency injection in functions.
- Log only actionable info; no secrets, tokens, or raw user content.

#### 5.4 Error Handling
- Fail fast: validate inputs early → return 400/401/403.
- Wrap external service calls; surface sanitized error messages.
- Never leak stack traces to client. Use generic message + server-side logged detail.
- For expected absence (e.g., optional resource): return 204 or empty array instead of 500.

#### 5.5 Performance
- Avoid N+1 DB patterns—batch selects or add indices if justified (document reasoning in PR).
- Stream large AI responses where user value is incremental (`streamObject`).
- Memoize pure computation in hot paths only after measurement.

#### 5.6 Accessibility & UI
- Ensure interactive elements are reachable via keyboard (tab order natural, no positive tabindex).
- Provide `aria-label` or text content for icon-only buttons.
- Color choices must respect contrast (WCAG AA). If uncertain, note for human review.
- **Dialog Components**: Always use `@tuturuuu/ui/dialog` components instead of native browser dialogs (`alert()`, `confirm()`, `prompt()`). Native dialogs are not accessible, not customizable, and break the design system.

#### 5.7 Security & Secrets
- Only reference environment variables by name—never inline secret values.
- Sanitize user-provided strings before embedding into prompts if risk of injection / model steering.
- For AI prompts containing user content: prefix with system delimiting instructions and strip control tokens.

#### 5.8 Schema Evolution (DB)
- Add columns instead of repurposing existing ones; deprecate with comment.
- Backfill in migration only if <30 lines & idempotent; else create script + escalate.
- Never drop a column/table without confirming no code references (search + types build).

#### 5.9 Testing Principles
- Fast unit tests: no network, DB, or file system unless integration explicitly.
- Use table-driven tests for function variants where meaningful.
- Snapshot tests sparingly—only for stable serializable artifacts.

#### 5.10 Documentation Drift Prevention
- When modifying a public API or schema: update corresponding `.mdx` in `apps/docs` same PR.
- Add “Updated: <yyyy-mm-dd>” line in doc frontmatter if materially changed.

#### 5.11 Tailwind Dynamic Color Policy
All Next.js apps use Tailwind CSS v4.1+ with dynamic color design tokens. Hard-coded palette utility classes (e.g. `text-blue-500`, `bg-purple-300/10`, `border-green-600/20`) are **forbidden**.

Allowed Pattern:
`text-dynamic-blue`, `bg-dynamic-purple/10`, `border-dynamic-green/20`, `hover:bg-dynamic-surface/80`.

Rules:
1. Never introduce static color classes referencing raw palette names (blue-500, slate-200, etc.).
2. Use `dynamic-*` token namespace for text, background, border, ring, divide, outline, accent, fill, stroke classes.
3. Opacity suffixes remain allowed: `bg-dynamic-red/15`.
4. For gradients: use dynamic tokens in from/via/to e.g. `from-dynamic-pink via-dynamic-indigo to-dynamic-cyan`.
5. If Tailwind plugin-generated utilities are needed, map them to dynamic tokens or add a design token first—never bypass with inline styles unless truly dynamic runtime value.
6. Inline style hex values only permitted for temporary experimental spikes; must be replaced before merge.
7. Linting/PR review should flag any `-blue-`, `-green-`, etc., occurrences in class strings unless preceded by `dynamic-`.

Migration Guidance (if editing legacy code):
- Replace `text-blue-500` → `text-dynamic-blue`.
- Replace `bg-purple-300/10` → `bg-dynamic-purple/10`.
- Replace `border-green-600/20` → `border-dynamic-green/20`.

Add a comment `// rationale: dynamic token mapping` only when mapping is non-obvious (e.g., brand-accent to dynamic-orange).

#### 5.12 Data Fetching & React Query
Goal: Minimize client complexity and network chatter while keeping UX responsive.

Decision Order (Prefer Earlier):
1. Pure Server Component (RSC) fetch – for read-only, cacheable, SEO / first paint critical data.
2. Server Action (mutation or non-idempotent op) returning updated canonical state to RSC.
3. RSC initial fetch + Client hydration (dehydrate React Query cache) if post-load background refresh needed.
4. Client-only React Query (`useQuery`/`useMutation`) for interactive, rapidly changing, or session-local state.
5. Realtime subscription (Supabase channel) + targeted query invalidation / cache updates (avoid polling) – only if live updates materially improve UX.

When NOT to use React Query:
- Single static fetch with no refresh requirement (use RSC).
- Simple form POST where immediate redirect or RSC re-render suffices (use server action / route handler returning redirect or new data).
- Data already fully present via parent RSC props.

When TO use React Query:
- User-triggered mutations needing optimistic UI or undo.
- Background refetch for freshness after initial SSR/RSC render.
- Paginated / infinite lists with incremental loading.
- Dependent queries (one key depends on another's resolved data) requiring client sequencing.
- Shared client state consumed in multiple sibling Client Components without prop drilling.

Query Keys:
- Always use stable array form: `[domain, subdomain?, paramsObjectHash, version?]`.
- Include a lightweight version token when shape/filters change to avoid stale structural assumptions.
- Never put non-deterministic values (functions, Date instances) directly in keys; serialize needed primitives.

Caching & Staleness:
- Set `staleTime` > 0 for data that rarely changes to prevent immediate refetch storms.
- Use `gcTime` (garbage collection) mindful of memory – large lists may require shorter retention; small scalar resources can live longer.
- For RSC + hydration: mark query as fresh (`staleTime` > re-render window) to avoid double fetch after hydration.

Hydration Pattern (RSC → Client):
1. Fetch data in Server Component / route.
2. Create a `QueryClient`, pre-populate with `queryClient.setQueryData(key, data)`.
3. Pass `dehydrate(queryClient)` to a Client boundary provider.
4. Client `useQuery` with same key gets instant data (no flash / duplicate network call).

Mutations:
- Define `useMutation({ mutationFn, onMutate, onError, onSettled })`.
- Optimistic Update Flow:
	1. `onMutate` – cancel outgoing queries for affected keys (`queryClient.cancelQueries`). Snapshot previous value.
	2. Apply optimistic cache change (`setQueryData`).
	3. On error – restore snapshot; surface toast / non-intrusive error.
	4. On success – merge server response (source of truth) and invalidate narrowly (e.g., `invalidateQueries({ queryKey: [...] })`).
- Avoid broad `invalidateQueries()` with no key – hurts perf & determinism.

Error Handling:
- Normalize HTTP / RPC errors to domain-centric objects before caching (avoid leaking implementation details into UI layer).
- Use error boundaries or `onError` side effects (logging, non-blocking notifications) – never swallow silently.

Pagination:
- Prefer cursor-based (stable `nextCursor`) over page-number when API supports it – simpler invalidation.
- Use `useInfiniteQuery` with `getNextPageParam` returning cursor; flatten pages in memoized selector.

Selective Data Mapping:
- Use `select` in `useQuery` to derive view model slices; keeps components decoupled from raw payload shape and reduces re-renders.

Realtime Integration (Optional):
- Subscribe to Supabase channel only for high-value live data (e.g., collaborative edits). In handler, update cache via `setQueryData` instead of invalidating if diff known.
- Throttle bursts (debounce merging) to avoid rapid re-renders.

Performance & Render Hygiene:
- Co-locate small read queries with components; share bigger aggregates at boundary provider to avoid over-fetch.
- Wrap large lists with virtualization when item count > ~200.
- Avoid putting large objects directly in dependency arrays; derive stable memoized IDs for selectors.

Security & Auth:
- Never embed service-role operations in client queries – all privileged actions must be via server route / action.
- On 401/403 inside mutation/query: surface sign-in required state; do not loop refetch blindly.

Testing Guidelines:
- Mock query client in unit tests; assert cache transitions for optimistic flows.
- Provide controlled fake timers for staleTime expiry tests.

Do / Avoid Summary:
| Do | Because | Avoid | Why |
|----|---------|-------|-----|
| RSC first for static & SEO data | Fewer bytes, faster TTFB | Client query for static config | Redundant round trip |
| Hydrate initial query cache | Prevent double fetch | Refetch immediately post-hydration | Wasted bandwidth |
| Narrow invalidations | Precise updates | Global invalidation | Performance hit |
| Optimistic updates with snapshot | Responsive UX | Blind optimistic writes w/out rollback | Inconsistent UI on failure |
| Version query keys on shape change | Avoid stale structural assumptions | Reusing old key after breaking change | Hard-to-debug stale caches |

Escalate if: Proposed pattern entails >5 overlapping realtime channels OR optimistic update logic >40 LOC (extract helper / reconsider complexity).

Cross-Reference: See 5.2 (TypeScript) for return type clarity and 5.7 (Security) for auth separation; React Query Client usage must not undermine those guarantees.

#### 5.13 Toast Notifications
Use the unified toast utility exported from `@tuturuuu/ui/sonner`.

Rules:
1. DO import from `@tuturuuu/ui/sonner` for all new toast / notification toasts.
2. DO NOT import from `@tuturuuu/ui/toast` – that module is **deprecated** and will be removed (breaking) in a future cleanup.
3. If you touch a file that still imports `@tuturuuu/ui/toast`, opportunistically migrate it to `@tuturuuu/ui/sonner` in the same PR (scoped change; no large refactor required).
4. Keep toast content concise (≤120 chars primary message). Longer contextual info should link to a help page or surface in an expanded UI element instead of stuffing the toast.
5. Prefer semantic intent variants (success / error / info / warning) provided by the Sonner wrapper; avoid custom ad‑hoc styling that bypasses design tokens.

Rationale:
- Consolidated API (Sonner) standardizes animation, accessibility (ARIA live region), and theming with dynamic color tokens.
- Deprecated path lacked consistent accessibility attributes and theming alignment.
- Early migration reduces friction ahead of scheduled removal.

Guardrail Enforcement:
- New imports from `@tuturuuu/ui/toast` should be treated similar to a lint violation and blocked in review.
- If a removal PR is large (>30 modified files), split into batches grouped by app/package.

Migration Pattern:
```ts
// BEFORE (deprecated)
import { toast } from '@tuturuuu/ui/toast';

// AFTER
import { toast } from '@tuturuuu/ui/sonner';
```

No behavioral API change expected; if an edge case arises (missing variant / prop), escalate instead of shim‑patching locally.

#### 5.14 Dialog Components
#### 5.15 Estimation Points Mapping (Boards)
To ensure consistent display of task estimation points across all views (task cards, bulk actions, timelines) a single shared mapping utility must be used.

Rules:
1. Underlying stored value is always an integer index (0…7). Never store the human label directly.
2. Mapping from index → display string handled by a shared function (currently `mapEstimationPoints` in `packages/ui/src/components/ui/tu-do/shared/estimation-mapping.ts`). Do not re‑implement ad hoc switch statements elsewhere (DRY enforcement).
3. Supported estimation types & display sequences:
  - `t-shirt`: `0 -> -`, `1 -> XS`, `2 -> S`, `3 -> M`, `4 -> L`, `5 -> XL`, `6 -> XXL`, `7 -> XXXL`.
  - `fibonacci`: `0,1,2,3,5,8,13,21` (index 0..7).
  - `exponential`: `0,1,2,4,8,16,32,64` (index 0..7).
  - Default / linear: display the raw index.
4. Extended Estimation Flag (`extended_estimation`):
  - When false: indices >5 (i.e. 6 and 7) MUST NOT be selectable; they should render in menus as disabled (optional hint label e.g. “(upgrade)” or omitted entirely).
  - When true: indices 6 and 7 become enabled with their mapped labels.
5. Zero Handling (`allow_zero_estimates`):
  - If false: index 0 is excluded from selection lists and should not appear.
  - If true: index 0 is included; t‑shirt displays `-`, others show their mapped numeric.
6. Bulk / dropdown UIs must: (a) enumerate indices based on flags, (b) disable (not hide) extended indices when `extended_estimation` is false to educate users about higher tiers.
7. Task display components (e.g. `TaskEstimationDisplay`) must rely on the shared util – any changes to mapping occur centrally.
8. New estimation types REQUIRE updating the shared util + this section; failure to do so is a review blocker.

Rationale:
- Prevents divergent label sets (e.g., numeric in bulk menu vs. t‑shirt on cards).
- Simplifies future addition of estimation types by consolidating mapping logic.
- Clear UX signaling for features gated behind `extended_estimation`.

Quality Gate Additions:
- PRs touching estimation display/selection must show diff of `estimation-mapping.ts` or explain why unchanged.
- Lint/Review should reject duplicate local maps for estimation types.

Use the unified dialog system from `@tuturuuu/ui/dialog` for all modal interactions.

Rules:
1. **NEVER** use native browser dialogs (`alert()`, `confirm()`, `prompt()`) – they are not accessible, not customizable, and break the design system.
2. **ALWAYS** use `@tuturuuu/ui/dialog` components for modal interactions.
3. Import dialog components: `import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@tuturuuu/ui/dialog'`
4. Use proper dialog patterns with controlled state management.
5. Ensure dialogs are keyboard accessible and screen reader friendly.
6. Use `DialogTrigger` for opening dialogs, `DialogContent` for the modal content.
7. Include proper `DialogHeader`, `DialogTitle`, and `DialogDescription` for accessibility.
8. Use `DialogFooter` for action buttons (Cancel, Confirm, etc.).

Dialog Pattern:
```tsx
const [showDialog, setShowDialog] = useState(false);

<Dialog open={showDialog} onOpenChange={setShowDialog}>
  <DialogTrigger asChild>
    <Button>Open Dialog</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Dialog Title</DialogTitle>
      <DialogDescription>Dialog description</DialogDescription>
    </DialogHeader>
    {/* Dialog content */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowDialog(false)}>
        Cancel
      </Button>
      <Button onClick={handleConfirm}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Rationale:
- Native dialogs cannot be styled, are not accessible, and break the design system.
- Custom dialogs provide full control over styling, behavior, and accessibility.
- Consistent dialog patterns improve user experience and maintainability.
- Proper ARIA attributes and keyboard navigation are built into the dialog components.

Guardrail Enforcement:
- Any use of `alert()`, `confirm()`, or `prompt()` should be flagged and replaced with proper dialog components.
- Dialog components must include proper accessibility attributes and keyboard navigation.

### 6. Environment & Tooling Usage

#### 6.1 Package Manager & Scripts
- Single package manager: **Bun** (`packageManager` pinned in root `package.json`).
- Global scripts orchestrate multi-app dev (`bun dev`, `bun devx`, filtered `dev:<app>` variants).
- Supabase lifecycle: `sb:start`, `sb:stop`, `sb:push`, `sb:reset`, `sb:typegen`, `sb:new`.
- Always re-run `bun sb:typegen` after schema changes (usually chained by scripts already).

#### 6.2 Turborepo Tasks
- `build` depends on upstream builds; cache outputs (.next excluding cache subdir).
- `dev` tasks are non-cached & persistent.
- Use `bun --filter <target...>` for scoped operations to speed iteration.

#### 6.3 Environment Variables (whitelisted in `turbo.json`)
Only reference by name. Examples (non-exhaustive):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SECRET_KEY`.

Rules:
- Never echo secret values to logs.
- Public-prefixed (`NEXT_PUBLIC_`) may appear client-side; everything else server-only.
- For edge runtime, ensure variables are available in deployment environment.

#### 6.4 Caching & Determinism
- Do not commit build artifacts except intentionally (e.g., generated types).
- Rely on Turborepo + Bun caching; do not introduce custom ad-hoc cache layers without review.

#### 6.5 Local Development Modes
- `bun dev`: start all Next.js apps (no DB required if features gated).
- `bun devx`: full stack w/ Supabase (backup/restore logic included).
- `bun devrs`: reset Supabase with seed data (destructive to prior local state).

#### 6.6 Filtering Examples
`bun --filter @tuturuuu/ui test` → only run UI package tests.
`bun --filter @tuturuuu/web... build` → build web and its dependency graph.

#### 6.7 Python Service Execution
- Keep Python isolated; do not assume Node environment variables exist unless duplicated.
- If adding dependencies: update (or create) `requirements.txt` with pinned versions.

### 7. Agent Collaboration Protocol

#### 7.1 Roles & Handoffs
- Execution Agent produces code + minimal tests + doc updates.
- Review Agent validates (lint, typecheck, tests, build) and annotates discrepancies.
- Refactor Agent only engages after feature correctness established; must not change behavior without tests.
- Docs Agent ensures public docs align with merged changes; updates frontmatter dates.

Handoff Requirements:
| From | To | Must Provide |
|------|----|--------------|
| Execution | Review | Summary of change, affected packages, commands run, residual warnings |
| Review | Execution | Precise failure list (file:line + message), suggested fix vectors |
| Execution | Docs | Public API surface diff & new env vars (names only) |
| Refactor | Review | Rationale, before/after complexity/perf notes, test matrix unchanged |

#### 7.2 Concurrency Rules
- Only one agent mutates a given file path set concurrently—others operate read-only.
- Large refactors (touching >50 files) require lock with explicit scope list.
- Use incremental commits grouped by logical concern (schema, code, tests, docs) to ease review.

#### 7.3 Logging & Traceability
- Commit messages and PR description serve as canonical audit trail; avoid verbose inline comments unless clarifying rationale.
- Add short `// rationale:` comments for non-obvious decisions (<80 chars ideally).

#### 7.4 Idempotency Verification
Before handing off, Execution Agent re-runs:
1. `bun install` (should produce no changes)
2. (User-only) Request user runs `bun run build` and confirms success.
3. (User-only) Request user runs relevant filtered tests (`bun --filter <scope> test`) and shares failures for analysis.
4. If DB change: Agent supplies migration SQL; user runs `bun sb:push` & `bun sb:typegen`; agent validates only intended type diffs.

#### 7.5 Conflict Resolution
- Prefer rebase over merge for feature branches to keep linear history.
- If migration number conflict: create new migration & re-apply; never edit previously merged migration.

#### 7.6 Escalation Path
If blocked by policy ambiguity, open an issue labeled `policy-gap` with:
`Context`, `Attempted Steps`, `Blocking Point`, `Proposed Rule`.

### 8. Guardrails & Pre-PR Verification

#### 8.1 Mandatory Checklist (Execution Agent)
Tick ALL before requesting review:
1. Scope limited to intended change set (no stray file edits) ✅
2. Build passes (user ran `bun run build`) ✅
3. Lint clean (user ran `bun lint`; agent suggested fixes) ✅
4. Tests added/updated & passing (user ran `bun run test` or filtered) ✅
5. For DB changes: migration added; user confirmed `bun sb:push` produced no diff ✅
6. Types regenerated (`packages/types`) if schema changed ✅
7. Docs updated for public API / env var / schema deltas ✅
8. No secrets, tokens, or API keys committed ✅
9. Added edge runtime export where required ✅
10. All new external inputs validated (Zod / guard logic) ✅

#### 8.2 Quality Gates
| Gate | Pass Criteria |
|------|---------------|
| Build | All packages/apps build w/out error |
| Lint | No errors; warnings justified or fixed |
| Types | No `any` leaks (except justified) |
| Tests | Relevant suites pass; coverage stable or improved |
| Migrations | Apply cleanly; idempotent re-run |
| Docs | Updated & internally consistent |
| Security | No plaintext secrets; validation present |
| Performance | No obvious regressions; hot paths unchanged or justified |

#### 8.3 Rejection Triggers (Auto-Fail)
- Adding unused dependency.
- Skipping validation for user-provided data.
- Silent catch of broad exceptions (`catch (e) {}` without handling/log rationale).
- Editing generated types manually.
- Large refactor PR mixing feature + infra (split required).

#### 8.4 Minimal PR Description Template
```
Summary: <1-2 lines>
Change Types: feat | fix | chore | docs | refactor | perf | test
Affected Scopes: @tuturuuu/ui, @tuturuuu/web
DB Migration: yes/no (id: <timestamp>)
New Env Vars: (names only)
Validation Added: yes/no (explain if no)
Testing: <cases brief>
Risks: <perf/edge cases>
Follow-ups: <deferred tasks>
```

### 9. CI / CD Workflows Overview

CI pipelines enforce the guardrails automatically. Agents should align local verification with how workflows evaluate changes.

#### 9.1 Workflow Categories
| Category | Representative Workflow(s) | Purpose | Agent Prep |
|----------|----------------------------|---------|-----------|
| Code Quality | `biome-check.yaml` | Format + lint, auto-format PR if needed | Run `bun lint` & `bun format:fix` locally |
| Unit Tests | `turbo-unit-tests.yaml` | Run Vitest across workspaces w/ remote turbo cache | Filter failing scope before pushing |
| DB Integrity | `check-migrations.yml`, `supabase-types.yaml` | Enforce migration naming/order & type generation parity | Ensure `bun sb:push` clean + regenerated types committed |
| Package Release | `release-*-package.yaml` | Conditional publish of scoped packages | Bump version + conventional commit title |
| Supabase Deploy | `supabase-staging.yaml` / `supabase-production.yaml` | Apply migrations to envs | Avoid destructive SQL; additive changes |
| Vercel Previews | `vercel-preview-*.yaml` | Build & preview per app | Keep build deterministic; avoid unused deps |
| Vercel Production | `vercel-production-*.yaml` | Production deploy gating | Ensure env var usage documented |
| Coverage | `codecov.yaml` | Upload coverage report | Add/maintain tests for changed logic |
| Security / CodeQL | `codeql.yml` | Static security analysis | Address flagged issues or justify |

#### 9.2 Failure Handling Guidance
| Failure Type | Typical Cause | Agent Action |
|--------------|---------------|--------------|
| Biome format job opens PR | Unformatted files | Rebase after merge of autofix or apply locally |
| Lint errors | New rule violations | Fix or suppress with rationale comment (rare) |
| Migration ordering failure | Timestamp earlier than base | Rename migration with later timestamp |
| Type mismatch (Supabase types) | Schema changed without regen | Run `bun sb:typegen` & commit |
| Unit test flake | Non-deterministic test (timing, randomness) | Stabilize using deterministic seed or fake timers |
| Build failure in preview | Missing dependency or edge runtime mismatch | Add dependency or export `runtime` constant |
| Release workflow no-op | Missing chore commit scope/title | Adjust commit to `chore(@tuturuuu/<pkg>): bump version` |

#### 9.3 Release Preconditions (Packages)
1. Version bump in `package.json` (semver) consistent with commit type.
2. Title contains `chore(@tuturuuu/<name>)` to trigger release workflow.
3. Tests for the package pass independently: `bun --filter @tuturuuu/<name> test`.
4. No pending unpublished breaking changes without `BREAKING` footer.

#### 9.4 Migration Safety Pattern
Checklist before merging migration PR:
- Files named with increasing sortable identifiers (timestamps).
- No direct destructive DDL (DROP/ALTER DROP) unless comment includes `-- reversible:` explanation & alternative.
- If data backfill needed and >=30 LOC: escalate.
- Regenerated types reflect new objects (diff limited to expected sections).

#### 9.5 Turbo Remote Cache Hygiene
- Ensure tasks rely only on declared inputs; avoid reading undeclared external files.
- Do not commit `.turbo` content.
- When unusual cache miss occurs, confirm no nondeterministic generation (timestamps, randomness) in build output.

#### 9.6 Minimal Local CI Parity Script
Run before pushing substantial feature (USER executes; agent prompts):
```
bun install
bun run build   # user-only
bun run test    # user-only
bun lint        # user-only
```
For DB changes (USER executes):
```
bun sb:push     # user-only (agent never runs)
bun sb:typegen  # user-only (agent consumes results)
```
Agent Responsibilities:
- Provide migration SQL & expected diff summary.
- Suggest which filtered tests to run.
- Infer likely lint/format issues; request user action rather than executing.

### 10. Quick Reference (Cheat Sheet)

| Goal | Command / Action | Notes |
|------|------------------|-------|
| Install deps | `bun install` | Deterministic via lockfile |
| Dev (all apps) | `bun dev` | No DB required if gated |
| Full stack dev | `bun devx` | Starts Supabase + apps |
| Reset + seed | `bun devrs` | Destructive local DB reset |
| Build all | `bun run build` | Uses Turbo cache |
| Test all | `bun run test` | Vitest workspaces |
| Scoped test | `bun --filter @tuturuuu/ui test` | Add `...` suffix to include dependents |
| Lint | `bun lint` | Use `lint:fix` to auto-fix |
| Format | `bun format` | Use `format:fix` to write |
| New migration | `bun sb:new` | Edit generated SQL file |
| Apply migrations | `bun sb:push` | Also regenerates types |
| Link migrations (user-only) | `bun sb:linkpush` | NEVER run as agent |
| Regenerate types | `bun sb:typegen` | Commit resulting changes |
| Add dep to pkg | `bun add <dep> --workspace=@tuturuuu/<scope>` | Internal deps `workspace:*` |
| Create shared pkg | Follow 4.2 workflow | Include README + test |
| Add API route | Create `app/api/.../route.ts` | Validate input early |
| Add AI endpoint | See 4.4 | Use schema + auth + feature flag |
| Edge runtime | `export const runtime = 'edge'` | Only if required |
| Supabase admin client | Import from `@tuturuuu/supabase` | Avoid direct REST calls |
| Escape hatch escalation | Open issue `policy-gap` | Provide context & proposal |
| (DO NOT auto run build/dev) | (Requires explicit user request) | Safeguard against unintended resource use |
| (DO NOT run sb:push/linkpush) | User-only | Agent prepares migration & instructions |
| (DO NOT run biome commands) | User-only | Agent suggests fixes; user executes |
| (DO NOT run modal commands) | User-only | Agent prepares Modal code; user runs `modal run/deploy` |

Top 5 Failure Causes → Fix Fast:
1. Missing regenerated Supabase types → run `bun sb:typegen`.
2. Unformatted code → run `bun format:fix`.
3. Lint errors → run `bun lint:fix` then address residuals.
4. Migration ordering error → rename with later timestamp.
5. Release workflow skipped → ensure PR title `chore(@tuturuuu/<pkg>): ...`.

Escalate if: multi-app breaking refactor, destructive schema change, data backfill >30 LOC, new external service, auth/token contract change.

### 11. Package Extraction Decision Matrix

When deciding whether to extract shared logic into a package under `packages/*`, evaluate the following dimensions. Extract only when ≥3 HIGH signals or a SINGLE Critical apply.

| Criterion | Keep In-App (LOW) | Consider Extraction (MED) | Extract Now (HIGH) | Critical (Immediate) |
|-----------|-------------------|---------------------------|--------------------|----------------------|
| Reuse Breadth | Used in 1 app | Needed in 2 apps soon | Actively duplicated in ≥2 apps | Security / auth logic duplicated |
| Change Velocity | Likely to churn heavily | Stabilizing | Stable interface | Must version for external integration |
| Complexity | <50 LOC simple | 50–150 LOC moderate | >150 LOC multi-module | Requires specialized setup (e.g., provider clients) |
| Domain Ownership | App-specific semantics | Mixed concerns | Pure cross-domain utility | Compliance / data boundary enforced |
| Testing Needs | Hard to unit test yet | Basic tests exist | Comprehensive tests stable | Needed for contract testing in CI |
| Public API Surface | Internal only | Might be exported later | Already imported via relative deep paths | External consumers (future OSS) |
| Drift Risk | Low | Emerging duplication | Frequent copy-paste edits | Security patch needs single point fix |

Extraction Steps Recap:
1. Create folder `packages/<name>`.
2. Add `package.json` (name `@tuturuuu/<name>`; set `type`, `main`, `types`).
3. Add `tsconfig.json` extending root base.
4. Implement `src/index.ts` – export only intentional surface.
5. Migrate code & update imports (`@tuturuuu/<name>`).
6. Add minimal tests + README (purpose, usage, stability level).
7. Build + run filtered tests before pushing.

Label Stability in README:
- `@experimental` (API may change)
- `@stable` (backwards compatible changes only)
- `@frozen` (changes require BREAKING notice)

### 12. AI Model Usage & Fallback Policy

#### 12.1 Model Selection Principles
- Prefer fastest model that satisfies quality for structured object tasks (e.g., `gemini-2.0-flash-*` for low-latency generation).
- Elevate to higher context model (e.g., `gemini-2.0-pro-*`) when:
	- Prompt + schema + accumulated context risk token overrun.
	- Prior attempt failed with truncation / hallucination flagged by validation.
- For deterministic schema compliance: rely on Vercel AI SDK `generateObject` / `streamObject` with Zod schema.

#### 12.2 Fallback Order (Example)
1. `gemini-2.0-flash-001`
2. `gemini-2.0-pro-exp-02-05`
3. Alternate provider (future) – escalate if not configured.

Document any deviation inside PR description (Reason + Observed Failure Mode).

#### 12.3 Error Handling Strategy
| Error Type | Detect | Action |
|-----------|--------|--------|
| Auth / 401 | Provider response code | Return 500 sanitized; log internal code path ID |
| Rate limit | 429 / provider signal | Exponential backoff (max 2 retries), fallback model if supported |
| Schema mismatch | Zod parse fail | Attempt single retry with stricter system instruction; else return 422 |
| Timeout | Exceeds `maxDuration` | Abort controller; fallback to shorter prompt or flash model |
| Content filter blocked | Provider flag | Return 400 with generic safe message; do not retry automatically |

#### 12.4 Prompt Hygiene
- Always isolate user-provided text with clear boundary markers: `USER_CONTENT_START` / `USER_CONTENT_END` (or similar) when risk of injection.
- Remove disallowed tokens / control sequences before sending.
- Avoid echoing secret-like substrings using a simple regex filter before model call (e.g., patterns for API key shapes) – if detected, replace with `[REDACTED]` and log sanitized event.

#### 12.5 Telemetry (Future Scope)
- If adding telemetry hooks: ensure they capture model name, latency bucket, success/failure classification, token estimate; never raw prompt or full output unless separately consented.

#### 12.6 Caching (Not Yet Enabled)
- Do not implement ad-hoc caching of AI responses without explicit product requirement; risk of stale sensitive data leakage.

#### 12.7 Large Output Strategy
- Prefer streaming for user-perceivable partial progress (`streamObject`).
- For bulk inserts (e.g., large flashcard sets) validate size thresholds (< defined row cap) before DB write; chunk if necessary.

### 13. Glossary
| Term | Definition |
|------|------------|
| RSC | React Server Components – default model; avoid `'use client'` unless interactivity required. |
| Edge Runtime | Next.js execution mode optimized for low-latency global compute; set `export const runtime = 'edge'`. |
| Typegen | Automatic generation of Supabase types via `bun sb:typegen`; never hand-edit output. |
| Workspace Filter | Turborepo/Bun filter syntax `bun --filter <pkg>... <task>` including dependents with `...`. |
| Migration | Versioned SQL file under `apps/db/supabase/migrations` representing additive schema evolution. |
| Feature Flag | Workspace-level toggle stored in `workspace_secrets` controlling conditional feature access. |
| Admin Client | Supabase service-role wrapper from `@tuturuuu/supabase` used for privileged operations server-side. |
| Structured AI Generation | Using Vercel AI SDK `generateObject` / `streamObject` with Zod schema for deterministic shape. |
| Idempotent | Safe to run multiple times without changing final state beyond initial application. |
| Remote Cache | Turborepo cache persisted via `TURBO_TOKEN` / `TURBO_TEAM` enabling shared build artifacts. |
| CI Parity | Local verification replicating key CI gates (build, test, lint, type, migration). |
| Scope (Commit) | Affected package/app name inside Conventional Commit header (`feat(ui): ...`). |
| Escalation | Opening `policy-gap` or human request when rule coverage insufficient or safety threshold exceeded. |
| Dynamic Color Classes | Tailwind `dynamic-*` token-based utilities replacing static palette class names (blue-500, etc.). |
| React Query | Client-side caching & async state library for queries/mutations; used only when RSC/server actions insufficient. |
| Query Key | Stable array descriptor for cached resource (`[domain, paramsHash, version]`). |
| Mutation | Write operation defined with `useMutation`; may perform optimistic UI update then reconcile. |
| Optimistic Update | Temporary cache modification prior to server confirmation with rollback on failure. |
| Hydration | Passing pre-fetched query data from server (RSC) into client cache to avoid duplicate fetch. |
| Dialog Components | Accessible modal components from `@tuturuuu/ui/dialog`; must be used instead of native browser dialogs (`alert()`, `confirm()`, `prompt()`). |


