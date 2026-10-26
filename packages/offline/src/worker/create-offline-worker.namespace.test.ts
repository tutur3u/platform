import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfflineWorker } from './create-offline-worker';
import type { ServiceWorkerConfig } from './types';

const ORIGIN = 'https://tuturuuu.test';
const stores = new Map<string, Map<string, Response>>();
const network = vi.fn();
const key = (value: Request | string) =>
  new URL(typeof value === 'string' ? value : value.url, ORIGIN).href;
function store(name: string) {
  const entries = stores.get(name) ?? new Map<string, Response>();
  stores.set(name, entries);
  return entries;
}

beforeEach(() => {
  stores.clear();
  network.mockReset();
  network.mockImplementation(async () => new Response('asset'));
  vi.stubGlobal('fetch', network);
  vi.stubGlobal('caches', {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      const entries = store(name);
      return {
        put: async (request: Request | string, response: Response) => {
          entries.set(key(request), response);
        },
        match: async (request: Request | string) =>
          entries.get(key(request))?.clone(),
        keys: async () => [...entries.keys()].map((url) => new Request(url)),
        delete: async (request: Request | string) =>
          entries.delete(key(request)),
      };
    },
  });
});

/** Boots one app's worker on the shared origin. Node needs absolute manifest URLs. */
function boot(config: ServiceWorkerConfig, manifest: string[] = []) {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.stubGlobal('self', {
    location: { origin: ORIGIN },
    __TUTURUUU_PRECACHE_MANIFEST: manifest,
    registration: {},
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (name: string, callback: (event: unknown) => void) =>
      listeners.set(name, callback),
  });
  createOfflineWorker({
    staticAssetsOnly: true,
    navigationPreload: false,
    ...config,
  }).addEventListeners();
  const lifecycle = async (name: 'install' | 'activate') => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get(name)!({
      waitUntil: (promise: Promise<unknown>) => {
        done = promise;
      },
    });
    await done;
  };
  return {
    install: () => lifecycle('install'),
    activate: () => lifecycle('activate'),
    async fetchAsset(path: string) {
      const background: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      listeners.get('fetch')!({
        request: {
          url: `${ORIGIN}${path}`,
          method: 'GET',
          mode: 'cors',
          destination: 'script',
        },
        respondWith: (value: Promise<Response>) => {
          response = value;
        },
        waitUntil: (promise: Promise<unknown>) => background.push(promise),
      });
      await response;
      await Promise.all(background);
    },
  };
}

const precacheNames = (namespace: string) =>
  [...stores.keys()].filter((name) =>
    name.startsWith(`${namespace}-precache-`)
  );

describe('cache namespaces on a shared origin', () => {
  it('keeps the default cache names that existing Web installs use', async () => {
    const web = boot({}, [`${ORIGIN}/~offline`]);
    await web.install();
    await web.fetchAsset('/_next/static/web.js');
    expect([...stores.keys()].sort()).toEqual([
      expect.stringMatching(/^tuturuuu-offline-precache-[0-9a-z]+$/u),
      'tuturuuu-offline-runtime-v1',
    ]);
  });

  it("keeps another app's caches when one app activates", async () => {
    const web = boot({ cacheNamespace: 'tuturuuu-offline' }, [
      `${ORIGIN}/~offline`,
    ]);
    await web.install();
    await web.fetchAsset('/_next/static/web.js');
    const calendar = boot({ cacheNamespace: 'calendar' }, [
      `${ORIGIN}/offline.html`,
    ]);
    await calendar.install();
    await calendar.fetchAsset('/_next/static/calendar.js');
    const [webPrecache] = precacheNames('tuturuuu-offline');
    const [calendarPrecache] = precacheNames('calendar');

    await calendar.activate();
    await boot({ cacheNamespace: 'tuturuuu-offline' }, [
      `${ORIGIN}/~offline`,
    ]).activate();

    expect(stores.get(webPrecache!)?.has(`${ORIGIN}/~offline`)).toBe(true);
    expect(stores.get(calendarPrecache!)?.has(`${ORIGIN}/offline.html`)).toBe(
      true
    );
    expect(
      stores
        .get('tuturuuu-offline-runtime-v1')
        ?.has(`${ORIGIN}/_next/static/web.js`)
    ).toBe(true);
    expect(
      stores
        .get('calendar-runtime-v1')
        ?.has(`${ORIGIN}/_next/static/calendar.js`)
    ).toBe(true);
  });

  it('still prunes stale precaches within its own namespace', async () => {
    store('calendar-precache-old');
    store('tuturuuu-offline-precache-old');
    const calendar = boot({ cacheNamespace: 'calendar' }, [
      `${ORIGIN}/offline.html`,
    ]);
    await calendar.install();
    await calendar.activate();
    expect(precacheNames('calendar')).toHaveLength(1);
    expect(precacheNames('calendar')).not.toContain('calendar-precache-old');
    expect(stores.has('tuturuuu-offline-precache-old')).toBe(true);
  });

  it("never evicts another app's runtime entries to honor its own bound", async () => {
    const web = boot({ maxRuntimeCacheEntries: 2 });
    await web.fetchAsset('/_next/static/web-a.js');
    await web.fetchAsset('/_next/static/web-b.js');
    const calendar = boot({
      cacheNamespace: 'calendar',
      maxRuntimeCacheEntries: 2,
    });
    for (const name of ['a', 'b', 'c', 'd'])
      await calendar.fetchAsset(`/_next/static/calendar-${name}.js`);

    expect([...store('tuturuuu-offline-runtime-v1').keys()]).toEqual([
      `${ORIGIN}/_next/static/web-a.js`,
      `${ORIGIN}/_next/static/web-b.js`,
    ]);
    expect([...store('calendar-runtime-v1').keys()]).toEqual([
      `${ORIGIN}/_next/static/calendar-c.js`,
      `${ORIGIN}/_next/static/calendar-d.js`,
    ]);
  });

  it('only clears its own runtime cache when retention is disabled', async () => {
    await boot({}).fetchAsset('/_next/static/web.js');
    await boot({
      cacheNamespace: 'calendar',
      maxRuntimeCacheEntries: 0,
    }).activate();
    expect(stores.has('tuturuuu-offline-runtime-v1')).toBe(true);
  });

  it('rejects namespaces that could collide with cache name syntax', () => {
    for (const namespace of ['', 'Calendar', 'calendar-', 'a--b', 'a/b', '.*'])
      expect(() => boot({ cacheNamespace: namespace })).toThrow(RangeError);
  });
});
