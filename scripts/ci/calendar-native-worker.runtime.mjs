import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  requireSourceSha,
  validateOutput,
  verify,
} from './calendar-native-artifact.mjs';

// Artifact-dependent: intentionally outside root source-only .test.* discovery.
const sourceSha = requireSourceSha(process.argv[2]);
const app = fileURLToPath(new URL('../../apps/calendar', import.meta.url));
const require = createRequire(resolve(app, 'package.json'));
const { unstable_getMiniflareWorkerOptions } = require('wrangler');
const { Miniflare } = require(
  require.resolve('miniflare', {
    paths: [dirname(require.resolve('wrangler'))],
  })
);
const { configPath, main } = validateOutput(app);
verify(
  app,
  JSON.parse(readFileSync(resolve(app, 'calendar-artifact.json'), 'utf8')),
  sourceSha
);
const { workerOptions, externalWorkers } =
  unstable_getMiniflareWorkerOptions(configPath);
assert.deepEqual(externalWorkers, [], 'unexpected auxiliary runtime');
const unexpected = [];
let runtime;
before(async () => {
  runtime = new Miniflare({
    host: '127.0.0.1',
    port: 0,
    workers: [
      {
        ...workerOptions,
        modules: true,
        scriptPath: main,
        modulesRoot: dirname(main),
        outboundService: async (request) => {
          unexpected.push(new URL(request.url).origin);
          return new Response('Fixture forbids network', { status: 599 });
        },
      },
    ],
  });
  await runtime.ready;
});
after(async () => {
  await runtime?.dispose();
});
const fetchWorker = (path, headers = {}) =>
  runtime.dispatchFetch(`https://calendar-ci.invalid${path}`, {
    headers,
    redirect: 'manual',
  });
test('actual native Worker renders EN/VI completion and emitted hydration assets', {
  timeout: 30000,
}, async () => {
  for (const [path, locale, headers] of [
    ['/verify-token', 'en', {}],
    ['/vi/verify-token', 'vi', {}],
    ['/verify-token', 'vi', { cookie: 'NEXT_LOCALE=vi' }],
    ['/verify-token', 'vi', { 'accept-language': 'vi,en;q=0.5' }],
  ]) {
    const response = await fetchWorker(path, headers);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    const html = await response.text();
    assert.match(html, new RegExp(`<html[^>]*lang="${locale}"`));
    const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(
      (m) => m[1]
    );
    const module = scripts.find(
      (src) => src.startsWith('/assets/') && /\.js(?:\?|$)/.test(src)
    );
    assert.ok(module, 'SSR hydration module missing');
    const asset = await fetchWorker(module);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') ?? '', /javascript/);
  }
  assert.deepEqual(unexpected, []);
});
test('native exact offline URL has root worker scope and classic script bytes', async () => {
  const response = await fetchWorker('/serwist/sw.js');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('service-worker-allowed'), '/');
  const bytes = await response.text();
  assert.equal(
    bytes,
    readFileSync(resolve(app, 'dist/client/serwist/sw.js'), 'utf8')
  );
  assert.doesNotMatch(bytes, /<html/i);
  assert.deepEqual(unexpected, []);
});
// Signed-in RPC/navigation/refresh, provider, permissions and enabled SQL drain
// need an admitted exact-artifact fixture and remain separate cutover blockers.
