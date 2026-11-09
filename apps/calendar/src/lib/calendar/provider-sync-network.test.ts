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
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
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

it.each([200, 201, 202, 299])(
  'accepts a direct Graph response %s with manual redirects',
  async (status) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json({ value: [] }, { status }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      createSyncGraphClient('synthetic').api('/me/events').get()
    ).resolves.toEqual({ value: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  }
);
it.each([300, 301, 302, 303, 304, 307, 308, 399])(
  'denies Graph redirect %s without reading or following it',
  async (status) => {
    const response = new Response(null, {
      status,
      headers: { Location: 'https://other.invalid/' },
    });
    const json = vi.spyOn(response, 'json');
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetch);
    await expect(
      createSyncGraphClient('synthetic').api('/me/events').get()
    ).rejects.toThrow('Microsoft calendar redirects are forbidden');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  }
);
it('denies opaque Graph redirects even if the status appears successful', async () => {
  const response = Response.json({ value: [] });
  Object.defineProperty(response, 'type', { value: 'opaqueredirect' });
  const json = vi.spyOn(response, 'json');
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetch);
  await expect(
    createSyncGraphClient('synthetic').api('/me/events').get()
  ).rejects.toThrow('Microsoft calendar redirects are forbidden');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(json).not.toHaveBeenCalled();
});
it('propagates a Graph network failure without retrying', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockRejectedValue(new Error('Synthetic network failure'));
  vi.stubGlobal('fetch', fetch);
  await expect(
    createSyncGraphClient('synthetic').api('/me/events').get()
  ).rejects.toThrow('Synthetic network failure');
  expect(fetch).toHaveBeenCalledTimes(1);
});
