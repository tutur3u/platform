import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { assertRenderedAssets } from '../../../scripts/start-bridge-codemod/html-asset-acceptance.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(app, 'package.json'));
const canonical = 'learn.tuturuuu.com';
const apex = 'tuturuuu.com';
const production = process.env.CUTOVER_ARTIFACT_PROFILE === 'production';
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
];
test(
  'host, auth and asset contracts on the emitted Learn Worker',
  {
    timeout: 120000,
  },
  async (t) => {
    const { configPath, config } = readNativeRuntimeConfig(app);
    assert.equal(
      config.name,
      production ? 'tuturuuu-learn' : 'tuturuuu-learn-vite-staging'
    );
    assert.equal(config.workers_dev, !production);
    if (production) {
      assert.equal(config.preview_urls, false);
    }
    assert.deepEqual(config.routes ?? [], []);
    const scratch = await mkdtemp(join(tmpdir(), 'learn-cutover-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    const local = join(scratch, 'wrangler.json');
    await writeFile(
      local,
      JSON.stringify({
        ...config,
        main: resolve(dirname(configPath), config.main),
        assets: {
          ...config.assets,
          directory: resolve(dirname(configPath), config.assets.directory),
        },
      })
    );
    const envFile = join(scratch, 'empty.env');
    await writeFile(envFile, '', { mode: 0o600 });
    const bindings = Object.fromEntries(
      required.map((name) => [
        name,
        {
          type: 'plain_text',
          value:
            name === 'NEXT_PUBLIC_SUPABASE_URL'
              ? 'https://production-smoke.invalid'
              : 'synthetic-cutover-fixture-value-000000000000',
        },
      ])
    );
    const sdk = require('wrangler');
    const worker = await sdk.unstable_startWorker({
      config: local,
      envFiles: [envFile],
      sendMetrics: false,
      bindings,
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false,
        watch: false,
        persist: false,
        inspector: false,
        liveReload: false,
        generateTypes: false,
        enableContainers: false,
        registry: join(scratch, 'registry'),
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false,
        routeRequestsByRoutes: false,
        auth: () => {
          throw new Error('Provider auth forbidden in cutover smoke');
        },
        outboundService: () =>
          new Response('Outbound denied by fixture', { status: 401 }),
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    const call = async (path, host, init = {}) => {
      const response = await worker.fetch(`https://${host}${path}`, {
        ...init,
        redirect: 'manual',
      });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: await response.text(),
      };
    };
    const profiles = [
      { host: canonical, base: '' },
      { host: apex, base: '/learn' },
    ];
    const query = '?x=1&x=2&q=a%2Fb';
    const deep = '/parent-invite';
    const source = process.env.LEARN_SOURCE_SHA ?? process.env.CI_SOURCE_SHA;
    assert.match(source ?? '', /^[a-f0-9]{40}$/u);

    for (const { host, base } of profiles) {
      const response = await call(`${base}${deep}${query}`, host);
      assert.equal(response.status, 307, host);
      const login = new URL(response.headers.location);
      assert.equal(login.origin, `https://${host}`);
      assert.equal(login.pathname, `${base}/login`);
      assert.equal(login.searchParams.get('next'), deep + query);
      assert.equal(response.headers['referrer-policy'], 'no-referrer');
      assert.match(response.headers['cache-control'] ?? '', /\bno-store\b/u);
      const forward = await call(`${login.pathname}${login.search}`, host);
      assert.equal(forward.status, 307, host);
      assert.equal(forward.headers['referrer-policy'], 'no-referrer');
      const webLogin = new URL(forward.headers.location, login);
      assert.equal(webLogin.origin, `https://${apex}`);
      assert.equal(webLogin.pathname, '/login');
      const callback = new URL(webLogin.searchParams.get('returnUrl'));
      assert.equal(callback.origin, `https://${host}`);
      assert.equal(callback.pathname, `${base}/verify-token`);
      assert.equal(callback.searchParams.get('nextUrl'), deep + query);
      const localized = await call(`${base}/vi/login${query}`, host);
      assert.equal(localized.status, 307, host);
      assert.equal(
        localized.headers.location,
        `https://${host}${base}/login${query}`
      );
      const build = await call(`${base}/api/build-info`, host);
      assert.equal(build.status, 200, host);
      const info = JSON.parse(build.body);
      assert.equal(info.appName, 'learn', host);
      assert.equal(info.commitHash, source, host);
    }
    const mint = await call('/learn/api/auth/verify-app-token', apex, {
      method: 'POST',
    });
    assert.equal(mint.status, 409);
    assert.equal(mint.headers['set-cookie'], undefined);
    for (const path of ['/', '/learning', '/api/build-info']) {
      assert.equal((await call(path, apex)).status, 404, path);
    }
    await t.test('every rendered asset loads on both hosts', (t) =>
      assertRenderedAssets(
        t,
        require,
        call,
        profiles.map(({ host, base }) => ({
          host,
          base,
          path: `${base || '/'}${query}`,
        }))
      )
    );
  }
);
