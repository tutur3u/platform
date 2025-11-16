# GEMINI.md

This file provides a comprehensive overview of the Tuturuuu monorepo for Gemini, outlining the project structure, key technologies, and development conventions.

## Project Overview

This is a monorepo for the Tuturuuu platform, a collection of web applications and services. The project is managed using Turborepo and utilizes `bun` as the package manager.

The main application is a Next.js web application located in `apps/web`. The project also includes a documentation site, an AI chatbot, a prompt engineering platform, and other services.

The frontend is built with React, Next.js, and Tailwind CSS, with a component library from `packages/ui` based on shadcn-ui and Radix UI. The backend is powered by Supabase.

### Key Technologies

-   **Monorepo:** Turborepo
-   **Package Manager:** bun
-   **Framework:** Next.js
-   **Language:** TypeScript
-   **Styling:** Tailwind CSS
-   **UI Components:** shadcn-ui, Radix UI
-   **Backend:** Supabase
-   **Testing:** Vitest
-   **Linting & Formatting:** Biome

## Building and Running

### Prerequisites

-   [Node.js](https://nodejs.org/) (v22+)
-   [bun](https://bun.sh/) (v1.2+)
-   [Docker](https://www.docker.com/) (latest)

### Getting Started

1.  **Install dependencies:**
    ```bash
    bun i
    ```

2.  **Start the Supabase local development environment:**
    ```bash
    bun sb:start
    ```

3.  **Create environment files:**
    Create a `.env.local` file in each app directory (`apps/*/.env.local`) using the corresponding `.env.example` template and add the Supabase URLs and keys from the previous step.

4.  **Start all applications in development mode:**
    ```bash
    bun dev
    ```

### Key Commands

-   `bun i`: Install dependencies.
-   `bun dev`: Start all applications in development mode.
-   `bun build`: Build all applications.
-   `bun test`: Run tests.
-   `bun sb:start`: Start the local Supabase development environment.
-   `bun sb:stop`: Stop the local Supabase development environment.
-   `bun format-and-lint:fix`: Format and lint all files.

## Development Conventions

-   **Package Management:** All packages are managed with `bun` workspaces.
-   **UI Components:** The `packages/ui` directory contains the shared UI component library. New components can be added using the `bun ui:add` command.
-   **Code Style:** The project uses Biome for linting and formatting. Use `bun format-and-lint:fix` to automatically fix any issues.
-   **Testing:** Tests are written with Vitest. Run all tests with `bun test`.
-   **Commits:** Commits should follow the Conventional Commits specification.
-   **Environment Variables:** Global environment variables are defined in `turbo.json`. Each application can also have its own `.env.local` file for local development.
-   **Internationalization:** The project supports multiple languages via `next-intl`. **CRITICAL**: Always provide translations for both English (`en.json`) AND Vietnamese (`vi.json`) when adding user-facing strings to `apps/web/messages/{locale}.json`. Never add translations only for English - Vietnamese translations are mandatory.
-   **Code Quality & Refactoring:** Files >400 LOC and components >200 LOC should be refactored into smaller, focused units. Apply best practices to ALL code, regardless of age. Follow single responsibility principle, extract utilities/hooks for complex logic, and leave code better than you found it. Code quality and developer experience are top priorities, not optional.

## Agent Operating Instructions

This section summarizes the key operating procedures for AI agents working in this repository, based on `AGENTS.md`.

### Core Principles

-   **Least Privilege:** Only touch files required for the change.
-   **Idempotency:** Scripts and migrations should be safe to re-run.
-   **Determinism:** Generated artifacts (like types) must come from scripts, not manual edits.
-   **Security:** Never output or commit secrets. Reference environment variables by name only.
-   **User Intent:** Do not run long-running commands (`bun dev`, `bun build`) unless explicitly asked. The user is responsible for running commands like `bun sb:push`, `bun lint`, and `bun format`.
-   **Code Quality First:** Proactively refactor long files (>400 LOC) and components (>200 LOC); maintain high DX standards for ALL code, both old and new. Code quality is never optional.

### Prohibited Actions

-   Committing secrets, API keys, or credentials.
-   Disabling linting, formatting, or type-checking.
-   Executing destructive database commands without a reversible strategy.
-   Running `bun sb:push`, `bun sb:linkpush`, `bun lint:fix`, or `bun format:fix`. Prepare the changes and ask the user to run these commands.

### Key Workflows

-   **Dependency Management:** Use `bun add <pkg> --workspace=@tuturuuu/<scope>` to add dependencies. Use `workspace:*` for internal packages.
-   **Database Migrations:**
    1.  Create a new migration with `bun sb:new`.
    2.  Edit the generated SQL file.
    3.  Ask the user to apply the migration (`bun sb:push`) and regenerate types (`bun sb:typegen`).
    4.  Incorporate the newly generated types from `packages/types` into your changes.
-   **Adding API Routes:** Create new routes in `apps/<app>/src/app/api/...`. Use Supabase client wrappers for authentication and Zod for input validation.
-   **Navigation Updates (CRITICAL):** When adding new pages or routes, **ALWAYS** update the main navigation file (`apps/web/src/app/[locale]/(dashboard)/[wsId]/navigation.tsx` for web app). Add routes to both the `aliases` array and `children` navigation items. Include proper icons, permission checks, and translation keys. **CRITICAL**: Ensure translation keys have entries in both `en.json` AND `vi.json`. Navigation updates are mandatory, not optional.
-   **Documentation:** When adding a new feature or changing an existing one, update the corresponding documentation in `apps/docs`. **Crucially, add any new page to `apps/docs/mint.json` to make it visible.**
-   **Styling:** Follow the **Tailwind Dynamic Color Policy**. Never use hard-coded color classes like `text-blue-500`. Instead, use the `dynamic-*` tokens, e.g., `text-dynamic-blue`.
-   **UI Components:**
    -   Use `sonner` for toasts: `import { toast } from '@tuturuuu/ui/sonner';`. Avoid the deprecated `@tuturuuu/ui/toast`.
    -   Use the dialog system for modals: `import { Dialog, ... } from '@tuturuuu/ui/dialog';`. **Never** use native browser dialogs like `alert()` or `confirm()`.
-   **Refactoring (Proactive):** Break down large files (>400 LOC) and components (>200 LOC) into smaller, focused units. Extract utilities to `src/lib/`, hooks to `src/hooks/`, and sub-components as needed. Apply best practices to BOTH old and new code—when touching existing code, assess and improve it. Follow single responsibility principle, use meaningful names, and eliminate duplication. Code quality is mandatory, not optional.