import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: async () => ({ rpc: mocks.rpc }),
}));

import { getCachedProjectStorageAnalytics } from './storage-analytics-cache';

describe('persisted project storage analytics', () => {
  beforeEach(() => mocks.rpc.mockReset());
  it('reads only the authorized workspace and adapter snapshot', async () => {
    const snapshot = {
      totalSize: 300,
      fileCount: 2,
      scannedObjectLimit: 1000,
      truncated: false,
      largestFile: null,
      smallestFile: null,
    };
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    expect(
      await getCachedProjectStorageAnalytics('workspace-1', 'exocorpse')
    ).toEqual(snapshot);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_external_project_storage_analytics',
      {
        p_ws_id: 'workspace-1',
        p_adapter: 'exocorpse',
      }
    );
  });
  it.each(['PGRST202', '42883'])(
    'falls back while the migration is unavailable (%s)',
    async (code) => {
      mocks.rpc.mockResolvedValue({
        data: null,
        error: { code, message: 'Missing function' },
      });
      expect(
        await getCachedProjectStorageAnalytics('workspace-1', 'exocorpse')
      ).toBeNull();
    }
  );
  it('rejects an invalid persisted snapshot', async () => {
    mocks.rpc.mockResolvedValue({ data: { totalSize: -1 }, error: null });
    await expect(
      getCachedProjectStorageAnalytics('workspace-1', 'exocorpse')
    ).rejects.toThrow();
  });

  it('reports database failures instead of serving fabricated zero totals', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Forbidden' },
    });
    await expect(
      getCachedProjectStorageAnalytics('workspace-1', 'exocorpse')
    ).rejects.toThrow('Forbidden');
  });
});
