import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = 'chat';
const gated = true;
const require = createRequire(import.meta.url);
test('anonymous root and closed public ingress on the emitted Worker', { timeout: 120000 }, async (t) => {
  assert.equal(process.env.CI, 'true', 'Run in owning CI after build');
  const { configPath, config } = readNativeRuntimeConfig(resolve('.'));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  const scratch = await mkdtemp(join(tmpdir(), `${app}-anonymous-`));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const envFile = join(scratch, 'empty.env');
  await writeFile(envFile, '', { mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry);
  const values = {
    NODE_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'https://synthetic.supabase.invalid',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic_only',
    SUPABASE_SECRET_KEY: 'synthetic-server-key',
    TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-coordination-key',
    INTERNAL_WEB_API_ORIGIN: 'https://central.invalid',
  };
  const worker = await require('wrangler').unstable_startWorker({
    config: configPath, envFiles: [envFile], sendMetrics: false,
    bindings: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { type: 'plain_text', value }])),
    build: { bundle: false, processEntrypoint: false },
    dev: {
      remote: false, watch: false, persist: false, inspector: false,
      liveReload: false, generateTypes: false, enableContainers: false, registry,
      server: { hostname: '127.0.0.1', port: 0 },
      inferOriginFromRoutes: false, routeRequestsByRoutes: false,
      auth: () => { throw new Error('Provider authentication forbidden'); },
      outboundService: () => new Response('{"error":"synthetic denial"}', { status: 401, headers: { 'content-type': 'application/json' } }),
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const origin = await worker.url;
  const get = (host, path = '/') => new Promise((resolveResponse, reject) => {
    request({ hostname: origin.hostname, port: origin.port, path, headers: { host } }, (response) => {
      response.resume();
      response.on('end', () => resolveResponse({ status: response.statusCode, location: response.headers.location }));
    }).on('error', reject).end();
  });
  const canonical = `${app}.tuturuuu.com`;
  const response = await get(canonical);
  if (gated) {
    assert.ok([301, 302, 303, 307, 308].includes(response.status));
    const target = new URL(response.location, `https://${canonical}`);
    assert.equal(target.host, canonical);
    assert.equal(target.pathname, '/login');
  } else {
    assert.equal(response.status, 200);
  }
  assert.equal((await get('unknown.invalid')).status, 404);
  if (app === 'external') assert.equal((await get(canonical, '/api/storage/probe')).status, 403);
});
