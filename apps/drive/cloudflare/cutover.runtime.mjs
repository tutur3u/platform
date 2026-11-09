import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'TUTURUUU_APP_COORDINATION_SECRET',
];
test('anonymous protected route redirects to login with production host isolation', {
  timeout: 120000,
}, async (t) => {
  const { configPath, config } = readNativeRuntimeConfig(app);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
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
  const sdk = createRequire(join(app, 'package.json'))('wrangler');
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
  const origin = await worker.url;
  const call = (host) =>
    new Promise((resolveCall, reject) => {
      request(
        {
          hostname: origin.hostname,
          port: origin.port,
          path: '/00000000-0000-4000-8000-000000000001',
          headers: { host },
        },
        (response) => {
          response.resume();
          response.on('end', () =>
            resolveCall({
              status: response.statusCode,
              location: response.headers.location,
            })
          );
        }
      )
        .on('error', reject)
        .end();
    });
  const response = await call('drive.tuturuuu.com');
  assert.ok(
    [301, 302, 303, 307, 308].includes(response.status),
    `anonymous protected route: ${response.status}`
  );
  assert.equal(
    new URL(response.location, 'https://drive.tuturuuu.com').pathname,
    '/login'
  );
  assert.equal((await call('untrusted.invalid')).status, 404);
  assert.equal((await call('drive.tutur3u.com')).status, 404);
});
