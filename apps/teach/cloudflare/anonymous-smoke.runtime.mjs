import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';
import { assertServerArtifact } from './server-artifact-scan.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(join(app, 'package.json'));
const ROOT_HOST = 'teach.tuturuuu.com';
const EXPECTED = {
  '/': 200,
  '/dashboard': { redirect: '/login' },
};
const SYNTHETIC_SECRETS = {
  ABUSE_GUARD_BACKEND: 'upstash',
  NEXT_PUBLIC_SUPABASE_URL: 'https://teach-smoke.supabase.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_teach_smoke',
  UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'synthetic-smoke-only',
  SUPABASE_SECRET_KEY: 'synthetic-smoke-only',
  TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-smoke-only',
};

async function startWorker(t, secrets) {
  const { configPath } = readNativeRuntimeConfig(app);
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'teach-smoke-')));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });
  const worker = await require('wrangler').unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    bindings: {
      INTERNAL_WEB_API_ORIGIN: {
        type: 'plain_text',
        value: 'https://central.invalid',
      },
      ...Object.fromEntries(
        Object.entries(secrets).map(([name, value]) => [
          name,
          { type: 'plain_text', value },
        ])
      ),
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
        throw new Error('Provider auth forbidden in the smoke test');
      },
      outboundService: () =>
        new Response('{"error":"denied by the smoke test"}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    },
  });
  t.after(() => worker.dispose());
  await worker.ready;
  const target = await worker.url;
  return (path, host = ROOT_HOST) =>
    new Promise((resolve, reject) => {
      httpRequest(
        { host: target.hostname, port: target.port, path, headers: { host } },
        (response) => {
          response.resume();
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              location: response.headers.location ?? '',
            })
          );
        }
      )
        .on('error', reject)
        .end();
    });
}

test('the emitted config exposes no default Cloudflare hostname', () => {
  const { config } = readNativeRuntimeConfig(app);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.routes ?? [], []);
});

test('the emitted server has no development defaults', async () => {
  await assertServerArtifact(join(app, 'dist/server'));
});

test('signed-out requests answer as production does', {
  timeout: 120000,
}, async (t) => {
  const call = await startWorker(t, SYNTHETIC_SECRETS);
  for (const [path, outcome] of Object.entries(EXPECTED)) {
    const { status, location } = await call(path);
    if (typeof outcome === 'number') {
      assert.equal(status, outcome, path);
    } else {
      assert.ok(status >= 300 && status < 400, `${path}: ${status}`);
      const resolved = new URL(location, `https://${ROOT_HOST}`);
      const wanted = new URL(outcome.redirect, `https://${ROOT_HOST}`);
      assert.equal(resolved.host, wanted.host, path);
      assert.equal(resolved.pathname, wanted.pathname, path);
    }
  }
  assert.equal((await call('/', 'unknown.example')).status, 404);
  assert.equal((await call('/', 'tuturuuu.com')).status, 404);
});

test('a Worker missing a required secret refuses to serve', {
  timeout: 120000,
}, async (t) => {
  const { SUPABASE_SECRET_KEY: _omitted, ...secrets } = SYNTHETIC_SECRETS;
  const call = await startWorker(t, secrets);
  assert.equal((await call('/')).status, 500);
});
