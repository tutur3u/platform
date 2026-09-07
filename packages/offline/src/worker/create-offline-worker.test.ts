import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfflineWorker } from './create-offline-worker';

const listeners = new Map<string, (event: unknown) => void>();
const entries = new Map<string, Response>();
const key = (value: Request | string) =>
  typeof value === 'string' ? value : value.url;
const put = vi.fn(async (request: Request | string, response: Response) => {
  entries.set(key(request), response);
});
const network = vi.fn();
beforeEach(() => {
  listeners.clear();
  entries.clear();
  put.mockClear();
  network.mockReset();
  vi.stubGlobal('self', {
    location: { origin: 'https://calendar.test' },
    __TUTURUUU_PRECACHE_MANIFEST: [],
    addEventListener: (name: string, callback: (event: unknown) => void) =>
      listeners.set(name, callback),
  });
  vi.stubGlobal('fetch', network);
  vi.stubGlobal('caches', {
    open: async () => ({
      put,
      match: async (request: Request | string) =>
        entries.get(key(request))?.clone(),
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      delete: async (request: Request | string) => entries.delete(key(request)),
    }),
  });
  createOfflineWorker({
    cacheNavigations: false,
    staticAssetsOnly: true,
    maxRuntimeCacheEntries: 2,
    offlineFallbackUrl: '/offline.html',
  }).addEventListeners();
});
async function request(path: string, mode: string, destination = '') {
  const respondWith = vi.fn();
  listeners.get('fetch')!({
    request: {
      url: `https://calendar.test${path}`,
      method: 'GET',
      mode,
      destination,
    },
    respondWith,
    waitUntil: vi.fn(),
  });
  return respondWith.mock.calls.length
    ? ((await respondWith.mock.calls[0]![0]) as Response)
    : null;
}
describe('private productivity app caching', () => {
  it('serves the fallback dependencies from precache without a network request', async () => {
    Object.assign(self, { __TUTURUUU_PRECACHE_MANIFEST: ['/offline.css'] });
    entries.set('https://calendar.test/offline.css', new Response('body {}'));
    createOfflineWorker({
      cacheNavigations: false,
      staticAssetsOnly: true,
    }).addEventListeners();
    network.mockRejectedValue(new Error('offline'));
    expect(await (await request('/offline.css', 'cors', 'style'))?.text()).toBe(
      'body {}'
    );
    expect(network).not.toHaveBeenCalled();
  });
  it('never persists authenticated navigation HTML', async () => {
    network.mockResolvedValue(new Response('private workspace'));
    expect(await (await request('/personal', 'navigate'))?.text()).toBe(
      'private workspace'
    );
    expect(put).not.toHaveBeenCalled();
  });
  it('returns only the public fallback when navigation is offline', async () => {
    entries.set('/offline.html', new Response('Offline'));
    network.mockRejectedValue(new Error('offline'));
    expect(await (await request('/personal', 'navigate'))?.text()).toBe(
      'Offline'
    );
    expect(put).not.toHaveBeenCalled();
  });
  it('does not intercept API responses or private image requests', async () => {
    expect(await request('/api/v1/tasks', 'cors')).toBeNull();
    expect(await request('/api/private-avatar', 'cors', 'image')).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });
  it('still returns network data when the browser cannot retain a cache entry', async () => {
    network.mockResolvedValue(new Response('asset'));
    put.mockRejectedValueOnce(new Error('quota exceeded'));
    expect(
      await (await request('/_next/static/a.js', 'cors', 'script'))?.text()
    ).toBe('asset');
  });
  it('keeps the bound when many assets finish concurrently', async () => {
    network.mockImplementation(async () => new Response('asset'));
    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(`/_next/static/${index}.js`, 'cors', 'script')
      )
    );
    expect(entries.size).toBe(2);
  });
  it('reuses hashed assets and bounds the runtime cache', async () => {
    network.mockImplementation(async () => new Response('asset'));
    await request('/_next/static/a.js', 'cors', 'script');
    await request('/_next/static/a.js', 'cors', 'script');
    expect(network).toHaveBeenCalledTimes(1);
    await request('/_next/static/b.js', 'cors', 'script');
    await request('/_next/static/c.js', 'cors', 'script');
    expect(entries.size).toBe(2);
  });
});
