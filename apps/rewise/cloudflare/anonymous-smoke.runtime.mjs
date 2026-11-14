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
import { assertCentralLoginRedirect } from './central-login-redirect.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(join(app, 'package.json'));
const ROOT_HOST = 'rewise.tuturuuu.com';
// The local Worker receives HTTP; the native /login page has a fixed HTTPS return target.
const EXPECTED = {
  '/': 'https://rewise.tuturuuu.com/verify-token?nextUrl=%2F',
  '/?smoke=return':
    'https://rewise.tuturuuu.com/verify-token?nextUrl=%2F%3Fsmoke%3Dreturn',
  // The auth proxy handles /login before the page and normalizes the loop to /.
  '/login': 'https://rewise.tuturuuu.com/verify-token?nextUrl=%2F',
  // The generated gate's notFound probe: the proxy redirects an unknown path
  // before the router can answer 404.
  '/__native-smoke-missing__':
    'https://rewise.tuturuuu.com/verify-token?nextUrl=%2F__native-smoke-missing__',
};
const HOSTILE_HOST = 'evil.example';
const SYNTHETIC_SECRETS = {
  ABUSE_GUARD: {},
  ABUSE_GUARD_KEY_PEPPER: 'synthetic-smoke-only',
  ABUSE_GUARD_FAMILIES: 'proxy',
  NEXT_PUBLIC_SUPABASE_URL: 'https://rewise-smoke.supabase.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_rewise_smoke',
  SUPABASE_SECRET_KEY: 'synthetic-smoke-only',
  TUTURUUU_APP_COORDINATION_SECRET: 'synthetic-smoke-only',
};

function assertUncacheableWithoutCookies({ headers }, path) {
  assert.match(headers['cache-control'] ?? '', /\bno-store\b/u, path);
  assert.equal(headers['set-cookie'], undefined, `${path}: Set-Cookie`);
}

async function startWorker(t, secrets) {
  const { configPath } = readNativeRuntimeConfig(app);
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'rewise-smoke-'))
  );
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
        Object.entries(secrets).flatMap(([name, value]) =>
          name === 'ABUSE_GUARD'
            ? [
                [
                  name,
                  {
                    type: 'fetcher',
                    fetcher: async () =>
                      new Response('{"error":"guard_unavailable"}', {
                        status: 503,
                        headers: { 'content-type': 'application/json' },
                      }),
                  },
                ],
              ]
            : [[name, { type: 'plain_text', value }]]
        )
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
  return (path, host = ROOT_HOST, headers = {}) =>
    new Promise((resolve, reject) => {
      httpRequest(
        {
          host: target.hostname,
          port: target.port,
          path,
          headers: { ...headers, host },
        },
        (response) => {
          response.resume();
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              location: response.headers.location ?? '',
              headers: response.headers,
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

test(
  'signed-out requests answer as production does',
  {
    timeout: 120000,
  },
  async (t) => {
    const call = await startWorker(t, SYNTHETIC_SECRETS);
    for (const [path, returnUrl] of Object.entries(EXPECTED)) {
      const response = await call(path);
      assertCentralLoginRedirect(response, returnUrl);
      assertUncacheableWithoutCookies(response, path);
    }
    assert.equal((await call('/', 'unknown.example')).status, 404);
    assert.equal((await call('/', 'tuturuuu.com')).status, 404);
  }
);

test(
  'a client-sent forwarded host never reaches the login return target',
  {
    timeout: 120000,
  },
  async (t) => {
    const call = await startWorker(t, SYNTHETIC_SECRETS);
    // Cloudflare forwards a client-sent X-Forwarded-Host unchanged.
    for (const headers of [
      { 'x-forwarded-host': HOSTILE_HOST },
      { 'x-forwarded-host': HOSTILE_HOST, 'x-forwarded-proto': 'https' },
      { 'x-forwarded-host': `${HOSTILE_HOST}, ${ROOT_HOST}` },
    ]) {
      const response = await call('/', ROOT_HOST, headers);
      assertCentralLoginRedirect(response, EXPECTED['/']);
      assert.ok(!response.location.includes(HOSTILE_HOST), response.location);
      assertUncacheableWithoutCookies(response, '/');
    }
    // A hostile Host is not a configured host: the bridge rejects it.
    const hostile = await call('/', HOSTILE_HOST, {
      'x-forwarded-host': ROOT_HOST,
    });
    assert.equal(hostile.status, 404);
    assert.equal(hostile.location, '');
  }
);

test(
  'a Worker missing a required secret refuses to serve',
  {
    timeout: 120000,
  },
  async (t) => {
    const { SUPABASE_SECRET_KEY: _omitted, ...secrets } = SYNTHETIC_SECRETS;
    const call = await startWorker(t, secrets);
    assert.equal((await call('/')).status, 500);
  }
);
