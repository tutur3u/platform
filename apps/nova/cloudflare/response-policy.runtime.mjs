import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(app, 'package.json'));
const hosts = ['nova.ai.vn', 'nova.tutur3u.com'];
const privateRobots = 'noindex, nofollow, nosnippet';

function assertHeaders(response, { asset = false, publicPage = false } = {}) {
  assert.equal(
    response.headers['x-robots-tag'],
    publicPage ? 'index, follow' : privateRobots
  );
  assert.match(
    response.headers['content-security-policy'] ?? '',
    /(?:^|;)\s*frame-ancestors 'none'(?:;|$)/
  );
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(
    response.headers['referrer-policy'],
    'strict-origin-when-cross-origin'
  );
  if (!asset) {
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.ok(
      (response.headers.vary ?? '')
        .split(',')
        .some((value) => value.trim().toLowerCase() === 'cookie')
    );
  }
}

test('emitted nova response policy and root host fences', {
  timeout: 120000,
}, async (t) => {
  assert.equal(
    process.env.CI,
    'true',
    'Requires the exact emitted native build'
  );
  assert.match(process.env.CI_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/);
  const { configPath } = readNativeRuntimeConfig(app);
  const scratch = await mkdtemp(join(tmpdir(), 'nova-response-policy-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry);
  const egress = [];
  const sdk = require('wrangler');
  const worker = await sdk.unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    bindings: {
      INTERNAL_WEB_API_ORIGIN: {
        type: 'plain_text',
        value: 'https://central.invalid',
      },
    },
    build: { bundle: false, processEntrypoint: false },
    dev: {
      remote: false,
      watch: false,
      persist: false,
      inspector: false,
      liveReload: false,
      generateTypes: false,
      enableContainers: false,
      registry,
      server: { hostname: '127.0.0.1', port: 0 },
      inferOriginFromRoutes: false,
      routeRequestsByRoutes: false,
      auth: () => {
        throw new Error('Provider auth forbidden');
      },
      outboundService(request) {
        assert.ok(egress.length < 16, 'Egress operation budget');
        egress.push(new URL(request.url).origin);
        return new Response('Fixture egress denied', { status: 599 });
      },
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const origin = await worker.url;
  const get = (host, path, method = 'GET') =>
    new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          hostname: origin.hostname,
          port: origin.port,
          path,
          method,
          headers: { host },
        },
        (response) => {
          const bytes = [];
          response.on('data', (part) => bytes.push(part));
          response.on('error', reject);
          response.on('end', () =>
            resolve({
              status: response.statusCode,
              headers: response.headers,
              body: Buffer.concat(bytes),
            })
          );
        }
      );
      request.on('error', reject);
      request.setTimeout(15000, () =>
        request.destroy(new Error('Runtime response deadline'))
      );
      request.end();
    });
  const assetNames = await readdir(join(app, 'dist/client/assets'), {
    recursive: true,
  });
  const firstScript = assetNames.sort().find((name) => name.endsWith('.js'));
  assert.ok(firstScript, 'Compiled browser asset required');
  const scriptPath = `/assets/${firstScript.split('\\').join('/')}`;
  for (const host of hosts) {
    await t.test(
      `${host} headers cover pages, APIs and method-limited assets`,
      async () => {
        const root = await get(host, '/');
        assert.equal(root.status, 200);
        assertHeaders(root, { publicPage: host === hosts[0] });
        const info = await get(host, '/api/build-info');
        assert.equal(info.status, 200);
        assertHeaders(info);
        assert.equal(
          JSON.parse(info.body).commitHash,
          process.env.CI_SOURCE_SHA
        );
        const head = await get(host, '/api/build-info', 'HEAD');
        assert.equal(head.status, 200);
        assert.equal(head.body.length, 0);
        assertHeaders(head);
        const privatePage = await get(host, '/home');
        assert.equal(privatePage.status, 307);
        assertHeaders(privatePage);
        for (const method of ['GET', 'HEAD']) {
          const asset = await get(host, scriptPath, method);
          assert.equal(asset.status, 200);
          assertHeaders(asset, { asset: true });
          assert.notEqual(asset.headers['cache-control'], 'private, no-store');
          const robots = await get(host, '/robots.txt', method);
          assert.equal(robots.status, 200);
          assertHeaders(robots, { asset: true });
        }
        const mutation = await get(host, scriptPath, 'POST');
        assert.ok(
          mutation.status < 500,
          `Asset-path mutation: ${mutation.status}`
        );
        assertHeaders(mutation);
      }
    );
  }
  for (const host of [
    'tuturuuu.com',
    'nova.ai.vn.attacker.invalid',
    'unknown.invalid',
    'nova.tuturuuu.com',
  ]) {
    const rejected = await get(host, '/nova');
    assert.equal(rejected.status, 404);
    assertHeaders(rejected);
  }
  assert.deepEqual(
    egress,
    [],
    'Header/host acceptance must perform no outbound requests'
  );
});
