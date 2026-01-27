# AGENTS.md

This file provides context and instructions for AI agents (and human developers) working on the **NCT Hub** repository.

## 1. Project Overview

-   **Type:** Monorepo (TurboRepo).
-   **Package Manager:** [Bun](https://bun.sh/).
-   **Frameworks:** Next.js (App Router), React, Tailwind CSS.
-   **Backend/Services:** Supabase, Transactional Emails (AWS SES), AI Services (OpenAI, Anthropic, Google Vertex).
-   **Tooling:** Biome (Linting/Formatting), Vitest (Testing), Shadcn UI.
-   **Workspaces:**
    -   `apps/web`: Main Next.js web application.
    -   `apps/neo-league`: Neo League application.
    -   `apps/docs`: Documentation.
    -   `apps/ocr`: OCR service.
    -   `packages/*`: Shared packages (`ui`, `utils`, `types`, `ai`, `auth`, etc.).

## 2. Operational Commands

**IMPORTANT:** Always use `bun` instead of `npm`, `yarn`, or `pnpm`.

### Installation
```bash
bun install
```

### Development
-   **Start All Apps:**
    ```bash
    bun dev
    ```
-   **Start Specific App:**
    ```bash
    bun dev --filter @ncthub/web
    # OR
    bun dev:web
    ```
-   **Supabase Local Dev:**
    ```bash
    bun devx      # Start Supabase and Dev
    bun devrs     # Reset Supabase and Start Dev
    ```

### Building
-   **Build All:**
    ```bash
    bun build
    ```
-   **Build Specific:**
    ```bash
    bun build --filter @ncthub/web
    ```

### Linting & Formatting (Biome)
The project uses [Biome](https://biomejs.dev/) for fast linting and formatting.
-   **Check Format & Lint:**
    ```bash
    bun format-and-lint
    ```
-   **Fix Issues:**
    ```bash
    bun format-and-lint:fix
    # OR separate commands
    bun format:fix
    bun lint:fix
    ```

### Testing (Vitest)
-   **Run All Tests:**
    ```bash
    bun test
    ```
-   **Run Tests in Specific Package:**
    ```bash
    bun test --filter @ncthub/web
    ```
-   **Run Single Test File:**
    Inside a package (e.g., `apps/web`):
    ```bash
    bunx vitest run src/__tests__/utils/text-helper.test.tsx
    ```
    Or from root using filter and arguments (if supported by script, otherwise `cd` is safer for single file):
    ```bash
    bun --filter @ncthub/web test -- src/__tests__/utils/text-helper.test.tsx
    ```

## 3. Code Style & Conventions

### Formatting
-   **Indent:** 2 spaces.
-   **Line Width:** 80 characters.
-   **Quotes:** Single quotes (JSX uses double quotes).
-   **Semicolons:** Always.
-   **Trailing Commas:** ES5.
-   **Imports:** Organized automatically by Biome (`organizeImports: "on"`).

### Naming Conventions
-   **Components:** PascalCase (e.g., `Logo`, `AuditLogCard`).
    -   *File Naming:* Mixed. PascalCase for major components (e.g., `Logo.tsx`, `Footer.tsx`) and kebab-case for others (e.g., `scroll-to-top-button.tsx`). **Follow the convention of the directory you are working in.**
-   **Hooks:** camelCase with `use` prefix (e.g., `useWorkspaces`). File name: `useWorkspaces.tsx`.
-   **Utilities:** camelCase (e.g., `removeAccents`).
-   **Types/Interfaces:** PascalCase (e.g., `LogoProps`, `Workspace`).

### React & Next.js
-   **Components:** Functional components.
-   **Props:** Define interfaces for props (e.g., `interface Props { ... }`).
-   **Styling:** Tailwind CSS. Use `cn()` utility for class merging.
    ```tsx
    import { cn } from '@ncthub/utils/format';
    // ...
    className={cn('bg-white', className)}
    ```
-   **State Management:** `swr` for data fetching, `jotai` for global state if needed, React Context for providers.
-   **I18n:** `next-intl` is used. Use `[locale]` folders in `app` router.

### TypeScript
-   **Strictness:** Strict mode is enabled.
-   **Explicit Types:** Prefer explicit types for exported functions and component props.
-   **No Any:** Avoid `any` (though linter rule `noExplicitAny` is currently `off`, strive for type safety).

### Testing
-   **Framework:** Vitest.
-   **Syntax:** Use `it` instead of `test`.
    ```tsx
    import { expect, it } from 'vitest';
    it('should do something', () => { ... });
    ```
-   **Location:** `__tests__` directories or co-located with `*.test.tsx`.

### Directory Structure
-   **Aliases:**
    -   `@/*` -> `src/*` (in apps)
    -   `@ncthub/ui` -> `packages/ui`
    -   `@ncthub/utils` -> `packages/utils`
    -   `@ncthub/types` -> `packages/types`

## 4. Cursor/Agent Specifics
-   **Environment Variables:** Check `turbo.json` `globalEnv` for required keys (e.g., `NEXT_PUBLIC_SUPABASE_URL`, `OPENAI_API_KEY`).
-   **Supabase:** The project uses local Supabase (`apps/db`). Ensure it is running (`bun sb:start`) if working on database-related features.
-   **Brevity:** When modifying code, keep changes minimal and focused. Run `bun format:fix` before submitting changes to ensure Biome compliance.
