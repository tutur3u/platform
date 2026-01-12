# NCT Hub Monorepo

This repository is a monorepo for all of NCT Hub's services, powered by Turborepo. View our documentation at [**docs.tuturuuu.com**](https://docs.tuturuuu.com).

## Project Structure

- `apps/web`: Main application (rmitnct.club)
- `apps/docs`: Documentation website powered by Mintlify

## Prerequisites

- [Node.js](https://nodejs.org/) (v22+)
- [bun](https://bun.sh/) (v1.2+) - Install with:
  - **macOS/Linux**: `curl -fsSL https://bun.sh/install | bash`
  - **Windows**: `powershell -c "irm bun.sh/install.ps1 | iex"`
- [Docker](https://www.docker.com/) (latest)

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone https://github.com/rmit-nct/hub.git
   cd hub
   ```

2. **Configure Tiptap Pro Registry:**

   > This step is no longer needed.

3. **Install dependencies:**

   ```bash
   bun i
   ```

4. **Start the Supabase local development environment:**

   ```bash
   bun sb:start
   ```

   This will provide the necessary URLs and keys for local development.

5. **Create environment files:**

   Create a `.env.local` file in each app directory (`apps/*/.env.local`) using the corresponding `.env.example` template and add the Supabase URLs and keys from the previous step.

6. **Start the desired application(s):**

   Use the appropriate bun scripts to start the applications.

   ```bash
   bun dev
   ```

## Development Tools

This turborepo has some additional tools already setup for you:

- [Tailwind CSS](https://tailwindcss.com/) for styles
- [Shadcn UI](https://ui.shadcn.com/) for UI components
- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [Biome](https://biomejs.dev/) for code linting, formatting
- [Vitest](https://vitest.dev/) for testing

> [!TIP]
> If you're using VS Code, you can install following the recommended extensions
> that will help you with the development process:
> [Biome](https://marketplace.visualstudio.com/items?itemName=biomejs.biome),
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
bun run build
```

### Develop

To develop all apps and packages (without requiring a local setup), run the following command:

```bash
bun dev
```

To stop development apps and packages that are running on your local machine, run the following command:

```bash
bun stop
```

#### Supabase

To start a local supabase instance (database), run the following command:

```bash
bun sb:start
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
bun sb:stop
```

#### Better Development Experience

In case you want to run all local development servers, run the following command:

```bash
bun devx
```

Running `devx` will:

1. Stop the currently running supabase instance and save current data as backup (if there is any)
2. Install all dependencies
3. Start a new supabase instance (using backed up data)
4. Start all Next.js apps in development mode

If you want to have the same procedure without the backup, you can run `bun devrs` instead. This will:

1. Stop the currently running supabase instance (if there is any)
2. Install all dependencies
3. Start a new supabase instance (with clean data from seed.sql)
4. Start all Next.js apps in development mode

> In case you don't want to run a local supabase instance, you can run `bun dev` instead.

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
bun run test
```

> Note: Tests are still a work in progress. We're currently working on adding tests to all packages to ensure the best quality possible.

## Additional Information

### Contribution Guidelines

We welcome contributions! Please read our [CONTRIBUTING.md](./CONTRIBUTING.md) file for guidelines on how to submit pull requests, report issues, and suggest improvements. If there is any security vulnerability, please report it responsibly by following our [security policy](./SECURITY.md). For more detailed information, please refer to our [Code of Conduct](./CODE_OF_CONDUCT.md).

### Troubleshooting

Common issues and their solutions:

1. **Supabase connection issues**: Ensure Docker is running and you've correctly set the Supabase URLs and keys in your `.env.local` files.
2. **Build errors**: Make sure you're using the correct Node.js version (v20+) and have run `bun i` to install all dependencies.

### Performance Optimization

To improve build and development performance:

- Use `bun` for faster package installation, better disk space usage, and significantly improved startup times (4x faster than Node.js). See [Bun's design goals](https://bun.sh/docs#design-goals) for more details.
- Leverage Turborepo's caching capabilities by utilizing remote caching.

### Learning Resources

- [Turborepo Handbook](https://turbo.build/repo/docs): Learn more about monorepo management with Turborepo.
- [Next.js Documentation](https://nextjs.org/docs): In-depth guide for Next.js, the framework used in our apps.
- [Next.js Learn](https://nextjs.org/learn): Interactive Next.js & React learning courses.
- [Supabase Documentation](https://supabase.io/docs): Learn about our database and backend services.

### License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](./LICENSE) file for more details.
