# Tuturuuu Monorepo

This is Tuturuuu's centralized monorepo, powered by Turborepo.

## What's inside?

This turborepo uses [pnpm](https://pnpm.io) as a package manager. It includes the following packages/apps:

### Apps

- `app`: a [Next.js](https://nextjs.org/) app that contains all Tuturuuu's services through a web application interface. On production, this app is located at [**app.tuturuuu.com**](https://app.tuturuuu.com)
- `docs`: a [Next.js](https://nextjs.org/) app that contains all public documentation about Tuturuuu's services. On production, this app is located at [**docs.tuturuuu.com**](https://docs.tuturuuu.com)
- `web`: a [Next.js](https://nextjs.org/) app that contains all public information about Tuturuuu, including the landing page, pricing plans, and branding-related resources. On production, this app is located at [**tuturuuu.com**](https://tuturuuu.com)

### Packages

- `ui`: a stub React component library shared by `app`, `web` and `docs` applications
- `eslint-config-custom`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `tsconfig`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
pnpm run build
```

### Develop

To develop all apps and packages, run the following command:

```
pnpm run dev
```
