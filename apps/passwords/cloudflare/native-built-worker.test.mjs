import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

const app = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(join(app, 'package.json'));

async function stage() {
  const { configPath, config } = readNativeRuntimeConfig(app);
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'passwords-native-'))
  );
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });
  return {
    scratch,
    config,
    configPath: join(scratch, relative(app, configPath)),
    envFile,
    registry,
  };
}

async function launch(staged, enabled, network) {
  const { unstable_startWorker } = require('wrangler');
  const plain = (value) => ({ type: 'plain_text', value });
  const secret = randomBytes(32).toString('hex');
  const worker = await unstable_startWorker({
    config: staged.configPath,
    envFiles: [staged.envFile],
    sendMetrics: false,
    bindings: {
      PASSWORDS_ENABLED: plain(enabled),
      NEXT_PUBLIC_APP_URL: plain('https://passwords.tuturuuu.com'),
      NEXT_PUBLIC_WEB_APP_URL: plain('https://web.example.test'),
      NEXT_PUBLIC_SUPABASE_URL: plain('https://database.example.test'),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: plain('synthetic-public'),
      SUPABASE_SECRET_KEY: { type: 'secret_text', value: secret },
      TUTURUUU_APP_COORDINATION_SECRET: { type: 'secret_text', value: secret },
      ENCRYPTION_MASTER_KEY: { type: 'secret_text', value: secret },
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
      registry: staged.registry,
      server: { hostname: '127.0.0.1', port: 0 },
      origin: { hostname: 'passwords.tuturuuu.com', secure: true },
      inferOriginFromRoutes: false,
      routeRequestsByRoutes: false,
      auth: () => {
        throw new Error('Provider auth forbidden in Passwords fixture');
      },
      outboundService: async () => {
        network.calls += 1;
        return new Response('Forbidden', { status: 599 });
      },
    },
  });
  await worker.ready;
  const url = await worker.url;
  assert.equal(url.hostname, '127.0.0.1');
  return { worker, origin: url.origin };
}

function guarded(response) {
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
}

test('emitted Passwords Worker stops vault and auth work across restart', {
  timeout: 90000,
}, async (t) => {
  assert.equal(
    process.env.CI,
    'true',
    'Requires the exact owning native build'
  );
  assert.match(process.env.CI_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/);
  const staged = await stage();
  t.after(() => rm(staged.scratch, { recursive: true, force: true }));
  assert.equal(staged.config.name, 'tuturuuu-passwords');
  assert.equal(staged.config.no_bundle, true);
  assert.equal(staged.config.vars.PASSWORDS_ENABLED, 'false');
  assert.equal(staged.config.assets.run_worker_first, true);
  assert.equal(staged.config.assets.not_found_handling, 'none');
  for (const name of ['favicon.ico', 'site.webmanifest'])
    assert.deepEqual(
      await readFile(join(app, 'dist/client', name)),
      await readFile(join(app, 'public', name))
    );

  for (const enabled of ['false', 'true', 'false']) {
    const network = { calls: 0 };
    const { worker } = await launch(staged, enabled, network);
    const origin = 'https://passwords.tuturuuu.com';
    try {
      if (enabled === 'true') {
        const response = await worker.fetch(`${origin}/en/personal`, {
          headers: { Accept: 'text/html' },
          redirect: 'manual',
        });
        guarded(response);
        assert.equal(response.status, 303);
        const location = new URL(response.headers.get('location'));
        assert.equal(location.origin, 'https://web.example.test');
        assert.equal(location.pathname, '/en/login');
        assert.match(
          response.headers.get('set-cookie') ?? '',
          /__Host-passwords_login=/
        );
      } else {
        for (const path of [
          '/en/personal',
          '/vi/personal',
          '/api/auth/step-up?next=%2Fen%2Fpersonal',
          '/api/v1/secrets/operation',
          '/_passwords/functions/unknown',
        ]) {
          for (const method of ['GET', 'POST']) {
            const response = await worker.fetch(origin + path, {
              method,
              redirect: 'manual',
            });
            guarded(response);
            assert.equal(response.status, 503);
            assert.deepEqual(await response.json(), { code: 'STOPPED' });
          }
        }
        const manifest = await worker.fetch(`${origin}/site.webmanifest`);
        assert.equal(manifest.status, 200);
        assert.equal((await manifest.json()).name, 'Tuturuuu Passwords');
        const info = await worker.fetch(`${origin}/api/build-info`);
        assert.equal(info.status, 200);
        const identity = await info.json();
        assert.equal(identity.appName, 'passwords');
        assert.equal(identity.commitHash, process.env.CI_SOURCE_SHA);
      }
      assert.equal(
        network.calls,
        0,
        'Stopped and unauthenticated requests must make zero external calls'
      );
    } finally {
      await worker.dispose();
    }
  }
});
