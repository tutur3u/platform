import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOfflineWorker } from './create-offline-worker';
import type { ServiceWorkerConfig } from './types';

const ORIGIN = 'https://tuturuuu.test';
const stores = new Map<string, Map<string, Response>>();
const network = vi.fn();
const unregister = vi.fn(async () => true);
const claim = vi.fn(async () => {});
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
  unregister.mockClear();
  claim.mockClear();
  network.mockImplementation(async () => new Response('network'));
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

const STRICT: ServiceWorkerConfig = {
  cacheNamespace: 'tuturuuu-offline',
  cacheNavigations: false,
  bypassPathPrefixes: ['/meet'],
  strictBypassPathPrefixes: ['/mastermind'],
};

function boot(config: ServiceWorkerConfig, scope = `${ORIGIN}/`) {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.stubGlobal('self', {
    location: { origin: ORIGIN },
    __TUTURUUU_PRECACHE_MANIFEST: [`${ORIGIN}/~offline`],
    registration: { scope, unregister },
    clients: { claim },
    skipWaiting: async () => {},
    addEventListener: (name: string, callback: (event: unknown) => void) =>
      listeners.set(name, callback),
  });
  createOfflineWorker(config).addEventListeners();
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
    dispatch(
      path: string,
      mode: string,
      destination = '',
      preload: Response | null = new Response('preloaded')
    ) {
      const respondWith = vi.fn();
      listeners.get('fetch')!({
        request: { url: `${ORIGIN}${path}`, method: 'GET', mode, destination },
        preloadResponse: Promise.resolve(preload ?? undefined),
        respondWith,
        waitUntil: () => {},
      });
      return respondWith;
    },
  };
}

describe('strict bypass prefixes', () => {
  it('never answers a strict-mount navigation, even with the offline page cached', () => {
    const web = boot(STRICT);
    store('tuturuuu-offline-precache-x').set(
      `${ORIGIN}/~offline`,
      new Response('poisoned offline page')
    );
    network.mockRejectedValue(new Error('offline'));
    for (const path of ['/mastermind', '/mastermind/', '/mastermind/vi/fleet'])
      expect(web.dispatch(path, 'navigate').mock.calls).toHaveLength(0);
  });

  it('never answers strict-mount subresources', () => {
    const web = boot(STRICT);
    for (const [path, destination] of [
      ['/mastermind/_next/static/app.js', 'script'],
      ['/mastermind/assets/app.css', 'style'],
      ['/mastermind/api/fleet', ''],
    ] as const)
      expect(web.dispatch(path!, 'cors', destination).mock.calls).toHaveLength(
        0
      );
    expect(network).not.toHaveBeenCalled();
  });

  it('keeps ordinary bypass and look-alike paths unchanged', async () => {
    const web = boot(STRICT);
    const meet = web.dispatch('/meet/vi/r/abc', 'navigate');
    expect(await (await meet.mock.calls[0]![0]).text()).toBe('preloaded');
    const asset = web.dispatch('/meet/app.js', 'cors', 'script');
    expect(asset.mock.calls).toHaveLength(0);
    const lookalike = web.dispatch('/mastermind-notes', 'navigate');
    expect(lookalike.mock.calls).toHaveLength(1);
  });

  it('answers every path outside the strict mount exactly as a worker without it', async () => {
    const { strictBypassPathPrefixes: _, ...withoutStrict } = STRICT;
    const cases = [
      ['/', 'navigate', 'document'],
      ['/en/settings', 'navigate', 'document'],
      ['/vi/ws/tasks?x=1', 'navigate', 'document'],
      ['/mastermind-notes', 'navigate', 'document'],
      ['/master', 'navigate', 'document'],
      ['/meet/vi/r/abc', 'navigate', 'document'],
      ['/meet/app.js', 'cors', 'script'],
      ['/_next/static/web.js', 'no-cors', 'script'],
      ['/_next/static/web.css', 'no-cors', 'style'],
      ['/api/v1/users/me', 'cors', ''],
    ] as const;
    const observe = async (config: ServiceWorkerConfig) => {
      stores.clear();
      network.mockClear();
      const web = boot(config);
      const out: Array<[number, string | null]> = [];
      for (const [path, mode, destination] of cases) {
        const calls = web.dispatch(path, mode, destination).mock.calls;
        const body = calls[0]
          ? await (await (calls[0][0] as Promise<Response>)).text()
          : null;
        out.push([calls.length, body]);
      }
      return { out, networkCalls: network.mock.calls.length };
    };
    expect(await observe(STRICT)).toEqual(await observe(withoutStrict));
  });

  it('purges strict-mount entries from owned caches on activate and keeps the rest', async () => {
    const runtime = store('tuturuuu-offline-runtime-v1');
    runtime.set(`${ORIGIN}/mastermind/_next/static/a.js`, new Response('x'));
    runtime.set(`${ORIGIN}/mastermind`, new Response('x'));
    runtime.set(`${ORIGIN}/_next/static/web.js`, new Response('web'));
    runtime.set(`${ORIGIN}/mastermind-notes`, new Response('web'));
    const custom = store('web-fonts');
    custom.set(`${ORIGIN}/mastermind/font.woff2`, new Response('x'));
    const foreign = store('meet-runtime-v1');
    foreign.set(`${ORIGIN}/mastermind/foreign.js`, new Response('x'));
    const web = boot({
      ...STRICT,
      additionalCaching: [
        { matcher: 'font', strategy: 'cache-first', cacheName: 'web-fonts' },
      ],
    });
    await web.install();
    const [precache] = [...stores.keys()].filter((name) =>
      name.startsWith('tuturuuu-offline-precache-')
    );
    store(precache!).set(`${ORIGIN}/mastermind/offline`, new Response('x'));

    await web.activate();

    expect([...runtime.keys()].sort()).toEqual([
      `${ORIGIN}/_next/static/web.js`,
      `${ORIGIN}/mastermind-notes`,
    ]);
    expect(custom.size).toBe(0);
    expect([...store(precache!).keys()]).toEqual([`${ORIGIN}/~offline`]);
    // Caches of other namespaces are not this worker's to edit.
    expect(foreign.size).toBe(1);
    expect(claim).toHaveBeenCalled();
  });

  it.each([`${ORIGIN}/mastermind/`, `${ORIGIN}/mastermind/vi/`])(
    'stays inert without removing its registration at %s',
    async (scope) => {
      store('tuturuuu-offline-runtime-v1').set(
        `${ORIGIN}/_next/static/web.js`,
        new Response('web')
      );
      const web = boot(STRICT, scope);
      await web.install();
      await web.activate();
      expect(unregister).not.toHaveBeenCalled();
      expect(claim).not.toHaveBeenCalled();
      expect(stores.size).toBe(1);
      expect(network).not.toHaveBeenCalled();
      expect(
        web.dispatch('/_next/static/web.js', 'cors', 'script').mock.calls
      ).toHaveLength(0);
      expect(web.dispatch('/', 'navigate').mock.calls).toHaveLength(0);
    }
  );

  it('keeps the root, broader and unrelated scopes registered', async () => {
    for (const scope of [
      `${ORIGIN}/`,
      `${ORIGIN}/tasks/`,
      `${ORIGIN}/m`,
      `${ORIGIN}/master`,
      `${ORIGIN}/mastermind-notes/`,
    ]) {
      const web = boot(STRICT, scope);
      await web.install();
      await web.activate();
      // A broader scope still never answers the strict mount.
      expect(web.dispatch('/mastermind/', 'navigate').mock.calls).toHaveLength(
        0
      );
    }
    expect(unregister).not.toHaveBeenCalled();
  });

  it('serves the cached offline page with its body and type only', async () => {
    const web = boot(STRICT);
    await web.install();
    const [precache] = [...stores.keys()].filter((name) =>
      name.startsWith('tuturuuu-offline-precache-')
    );
    store(precache!).set(
      `${ORIGIN}/~offline`,
      new Response('<p>offline</p>', {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cross-Origin-Opener-Policy': 'noopener-allow-popups',
          'Content-Security-Policy': "script-src 'none'",
          'Set-Cookie': 'x=1',
        },
      })
    );
    network.mockRejectedValue(new Error('offline'));
    const respondWith = web.dispatch('/vi/tasks', 'navigate', '', null);
    const response: Response = await respondWith.mock.calls[0]![0];
    expect([...response.headers.keys()].sort()).toEqual([
      'cache-control',
      'content-type',
    ]);
    expect(await response.text()).toBe('<p>offline</p>');
  });

  it('never removes its own registration in the emitted source', () => {
    // Every app's emitted worker is accepted only without self-removal
    // (scripts/ci/wave1-native-runtime.mjs asserts the same pattern).
    const source = readFileSync(
      join(import.meta.dirname, 'create-offline-worker.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/registration\.unregister/u);
  });

  it('rejects malformed strict prefixes', () => {
    for (const prefix of ['mastermind', '/mastermind/', '/', '//mastermind'])
      expect(() =>
        createOfflineWorker({ strictBypassPathPrefixes: [prefix] })
      ).toThrow(RangeError);
  });
});
