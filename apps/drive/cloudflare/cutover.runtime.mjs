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
const canonical = 'drive.tuturuuu.com';
const apex = 'tuturuuu.com';
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
];
test(
  'production host, auth and asset contracts on the emitted Drive Worker',
  {
    timeout: 120000,
  },
  async (t) => {
    const { configPath, config } = readNativeRuntimeConfig(app);
    assert.equal(config.workers_dev, false);
    assert.equal(config.preview_urls, false);
    assert.deepEqual(config.routes ?? [], []);
    const scratch = await mkdtemp(join(tmpdir(), 'drive-cutover-'));
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
      { host: apex, base: '/drive' },
    ];
    const query = '?x=1&x=2&q=a%2Fb';
    const deep = '/vi/00000000-0000-4000-8000-000000000001';
    const source = process.env.DRIVE_SOURCE_SHA;
    assert.match(source ?? '', /^[a-f0-9]{40}$/u);

    for (const { host, base } of profiles) {
      for (const appPath of ['/', deep]) {
        const path = appPath === '/' ? base || '/' : base + appPath;
        const response = await call(path + query, host);
        assert.equal(response.status, 307, path);
        const login = new URL(response.headers.location);
        assert.equal(login.origin, `https://${apex}`);
        assert.equal(login.pathname, '/login');
        const callback = new URL(login.searchParams.get('returnUrl'));
        assert.equal(callback.origin, `https://${host}`);
        assert.equal(callback.pathname, `${base}/verify-token`);
        assert.equal(callback.searchParams.get('nextUrl'), appPath + query);
        assert.match(response.headers['cache-control'] ?? '', /\bno-store\b/u);
        assert.equal(response.headers['set-cookie'], undefined);
      }
      const build = await call(`${base}/api/build-info`, host);
      assert.equal(build.status, 200, host);
      const info = JSON.parse(build.body);
      assert.equal(info.appName, 'drive', host);
      assert.equal(info.commitHash, source, host);
      const storage = await call(
        `${base}/api/v1/workspaces/workspace-a/storage/list`,
        host
      );
      assert.equal(storage.status, 401, host);
    }
    const mint = await call('/drive/api/auth/verify-app-token', apex, {
      method: 'POST',
    });
    assert.equal(mint.status, 409);
    assert.equal(mint.headers['set-cookie'], undefined);
    for (const path of ['/', '/driveway', '/api/build-info']) {
      assert.equal((await call(path, apex)).status, 404, path);
    }
    assert.equal((await call('/drive', 'untrusted.invalid')).status, 404);
    assert.equal((await call('/', 'drive.tutur3u.com')).status, 404);
    await t.test('every rendered asset loads on both hosts', (t) =>
      assertRenderedAssets(
        t,
        require,
        call,
        profiles.map(({ host, base }) => ({
          host,
          base,
          path: `${base}/verify-token/__native-asset-probe/missing`,
          status: 404,
        }))
      )
    );
  }
);
