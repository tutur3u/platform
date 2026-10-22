import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { admin, list, auth, write, store, read } = vi.hoisted(() => ({
  admin: vi.fn(),
  list: vi.fn(),
  auth: { transporter: { defaults: {} } },
  write: vi.fn(),
  store: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({ createAdminClient: admin }));
vi.mock('@tuturuuu/google', () => ({
  google: { calendar: () => ({ events: { list } }) },
}));
vi.mock('@tuturuuu/trigger/google-calendar-sync', () => ({
  getGoogleAuthClient: () => auth,
  getSyncToken: read,
  storeSyncToken: store,
  clearSyncToken: vi.fn(),
}));
vi.mock('@tuturuuu/utils/google-calendar-import-fence', () => ({
  captureGoogleImport: vi.fn(),
  replayDeferredGoogleImports: vi.fn(),
}));
vi.mock('./google-color-context', () => ({
  refreshGoogleColorContext: vi.fn(),
}));
vi.mock('./google-guarded-sync-writes', () => ({
  incrementalActiveSync: write,
}));
vi.mock('./recurrence/provider/inbound/google-connection', () => ({
  reconcileGoogleConnectionSeries: vi.fn(),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  encryptGoogleSyncEvents: vi.fn(),
}));

import { performIncrementalActiveSync } from './incremental-active-sync';
import { withProviderSyncBudget } from './provider-sync-budget';

beforeEach(() => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: {
        id: 'token',
        access_token: 'test-access',
        refresh_token: 'test-refresh',
      },
      error: null,
    }),
  };
  admin.mockResolvedValue({ from: () => query });
  read.mockResolvedValue(null);
  list.mockResolvedValue({
    data: { items: [], nextPageToken: 'another-page' },
  });
});
afterEach(() => vi.resetAllMocks());
it('caps Google pagination without applying a partial snapshot or advancing its token', async () => {
  const signal = new AbortController().signal;
  await expect(
    withProviderSyncBudget(signal, () =>
      performIncrementalActiveSync(
        'workspace',
        'actor',
        'calendar',
        new Date('2026-10-01'),
        new Date('2026-11-01'),
        undefined,
        'token'
      )
    )
  ).rejects.toThrow('Google calendar page limit exceeded');
  expect(list).toHaveBeenCalledTimes(20);
  expect(write).not.toHaveBeenCalled();
  expect(store).not.toHaveBeenCalled();
  expect(read).toHaveBeenCalledWith(
    'workspace',
    'google:token:calendar',
    await admin.mock.results[0]?.value
  );
  expect(auth.transporter.defaults).toMatchObject({
    signal,
    timeout: 10_000,
    retry: false,
    retryConfig: { retry: 0 },
  });
});
