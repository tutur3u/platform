import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
  resolve: {
    alias: {
      '@tuturuuu/utils': path.resolve(__dirname, 'packages/utils/src'),
      '@tuturuuu/supabase': path.resolve(__dirname, 'packages/supabase/src'),
      '@tuturuuu/types': path.resolve(__dirname, 'packages/types/src'),
    },
  },
});
