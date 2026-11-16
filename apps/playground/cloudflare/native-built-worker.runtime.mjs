import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { assertNoPublicResources } from './public-resources.mjs';

const app = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(app, 'package.json'));
test(
  'emitted guest Worker: pages, identity, CSP, no cookies or egress',
  { timeout: 120000 },
  async (t) => {
    assert.equal(process.env.CI, 'true', 'Requires an admitted emitted build');
    const source = process.env.CI_SOURCE_SHA;
    assert.match(source ?? '', /^[a-f0-9]{40}$/);
    const { config, configPath } = readNativeRuntimeConfig(app);
    assert.deepEqual(config.vars, { PLATFORM_BUILD_COMMIT_HASH: source });
    assert.equal(config.assets.binding, 'ASSETS');
    assert.equal(config.assets.run_worker_first, true);
    assertNoPublicResources(config);
    const scratch = await mkdtemp(join(tmpdir(), 'playground-guest-runtime-'));
    t.after(() => rm(scratch, { recursive: true, force: true }));
    await cp(join(app, 'dist'), join(scratch, 'dist'), {
      recursive: true,
      verbatimSymlinks: true,
    });
    const envFile = join(scratch, 'empty.env');
    await writeFile(envFile, '', { mode: 0o600, flag: 'wx' });
    const registry = join(scratch, 'registry');
    await mkdir(registry, { mode: 0o700 });
    const egress = [];
    const worker = await require('wrangler').unstable_startWorker({
      config: join(scratch, relative(app, configPath)),
      envFiles: [envFile],
      sendMetrics: false,
      bindings: {},
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
          throw new Error('Provider access forbidden');
        },
        outboundService: (req) => {
          egress.push(new URL(req.url).origin);
          return new Response(null, { status: 502 });
        },
      },
    });
    t.after(() => worker.dispose());
    await worker.ready;
    const origin = await worker.url;
    const call = (path, headers = {}, method = 'GET') =>
      new Promise((resolve, reject) => {
        const req = request(
          {
            hostname: origin.hostname,
            port: origin.port,
            path,
            method,
            headers: { host: 'tuturuuu.com', ...headers },
          },
          (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString('utf8'),
              })
            );
          }
        );
        req.on('error', reject);
        req.end();
      });
    for (const suffix of [
      '',
      ...['tasks', 'calendar', 'track', 'finance', 'mail', 'mind'].map(
        (x) => '/demo/' + x
      ),
    ]) {
      const res = await call('/playground' + suffix);
      assert.equal(res.status, 200, suffix);
      assert.match(res.headers['content-type'], /text\/html/);
      assert.equal(res.headers['set-cookie'], undefined);
      assert.equal(res.headers['cache-control'], 'private, no-store');
      const csp = res.headers['content-security-policy'];
      assert.match(csp, /script-src 'self' 'nonce-/);
      assert.doesNotMatch(
        csp.match(/script-src[^;]+/)?.[0] ?? '',
        /unsafe-inline|unsafe-eval/
      );
      for (const part of [
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'self'",
      ])
        assert.ok(csp.includes(part), part);
      assert.ok(
        csp.includes(
          'connect-src http://tuturuuu.com/playground/api/build-info'
        )
      );
      assert.match(res.body, /playground/i);
    }
    for (const headers of [
      {},
      { cookie: 'sb-demo-auth-token=synthetic' },
      {
        authorization: 'Bearer synthetic',
        'x-tuturuuu-app-session': 'forged',
        'x-middleware-rewrite': 'https://tuturuuu.com/api/ai/object-generation',
      },
    ]) {
      for (const suffix of [
        '/api/ai/object-generation',
        '/api/ai/tool-calling',
        '/api/unknown',
        '/_serverFn/unknown',
      ]) {
        const res = await call('/playground' + suffix, headers);
        assert.equal(res.status, 404);
        assert.equal(res.headers['set-cookie'], undefined);
      }
    }
    const info = await call('/playground/api/build-info');
    assert.equal(info.status, 200);
    assert.deepEqual(JSON.parse(info.body), {
      commit: source,
      platform: 'cloudflare',
    });
    assert.equal(info.headers['cache-control'], 'private, no-store');
    assert.equal(
      (await call('/playground/api/build-info', {}, 'HEAD')).body,
      ''
    );
    assert.equal(
      (await call('/playground/api/build-info', {}, 'POST')).status,
      405
    );
    for (const path of [
      '/playgroundful',
      '/%70layground',
      '//playground',
      '/api/playground',
    ])
      assert.equal((await call(path)).status, 404, path);
    assert.deepEqual(
      egress,
      [],
      'Guest requests must never contact Web, Supabase or AI'
    );
  }
);
