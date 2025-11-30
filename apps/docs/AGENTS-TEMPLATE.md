# AGENTS.md – Operating Manual for Autonomous AI Assistants

> **Attribution**: This template is inspired by [Tuturuuu's AGENTS.md](https://github.com/tutur3u/platform). Adapted for general use with modern JavaScript/TypeScript monorepo projects.

---

## 1. Purpose & Audience

This document is a concise but complete operating manual for autonomous or semi-autonomous AI coding / documentation / maintenance agents working inside a monorepo. It defines:

- Repository mental model (Turborepo/Nx + package manager workspaces + Next.js App Router)
- Canonical workflows (implement feature, add package, DB migration, AI endpoint, docs update, dependency maintenance)
- Guardrails (security, secrets, data boundaries, idempotency, reproducibility, performance, style)
- Collaboration protocol between multiple concurrent agents and with humans

Primary audiences:

1. Execution Agents – generate / modify code, tests, migrations, docs.
2. Review / Validation Agents – static analysis, lint/type/test/build verification.
3. Architectural / Refactor Agents – cross-cutting improvements (performance, DX, modularity) under constraints.
4. Knowledge / Docs Agents – keep documentation and schemas in sync.

All agents MUST treat this file as source of truth when policy conflicts arise. If a required rule is missing, propose an addition rather than inventing ad-hoc behavior.

---

## 2. Canonical Capabilities & Hard Boundaries

Approved capability surface (default-allowed unless explicitly restricted):

| Domain | Allowed Actions | Must Also Do | Never Do |
|--------|-----------------|--------------|----------|
| Code (TS/JS) | Create/modify Next.js App Router routes, React Server/Client Components, shared package code | Add/update minimal tests & types, update relevant docs, use TanStack Query for ALL client-side data fetching | Introduce breaking public API changes without `BREAKING` note; **NEVER use `useEffect` for data fetching**; use raw fetch without React Query |
| Code (Python) | Modify scripts/services respecting virtual env & dependency isolation | Keep requirements pinned / update lock if exists | Mix unrelated refactors with feature PR |
| Database | Create migration SQL in designated migrations folder, run typegen | Bump generated types in shared types package | Directly edit generated type files manually |
| AI Endpoints | Add routes under `app/api/...` using AI SDK & schemas | Enforce auth & feature flag checks | Expose raw provider keys or skip validation |
| Tooling | Update configs (biome.json, turbo.json, eslint) | Document rationale in PR description | Remove caching or security settings silently |
| Docs | Update `.md` / `.mdx` for accuracy | Cross-link related guides | Invent undocumented behavior |
| Dependencies | Add/remove workspace deps via package manager | Prefer workspace:* for internal packages | Add duplicate version already satisfied |

<!-- [CUSTOMIZE] Add domain-specific rows for your project -->

### Mandatory Guardrails

1. **Least Privilege**: Touch ONLY files required for the change.
2. **Idempotency**: Re-running a workflow yields same state (migrations additive, scripts safe to repeat).
3. **Determinism**: Generated artifacts (types) must result from scripted commands, not manual edits.
4. **Reproducibility**: Provide succinct steps (install → dev/build/test) if novel.
5. **Security**: Never output secret values; reference env var names only.
6. **Observability**: Add log / comment only where materially aids debugging—avoid noisy console logs committed.
7. **Explicit User Intent**: Do NOT run `dev`, `build`, or equivalent long-running / build commands unless the user **explicitly requests** it. Build commands are USER-ONLY.
8. **User-Only Database Push**: NEVER run remote database push commands. Prepare migrations & instructions; the user applies them.
9. **Testing After Features**: ALWAYS add test cases after implementing new features and run them. Testing is encouraged and expected from agents.
10. **User-Only Linting**: NEVER run lint or format fix commands. Surface needed changes; ask user to run.
11. **Bilingual Translations**: ALWAYS provide translations for ALL configured locales when adding user-facing strings.

<!-- [CUSTOMIZE] Update guardrail #11 with your specific locale requirements -->

### Prohibited Actions (HARD STOP)

- Committing secrets, API keys, tokens, URLs containing credentials.
- Writing binary blobs not required outside designated `public/` folders.
- Removing or disabling linting, formatting, type checking to "make it pass".
- Executing destructive DB commands in migrations without `-- reversible` strategy or clear comment.
- **Running build commands unless the user explicitly requests it.**
- **USING `useEffect` FOR DATA FETCHING - THIS IS ABSOLUTELY FORBIDDEN. Use TanStack Query instead.**

### Escalate (Ask for Human Input) When

1. A migration requires data backfill logic > 30 lines.
2. A refactor impacts >3 apps or >5 packages simultaneously.
3. Introducing a new third-party service dependency.
4. Changing security/auth flows or environment variable contract.

---

## 3. Repository Structure & Semantics

<!-- [CUSTOMIZE] Update this structure to match your project -->

Top-level layout (template):

```typescript
project/
├── apps/
│   ├── web/              # Main web app (Next.js App Router)
│   ├── docs/             # Documentation website
│   ├── api/              # API service (if separate)
│   └── db/               # Database migrations, scripts, typegen
├── packages/
│   ├── ui/               # Shared UI components
│   ├── ai/               # AI schemas, model config, helpers
│   ├── db/               # Database client wrappers
│   ├── types/            # Central TS types (incl. generated DB types)
│   ├── utils/            # Cross-cutting utilities
│   └── config/           # Shared configurations
├── scripts/              # Maintenance & automation scripts
├── public/               # Global static assets
└── AGENTS.md
```

### Semantics & Norms

| Area | Rule |
|------|------|
| Cross-app sharing | Prefer extracting to `packages/*` before duplicating logic. |
| Database types | Always regenerate via typegen command—never hand-edit generated files. |
| Type inference | Prefer importing types from shared types package. Never attempt to run migrations yourself. |
| App isolation | Avoid importing from another app's `src/`; use published workspace packages. |
| Environment config | Each app consumes root `.env*` plus its own; services manage their own `.env`. |
| Naming | Package names follow `@your-org/<name>`; commit scopes mirror these names. |
| Edge/runtime | Explicitly set `export const runtime = 'edge'` when targeting edge execution. |
| Server vs Client Components | Default to Server Components; add `'use client'` only when interactivity/state required. |

<!-- [CUSTOMIZE] Replace @your-org with your actual organization scope -->

### Database Directory

- Migrations folder holds versioned SQL migrations (timestamp-based or sequential). Do not reorder.
- Scripts orchestrate database CLI lifecycle.
- After schema change: run migrations → typegen → commit updated types in same PR.

---

## 4. Canonical Workflows

Each workflow must be: minimal, idempotent, documented in PR description.

### 4.1 Add / Update a Workspace Dependency

1. Determine scope (app vs shared). If reusable → create/update package under `packages/*`.
2. Add dependency:

   ```bash
   # [CUSTOMIZE] Replace with your package manager syntax
   bun add <pkg>@<version> --workspace=@your-org/<package-or-app>
   # or: pnpm add <pkg> --filter @your-org/<package>
   # or: yarn workspace @your-org/<package> add <pkg>
   ```

   - Internal: reference as `workspace:*`.
3. If types required: ensure `@types/*` present (unless TS ships types).
4. Run build to validate (user executes).
5. Update relevant docs if public surface exposed.

### 4.2 Create New Shared Package

1. Scaffold directory `packages/<name>/` with `package.json` (name `@your-org/<name>`; `main` & `types` fields).
2. Add `tsconfig.json` extending root or typescript-config package.
3. Export public API via `src/index.ts` (avoid deep export leakage).
4. Add minimal README (purpose, usage, maintenance notes).
5. Add one smoke test if logic present.
6. Run build + test (user executes build).

### 4.3 Add Next.js App Router API Route

1. Choose app: `apps/<app>/src/app/api/<segment>/route.ts`.
2. For edge: `export const runtime = 'edge'` if appropriate.
3. Implement handler(s): `export async function GET/POST(...)`.
4. Use database client wrappers from shared package for auth.
5. Validate input (Zod if structured JSON) – reject early with 4xx.
6. Add test (unit or integration stub) if feasible; else doc example.
7. Update feature docs if new public capability.

### 4.4 Add AI Structured Data Endpoint

1. Define / reuse schema in AI package (Zod).
2. Create route `app/api/ai/<feature>/route.ts`.
3. Enforce auth: get user via auth client; return 401 if absent.
4. Feature flag: check feature flags table when required.
5. Use `streamObject` / `generateObject` with selected model.
6. Bound runtime: set `maxDuration` if long-running.
7. Handle & log (server-side) errors → generic user message.
8. NEVER log secrets / raw provider responses containing keys.
9. If storing results, insert via admin client with type-safe types.

### 4.5 Database Schema Change

<!-- [CUSTOMIZE] Replace with your database tooling commands -->

1. Create migration: `db:new` script → edit SQL.
2. Prefer additive changes. For destructive ops: comment rationale + reversible notes.
3. (User-only) Application: User runs `db:push`. Agent MUST NOT execute remote push.
4. Types: Run typegen; agent incorporates updated generated types (never hand-edit).
5. Update application code referencing new columns (after user supplies regenerated types).
6. Add data backfill script (idempotent) if needed (<30 LOC) inside migration or separate script; else escalate.
7. Prepare targeted tests referencing new schema.

### 4.6 Formatting, Linting, Typecheck

Use project linter/formatter (user-run only; agent must not execute commands directly).

1. Agent identifies potential lint/format issues (heuristic or static review) and requests user to run lint/format.
2. For fixes, agent proposes code edits; user optionally runs fix commands.
3. Agent re-checks file content post-user action to confirm resolution.

### 4.7 Testing

**CRITICAL**: Agents SHOULD add test cases after implementing new features and run them to verify functionality.

1. Run test command (Vitest/Jest across workspaces) or filter by package.
2. Add at least: happy path + failure/edge case.
3. For new util: prefer pure function structure → easy unit test.
4. **After implementing a feature**: Create test cases and run them immediately to verify the implementation works as expected.
5. **Agents CAN and SHOULD run tests** - unlike build commands, running tests is encouraged and expected.

### 4.8 Performance / Profiling

1. For React performance: consider profiling tools if integrated.
2. Avoid premature optimization; include micro-benchmark only if regression risk.
3. Document performance-sensitive choices inline (brief comment) + in PR summary.

### 4.9 Dependency Maintenance

1. Use update script for batch updates when approved.
2. After bump: run build, test, lint (user executes build/lint).
3. For major version: consult changelog; add BREAKING note if user-facing.

### 4.10 Scripts Directory

1. Must be idempotent & side-effect explicit.
2. Accept dry-run flag where feasible.
3. Log concise summary; avoid verbose diff dumps unless necessary.

### 4.11 Add Documentation Page

1. Create `.mdx` file in appropriate docs subdirectory.
2. **CRITICAL**: Add page to documentation navigation config.
3. Add frontmatter with `title`, `description`, and `updatedAt` fields.
4. Use proper heading hierarchy (start with H1, use H2/H3 for subsections).
5. Cross-link related documentation where relevant.
6. Add code examples with proper syntax highlighting.
7. Update any existing documentation that references changed functionality.

### 4.12 Update Main Navigation

When adding new pages or routes to any application, **ALWAYS** update the main navigation file to ensure discoverability.

**CRITICAL Priority Rule**: Navigation updates MUST be treated as a mandatory part of any feature addition, not an afterthought.

Workflow:

1. Identify the navigation file for the affected app.
2. **Before completing the feature**, add new routes to both:
   - The route aliases array (for route matching)
   - The navigation items (for UI display)
3. Include proper icons that match the feature's purpose.
4. Add appropriate permission checks.
5. Use translation keys from the appropriate namespace.
6. **CRITICAL**: Add translation entries to ALL configured locale files.
7. Ensure the navigation structure is logical and grouped with related features.

---

## 5. Coding Standards & Conventions

### 5.1 Git Hygiene

Follow Conventional Commits & Branch naming.

- Commit format: `type(scope): description` in imperative mood.
- Scope = package or app directory name (e.g., `feat(ui): ...`).
- Add `!` or `BREAKING CHANGE:` footer for breaking changes.
- Keep PR title aligned with primary commit.

### 5.2 TypeScript

- Prefer explicit return types for exported functions & public APIs.
- Narrow unknown/any at boundaries; `any` requires a justification comment.
- Use discriminated unions over enums unless runtime enum needed.
- Keep React Server Components default; add `'use client'` only when necessary.
- Avoid deep relative imports into other packages—expose via their `index.ts`.
- Use Zod for runtime validation of external inputs (API bodies, env-derived config).
- **Type Inference from Database**: Always prefer importing types from shared types package rather than manually defining database types. Only use these types AFTER migrations have been applied.

### 5.3 Error Handling

- Fail fast: validate inputs early → return 400/401/403.
- Wrap external service calls; surface sanitized error messages.
- Never leak stack traces to client. Use generic message + server-side logged detail.
- For expected absence (e.g., optional resource): return 204 or empty array instead of 500.

### 5.4 Performance

- Avoid N+1 DB patterns—batch selects or add indices if justified (document reasoning in PR).
- Stream large AI responses where user value is incremental (`streamObject`).
- Memoize pure computation in hot paths only after measurement.

### 5.5 Accessibility & UI

- Ensure interactive elements are reachable via keyboard (tab order natural, no positive tabindex).
- Provide `aria-label` or text content for icon-only buttons.
- Color choices must respect contrast (WCAG AA). If uncertain, note for human review.
- **Dialog Components**: Always use proper dialog components instead of native browser dialogs (`alert()`, `confirm()`, `prompt()`). Native dialogs are not accessible, not customizable, and break the design system.
- **Icons**: Always use icon library components. NEVER use emojis in UI code—they render inconsistently across platforms and lack semantic meaning for accessibility.

### 5.6 Security & Secrets

- Only reference environment variables by name—never inline secret values.
- Sanitize user-provided strings before embedding into prompts if risk of injection / model steering.
- For AI prompts containing user content: prefix with system delimiting instructions and strip control tokens.

### 5.7 Schema Evolution (DB)

- Add columns instead of repurposing existing ones; deprecate with comment.
- Backfill in migration only if <30 lines & idempotent; else create script + escalate.
- Never drop a column/table without confirming no code references (search + types build).

### 5.8 Testing Principles

- Fast unit tests: no network, DB, or file system unless integration explicitly.
- Use table-driven tests for function variants where meaningful.
- Snapshot tests sparingly—only for stable serializable artifacts.

### 5.9 Documentation Drift Prevention

- When modifying a public API or schema: update corresponding docs in same PR.
- Add "Updated: [yyyy-mm-dd]" line in doc frontmatter if materially changed.
- **CRITICAL**: Add new documentation files to navigation config. Documentation files are not visible unless explicitly added.

### 5.10 CSS/Styling Policy

<!-- [CUSTOMIZE] Adapt to your styling approach (Tailwind, CSS Modules, etc.) -->

If using Tailwind with design tokens:

- Never introduce static color classes referencing raw palette names (blue-500, etc.).
- Use design token namespace for text, background, border utilities.
- Opacity suffixes allowed: `bg-primary/15`.
- Inline style hex values only permitted for temporary experimental spikes; must be replaced before merge.

### 5.11 Data Fetching & React Query

Goal: Minimize client complexity and network chatter while keeping UX responsive. **For ALL client-side data fetching needs, TanStack Query (React Query) is the mandatory standard.**

#### Decision Order (Prefer Earlier)

1. Pure Server Component (RSC) fetch – for read-only, cacheable, SEO / first paint critical data.
2. Server Action (mutation or non-idempotent op) returning updated canonical state to RSC.
3. RSC initial fetch + Client hydration (dehydrate React Query cache) if post-load background refresh needed.
4. **Client-side TanStack Query (`useQuery`/`useMutation`) – REQUIRED for ALL client-side data fetching.**
5. Realtime subscription + targeted query invalidation / cache updates (avoid polling) – only if live updates materially improve UX.

#### When NOT to Use React Query

- Single static fetch with no refresh requirement (use RSC).
- Simple form POST where immediate redirect or RSC re-render suffices (use server action).
- Data already fully present via parent RSC props.

#### When TO Use React Query (MANDATORY for Client-Side Fetching)

**TanStack Query is the ONLY approved method for client-side data fetching.**

**ABSOLUTELY FORBIDDEN PATTERNS:**

- **NEVER use `useEffect` for data fetching** - This is the #1 most common violation
- Raw `fetch()` in client components
- Manual state management (`useState` + `useEffect`) for API calls
- Custom data fetching hooks without React Query

**The pattern `useEffect(() => { fetch(...).then(setData) }, [])` is BANNED.**

Use React Query for:

- **User-triggered mutations** needing optimistic UI or undo.
- **Background refetch** for freshness after initial SSR/RSC render.
- **Paginated / infinite lists** with incremental loading.
- **Dependent queries** requiring client sequencing.
- **Shared client state** consumed in multiple sibling Client Components without prop drilling.
- **Any client-side API call** that needs caching, refetching, or state management.

#### Query Keys

- Always use stable array form: `[domain, subdomain?, paramsObjectHash, version?]`.
- Include a lightweight version token when shape/filters change.
- Never put non-deterministic values (functions, Date instances) directly in keys.

#### Caching & Staleness

- Set `staleTime` > 0 for data that rarely changes to prevent immediate refetch storms.
- Use `gcTime` mindful of memory.
- For RSC + hydration: mark query as fresh to avoid double fetch after hydration.

#### Hydration Pattern (RSC → Client)

1. Fetch data in Server Component / route.
2. Create a `QueryClient`, pre-populate with `queryClient.setQueryData(key, data)`.
3. Pass `dehydrate(queryClient)` to a Client boundary provider.
4. Client `useQuery` with same key gets instant data.

#### Mutations

- Define `useMutation({ mutationFn, onMutate, onError, onSettled })`.
- Optimistic Update Flow:
  1. `onMutate` – cancel outgoing queries for affected keys. Snapshot previous value.
  2. Apply optimistic cache change (`setQueryData`).
  3. On error – restore snapshot; surface toast / non-intrusive error.
  4. On success – merge server response and invalidate narrowly.
- Avoid broad `invalidateQueries()` with no key.

#### Error Handling

- Normalize HTTP / RPC errors to domain-centric objects before caching.
- Use error boundaries or `onError` side effects – never swallow silently.

### 5.12 Toast Notifications

<!-- [CUSTOMIZE] Replace with your toast library (Sonner, react-hot-toast, etc.) -->

Rules:

1. Use a unified toast utility from your UI package.
2. Keep toast content concise (≤120 chars primary message).
3. Prefer semantic intent variants (success / error / info / warning).

### 5.13 Dialog Components

Use a unified dialog system from your UI package for all modal interactions.

Rules:

1. **NEVER** use native browser dialogs (`alert()`, `confirm()`, `prompt()`) – they are not accessible, not customizable, and break the design system.
2. **ALWAYS** use proper dialog components.
3. Ensure dialogs are keyboard accessible and screen reader friendly.
4. Include proper header, title, and description for accessibility.

### 5.14 Internationalization

<!-- [CUSTOMIZE] Replace with your i18n setup and locales -->

The platform supports multiple languages via i18n library (e.g., `next-intl`, `react-i18next`).

**Mandatory Multi-Locale Policy:**

1. **ALWAYS** add translations to ALL configured locale files simultaneously.
2. **NEVER** add translations only for one locale - this is a hard violation.
3. Use consistent translation keys across all language files.
4. All user-facing content must be localized:
   - UI labels, buttons, and navigation items
   - Form validation messages and error states
   - Notifications (toasts, dialogs)
   - Help text, tooltips, and placeholders

**Translation Key Structure:**

- Use hierarchical namespaces: `feature.component.element`
- Keep keys descriptive and self-documenting
- Group related translations under the same namespace

### 5.15 Code Quality & Proactive Refactoring

Code quality and developer experience (DX) are **top-tier priorities**. Agents MUST proactively maintain high standards across ALL code.

#### Mandatory Refactoring Triggers

1. **File Size**: Any file >400 LOC must be evaluated for extraction opportunities.
2. **Component Size**: React components >200 LOC must be broken down into smaller sub-components.
3. **Function Complexity**: Functions >50 LOC or with cyclomatic complexity >10 should be decomposed.
4. **Duplication**: Any duplicated logic across ≥2 locations must be extracted to shared utilities/hooks.

#### Refactoring Principles

| Principle | Rule | Example |
|-----------|------|---------|
| Single Responsibility | Each component/function does ONE thing well | Split large form into focused sub-components |
| Composition over Monoliths | Build from small, reusable pieces | Extract `<DataTable>`, `<FilterBar>`, `<Pagination>` |
| Proper Hook Usage | Extract stateful logic to custom hooks | Move complex form state to `useFormLogic()` |
| Meaningful Naming | Names reveal intent without needing comments | `calculateTotalWithTax()` not `calc()` |
| DRY | Zero tolerance for copy-paste code | Extract repeated validation logic |

#### React-Specific Best Practices (Mandatory)

- **Component Structure**: Keep JSX templates <100 LOC; extract sub-components for complex sections.
- **State Management**: Co-locate state with usage; lift only when truly shared.
- **Props Interface**: Define explicit TypeScript interfaces for all props; avoid `any`.
- **Event Handlers**: Extract complex handlers to separate functions or custom hooks.
- **Conditional Rendering**: For >3 conditions, extract to separate rendering functions.

#### Opportunistic Improvement Policy

When modifying existing code (even small changes), agents MUST:

1. **Assess Quality**: Does the touched file/component meet current standards?
2. **Scope Improvement**: If file is >400 LOC or component >200 LOC, refactor as part of the PR.
3. **Extract Utilities**: If you write similar logic twice, extract immediately.
4. **Update Patterns**: Migrate deprecated patterns encountered during work.
5. **Document Rationale**: Add brief comment for non-obvious refactoring decisions.

#### Quality Over Speed

- **Never** ship poorly structured code "to move fast"—tech debt compounds rapidly.
- **Never** skip refactoring "because it's old code"—all code is equally subject to quality standards.
- **Always** leave code better than you found it (Boy Scout Rule).
- **Always** consider: "Would a new developer understand this in 6 months?"

### 5.16 Centralized Settings Architecture

<!-- [CUSTOMIZE] Adapt to your settings architecture -->

All application settings SHOULD be implemented within a centralized settings component/dialog. This provides:

1. **User Profile Settings** - Avatar, display name, email
2. **User Account Settings** - Security, sessions
3. **Preferences** - Appearance, theme, notifications
4. **Workspace Settings** - General info, members, billing
5. **Product-Specific Settings** - Feature-specific configurations

**Rules:**

- **NEVER** create separate settings pages outside the centralized component without strong justification.
- **ALWAYS** add new settings as sections within the centralized component.
- **ALWAYS** group settings logically.

### 5.17 Third-Party UI Library Integration

When integrating third-party UI libraries that have their own theming systems, **theme synchronization is mandatory**.

Rules:

1. **Theme Override File**: Create a CSS override file that maps application colors to the library's color system.
2. **Documentation**: Document color mappings and synchronization requirements.
3. **Synchronization Requirement**: When updating application theme colors, update corresponding variables in override files.
4. **Testing**: Test both light and dark modes across pages using the library.

---

## 6. Environment & Tooling Usage

### 6.1 Package Manager & Scripts

<!-- [CUSTOMIZE] Replace with your package manager -->

- Single package manager (pinned in root `package.json`).
- Global scripts orchestrate multi-app dev.
- Database lifecycle scripts for migrations and types.
- Always re-run typegen after schema changes.

### 6.2 Build Tool Tasks

<!-- [CUSTOMIZE] Replace with your build tool (Turborepo, Nx, etc.) -->

- `build` depends on upstream builds; cache outputs.
- `dev` tasks are non-cached & persistent.
- Use filters for scoped operations to speed iteration.

### 6.3 Environment Variables

Only reference by name. Examples (non-exhaustive):
`DATABASE_URL`, `NEXT_PUBLIC_API_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

<!-- [CUSTOMIZE] List your common environment variables -->

Rules:

- Never echo secret values to logs.
- Public-prefixed variables may appear client-side; everything else server-only.
- For edge runtime, ensure variables are available in deployment environment.

### 6.4 Caching & Determinism

- Do not commit build artifacts except intentionally (e.g., generated types).
- Rely on build tool caching; do not introduce custom ad-hoc cache layers without review.

### 6.5 Filtering Examples

<!-- [CUSTOMIZE] Replace with your package manager/build tool syntax -->

```bash
# Only run UI package tests
bun --filter @your-org/ui test

# Build web and its dependency graph
bun --filter @your-org/web... build
```

---

## 7. Agent Collaboration Protocol

### 7.1 Roles & Handoffs

- Execution Agent produces code + minimal tests + doc updates.
- Review Agent validates (lint, typecheck, tests, build) and annotates discrepancies.
- Refactor Agent only engages after feature correctness established; must not change behavior without tests.
- Docs Agent ensures public docs align with merged changes.

#### Handoff Requirements

| From | To | Must Provide |
|------|----|--------------|
| Execution | Review | Summary of change, affected packages, commands run, residual warnings |
| Review | Execution | Precise failure list (file:line + message), suggested fix vectors |
| Execution | Docs | Public API surface diff & new env vars (names only) |
| Refactor | Review | Rationale, before/after complexity/perf notes, test matrix unchanged |

### 7.2 Concurrency Rules

- Only one agent mutates a given file path set concurrently—others operate read-only.
- Large refactors (touching >50 files) require lock with explicit scope list.
- Use incremental commits grouped by logical concern (schema, code, tests, docs).

### 7.3 Logging & Traceability

- Commit messages and PR description serve as canonical audit trail.
- Add short `// rationale:` comments for non-obvious decisions.

### 7.4 Idempotency Verification

Before handing off, Execution Agent re-runs:

1. Install (should produce no changes)
2. (User-only) Request user runs build and confirms success.
3. (User-only) Request user runs relevant filtered tests.
4. If DB change: Agent supplies migration SQL; user runs push & typegen; agent validates only intended type diffs.

### 7.5 Conflict Resolution

- Prefer rebase over merge for feature branches to keep linear history.
- If migration number conflict: create new migration & re-apply; never edit previously merged migration.

### 7.6 Escalation Path

If blocked by policy ambiguity, open an issue labeled `policy-gap` with:
`Context`, `Attempted Steps`, `Blocking Point`, `Proposed Rule`.

---

## 8. Guardrails & Pre-PR Verification

### 8.1 Mandatory Checklist (Execution Agent)

Tick ALL before requesting review:

1. Scope limited to intended change set (no stray file edits)
2. Build passes (user ran build)
3. Lint clean (user ran lint; agent suggested fixes)
4. Tests added/updated & passing
5. For DB changes: migration added; user confirmed push produced no diff
6. Types regenerated if schema changed
7. Docs updated for public API / env var / schema deltas
8. **Navigation updated for all new routes**
9. **All user-facing strings have translations for ALL configured locales**
10. **Code quality maintained; files >400 LOC and components >200 LOC refactored**
11. **Components follow single responsibility principle; complex logic extracted**
12. **ALL client-side data fetching uses TanStack Query (ZERO `useEffect` for data fetching)**
13. **New settings implemented within centralized settings component**
14. No secrets, tokens, or API keys committed
15. Added edge runtime export where required
16. All new external inputs validated (Zod / guard logic)

### 8.2 Quality Gates

| Gate | Pass Criteria |
|------|---------------|
| Build | All packages/apps build without error |
| Lint | No errors; warnings justified or fixed |
| Types | No `any` leaks (except justified) |
| Tests | Relevant suites pass; coverage stable or improved |
| Migrations | Apply cleanly; idempotent re-run |
| Docs | Updated & internally consistent |
| Security | No plaintext secrets; validation present |
| Performance | No obvious regressions; hot paths unchanged or justified |

### 8.3 Rejection Triggers (Auto-Fail)

- Adding unused dependency.
- Skipping validation for user-provided data.
- Silent catch of broad exceptions (`catch (e) {}` without handling/log rationale).
- Editing generated types manually.
- Large refactor PR mixing feature + infra (split required).
- **Using `useEffect` for data fetching instead of TanStack Query.**
- Using raw `fetch()` or manual state management for client-side API calls.

### 8.4 Minimal PR Description Template

```typescript
Summary: <1-2 lines>
Change Types: feat | fix | chore | docs | refactor | perf | test
Affected Scopes: @your-org/ui, @your-org/web
DB Migration: yes/no (id: <timestamp>)
New Env Vars: (names only)
Validation Added: yes/no (explain if no)
Testing: <cases brief>
Risks: <perf/edge cases>
Follow-ups: <deferred tasks>
```

---

## 9. CI/CD Workflows Overview

CI pipelines enforce the guardrails automatically. Agents should align local verification with how workflows evaluate changes.

### 9.1 Workflow Categories

<!-- [CUSTOMIZE] Replace with your actual workflow names -->

| Category | Representative Workflow(s) | Purpose | Agent Prep |
|----------|----------------------------|---------|--------------|
| Code Quality | `lint-check.yaml` | Format + lint | Run lint locally |
| Unit Tests | `test.yaml` | Run tests across workspaces | Filter failing scope before pushing |
| DB Integrity | `check-migrations.yaml` | Enforce migration naming/order & type generation | Ensure clean migrations + regenerated types committed |
| Build | `build.yaml` | Build verification | Keep build deterministic |
| Security | `security-scan.yaml` | Static security analysis | Address flagged issues |

### 9.2 Failure Handling Guidance

| Failure Type | Typical Cause | Agent Action |
|--------------|---------------|--------------|
| Format job fails | Unformatted files | Apply fixes locally or rebase after autofix |
| Lint errors | New rule violations | Fix or suppress with rationale comment |
| Migration ordering failure | Timestamp earlier than base | Rename migration with later timestamp |
| Type mismatch | Schema changed without regen | Run typegen & commit |
| Unit test flake | Non-deterministic test | Stabilize using deterministic seed or fake timers |
| Build failure | Missing dependency or edge runtime mismatch | Add dependency or export `runtime` constant |

### 9.3 Migration Safety Pattern

Checklist before merging migration PR:

- Files named with increasing sortable identifiers (timestamps).
- No direct destructive DDL unless comment includes `-- reversible:` explanation.
- If data backfill needed and >=30 LOC: escalate.
- Regenerated types reflect new objects.

### 9.4 Minimal Local CI Parity Script

Run before pushing substantial feature (USER executes; agent prompts):

```bash
# [CUSTOMIZE] Replace with your commands
npm install        # or bun install / pnpm install
npm run build      # user-only
npm run test       # user-only
npm run lint       # user-only
```

For DB changes (USER executes):

```bash
npm run db:push    # user-only (agent never runs)
npm run db:typegen # user-only (agent consumes results)
```

---

## 10. Quick Reference (Cheat Sheet)

<!-- [CUSTOMIZE] Replace commands with your project's commands -->

| Goal | Command / Action | Notes |
|------|------------------|-------|
| Install deps | `npm install` | Deterministic via lockfile |
| Dev (all apps) | `npm run dev` | No DB required if gated |
| Full stack dev | `npm run dev:full` | Starts DB + apps |
| Build all | `npm run build` | USER-ONLY; uses cache |
| Test all | `npm run test` | Agents CAN run |
| Scoped test | `npm --filter @your-org/ui test` | Add `...` suffix for dependents |
| Lint | `npm run lint` | USER-ONLY |
| Format | `npm run format` | USER-ONLY |
| New migration | `npm run db:new` | Edit generated SQL file |
| Apply migrations | `npm run db:push` | USER-ONLY |
| Regenerate types | `npm run db:typegen` | Commit resulting changes |
| Add dep to pkg | `npm add <dep> --workspace=@your-org/<scope>` | Internal deps `workspace:*` |
| Edge runtime | `export const runtime = 'edge'` | Only if required |

### Top Failure Causes → Fix Fast

1. Missing regenerated types → run typegen.
2. Unformatted code → run format fix.
3. Lint errors → run lint fix then address residuals.
4. Migration ordering error → rename with later timestamp.
5. Documentation not visible → add page to navigation config.
6. **New routes not in navigation** → update navigation file.
7. **Missing locale translations** → add entries to ALL locale files.
8. **Third-party UI colors mismatched** → update theme override file.
9. **Settings created outside centralized component** → move to centralized settings.

Escalate if: multi-app breaking refactor, destructive schema change, data backfill >30 LOC, new external service, auth/token contract change.

---

## 11. Package Extraction Decision Matrix

When deciding whether to extract shared logic into a package, evaluate the following dimensions. Extract only when ≥3 HIGH signals or a SINGLE Critical apply.

| Criterion | Keep In-App (LOW) | Consider Extraction (MED) | Extract Now (HIGH) | Critical (Immediate) |
|-----------|-------------------|---------------------------|--------------------|----------------------|
| Reuse Breadth | Used in 1 app | Needed in 2 apps soon | Actively duplicated in ≥2 apps | Security / auth logic duplicated |
| Change Velocity | Likely to churn heavily | Stabilizing | Stable interface | Must version for external integration |
| Complexity | <50 LOC simple | 50–150 LOC moderate | >150 LOC multi-module | Requires specialized setup |
| Domain Ownership | App-specific semantics | Mixed concerns | Pure cross-domain utility | Compliance / data boundary enforced |
| Testing Needs | Hard to unit test yet | Basic tests exist | Comprehensive tests stable | Needed for contract testing in CI |
| Public API Surface | Internal only | Might be exported later | Already imported via relative deep paths | External consumers |
| Drift Risk | Low | Emerging duplication | Frequent copy-paste edits | Security patch needs single point fix |

### Extraction Steps Recap

1. Create folder `packages/<name>`.
2. Add `package.json` (name `@your-org/<name>`; set `type`, `main`, `types`).
3. Add `tsconfig.json` extending root base.
4. Implement `src/index.ts` – export only intentional surface.
5. Migrate code & update imports.
6. Add minimal tests + README (purpose, usage, stability level).
7. Build + run filtered tests before pushing.

### Label Stability in README

- `@experimental` (API may change)
- `@stable` (backwards compatible changes only)
- `@frozen` (changes require BREAKING notice)

---

## 12. AI Model Usage & Fallback Policy

### 12.1 Model Selection Principles

- Prefer fastest model that satisfies quality for structured object tasks.
- Elevate to higher context model when:
  - Prompt + schema + accumulated context risk token overrun.
  - Prior attempt failed with truncation / hallucination flagged by validation.
- For deterministic schema compliance: rely on AI SDK `generateObject` / `streamObject` with Zod schema.

### 12.2 Fallback Order (Example)

<!-- [CUSTOMIZE] Replace with your model preferences -->

1. Fast model (e.g., `gpt-4o-mini`, `claude-3-haiku`, `gemini-flash`)
2. Standard model (e.g., `gpt-4o`, `claude-3-sonnet`, `gemini-pro`)
3. Alternate provider – escalate if not configured.

Document any deviation inside PR description (Reason + Observed Failure Mode).

### 12.3 Error Handling Strategy

| Error Type | Detect | Action |
|------------|--------|--------|
| Auth / 401 | Provider response code | Return 500 sanitized; log internal code path ID |
| Rate limit | 429 / provider signal | Exponential backoff (max 2 retries), fallback model if supported |
| Schema mismatch | Zod parse fail | Attempt single retry with stricter system instruction; else return 422 |
| Timeout | Exceeds `maxDuration` | Abort controller; fallback to shorter prompt or faster model |
| Content filter blocked | Provider flag | Return 400 with generic safe message; do not retry automatically |

### 12.4 Prompt Hygiene

- Always isolate user-provided text with clear boundary markers when risk of injection.
- Remove disallowed tokens / control sequences before sending.
- Avoid echoing secret-like substrings – if detected, replace with `[REDACTED]` and log sanitized event.

### 12.5 Large Output Strategy

- Prefer streaming for user-perceivable partial progress (`streamObject`).
- For bulk inserts validate size thresholds before DB write; chunk if necessary.

---

## 13. Glossary

| Term | Definition |
|------|------------|
| RSC | React Server Components – default model; avoid `'use client'` unless interactivity required. |
| Edge Runtime | Execution mode optimized for low-latency global compute; set `export const runtime = 'edge'`. |
| Typegen | Automatic generation of database types via CLI; never hand-edit output. |
| Workspace Filter | Build tool filter syntax to scope commands to specific packages. |
| Migration | Versioned SQL file representing additive schema evolution. |
| Feature Flag | Toggle controlling conditional feature access. |
| Admin Client | Service-role database wrapper for privileged operations server-side. |
| Structured AI Generation | Using AI SDK `generateObject` / `streamObject` with Zod schema for deterministic shape. |
| Idempotent | Safe to run multiple times without changing final state beyond initial application. |
| Remote Cache | Build cache enabling shared build artifacts across CI/CD. |
| CI Parity | Local verification replicating key CI gates (build, test, lint, type, migration). |
| Scope (Commit) | Affected package/app name inside Conventional Commit header (`feat(ui): ...`). |
| Escalation | Opening issue or human request when rule coverage insufficient. |
| React Query | Client-side caching & async state library for queries/mutations; used only when RSC/server actions insufficient. |
| Query Key | Stable array descriptor for cached resource (`[domain, paramsHash, version]`). |
| Mutation | Write operation defined with `useMutation`; may perform optimistic UI update then reconcile. |
| Optimistic Update | Temporary cache modification prior to server confirmation with rollback on failure. |
| Hydration | Passing pre-fetched query data from server (RSC) into client cache to avoid duplicate fetch. |

---

## Appendix: Customization Guide

This template contains `[CUSTOMIZE]` markers and placeholder values that should be adapted for your project. Here's a checklist:

### Organization & Naming

- [ ] Replace `@your-org` with your actual npm organization scope
- [ ] Update package names to match your monorepo structure

### Commands & Tooling

- [ ] Replace placeholder commands with your actual scripts:
  - Package manager commands (`npm`, `bun`, `pnpm`, `yarn`)
  - Database commands (`db:new`, `db:push`, `db:typegen`)
  - Build tool syntax (Turborepo filters, Nx commands)
- [ ] Update CI/CD workflow names to match your actual workflows

### Repository Structure

- [ ] Update the directory structure in Section 3 to match your project
- [ ] Add domain-specific rows to the capabilities table in Section 2

### Localization

- [ ] List your supported locales in Section 5.14
- [ ] Update guardrail #11 with your specific locale requirements

### Environment Variables

- [ ] List your common environment variables in Section 6.3

### AI Models

- [ ] Update the fallback order in Section 12.2 with your preferred models

### Third-Party Libraries

- [ ] Document your specific UI libraries and their theme integration requirements

### Quick Reference

- [ ] Replace all commands in Section 10 with your project's actual commands

---

**Remember**: This AGENTS.md should be treated as the source of truth for AI agent behavior in your repository. Keep it updated as your project evolves!
