import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const silent = process.env.CHECK_DETAILS === '1' ? false : 'passed-only';

export default defineConfig({
  resolve: {
    // `@tuturuuu/types` and `@tuturuuu/supabase` only expose built `dist/**`
    // entrypoints to Node resolution, and the turbo `test` task does not depend
    // on `^build`, so on a fresh checkout there is no `dist` to resolve against.
    // (`@tuturuuu/supabase` does point its `bun` condition at source, but vitest
    // resolves under Node conditions, so that does not help here.) Map both to
    // source the way tasks-api, tasks-ui, and ui already do.
    alias: [
      {
        find: /^@tuturuuu\/types\/primitives\/(.+)$/,
        replacement: `${resolve(__dirname, '../types/src/primitives')}/$1.ts`,
      },
      {
        find: '@tuturuuu/supabase/next/client',
        replacement: resolve(__dirname, '../supabase/src/next/client.ts'),
      },
      {
        find: '@tuturuuu/supabase/next/server',
        replacement: resolve(__dirname, '../supabase/src/next/server.ts'),
      },
      {
        find: '@tuturuuu/supabase/types',
        replacement: resolve(__dirname, '../supabase/src/types.ts'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    silent,
  },
});
