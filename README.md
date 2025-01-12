# Tuturuuu Monorepo

[![Vercel Platform Production Deployment](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/vercel-production-platform.yaml)
[![CodeQL](https://github.com/tutur3u/platform/actions/workflows/codeql.yml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/codeql.yml)
[![Test](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/turbo-unit-tests.yaml)
[![Supabase CI](https://github.com/tutur3u/platform/actions/workflows/supabase-production.yaml/badge.svg)](https://github.com/tutur3u/platform/actions/workflows/supabase-production.yaml)

![Tuturuuu Cover](/public/cover.png)

This monorepo contains multiple applications and services that make up the Tuturuuu ecosystem. It's powered by Turborepo for efficient management of multiple packages. View our documentation at [**docs.tuturuuu.com**](https://docs.tuturuuu.com).

## Project Structure

- `apps/web`: Web application for Tuturuuu platform
- `apps/docs`: Documentation website powered by Mintlify
- `apps/rewise`: AI-powered chatbot for everyday tasks
- `apps/nova`: Prompt engineering platform that allows everyone to Learn, Practice, Innovate, and Compete. Similar to Leetcode for Algorithms and Kaggle for Machine Learning & AI

## Features

Tuturuuu services include:

- Task management (upcoming)
- Calendar scheduling and management (upcoming)
- Finance management
- User management (personal and enterprise, internal and external)
- Inventory management
- Mailing services (integrated with user management for group-scoped post notifications)
- Workspace permission management
- Granular permission control
- API & Secrets system
- External migration support
- AI chat with deep integration across all features and products

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io) (v9+)
- [Docker](https://www.docker.com/) (latest)

> [!NOTE]  
> Check out why we recommend using pnpm instead of npm by checking out their [motivation](https://pnpm.io/motivation) and [feature comparison](https://pnpm.io/feature-comparison).

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/tutur3u/platform.git
   cd platform
   ```

2. **Install dependencies:**

   ```bash
   pnpm i
   ```

3. **Start the Supabase local development environment:**

   ```bash
   pnpm sb:start
   ```

   This will provide the necessary URLs and keys for local development.

4. **Create environment files:**

   Create a `.env.local` file in each app directory (`apps/*/.env.local`) using the corresponding `.env.example` template and add the Supabase URLs and keys from the previous step.

5. **Start the desired application(s):**

   Use the appropriate pnpm scripts to start the applications.

   ```bash
   pnpm dev
   ```

## Community & Support

If you have any questions, feel free to reach out to our community or support team:

- Follow us on [X/Twitter](https://x.com/tutur3u) for updates and announcements.
- Check out our [GitHub Discussions](https://github.com/orgs/tutur3u/discussions) for more in-depth conversations and support.

## Development Tools

This turborepo has some additional tools already setup for you:

- [Tailwind CSS](https://tailwindcss.com/) for styles
- [Shadcn UI](https://ui.shadcn.com/) for UI components
- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting
- [Vitest](https://vitest.dev/) for testing

> [!TIP]
> If you're using VS Code, you can install following the recommended extensions
> that will help you with the development process:
> [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint),
> [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode),
> [Vitest](https://marketplace.visualstudio.com/items?itemName=vitest.explorer),
> [Tailwind CSS
> IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss),
> [Version
> Lens](https://marketplace.visualstudio.com/items?itemName=pflannery.vscode-versionlens),
> [Error
> Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens),
> [Pretty TypeScript
> Errors](https://marketplace.visualstudio.com/items?itemName=YoavBls.pretty-ts-errors),
> [Material Icon
> Theme](https://marketplace.visualstudio.com/items?itemName=PKief.material-icon-theme).

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

#### Supabase

To start a local supabase instance (database), run the following command:

```bash pnpm
pnpm sb:start
```

> [!NOTE]
> This command will start a local supabase instance on your machine. You can access the **Supabase Studio Dashboard** by visiting <http://localhost:8003>
>
> You can access the **InBucket service** that handles all email sending operations on your local machine by visiting <http://localhost:8004>

#### Supabase Prerequisites

> [!WARNING]
> You need to have Docker installed and running on your machine to start a local
> supabase instance.

### Stop Local Supabase Instance

To stop the local supabase instance, run the following command:

```bash
pnpm sb:stop
```

</CodeGroup>

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

## Additional Information

### Contribution Guidelines

We welcome contributions! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) file for guidelines on how to submit pull requests, report issues, and suggest improvements. If there is any security vulnerability, please report it responsibly by following our [security policy](./SECURITY.md). For more detailed information, please refer to our [Code of Conduct](./CODE_OF_CONDUCT.md).

### Troubleshooting

Common issues and their solutions:

1. **Supabase connection issues**: Ensure Docker is running and you've correctly set the Supabase URLs and keys in your `.env.local` files.
2. **Build errors**: Make sure you're using the correct Node.js version (v20+) and have run `pnpm i` to install all dependencies.

### Performance Optimization

To improve build and development performance:

- Use `pnpm` for faster package installation and better disk space usage.
- Leverage Turborepo's caching capabilities by utilizing remote caching.

### Learning Resources

- [Turborepo Handbook](https://turbo.build/repo/docs): Learn more about monorepo management with Turborepo.
- [Next.js Documentation](https://nextjs.org/docs): In-depth guide for Next.js, the framework used in our apps.
- [Next.js Learn](https://nextjs.org/learn): Interactive Next.js & React learning courses.
- [Supabase Documentation](https://supabase.io/docs): Learn about our database and backend services.

### License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](./LICENSE) file for more details.
