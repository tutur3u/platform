# @tuturuuu/ui

Shared UI components and design system for Tuturuuu Platform.

## Installation

```bash
npm install @tuturuuu/ui
```

Using another package manager? Run `pnpm add @tuturuuu/ui`,
`yarn add @tuturuuu/ui`, or `bun add @tuturuuu/ui` instead.

The public package depends on other published Tuturuuu packages, including
`@tuturuuu/apis` and `@tuturuuu/ai`. Release those dependencies first, then
publish UI from the same production commit so standalone apps can install
`@tuturuuu/ui` without local workspace links or package-manager overrides.

## Usage

Import the shared stylesheet once from your app's root layout or entry point:

```typescript
import '@tuturuuu/ui/globals.css';
```

Then import each component from its public subpath:

```tsx
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';

export default function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Tuturuuu</CardTitle>
      </CardHeader>
      <CardContent>
        <Button>Get started</Button>
      </CardContent>
    </Card>
  );
}
```

The package exports TypeScript and TSX source files. Configure your framework
or bundler to transpile `@tuturuuu/ui` and its published Tuturuuu dependencies
when it does not transpile package source automatically.

## Features

- Fully accessible components
- Type-safe props
- Tailwind CSS integration
- Dark mode support
- Comprehensive theming system

## Development

```bash
# Install dependencies
bun install
```

## License

MIT © [Tuturuuu](https://github.com/tutur3u)
