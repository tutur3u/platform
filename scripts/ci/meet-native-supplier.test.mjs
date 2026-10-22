import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { meetFixture } from './meet-native-fixture.mjs';
import { admitSupplier, loadMeetSupplier } from './meet-native-graph.mjs';
import { meetChildEnvironment } from './meet-native-launcher.mjs';
import { fixtureBindings, SUPPLIER } from './meet-native-profile.mjs';
import { supplierReceipt } from './native-wrangler-evidence.mjs';

test('supplier receipt resolves MF from the owning Wrangler ancestry and never executes either entry', async (t) => {
  const f = await meetFixture(t);
  const wrangler = join(f.app, 'node_modules/wrangler');
  const mf = join(wrangler, 'node_modules/miniflare');
  const decoy = join(f.app, 'node_modules/miniflare');
  for (const path of [mf, decoy]) await mkdir(path, { recursive: true });
  for (const [path, name, version] of [
    [wrangler, 'wrangler', '4.151.2'],
    [mf, 'miniflare', '5.20261019.0-beta'],
    [decoy, 'miniflare', '4.0.0'],
  ]) {
    await writeFile(
      join(path, 'package.json'),
      JSON.stringify({ name, version, main: 'index.cjs' })
    );
    await writeFile(
      join(path, 'index.cjs'),
      `throw new Error('must not execute ${version}');`
    );
  }
  const receipt = await supplierReceipt(join(f.app, 'package.json'));
  assert.equal(receipt.cliPath, join(wrangler, 'index.cjs'));
  assert.equal(receipt.miniflarePath, join(mf, 'index.cjs'));
  assert.equal(receipt.summary.miniflareVersion, '5.20261019.0-beta');
  assert.throws(() => admitSupplier(receipt.summary), /Unreviewed/);
  const original = await readFile(join(mf, 'index.cjs'));
  await writeFile(
    join(mf, 'index.cjs'),
    Buffer.concat([original, Buffer.from('\n')])
  );
  const changed = await supplierReceipt(join(f.app, 'package.json'));
  assert.notEqual(
    changed.summary.miniflareSha256,
    receipt.summary.miniflareSha256
  );
  assert.equal(changed.summary.wranglerSha256, receipt.summary.wranglerSha256);
});

test('supplier requires both exact version/hash pins', () => {
  admitSupplier({ ...SUPPLIER });
  for (const key of Object.keys(SUPPLIER))
    assert.throws(() => admitSupplier({ ...SUPPLIER, [key]: 'unreviewed' }));
  const bindings = fixtureBindings(randomUUID() + randomUUID());
  assert.deepEqual(Object.keys(bindings).sort(), [
    'GOOGLE_GENERATIVE_AI_API_KEY',
    'MEET_REALTIME_TOKEN_SECRET',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
  ]);
  assert.equal(bindings.NEXT_PUBLIC_SUPABASE_URL.type, 'plain_text');
  assert.equal(bindings.SUPABASE_SECRET_KEY.type, 'secret_text');
});
test('supplier rejects either preload before execution and rechecks bytes and owner after load', async () => {
  const receipt = {
    cliPath: '/owner/wrangler/cli.js',
    miniflarePath: '/owner/wrangler/node_modules/miniflare/index.js',
    summary: { ...SUPPLIER },
  };
  for (const path of [receipt.cliPath, receipt.miniflarePath]) {
    let loaded = 0;
    const require = () => {
      loaded++;
    };
    require.cache = { [path]: {} };
    await assert.rejects(
      loadMeetSupplier('/owner/package.json', {
        receipt: async () => receipt,
        require: () => require,
      }),
      /Preloaded/
    );
    assert.equal(loaded, 0);
  }
  for (const mutate of [
    (r) => {
      r.summary.wranglerSha256 = 'b'.repeat(64);
    },
    (r) => {
      r.summary.miniflareSha256 = 'b'.repeat(64);
    },
    (r) => {
      r.miniflarePath = '/root-decoy/miniflare.js';
    },
    (r) => {
      r.cliPath = '/root-decoy/wrangler.js';
    },
  ]) {
    let reads = 0,
      loaded = 0;
    const require = (path) => {
      assert.equal(path, receipt.cliPath);
      loaded++;
      return { unstable_startWorker() {} };
    };
    require.cache = {};
    await assert.rejects(
      loadMeetSupplier('/owner/package.json', {
        receipt: async () => {
          const r = structuredClone(receipt);
          if (++reads === 2) mutate(r);
          return r;
        },
        require: () => require,
      })
    );
    assert.equal(loaded, 1);
    assert.equal(reads, 2);
  }
});
test('child environment drops all ambient credentials, overrides, telemetry and preloads', () => {
  const env = meetChildEnvironment(
    {
      PATH: '/bin',
      GITHUB_REF: 'refs/heads/production',
      CLOUDFLARE_API_TOKEN: 'never-copy',
      GOOGLE_API_KEY: 'never-copy',
      WRANGLER_REGISTRY_PATH: '/ambient',
      NODE_OPTIONS: '--import ambient',
    },
    {
      caseRoot: '/case',
      tempRoot: '/case/native-sdk-temp',
      planFile: '/case/plan',
      receiptFile: '/case/receipt',
      sourceSHA: 'a'.repeat(40),
    }
  );
  assert.ok(!JSON.stringify(env).includes('never-copy'));
  assert.ok(!Object.hasOwn(env, 'WRANGLER_REGISTRY_PATH'));
  assert.equal(env.NODE_OPTIONS, '');
  assert.equal(env.WRANGLER_SEND_METRICS, 'false');
  assert.equal(env.HOME, '/case/home');
});
