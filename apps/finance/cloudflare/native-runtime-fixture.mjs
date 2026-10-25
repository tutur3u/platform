import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNativeRuntimeConfig } from '../../../scripts/ci/apps-native-runtime-pointer.mjs';

export const app = await realpath(
  fileURLToPath(new URL('../', import.meta.url))
);
export const modes = [
  { origin: 'https://finance.tuturuuu.com', base: '' },
  { origin: 'https://tuturuuu.com', base: '/finance' },
];

export async function financeRuntime(t) {
  assert.equal(process.env.CI, 'true', 'Requires an emitted native build');
  const source = process.env.CI_SOURCE_SHA;
  assert.match(source ?? '', /^[a-f0-9]{40}$/);
  const { configPath, config } = readNativeRuntimeConfig(app);
  assert.equal(config.name, 'tuturuuu-finance-vite-staging');
  assert.equal(config.no_bundle, true);
  assert.equal(config.assets.run_worker_first, true);
  assert.equal(config.assets.not_found_handling, 'none');
  assert.deepEqual(config.vars, { TUTURUUU_NOINDEX: '1' });
  const scratch = await realpath(
    await mkdtemp(join(tmpdir(), 'finance-native-'))
  );
  let worker;
  t.after(async () => {
    try {
      await worker?.dispose();
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  });
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const registry = join(scratch, 'registry');
  await mkdir(registry, { mode: 0o700 });
  const central = [];
  const unexpected = [];
  const fixtureOrigin = 'https://finance-fixture.invalid';
  const plain = (value) => ({ type: 'plain_text', value });
  const secret = randomBytes(32).toString('hex');
  let operations = 0;
  const require = createRequire(join(app, 'package.json'));
  const sdk = require('wrangler');
  worker = await sdk.unstable_startWorker({
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    bindings: {
      INTERNAL_WEB_API_ORIGIN: plain(fixtureOrigin),
      NEXT_PUBLIC_SUPABASE_URL: plain(fixtureOrigin),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: plain('fixture-public-key'),
      SUPABASE_SECRET_KEY: { type: 'secret_text', value: secret },
      TUTURUUU_APP_COORDINATION_SECRET: { type: 'secret_text', value: secret },
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
        throw new Error('Provider authentication forbidden');
      },
      outboundService: async (request) => {
        const url = new URL(request.url);
        if (
          ++operations <= 100 &&
          url.origin === fixtureOrigin &&
          request.method === 'GET' &&
          url.pathname === '/api/workspaces/invitations'
        ) {
          central.push(url.pathname + url.search);
          const headers = new Headers();
          headers.append('Set-Cookie', 'fixture_first=1; Path=/');
          headers.append('Set-Cookie', 'fixture_second=2; Path=/');
          return new Response('reserved Web owner', { status: 202, headers });
        }
        unexpected.push({ method: request.method, url: request.url });
        return new Response('Unadmitted fixture egress', { status: 599 });
      },
    },
  });
  await worker.ready;
  let requests = 0;
  const fetch = (url, init = {}) => {
    assert.ok(++requests <= 600, 'Runtime request budget exceeded');
    return worker.fetch(url, { redirect: 'manual', signal: t.signal, ...init });
  };
  return { worker, source, fetch, central, unexpected, secret };
}
