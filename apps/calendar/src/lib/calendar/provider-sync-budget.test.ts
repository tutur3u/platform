import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import {
  providerSyncFetch,
  rotatingSyncBatch,
  withProviderSyncBudget,
} from './provider-sync-budget';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('rotates a bounded batch so deferred work is admitted on later ticks', () => {
  const now = vi.spyOn(Date, 'now');
  const covered = new Set<number>();
  for (let tick = 0; tick < 4; tick++) {
    now.mockReturnValue(tick * 900_000);
    const batch = rotatingSyncBatch(
      Array.from({ length: 31 }, (_, id) => id),
      10
    );
    expect(batch).toHaveLength(10);
    batch.forEach((id) => {
      covered.add(id);
    });
  }
  expect(covered.size).toBe(31);
});
it('refuses network work after the shared deadline', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  const signal = AbortSignal.abort(new Error('deadline'));
  await expect(
    withProviderSyncBudget(signal, async () =>
      providerSyncFetch('https://example.test')
    )
  ).rejects.toThrow('deadline');
  expect(fetch).not.toHaveBeenCalled();
});
it('cancels and drains an in-flight request without retrying', async () => {
  const controller = new AbortController();
  const fetch = vi.fn<typeof globalThis.fetch>(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(init.signal?.reason),
          { once: true }
        );
      })
  );
  vi.stubGlobal('fetch', fetch);
  const pending = withProviderSyncBudget(controller.signal, async () =>
    providerSyncFetch('https://example.test')
  );
  controller.abort(new Error('deadline'));
  await expect(pending).rejects.toThrow('deadline');
  expect(fetch).toHaveBeenCalledTimes(1);
});
