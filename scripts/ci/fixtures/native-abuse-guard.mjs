import { disposeNativeWorker } from './native-worker-receipt.mjs';
import assert from 'node:assert/strict';
import { randomBytes, createHash, createHmac } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const guardRoot = fileURLToPath(
  new URL('../../../apps/abuse-guard/', import.meta.url)
);
const require = createRequire(join(guardRoot, 'package.json'));

// The first-party SQLite backend runs in an isolated registry, never a remote service.
export async function startNativeAbuseGuard(t, sdk, registry) {
  const scratch = await mkdtemp(join(tmpdir(), 'native-guard-'));
  t.after(() => rm(scratch, { recursive: true, force: true }));
  const secret = randomBytes(32).toString('hex');
  const operator = randomBytes(32).toString('hex');
  const { build } = require('esbuild');
  await build({
    entryPoints: [join(guardRoot, 'src/worker.ts')],
    outfile: join(scratch, 'worker.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    mainFields: ['module', 'main'],
    conditions: ['workerd', 'worker', 'import'],
    external: ['cloudflare:*'],
    logLevel: 'silent',
  });
  if (process.env.NATIVE_RUNTIME_RECEIPT_DIR) {
    await mkdir(process.env.NATIVE_RUNTIME_RECEIPT_DIR, { recursive: true });
    await writeFile(
      join(
        process.env.NATIVE_RUNTIME_RECEIPT_DIR,
        `guard-${process.pid}-${Date.now()}.json`
      ),
      JSON.stringify({
        source: 'apps/abuse-guard/src/worker.ts',
        artifactHash: createHash('sha256')
          .update(await readFile(join(scratch, 'worker.mjs')))
          .digest('hex'),
        compatibilityDate: '2026-09-28',
      })
    );
  }
  const config = join(scratch, 'wrangler.json');
  await writeFile(
    config,
    JSON.stringify({
      name: 'tuturuuu-abuse-guard',
      main: './worker.mjs',
      compatibility_date: '2026-09-28',
      workers_dev: false,
      preview_urls: false,
      durable_objects: {
        bindings: [
          { name: 'GUARD_SUBJECT', class_name: 'GuardSubject' },
          { name: 'GUARD_CONTROL', class_name: 'GuardControl' },
        ],
      },
      migrations: [
        {
          tag: 'fixture-v1',
          new_sqlite_classes: ['GuardSubject', 'GuardControl'],
        },
      ],
    })
  );
  const envFile = join(scratch, 'empty.env');
  await writeFile(envFile, '', { mode: 0o600 });
  const worker = await sdk.unstable_startWorker({
    config,
    envFiles: [envFile],
    sendMetrics: false,
    bindings: Object.fromEntries(
      Object.entries({
        ABUSE_GUARD_SECRETS: secret,
        ABUSE_GUARD_OPERATOR_TOKEN: operator,
        ABUSE_GUARD_CONTROL_CACHE_MS: '0',
        ABUSE_GUARD_DAILY_OP_BUDGET: '1000',
      }).map(([name, value]) => [name, { type: 'secret_text', value }])
    ),
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
      auth() {
        throw new Error('Provider authentication forbidden');
      },
      outboundService() {
        throw new Error('Guard egress forbidden');
      },
    },
  });
  t.after(() => disposeNativeWorker(worker));
  await worker.ready;
  const origin = await worker.url;
  const rpc = async (payload, key = secret) => {
    const body = JSON.stringify(payload);
    const timestamp = String(Date.now());
    const hash = createHash('sha256').update(body).digest('base64url');
    const signature = createHmac('sha256', key)
      .update(`${timestamp}\nPOST /v1/rpc\n${hash}`)
      .digest('base64url');
    return fetch(new URL('/v1/rpc', origin), {
      method: 'POST',
      body,
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        'x-guard-ts': timestamp,
        'x-guard-sig': signature,
      },
    });
  };
  const digest = () => randomBytes(32).toString('base64url');
  const partition = digest();
  const k = digest();
  const request = () => ({
    v: 1,
    id: digest(),
    family: 'proxy',
    steps: [
      {
        p: partition,
        cmds: [
          {
            op: 'win.hit',
            windows: [{ k, limit: 1, windowMs: 60000, algo: 'fixed' }],
          },
        ],
      },
    ],
  });
  assert.equal(
    (await rpc(request(), randomBytes(32).toString('hex'))).status,
    401,
    'foreign caller denied'
  );
  const first = await rpc(request());
  assert.equal(first.status, 200);
  assert.equal(
    (await first.json()).steps[0].results[0].ok,
    true,
    'quota admitted'
  );
  const second = await rpc(request());
  assert.equal(second.status, 200);
  assert.equal(
    (await second.json()).steps[0].results[0].ok,
    false,
    'quota refused'
  );
  assert.equal(
    (await rpc({ ...request(), family: 'foreign' })).status,
    400,
    'invalid family denied'
  );
  const control = async (path, token = operator) =>
    fetch(new URL(`/control/${path}`, origin), {
      method: 'POST',
      redirect: 'manual',
      headers: { authorization: `Bearer ${token}` },
    });
  assert.equal(
    (await control('stop', secret)).status,
    401,
    'foreign operator denied'
  );
  assert.equal((await control('stop')).status, 200);
  assert.equal(
    (await rpc(request())).status,
    503,
    'durable stop fence refuses work'
  );
  assert.equal((await control('resume')).status, 200);

  return {
    ABUSE_GUARD: {
      type: 'service',
      service: 'tuturuuu-abuse-guard',
      entrypoint: 'AbuseGuardEntrypoint',
    },
    ABUSE_GUARD_KEY_PEPPER: {
      type: 'secret_text',
      value: randomBytes(32).toString('hex'),
    },
    ABUSE_GUARD_FAMILIES: { type: 'plain_text', value: 'proxy' },
  };
}
