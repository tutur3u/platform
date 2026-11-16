import {
  offlineEgressFence,
  recordNativeWorker,
  disposeNativeWorker,
} from '../../../scripts/ci/fixtures/native-worker-receipt.mjs';
import { SYNTHETIC_SECRETS } from './synthetic-bindings.mjs';
import { startNativeAbuseGuard } from '../../../scripts/ci/fixtures/native-abuse-guard.mjs';
import assert from 'node:assert/strict';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
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
const { deploymentProfile } = await import('./deployment-profile.ts');
const PROFILE = deploymentProfile();
// The production profile serves the apex mount; its legacy host only moves
// visitors there with a path-preserving 307.
const MOUNTED = PROFILE.basePath === '/mind';
const ROOT_HOST = 'mind.tuturuuu.com';
const APEX = 'tuturuuu.com';
const EXPECTED = {
  '/': { redirect: '/login' },
  '/login': { redirect: 'https://tuturuuu.com/login' },
};
// Production: the legacy host answers 307 to the fixed apex mount.
const LEGACY_EXPECTED = {
  '/': 'https://tuturuuu.com/mind',
  '/login': 'https://tuturuuu.com/mind/login',
  '/boards?a=1&a=2&b=%20x': 'https://tuturuuu.com/mind/boards?a=1&a=2&b=%20x',
  '//evil.example/x': 'https://tuturuuu.com/mind/evil.example/x',
  '/%2F%2Fevil.example?next=//evil.example':
    'https://tuturuuu.com/mind/%2F%2Fevil.example?next=//evil.example',
};

async function startWorker(t, secrets) {
  const { configPath } = readNativeRuntimeConfig(app);
  const scratch = await realpath(await mkdtemp(join(tmpdir(), 'mind-smoke-')));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });
  const sdk = require('wrangler');
  const guardBindings = await startNativeAbuseGuard(t, sdk, registry);
  const worker = await sdk.unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    bindings: {
      ...guardBindings,
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
      outboundService: offlineEgressFence(),
    },
  });
  t.after(() => disposeNativeWorker(worker));
  await worker.ready;
  await recordNativeWorker(worker, app);
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
              cacheControl: response.headers['cache-control'] ?? '',
              setCookie: response.headers['set-cookie'] ?? [],
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

test('the emitted server has NODE_ENV inlined', async () => {
  await assertServerArtifact(join(app, 'dist/server'));
});

test(
  'signed-out requests answer as production does',
  {
    timeout: 120000,
  },
  async (t) => {
    const call = await startWorker(t, SYNTHETIC_SECRETS);
    const { config } = readNativeRuntimeConfig(app);
    assert.equal(config.name, PROFILE.name, 'artifact and profile disagree');
    if (MOUNTED) {
      for (const [path, location] of Object.entries(LEGACY_EXPECTED)) {
        const response = await call(path);
        assert.equal(response.status, 307, path);
        assert.equal(response.location, location, path);
        assert.equal(response.cacheControl, 'private, no-store', path);
        assert.deepEqual(response.setCookie, [], path);
      }
      // The apex mount itself answers a signed-out visitor with its login.
      const mounted = await call('/mind', APEX);
      assert.ok(
        mounted.status >= 300 && mounted.status < 400,
        `/mind: ${mounted.status}`
      );
      const login = new URL(mounted.location, `https://${APEX}`);
      assert.equal(login.host, APEX, '/mind');
      assert.equal(login.pathname, '/mind/login', '/mind');
      assert.equal((await call('/', 'unknown.example')).status, 404);
      assert.equal((await call('/', APEX)).status, 404);
      return;
    }
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

for (const name of ['ABUSE_GUARD_KEY_PEPPER', 'ABUSE_GUARD_FAMILIES']) {
  test(
    `a Worker with blank ${name} refuses to serve`,
    { timeout: 120000 },
    async (t) => {
      const call = await startWorker(t, { ...SYNTHETIC_SECRETS, [name]: '' });
      assert.equal((await call('/')).status, 500);
    }
  );
}
