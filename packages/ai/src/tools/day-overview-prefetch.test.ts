import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();
vi.mock('./executors/day-overview', () => ({
  executeGetDayOverview: (...args: unknown[]) => execute(...args),
}));

const { startDayOverviewPrefetch, takePrefetchedDayOverview } =
  await import('./day-overview-prefetch');

type Ctx = Parameters<typeof startDayOverviewPrefetch>[0];
const makeCtx = (wsId = 'ws-1') =>
  ({ userId: 'u-1', wsId, supabase: {} }) as unknown as Ctx;

describe('day overview prefetch', () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it('serves the prefetched result once for a same-day call', async () => {
    execute.mockResolvedValue({ success: true, date: '2026-11-16' });
    const ctx = makeCtx();
    startDayOverviewPrefetch(ctx);
    expect(execute).toHaveBeenCalledWith({}, ctx);

    await expect(takePrefetchedDayOverview(ctx, {})).resolves.toEqual({
      hit: true,
      value: { success: true, date: '2026-11-16' },
    });
    await expect(takePrefetchedDayOverview(ctx, {})).resolves.toEqual({
      hit: false,
    });
  });

  it('misses for another date', async () => {
    execute.mockResolvedValue({ success: true, date: '2026-11-16' });
    const ctx = makeCtx();
    startDayOverviewPrefetch(ctx);
    await expect(
      takePrefetchedDayOverview(ctx, { date: '2026-11-17' })
    ).resolves.toEqual({ hit: false });
  });

  it('misses after the workspace context changed', async () => {
    execute.mockResolvedValue({ success: true, date: '2026-11-16' });
    const ctx = makeCtx('ws-1');
    startDayOverviewPrefetch(ctx);
    (ctx as { wsId: string }).wsId = 'ws-2';
    await expect(takePrefetchedDayOverview(ctx, {})).resolves.toEqual({
      hit: false,
    });
  });

  it('misses, without an unhandled rejection, when the prefetch failed', async () => {
    execute.mockImplementation(async () => {
      throw new Error('boom');
    });
    const ctx = makeCtx();
    startDayOverviewPrefetch(ctx);
    await expect(takePrefetchedDayOverview(ctx, {})).resolves.toEqual({
      hit: false,
    });
  });
});
