import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  oxc: false,
  resolve: {
    conditions: ['bun', 'node', 'development|production'],
    alias: [
      {
        find: /^server-only$/u,
        replacement: '@tanstack/react-start/server-only',
      },
      {
        find: /^next\/headers(?:\.js)?$/u,
        replacement: resolve(__dirname, 'src/runtime/request-context.ts'),
      },
      {
        find: /^next\/navigation(?:\.js)?$/u,
        replacement: resolve(__dirname, 'src/runtime/next-navigation.tsx'),
      },
      {
        find: /^next\/server(?:\.js)?$/u,
        replacement: resolve(__dirname, 'src/runtime/next-server.ts'),
      },
      {
        find: /^next-intl\/server$/u,
        replacement: resolve(__dirname, 'src/runtime/intl-server.ts'),
      },
      {
        find: /^@tuturuuu\/internal-api\/(calendar|client|mail|people)$/,
        replacement: `${resolve(__dirname, '../../packages/internal-api/src')}/$1`,
      },
      { find: '@', replacement: resolve(__dirname, './src') },
      {
        find: /^@tuturuuu\/internal-api$/u,
        replacement: resolve(
          __dirname,
          '../../packages/internal-api/src/index.ts'
        ),
      },
      {
        find: /^@tuturuuu\/internal-api\/(.+)$/u,
        replacement: `${resolve(__dirname, '../../packages/internal-api/src')}/$1.ts`,
      },
    ],
  },
  ssr: {
    resolve: {
      conditions: ['bun', 'node', 'development|production'],
    },
  },
  test: {
    server: { deps: { inline: ['next-intl'] } },
    environment: 'node',
    // Pinned explicitly: source has no fallback, and the profile tests
    // re-import modules under each profile plus the unset/unknown cases.
    env: { MAIL_DEPLOYMENT_PROFILE: 'production' },
    exclude: ['**/node_modules/**', '**/dist/**'],
    globals: true,
    include: ['src/**/*.test.ts'],
    silent,
  },
});
