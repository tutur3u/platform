# @tuturuuu/eslint-config

Shared ESLint configurations for Tuturuuu Platform.

## Installation

```bash
npm install --dev @tuturuuu/eslint-config
# or
yarn add --dev @tuturuuu/eslint-config
# or
pnpm add -D @tuturuuu/eslint-config
```

## Usage

### Next.js Projects

```js
// eslint.config.mjs
import nextConfig from '@tuturuuu/eslint-config/next';

export default nextConfig;
```

### React Library

```js
// eslint.config.mjs
import reactConfig from '@tuturuuu/eslint-config/react-internal';

export default reactConfig;
```

### Generic Library

```js
// eslint.config.mjs
import libraryConfig from '@tuturuuu/eslint-config/library';

export default libraryConfig;
```

## License

MIT © [Tuturuuu](https://github.com/tutur3u)
