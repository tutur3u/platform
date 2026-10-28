import { afterEach, expect, it, vi } from 'vite-plus/test';
import { reapQuotaRuns } from './quota-reaper';

const env = {
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SECRET_KEY: 'test-only',
};
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, 'false', '1', 'TRUE'])(
  'off fence %s makes zero calls',
  async (flag) => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await reapQuotaRuns(
      { ...env, TUTURUUU_DEVBOX_QUOTA_REAPER_ENABLED: flag },
      Date.now()
    );
    expect(fetcher).not.toHaveBeenCalled();
  }
);
it('bounds each tick to one transaction and never retries errors', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(null, { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    reapQuotaRuns({ ...env, TUTURUUU_DEVBOX_QUOTA_REAPER_ENABLED: 'true' }, 0)
  ).rejects.toThrow('503');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({
    p_tick: '1970-01-01T00:00:00.000Z',
    p_limit: 25,
  });
});
