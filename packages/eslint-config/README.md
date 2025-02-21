# @tutur3u/eslint-config

Shared ESLint configurations for Tuturuuu Platform.

## Installation

```bash
npm install --dev @tutur3u/eslint-config
# or
yarn add --dev @tutur3u/eslint-config
# or
pnpm add -D @tutur3u/eslint-config
```

## Usage

### Next.js Projects

```js
// eslint.config.mjs
import nextConfig from '@tutur3u/eslint-config/next';

export default nextConfig;
```

### React Library

```js
// eslint.config.mjs
import reactConfig from '@tutur3u/eslint-config/react-internal';

export default reactConfig;
```

### Generic Library

```js
// eslint.config.mjs
import libraryConfig from '@tutur3u/eslint-config/library';

export default libraryConfig;
```

## License

MIT © [Tuturuuu](https://github.com/tutur3u)
