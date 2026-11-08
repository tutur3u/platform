import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(app, 'package.json'));
const host = 'hive.tuturuuu.com';
const sdk = require('wrangler');

function call(origin, requestHost) {
  return new Promise((resolve, reject) => {
    const target = new URL(origin);
    httpRequest({ hostname: target.hostname, port: target.port, path: '/', headers: { host: requestHost } }, response => {
      response.resume();
      response.on('end', () => resolve({ status: response.statusCode, location: response.headers.location }));
    }).on('error', reject).end();
  });
}

test('production ingress and anonymous auth fail closed', { timeout: 120000 }, async t => {
  assert.equal(process.env.CI, 'true');
  const { configPath, config } = readNativeRuntimeConfig(app);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  const scratch = await mkdtemp(join(tmpdir(), 'hive-auth-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { mode: 0o600 });
  async function start(bindings) {
    const worker = await sdk.unstable_startWorker({
      config: configPath,
      envFiles: [envFile],
      sendMetrics: false,
      bindings,
      build: { bundle: false, processEntrypoint: false },
      dev: {
        remote: false, watch: false, persist: false, inspector: false,
        liveReload: false, generateTypes: false, enableContainers: false,
        server: { hostname: '127.0.0.1', port: 0 },
        inferOriginFromRoutes: false, routeRequestsByRoutes: false,
        auth: () => { throw new Error('Provider auth forbidden in CI smoke'); },
        outboundService: () => new Response('{}', { status: 401 }),
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    return { worker, origin: (await worker.url).origin };
  }
  const missing = await start({});
  assert.equal((await call(missing.origin, host)).status, 503);
  await missing.worker.dispose();
  const bindings = Object.fromEntries([
    'TUTURUUU_hive_COORDINATION_SECRET', 'SUPABASE_SECRET_KEY',
  ].map(name => [name, { type: 'plain_text', value: 'synthetic-ci-only-secret-value' }]));
  const ready = await start(bindings);
  const anonymous = await call(ready.origin, host);
  assert.ok([301, 302, 303, 307, 308].includes(anonymous.status));
  assert.equal(new URL(anonymous.location, `https://${host}`).pathname, '/login');
  assert.equal((await call(ready.origin, 'untrusted.invalid')).status, 404);
});
