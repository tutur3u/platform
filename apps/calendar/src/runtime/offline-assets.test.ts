import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfflineWorker } from '../../../../packages/offline/src/worker';
import {
  calendarOfflineContract,
  isNativeStaticAsset,
  OFFLINE_SCOPE,
  OFFLINE_WORKER_URL,
  offlinePrecache,
} from './offline-assets';

const listeners = new Map<string, (event: unknown) => void>();
const entries = new Map<string, Response>();
const background: Promise<unknown>[] = [];
const key = (value: Request | string) =>
  typeof value === 'string' ? value : value.url;
const put = vi.fn(async (input: Request | string, response: Response) => {
  entries.set(key(input), response);
});
const network = vi.fn();
beforeEach(() => {
  listeners.clear();
  entries.clear();
  background.length = 0;
  put.mockClear();
  network.mockReset();
  vi.stubGlobal('self', {
    location: { origin: 'https://calendar.test' },
    __TUTURUUU_PRECACHE_MANIFEST: offlinePrecache,
    addEventListener: (name: string, callback: (event: unknown) => void) =>
      listeners.set(name, callback),
  });
  vi.stubGlobal('fetch', network);
  vi.stubGlobal('caches', {
    open: async () => ({
      put,
      match: async (input: Request | string) =>
        entries.get(key(input))?.clone(),
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      delete: async (input: Request | string) => entries.delete(key(input)),
    }),
  });
  createOfflineWorker({
    offlineFallbackUrl: '/offline.html',
    cacheNavigations: false,
    staticAssetsOnly: true,
    maxRuntimeCacheEntries: 160,
    additionalCaching: [
      {
        matcher: ({ request }) =>
          isNativeStaticAsset(request, 'https://calendar.test'),
        strategy: 'cache-first',
      },
    ],
  }).addEventListeners();
});
async function dispatch(
  path: string,
  mode: RequestMode,
  destination: RequestDestination = ''
) {
  const request = new Request(new URL(path, 'https://calendar.test'));
  Object.defineProperties(request, {
    mode: { value: mode },
    destination: { value: destination },
  });
  const respondWith = vi.fn();
  const listener = listeners.get('fetch');
  if (!listener) throw new Error('Missing worker fetch listener');
  listener({
    request,
    respondWith,
    waitUntil: (work: Promise<unknown>) => background.push(work),
  });
  const result: Response | null = respondWith.mock.calls.length
    ? await respondWith.mock.calls[0]?.[0]
    : null;
  await Promise.all(background);
  return result;
}
describe('native Calendar offline contract', () => {
  it('retains exactly the existing registration URL, scope and public precache set', () => {
    expect(OFFLINE_WORKER_URL).toBe('/serwist/sw.js');
    expect(OFFLINE_SCOPE).toBe('/');
    expect(offlinePrecache).toContain('/offline.html');
    expect(offlinePrecache.every((url) => !url.startsWith('/api/'))).toBe(true);
  });
  it('never persists private navigation HTML', async () => {
    network.mockResolvedValue(new Response('private calendar'));
    expect(await (await dispatch('/personal', 'navigate'))?.text()).toBe(
      'private calendar'
    );
    expect(put).not.toHaveBeenCalled();
  });
  it('returns only the public offline fallback after navigation failure', async () => {
    entries.set('/offline.html', new Response('Offline'));
    network.mockRejectedValue(new Error('offline'));
    expect(await (await dispatch('/personal', 'navigate'))?.text()).toBe(
      'Offline'
    );
    expect(put).not.toHaveBeenCalled();
  });
  it.each([
    '/api/v1/calendar/connections',
    '/api/v1/workspaces/ws/calendar/events',
    '/private-image.png',
    'https://foreign.test/assets/file-12345678.js',
  ])('does not cache or intercept %s', async (path) => {
    expect(await dispatch(path, 'cors', 'script')).toBeNull();
    expect(network).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
  it('reuses emitted Vite assets and bounds concurrent writes to160 entries', async () => {
    network.mockImplementation(async () => new Response('public asset'));
    await dispatch('/assets/app-12345678.js', 'cors', 'script');
    await dispatch('/assets/app-12345678.js', 'cors', 'script');
    expect(network).toHaveBeenCalledTimes(1);
    await Promise.all(
      Array.from({ length: 170 }, (_, i) =>
        dispatch(`/assets/file${i}-12345678.js`, 'cors', 'script')
      )
    );
    expect(entries.size).toBe(160);
  });
});

it('scopes the mounted worker, public fallback and hashed assets to Calendar', () => {
  const contract = calendarOfflineContract('/calendar');
  expect(contract.workerUrl).toBe('/calendar/serwist/sw.js');
  expect(contract.scope).toBe('/calendar/');
  expect(contract.fallback).toBe('/calendar/offline.html');
  expect(contract.precache.every((path) => path.startsWith('/calendar/'))).toBe(
    true
  );
  const request = (path: string) => {
    const req = new Request(new URL(path, 'https://tuturuuu.com'));
    Object.defineProperty(req, 'destination', { value: 'script' });
    return req;
  };
  expect(
    isNativeStaticAsset(
      request('/calendar/assets/app-12345678.js'),
      'https://tuturuuu.com',
      '/calendar'
    )
  ).toBe(true);
  for (const path of [
    '/assets/app-12345678.js',
    '/mail/assets/app-12345678.js',
    '/calendar/api/private',
  ])
    expect(
      isNativeStaticAsset(request(path), 'https://tuturuuu.com', '/calendar')
    ).toBe(false);
});
