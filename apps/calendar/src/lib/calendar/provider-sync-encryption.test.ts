import { expect, it, vi } from 'vitest';

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('@tuturuuu/utils/encryption', async (original) => ({
  ...(await original<typeof import('@tuturuuu/utils/encryption')>()),
  isEncryptionEnabled: () => true,
  getMasterKey: () => Buffer.alloc(32),
}));

import { getWorkspaceKey } from '@/lib/workspace-encryption';
import { withProviderSyncBudget } from './provider-sync-budget';

it('fails the cron import if encryption key lookup times out instead of falling back to plaintext', async () => {
  admin.mockReturnValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
            error: { message: 'network timeout' },
          }),
        }),
      }),
    }),
  });
  await expect(
    withProviderSyncBudget(new AbortController().signal, () =>
      getWorkspaceKey('workspace')
    )
  ).rejects.toThrow('Calendar encryption key lookup failed');
});
