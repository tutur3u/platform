# AGENTS.md – Operating Manual for AI Assistants (Single Next.js App)

> **Attribution**: This template is inspired by [Tuturuuu's AGENTS.md](https://github.com/tutur3u/platform). Adapted for single Next.js applications without monorepo structure.

---

## 1. Purpose & Audience

This document is an operating manual for AI coding assistants working on a single Next.js application. It defines:

- Project structure and conventions
- Canonical workflows for common tasks
- Guardrails for security, quality, and consistency
- Collaboration protocol between agents and humans

Primary audiences:

1. **Execution Agents** – generate / modify code, tests, docs.
2. **Review Agents** – validate lint/type/test/build.
3. **Refactor Agents** – improve code quality under constraints.

All agents MUST treat this file as source of truth when policy conflicts arise.

---

## 2. Capabilities & Hard Boundaries

### Allowed Actions

| Domain | Allowed | Must Also Do | Never Do |
|--------|---------|--------------|----------|
| Code | Create/modify pages, components, API routes, utilities | Add tests & types, use TanStack Query for client data fetching | **NEVER use `useEffect` for data fetching**; skip validation |
| Database | Create migrations, run typegen | Update types after schema changes | Edit generated types manually |
| API Routes | Add routes under `app/api/` | Validate input with Zod, enforce auth | Expose secrets, skip validation |
| Docs | Update README, inline docs | Keep accurate | Invent undocumented behavior |

### Mandatory Guardrails

1. **Least Privilege**: Touch ONLY files required for the change.
2. **Idempotency**: Scripts and migrations safe to re-run.
3. **Security**: Never output secret values; reference env var names only.
4. **User-Only Build**: Do NOT run `build` commands unless explicitly requested.
5. **User-Only DB Push**: NEVER run remote database push commands. Prepare migrations; user applies.
6. **User-Only Lint/Format**: NEVER run lint/format commands. Suggest fixes; user runs.
7. **Testing**: ALWAYS add tests after implementing features. Agents CAN and SHOULD run tests.
8. **Translations**: Provide translations for ALL configured locales when adding user-facing strings.

### Prohibited Actions (HARD STOP)

- Committing secrets, API keys, tokens.
- Removing linting/formatting/type checking to "make it pass".
- Running build commands without explicit user request.
- **Using `useEffect` for data fetching – use TanStack Query instead.**

### Escalate When

1. Database migration requires >30 lines of backfill logic.
2. Introducing a new third-party service.
3. Changing auth flows or environment variable contracts.

---

## 3. Project Structure

<!-- [CUSTOMIZE] Update to match your project -->

```typescript
project/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (auth)/           # Auth-related routes (grouped)
│   │   ├── (dashboard)/      # Dashboard routes (grouped)
│   │   ├── api/              # API routes
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Home page
│   ├── components/           # React components
│   │   ├── ui/               # Base UI components
│   │   └── features/         # Feature-specific components
│   ├── lib/                  # Utilities and configurations
│   │   ├── db.ts             # Database client
│   │   ├── auth.ts           # Auth utilities
│   │   └── utils.ts          # General utilities
│   ├── hooks/                # Custom React hooks
│   ├── types/                # TypeScript types
│   └── styles/               # Global styles
├── public/                   # Static assets
├── prisma/                   # Database schema & migrations (if using Prisma)
│   ├── schema.prisma
│   └── migrations/
├── messages/                 # i18n translations (if using)
│   ├── en.json
│   └── [locale].json
├── .env.local                # Local environment variables
├── .env.example              # Environment template
└── package.json
```

### Conventions

| Area | Rule |
|------|------|
| Components | Colocate related files; extract to `components/` when reused |
| Server vs Client | Default to Server Components; add `'use client'` only when needed |
| API Routes | `src/app/api/<segment>/route.ts` with proper validation |
| Database | Never hand-edit generated types; always run typegen after schema changes |
| Environment | Reference env vars by name only; never inline secrets |

---

## 4. Canonical Workflows

### 4.1 Add a Dependency

```bash
# [CUSTOMIZE] Replace with your package manager
npm install <package>
# or: pnpm add <package>
# or: bun add <package>
```

If types needed: `npm install -D @types/<package>`

### 4.2 Add an API Route

1. Create `src/app/api/<segment>/route.ts`
2. For edge runtime: add `export const runtime = 'edge'`
3. Implement handlers: `export async function GET/POST(...)`
4. Validate input with Zod – reject early with 4xx
5. Add auth checks where required
6. Add tests or documentation

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = schema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Handle request...
  return NextResponse.json({ success: true });
}
```

### 4.3 Add a Page/Route

1. Create `src/app/<path>/page.tsx`
2. Default to Server Component
3. Add `'use client'` only if interactivity required
4. For data fetching: use RSC for initial data, React Query for client-side
5. Update navigation if applicable

### 4.4 Database Schema Change

<!-- [CUSTOMIZE] Replace with your database tooling (Prisma, Drizzle, etc.) -->

1. Modify schema file
2. Create migration: `npx prisma migrate dev --name <name>`
3. (User-only) Push to remote: `npx prisma migrate deploy`
4. Regenerate types: `npx prisma generate`
5. Update application code
6. Add tests for new schema

### 4.5 Add a Component

1. Create in `src/components/` (or colocate if single-use)
2. Define TypeScript props interface
3. Default to Server Component unless state/interactivity needed
4. Follow accessibility guidelines (keyboard nav, ARIA labels)
5. Add tests for complex logic

```typescript
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}

export function Button({ children, variant = 'primary', onClick }: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

### 4.6 Testing

**Agents SHOULD add and run tests after implementing features.**

```bash
# [CUSTOMIZE] Replace with your test command
npm run test           # Run all tests
npm run test -- --watch # Watch mode
npm run test <file>    # Run specific test
```

Test requirements:

- Add happy path + edge case tests
- Prefer pure functions for easy unit testing
- Mock external services appropriately

### 4.7 Lint & Format (User-Only)

Agent identifies issues; user runs commands:

```bash
# [CUSTOMIZE] Replace with your lint/format commands
npm run lint          # Check issues
npm run lint:fix      # Auto-fix
npm run format        # Check formatting
npm run format:fix    # Auto-fix formatting
```

---

## 5. Coding Standards

### 5.1 Git Conventions

Follow Conventional Commits:

```typescript
type(scope): description

feat: add user authentication
fix: resolve login redirect issue
chore: update dependencies
docs: add API documentation
refactor: simplify auth logic
test: add user service tests
```

### 5.2 TypeScript

- Explicit return types for exported functions
- Avoid `any` – use `unknown` and narrow at boundaries
- Use Zod for runtime validation of external inputs
- Prefer discriminated unions over enums

```typescript
// Good
function getUser(id: string): Promise<User | null> { ... }

// Avoid
function getUser(id: any): any { ... }
```

### 5.3 React Components

- Server Components by default
- `'use client'` only when state/effects needed
- Keep components <200 LOC; extract sub-components
- Define explicit props interfaces
- Use composition over monolithic components

### 5.4 Data Fetching (CRITICAL)

**TanStack Query is MANDATORY for ALL client-side data fetching.**

#### Decision Order (Prefer Earlier)

1. **Server Component fetch** – for SEO-critical, cacheable data
2. **Server Action** – for mutations
3. **RSC + React Query hydration** – when background refresh needed
4. **React Query client-side** – for interactive/dynamic data

#### FORBIDDEN Patterns

```typescript
// NEVER DO THIS - useEffect for data fetching is BANNED
useEffect(() => {
  fetch('/api/data').then(r => r.json()).then(setData);
}, []);

// NEVER DO THIS - manual state for API calls
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  fetchData().then(setData).finally(() => setLoading(false));
}, []);
```

#### REQUIRED Pattern

```typescript
// ALWAYS use React Query for client-side data
import { useQuery, useMutation } from '@tanstack/react-query';

// Reading data
const { data, isLoading, error } = useQuery({
  queryKey: ['users', userId],
  queryFn: () => fetch(`/api/users/${userId}`).then(r => r.json()),
});

// Mutations with optimistic updates
const mutation = useMutation({
  mutationFn: (newUser) => fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(newUser),
  }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
  },
});
```

#### Query Key Conventions

```typescript
// Use stable array keys
['users']                    // List
['users', userId]            // Single item
['users', { status: 'active' }] // Filtered list
```

### 5.5 Error Handling

- Validate inputs early; return 4xx for bad requests
- Never leak stack traces to client
- Log errors server-side; show generic messages to users

```typescript
try {
  // operation
} catch (error) {
  console.error('Operation failed:', error);
  return NextResponse.json(
    { error: 'Something went wrong' },
    { status: 500 }
  );
}
```

### 5.6 Security

- Reference env vars by name only
- Validate all user input
- Sanitize data before database queries
- Use parameterized queries (ORMs handle this)

### 5.7 Accessibility

- Keyboard navigable (natural tab order)
- `aria-label` for icon-only buttons
- Sufficient color contrast (WCAG AA)
- Use semantic HTML elements
- **Never use native `alert()`, `confirm()`, `prompt()`** – use proper dialog components

### 5.8 CSS/Styling

<!-- [CUSTOMIZE] Adapt to your styling approach -->

If using Tailwind with design tokens:

- Use design token classes, not raw colors (`text-primary` not `text-blue-500`)
- Keep consistent spacing scale
- Avoid inline styles except for truly dynamic values

### 5.9 Code Quality & Refactoring

#### Mandatory Thresholds

- Files >400 LOC → evaluate for splitting
- Components >200 LOC → break into sub-components
- Functions >50 LOC → decompose
- Duplicated logic (≥2 places) → extract to utility

#### Principles

| Principle | Application |
|-----------|-------------|
| Single Responsibility | Each function/component does ONE thing |
| DRY | Extract repeated logic immediately |
| Meaningful Names | `calculateTotalPrice()` not `calc()` |
| Composition | Build from small, focused pieces |

#### Boy Scout Rule

Always leave code better than you found it. When touching existing code:

- Assess if it meets current standards
- Refactor if it exceeds size thresholds
- Extract utilities if writing similar logic twice

### 5.10 Internationalization

<!-- [CUSTOMIZE] Update with your i18n setup and locales -->

If using i18n (next-intl, react-i18next, etc.):

1. **ALWAYS** add translations to ALL locale files
2. Use hierarchical keys: `feature.component.element`
3. Never hardcode user-facing strings

```typescript
// Good
t('auth.login.submitButton')

// Bad
"Submit"
```

---

## 6. Environment & Commands

### Common Scripts

<!-- [CUSTOMIZE] Replace with your actual scripts -->

| Goal | Command | Notes |
|------|---------|-------|
| Install deps | `npm install` | Run after pulling changes |
| Dev server | `npm run dev` | Starts on localhost:3000 |
| Build | `npm run build` | **USER-ONLY** |
| Start prod | `npm run start` | After build |
| Run tests | `npm run test` | Agents CAN run |
| Lint | `npm run lint` | **USER-ONLY** |
| Format | `npm run format` | **USER-ONLY** |
| DB migrate | `npm run db:migrate` | **USER-ONLY** for remote |
| DB typegen | `npm run db:generate` | After schema changes |

### Environment Variables

<!-- [CUSTOMIZE] List your environment variables -->

```bash
# .env.local (never commit)
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=

# Public (safe for client)
NEXT_PUBLIC_API_URL=
```

Rules:

- Never log secret values
- `NEXT_PUBLIC_` prefix for client-side variables
- Keep `.env.example` updated

---

## 7. Pre-PR Checklist

Before requesting review:

- [ ] Scope limited to intended changes
- [ ] Build passes (user verified)
- [ ] Lint clean (user verified)
- [ ] Tests added and passing
- [ ] Types correct (no `any` without justification)
- [ ] For DB changes: migration added, types regenerated
- [ ] Documentation updated if needed
- [ ] **All client data fetching uses React Query**
- [ ] **Files <400 LOC, components <200 LOC**
- [ ] **All user-facing strings translated**
- [ ] No secrets committed
- [ ] External inputs validated

### Rejection Triggers (Auto-Fail)

- Using `useEffect` for data fetching
- Raw `fetch()` without React Query in client components
- Unused dependencies added
- Skipping input validation
- Silent error catching (`catch (e) {}`)
- Manually editing generated types

---

## 8. Quick Reference

### File Naming

```typescript
src/app/dashboard/page.tsx      # Page component
src/app/api/users/route.ts      # API route
src/components/UserCard.tsx     # Component (PascalCase)
src/lib/auth.ts                 # Utility (camelCase)
src/hooks/useUser.ts            # Hook (useX convention)
src/types/user.ts               # Types (camelCase)
```

### Import Order

```typescript
// 1. React/Next
import { useState } from 'react';
import { NextRequest } from 'next/server';

// 2. External packages
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';

// 3. Internal absolute imports
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';

// 4. Relative imports
import { UserAvatar } from './UserAvatar';

// 5. Types
import type { User } from '@/types/user';
```

### Common Patterns

#### Server Component with Data

```typescript
// src/app/users/page.tsx
import { db } from '@/lib/db';

export default async function UsersPage() {
  const users = await db.user.findMany();
  return <UserList users={users} />;
}
```

#### Client Component with React Query

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

export function UserStats({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-stats', userId],
    queryFn: () => fetch(`/api/users/${userId}/stats`).then(r => r.json()),
  });

  if (isLoading) return <Skeleton />;
  return <StatsDisplay data={data} />;
}
```

#### API Route with Validation

```typescript
// src/app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = createUserSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: result.error.flatten() },
      { status: 400 }
    );
  }

  const user = await db.user.create({ data: result.data });
  return NextResponse.json(user, { status: 201 });
}
```

---

## 9. Glossary

| Term | Definition |
|------|------------|
| RSC | React Server Components – default in App Router |
| App Router | Next.js routing via `app/` directory |
| Route Handler | API endpoints in `app/api/*/route.ts` |
| Server Action | Server function callable from client (`'use server'`) |
| React Query | TanStack Query for client-side data fetching |
| Query Key | Array identifier for cached data |
| Mutation | Write operation with `useMutation` |
| Zod | TypeScript-first schema validation |
| Edge Runtime | Low-latency execution (`export const runtime = 'edge'`) |

---

## Appendix: Customization Checklist

- [ ] Update project structure in Section 3
- [ ] Replace package manager commands throughout
- [ ] Update database commands (Prisma/Drizzle/other)
- [ ] List your environment variables in Section 6
- [ ] Update i18n locales in Section 5.10
- [ ] Adjust styling conventions in Section 5.8
- [ ] Update scripts table in Section 6

---

**Keep this file updated as your project evolves!**
