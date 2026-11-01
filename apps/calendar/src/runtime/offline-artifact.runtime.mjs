import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Mandatory emitted-artifact acceptance input; keep outside source-only discovery.
const client = resolve(process.env.CALENDAR_CLIENT_OUTPUT ?? 'dist/client');
const code = await readFile(resolve(client, 'serwist/sw.js'), 'utf8');
function worker(basePath = '', origin = 'https://calendar.test') {
  const listeners = new Map();
  const entries = new Map();
  const background = [];
  const cacheNames = new Set();
  const writes = [];
  let online = true;
  const self = {
    location: { origin },
    clients: { claim: async () => {} },
    registration: { scope: `${origin}${basePath}/` },
    addEventListener: (name, listener) =>
      listeners.set(name, [...(listeners.get(name) ?? []), listener]),
  };
  const cache = {
    match: async (input) =>
      entries.get(typeof input === 'string' ? input : input.url)?.clone(),
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
    delete: async (input) =>
      entries.delete(typeof input === 'string' ? input : input.url),
    put: async (input, response) => {
      const key = typeof input === 'string' ? input : input.url;
      writes.push(key);
      entries.set(key, response);
    },
  };
  runInNewContext(code, {
    self,
    URL,
    Request,
    Response,
    Headers,
    console,
    caches: {
      open: async () => cache,
      keys: async () => [...cacheNames],
      delete: async (name) => cacheNames.delete(name),
    },
    fetch: async () => {
      if (!online) throw new Error('offline');
      return new Response('network');
    },
  });
  return {
    entries,
    writes,
    cacheNames,
    async activate() {
      const work = [];
      for (const listener of listeners.get('activate') ?? [])
        listener({ waitUntil: (promise) => work.push(promise) });
      await Promise.all(work);
    },
    offline: () => {
      online = false;
    },
    async request(path, mode = 'cors', destination = '') {
      const request = new Request(new URL(path, self.location.origin));
      Object.defineProperties(request, {
        mode: { value: mode },
        destination: { value: destination },
      });
      let response;
      for (const listener of listeners.get('fetch') ?? [])
        listener({
          request,
          respondWith: (promise) => {
            response = promise;
          },
          waitUntil: (promise) => background.push(promise),
        });
      const result = await response;
      await Promise.all(background);
      return result;
    },
  };
}
test('actual emitted classic worker never caches private APIs or documents', async () => {
  const app = worker();
  assert.equal(
    await app.request('/api/v1/calendar/connections', 'cors', 'script'),
    undefined
  );
  assert.equal(
    await (await app.request('/personal', 'navigate')).text(),
    'network'
  );
  assert.deepEqual(app.writes, []);
  app.entries.set('/offline.html', new Response('Offline'));
  app.offline();
  assert.equal(
    await (await app.request('/personal', 'navigate')).text(),
    'Offline'
  );
  assert.deepEqual(app.writes, []);
});
test('actual emitted worker caps concurrent Vite static cache writes at160', async () => {
  const app = worker();
  await Promise.all(
    Array.from({ length: 170 }, (_, i) =>
      app.request(`/assets/app${i}-12345678.js`, 'cors', 'script')
    )
  );
  assert.equal(app.entries.size, 160);
});
test('mounted emitted worker caches only Calendar assets and uses its own fallback', async () => {
  const app = worker('/calendar');
  assert.equal(
    await app.request('/assets/web-12345678.js', 'cors', 'script'),
    undefined
  );
  assert.equal(
    await app.request('/calendarish/assets/app-12345678.js', 'cors', 'script'),
    undefined
  );
  assert.equal(
    await app.request(
      '/calendar/api/v1/calendar/connections',
      'cors',
      'script'
    ),
    undefined
  );
  assert.equal(
    await (
      await app.request('/calendar/assets/app-12345678.js', 'cors', 'script')
    ).text(),
    'network'
  );
  assert.deepEqual(app.writes, [
    'https://calendar.test/calendar/assets/app-12345678.js',
  ]);
  app.entries.set('/offline.html', new Response('Web Offline'));
  app.entries.set('/calendar/offline.html', new Response('Calendar Offline'));
  app.offline();
  assert.equal(
    await (await app.request('/calendar/personal', 'navigate')).text(),
    'Calendar Offline'
  );
});
test('existing offline dependencies are emitted as public deployment assets', async () => {
  for (const name of [
    'offline.html',
    'offline.css',
    'offline.js',
    'site.webmanifest',
    'android-chrome-192x192.png',
    'android-chrome-512x512.png',
    'apple-touch-icon.png',
  ])
    assert.ok((await readFile(resolve(client, name))).length > 0);
});

test('emitted activation migrates legacy caches only on the Calendar subdomain', async () => {
  for (const [origin, base, migrated] of [
    ['https://calendar.tuturuuu.com', '', true],
    ['https://tuturuuu.com', '/calendar', false],
    ['https://tutur3u.com', '/calendar', false],
  ]) {
    const app = worker(base, origin);
    for (const name of [
      'tuturuuu-offline-precache-old',
      'tuturuuu-offline-runtime-v1',
      'calendar-runtime-v1',
      'other-app',
    ])
      app.cacheNames.add(name);
    await app.activate();
    assert.equal(
      app.cacheNames.has('tuturuuu-offline-precache-old'),
      !migrated
    );
    assert.equal(app.cacheNames.has('tuturuuu-offline-runtime-v1'), !migrated);
    assert.equal(app.cacheNames.has('calendar-runtime-v1'), true);
    assert.equal(app.cacheNames.has('other-app'), true);
    await app.activate();
    assert.equal(app.cacheNames.size, migrated ? 2 : 4);
  }
});
