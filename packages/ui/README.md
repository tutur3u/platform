# @tuturuuu/ui

Shared UI components and design system for Tuturuuu Platform.

## Installation

```bash
npm install @tuturuuu/ui
# or
yarn add @tuturuuu/ui
# or
bun add @tuturuuu/ui
```

The public package depends on other published Tuturuuu packages, including
`@tuturuuu/apis` and `@tuturuuu/ai`. Release those dependencies first, then
publish UI from the same production commit so standalone apps can install
`@tuturuuu/ui` without local workspace links or package-manager overrides.

## Usage

```typescript
import { Button, Card } from '@tuturuuu/ui'

export default function MyComponent() {
  return (
    <Card>
      <Button variant="primary">Click me</Button>
    </Card>
  )
}
```

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
