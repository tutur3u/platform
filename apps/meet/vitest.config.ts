import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    conditions: ['bun', 'module', 'node', 'development|production'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/internal-api$/,
        replacement: path.resolve(
          __dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/,
        replacement: path.resolve(
          __dirname,
          '../../packages/internal-api/src/$1.ts'
        ),
      },
    ],
  },
  ssr: {
    resolve: {
      conditions: ['bun', 'module', 'node', 'development|production'],
    },
  },
  test: {
    fsModuleCache: false,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude, 'src/proxy.public-callback.test.ts'],
  },
});
