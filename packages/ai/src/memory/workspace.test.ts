import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it } from 'vitest';
import { resolveAiMemoryWorkspaceIdForUser } from './workspace';

describe('memory policy workspace resolution', () => {
  for (const mode of ['missing', 'query-error', 'thrown-error']) {
    it(`denies ${mode} instead of selecting root`, async () => {
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        maybeSingle: async () => {
          if (mode === 'thrown-error') throw new Error('unavailable');
          return {
            data: null,
            error: mode === 'query-error' ? new Error('unavailable') : null,
          };
        },
      };
      const supabase = { from: () => query } as unknown as TypedSupabaseClient;
      await expect(
        resolveAiMemoryWorkspaceIdForUser({
          supabase,
          userId: 'synthetic-user',
        })
      ).rejects.toThrow();
    });
  }
});
