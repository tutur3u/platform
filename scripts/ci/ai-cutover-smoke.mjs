import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { readNativeRuntimeConfig } from './apps-native-runtime-pointer.mjs';

const app = resolve('apps/ai');
const { configPath, config } = readNativeRuntimeConfig(app);
assert.equal(config.workers_dev, false);
assert.equal(config.preview_urls, false);
const profile = process.env.VITE_AI_NATIVE_PROFILE || 'staging';
const host =
  'ai.' +
  (profile === 'production' || 'ai' !== 'finance'
    ? 'tuturuuu.com'
    : 'tutur3u.com');
const scratch = await mkdtemp(join(tmpdir(), 'ai-cutover-'));
const sdk = createRequire(join(app, 'package.json'))('wrangler');
let worker;
try {
  await cp(join(app, 'dist'), join(scratch, 'dist'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const envFile = join(scratch, 'synthetic.env');
  await writeFile(envFile, '', { flag: 'wx', mode: 0o600 });
  const secret = randomBytes(32).toString('hex');
  const plain = (value) => ({ type: 'plain_text', value });
  const bindings = {
    NEXT_PUBLIC_SUPABASE_URL: plain('https://fixture.supabase.invalid'),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: plain('sb_publishable_fixture'),
    TUTURUUU_APP_COORDINATION_SECRET: { type: 'secret_text', value: secret },
    SUPABASE_SECRET_KEY: { type: 'secret_text', value: secret },
  };
  const options = {
    config: join(scratch, relative(app, configPath)),
    envFiles: [envFile],
    sendMetrics: false,
    build: { bundle: false, processEntrypoint: false },
    dev: {
      remote: false,
      watch: false,
      persist: false,
      inspector: false,
      liveReload: false,
      generateTypes: false,
      enableContainers: false,
      registry: join(scratch, 'registry'),
      server: { hostname: '127.0.0.1', port: 0 },
      inferOriginFromRoutes: false,
      routeRequestsByRoutes: false,
      auth: () => {
        throw new Error('Provider authentication forbidden');
      },
      outboundService: () =>
        new Response('Synthetic upstream denied', { status: 401 }),
    },
  };
  for (const missing of [
    'TUTURUUU_APP_COORDINATION_SECRET',
    'SUPABASE_SECRET_KEY',
  ]) {
    const incomplete = { ...bindings };
    delete incomplete[missing];
    let refused = false;
    try {
      worker = await sdk.unstable_startWorker({
        ...options,
        bindings: incomplete,
      });
      await worker.ready;
    } catch {
      refused = true;
    } finally {
      await worker?.dispose();
      worker = undefined;
    }
    assert.equal(refused, true, `Worker must refuse missing ${missing}`);
  }
  worker = await sdk.unstable_startWorker({ ...options, bindings });
  await worker.ready;
  const response = await worker.fetch(`https://${host}/`, {
    redirect: 'manual',
  });
  assert.ok(
    [301, 302, 303, 307, 308].includes(response.status),
    'Anonymous root must redirect'
  );
  assert.equal(
    new URL(response.headers.get('location'), `https://${host}`).pathname,
    '/login'
  );
  const unknown = await worker.fetch('https://unknown.invalid/', {
    redirect: 'manual',
  });
  assert.equal(unknown.status, 404, 'Unknown host must be rejected');
  console.log(
    'ai emitted smoke passed: anonymous / redirects to /login; unknown host and missing secrets refused'
  );
} finally {
  await worker?.dispose();
  await rm(scratch, { recursive: true, force: true });
}
