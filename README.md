# Tuturuuu Monorepo

[![Tests](https://github.com/tutur3u/tutur3u/actions/workflows/test.yaml/badge.svg)](https://github.com/tutur3u/tutur3u/actions/workflows/test.yaml)
[![Supabase](https://github.com/tutur3u/tutur3u/actions/workflows/supabase-production.yaml/badge.svg)](https://github.com/tutur3u/tutur3u/actions/workflows/supabase-production.yaml)

This repository is a monorepo for all of Tuturuuu's services, powered by Turborepo. View our documentation at [**docs.tuturuuu.com**](https://docs.tuturuuu.com).

## What's inside?

This turborepo uses [pnpm](https://pnpm.io) as a package manager. It includes the following packages/apps:

### Apps

- `app`: a [Next.js](https://nextjs.org/) app with [Tailwind CSS](https://tailwindcss.com/) support that contains all public information about Tuturuuu, including the landing page, pricing plans, branding-related resources and Tuturuuu's services through a web application interface. On production, this app is located at [**tuturuuu.com**](https://tuturuuu.com).

### Packages

- `ui`: a stub React component library with [Tailwind CSS](https://tailwindcss.com/) shared by the `web` application.
- `eslint-config-custom`: `ESLint` configurations (includes `eslint-config-next` and `eslint-config-prettier`).
- `tailwind-config`: `Tailwind CSS` configurations.
- `tsconfig`: `tsconfig.json`s used throughout the monorepo.

### Utilities

This turborepo has some additional tools already setup for you:

- [Tailwind CSS](https://tailwindcss.com/) for styles
- [Shadcn UI](https://ui.shadcn.com/) for UI components
- [TypeScript](https://www.typescriptlang.org/) for static type checking.
- [ESLint](https://eslint.org/) for code linting.
- [Prettier](https://prettier.io) for code formatting.
- [Vitest](https://vitest.dev/) for testing.

### Setup

Before proceeding to the Build and Develop sections, you should have pnpm installed on your local machine.
The most common way to install it is using npm:

```bash
npm install -g pnpm
```

> More information can be found at the [pnpm installation](https://pnpm.io/installation) page.

After installing pnpm, you can install all dependencies by running the following command:

```bash
pnpm install
```

or

```bash
pnpm i
```

### Build

To build all apps and packages, run the following command:

```bash
pnpm build
```

### Develop

To develop all apps and packages (without requiring a local setup), run the following command:

```bash
pnpm dev
```

To stop development apps and packages that are running on your local machine, run the following command:

```bash
pnpm stop
```

#### Better Development Experience

In case you want to run all local development servers, run the following command:

```bash
pnpm devx
```

Running `devx` will:

1. Stop the currently running supabase instance and save current data as backup (if there is any)
2. Install all dependencies
3. Start a new supabase instance (using backed up data)
4. Start all Next.js apps in development mode

If you want to have the same procedure without the backup, you can run `pnpm devrs` instead. This will:

1. Stop the currently running supabase instance (if there is any)
2. Install all dependencies
3. Start a new supabase instance (with clean data from seed.sql)
4. Start all Next.js apps in development mode

> In case you don't want to run a local supabase instance, you can run `pnpm dev` instead.

#### Local development

There are 5 seed accounts that are already set up for local development:

1. <local@tuturuuu.com>
2. <user1@tuturuuu.com>
3. <user2@tuturuuu.com>
4. <user3@tuturuuu.com>
5. <user4@tuturuuu.com>

### Test

To run all tests, run the following command:

```bash
pnpm test
```

> Note: Tests are still a work in progress. We're currently working on adding tests to all packages to ensure the best quality possible.
