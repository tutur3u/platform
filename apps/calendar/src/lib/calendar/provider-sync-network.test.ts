import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

import { withProviderSyncBudget } from './provider-sync-budget';
import {
  createSyncGraphClient,
  providerSyncNetworkClient,
} from './provider-sync-network';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('makes only one Graph attempt on a throttled response', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(
        JSON.stringify({
          error: { code: 'TooManyRequests', message: 'rate limit' },
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '120' },
        }
      )
  );
  vi.stubGlobal('fetch', fetch);
  const signal = new AbortController().signal;
  await expect(
    withProviderSyncBudget(signal, async () =>
      createSyncGraphClient('test-secret')
        .api('/me/calendars/one/calendarView')
        .get()
    )
  ).rejects.toMatchObject({ statusCode: 429 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
});
it('cancels Microsoft refresh transport and drains without a retry', async () => {
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
  const pending = withProviderSyncBudget(controller.signal, () =>
    providerSyncNetworkClient.sendPostRequestAsync(
      'https://login.microsoftonline.com/token',
      { body: 'test-body' }
    )
  );
  controller.abort(new Error('deadline'));
  await expect(pending).rejects.toThrow('deadline');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('refuses to send Graph credentials to another origin', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal('fetch', fetch);
  await expect(
    createSyncGraphClient('test-secret').api('https://other.example/me').get()
  ).rejects.toThrow('Unsafe Microsoft calendar origin');
  expect(fetch).not.toHaveBeenCalled();
});
