import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { SourceTextModule, SyntheticModule } from 'node:vm';

// Execute the app-owned entry and guards; isolate route/framework suppliers.
async function loadWorker(app, result) {
  const cache = new Map();
  const emit = () => {
    if (result instanceof Error) throw result;
    return result;
  };
  const mocks = {
    handleTasksRequest: emit,
    default: { fetch: emit },
    workerBuildInfo: emit,
    forwardCentralApi: emit,
    guardShortenerApi: emit,
    appendContextCookies: (response) => response,
    setContextPage: () => {},
    withRequestContext: (_request, run) => run(),
    shortenerRequest: emit,
    createSupabaseLinkStore: () => ({}),
    createFunctionProxy: () => ({}),
    resolveAppBase: () => true,
    defaultProxyMatches: () => true,
    createProxyMatcher: () => () => true,
    bridgeErrorResponse: () =>
      new Response('Internal Server Error', { status: 500 }),
    createBridgeHandler: () => emit,
    createBridgeStartHandler: () => ({}),
    proxy: () => {},
    config: { matcher: [] },
    centralFirst: [],
    publicAssets: new Set(),
    isDriveProductionEnvironment: () => true,
    isDriveStagingEnvironment: () => true,
  };
  async function source(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file);
    const pending = (async () => {
      let text = await readFile(file, 'utf8');
      if (file.endsWith('/drive/cloudflare/worker.ts')) {
        text = text.replace(
          "import.meta.viteRsc.loadModule('rsc', 'bridge-api')",
          'Promise.resolve({ endpoints: [] })'
        );
      }
      return new SourceTextModule(stripTypeScriptTypes(text), {
        identifier: file,
      });
    })();
    cache.set(file, pending);
    return pending;
  }
  const linker = async (specifier, parent) => {
    let target;
    if (specifier === '@tuturuuu/start-bridge/response-policy')
      target = 'packages/start-bridge/src/core/response-policy.ts';
    else if (specifier === '@tuturuuu/start-bridge/startup')
      target = 'packages/start-bridge/src/server/startup.ts';
    else if (
      specifier.startsWith('@tuturuuu/utils/') &&
      [
        'framable-paths',
        'seo-robots',
        'staging-cookie-policy',
        'staging-hosts',
      ].includes(specifier.split('/').at(-1))
    )
      target = `packages/utils/src/${specifier.split('/').at(-1)}.ts`;
    else if (
      [
        './startup',
        './required-bindings',
        '../src/native/required-secrets',
      ].includes(specifier)
    )
      target = resolve(parent.identifier, '..', `${specifier}.ts`);
    if (target) return source(target);
    const values = { ...mocks };
    if (specifier === '../start-bridge.config') values.default = { mounts: {} };
    return new SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values))
        this.setExport(key, value);
    });
  };
  const entry = await source(`apps/${app}/cloudflare/worker.ts`);
  await entry.link(linker);
  await entry.evaluate();
  return entry.namespace.default;
}

const secrets = {
  NEXT_PUBLIC_SUPABASE_URL: 'fixture',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture',
  SUPABASE_SECRET_KEY: 'fixture',
  TUTURUUU_APP_COORDINATION_SECRET: 'fixture',
};
for (const app of ['tasks', 'drive', 'shortener']) {
  test(`${app}: actual entry refuses missing configuration before dispatch`, async () => {
    process.env.NODE_ENV = 'production';
    const worker = await loadWorker(app, new Error('dispatch must not run'));
    const response = await worker.fetch(
      new Request(`https://${app}.tuturuuu.com/`),
      { SHORTENER_CANONICAL_HOST_ENABLED: '1' },
      {}
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(
      response.headers.get('strict-transport-security'),
      'max-age=63072000'
    );
  });
  for (const status of [200, 302, 404, 500]) {
    test(`${app}: preserves ${status} and replaces hostile duplicate policy`, async () => {
      const input = new Response('fixture', {
        status,
        headers: [
          ['Strict-Transport-Security', 'max-age=1; includeSubDomains'],
          ['sTrIcT-TrAnSpOrT-sEcUrItY', 'max-age=2; preload'],
          ['Set-Cookie', 'one=1; Path=/'],
          ['Set-Cookie', 'two=2; Path=/'],
          ['Location', '/destination'],
          ['Content-Type', 'text/plain'],
        ],
      });
      const worker = await loadWorker(app, input);
      const response = await worker.fetch(
        new Request(`https://${app}.tuturuuu.com/`),
        secrets,
        {}
      );
      assert.equal(response.status, status);
      assert.deepEqual(
        [...response.headers].filter(
          ([key]) => key.toLowerCase() === 'strict-transport-security'
        ),
        [['strict-transport-security', 'max-age=63072000']]
      );
      assert.deepEqual(
        response.headers.getSetCookie(),
        input.headers.getSetCookie()
      );
      assert.equal(response.headers.get('location'), '/destination');
      assert.equal(response.headers.get('content-type'), 'text/plain');
      assert.equal(await response.text(), 'fixture');
    });
  }
  test(`${app}: thrown dispatch returns secured 500`, async () => {
    const worker = await loadWorker(app, new Error('fixture failure'));
    const response = await worker.fetch(
      new Request(`https://${app}.tuturuuu.com/`),
      secrets,
      {}
    );
    assert.equal(response.status, 500);
    assert.equal(
      response.headers.get('strict-transport-security'),
      'max-age=63072000'
    );
  });
  test(`${app}: upgrade object identity is preserved (runtime upgrade separate)`, async () => {
    const upgrade = { status: 101 };
    const worker = await loadWorker(app, upgrade);
    assert.equal(
      await worker.fetch(
        new Request(`https://${app}.tuturuuu.com/`),
        secrets,
        {}
      ),
      upgrade
    );
  });
}
