# @ncthub/eslint-config

Shared ESLint configurations for Tuturuuu Platform.

## Installation

```bash
npm install --dev @ncthub/eslint-config
# or
yarn add --dev @ncthub/eslint-config
# or
pnpm add -D @ncthub/eslint-config
```

## Usage

### Next.js Projects

```js
// eslint.config.mjs
import nextConfig from '@ncthub/eslint-config/next';

export default nextConfig;
```

### React Library

```js
// eslint.config.mjs
import reactConfig from '@ncthub/eslint-config/react-internal';

export default reactConfig;
```

### Generic Library

```js
// eslint.config.mjs
import libraryConfig from '@ncthub/eslint-config/library';

export default libraryConfig;
```

## License

MIT © [Tuturuuu](https://github.com/rmit-nct)
