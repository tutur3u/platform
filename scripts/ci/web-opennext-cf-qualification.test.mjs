import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  globSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readJsonc } from './gateway-deploy-config.mjs';
import { qualifyFamilyOutput } from './web-opennext-cf-qualification.mjs';

const configDir = fileURLToPath(
  new URL('../../apps/web/cloudflare/opennext/', import.meta.url)
);
const [configName] = globSync('*.api-identity.jsonc', { cwd: configDir });
const configSource = join(configDir, configName);
const publisher = new URL('./void-cf-publisher.mjs', import.meta.url);
const bundlePrefix = '.cloudflare/output/v0/workers/default';

async function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'web-family-cf-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, content) => {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  const source = readJsonc(configSource);
  const configPath = put(
    'cloudflare/opennext/worker.jsonc',
    readFileSync(configSource)
  );
  const sourceSha = 'a'.repeat(40);
  const worker = 'export default {fetch: () => new Response("ok")};';
  const map = '{"version":3,"sources":["original.ts"],"mappings":""}';
  const form = new FormData();
  form.set('metadata', JSON.stringify({ main_module: 'worker.js' }));
  form.set(
    'worker.js',
    new File([worker], 'worker.js', { type: 'application/javascript+module' })
  );
  form.set(
    'worker.js.map',
    new File([map], 'worker.js.map', { type: 'application/source-map' })
  );
  const saveUpload = async () =>
    put(
      'upload.multipart',
      Buffer.from(await new Response(form).arrayBuffer())
    );
  const uploadFile = await saveUpload();
  put('.open-next/assets/static.txt', 'public bytes');
  put('.open-next/assets/.assetsignore', 'ignored.txt');
  put('.open-next/assets/ignored.txt', 'ignored bytes');
  return {
    put,
    source,
    form,
    saveUpload,
    worker,
    map,
    options: {
      configPath,
      sourceSha,
      accountId: source.account_id,
      worker: source.name,
      uploadFile,
      destination: join(root, 'output'),
      vars: { PLATFORM_BUILD_COMMIT_HASH: sourceSha },
    },
  };
}

test('qualifies the exact module and asset bytes with the pinned cf CLI', async (t) => {
  const { options, worker: sourceWorker, map } = await fixture(t);
  const receipt = await qualifyFamilyOutput(options);
  assert.equal(receipt.sourceSha, options.sourceSha);
  assert.equal(receipt.migrationTag, null);
  assert.equal(receipt.worker, options.worker);
  const worker = receipt.workerConfig;
  assert.equal(worker.workersDev, false);
  assert.equal(worker.previewUrls, false);
  assert.equal(worker.limits.cpuMs, 30000);
  assert.equal(worker.env.WORKER_SELF_REFERENCE.worker, options.worker);
  assert.equal(worker.env.ABUSE_GUARD.exportName, 'AbuseGuardEntrypoint');
  assert.equal(worker.env.SUPABASE_SECRET_KEY.type, 'secret');
  assert.equal(worker.env.PLATFORM_BUILD_COMMIT_HASH.value, options.sourceSha);
  assert.deepEqual(
    readFileSync(
      join(options.destination, bundlePrefix, 'bundle/worker.js'),
      'utf8'
    ),
    sourceWorker
  );
  assert.equal(worker.manifest.modules['worker.js.map'].type, 'sourcemap');
  assert.equal(
    readFileSync(
      join(options.destination, bundlePrefix, 'bundle/worker.js.map'),
      'utf8'
    ),
    map
  );
  assert.deepEqual(
    Object.keys(receipt.files).filter((file) => file.includes('/assets/')),
    [`${bundlePrefix}/assets/static.txt`]
  );
  const result = execFileSync(
    process.execPath,
    [fileURLToPath(publisher), 'dry-run', '--build', options.destination],
    { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 30_000 }
  );
  assert.equal(JSON.parse(result).dryRun, true);
});

test('rejects a different account or a public route before conversion', async (t) => {
  const { options, put, source } = await fixture(t);
  await assert.rejects(
    qualifyFamilyOutput({ ...options, accountId: '0'.repeat(32) }),
    /unexpected family account/u
  );
  put(
    'cloudflare/opennext/worker.jsonc',
    JSON.stringify({ ...source, routes: ['example.com/*'] })
  );
  await assert.rejects(qualifyFamilyOutput(options), /must be route-free/u);
});

test('rejects unexpected modules instead of silently dropping them', async (t) => {
  const { options, form, saveUpload } = await fixture(t);
  form.set(
    'unmapped.module',
    new File(['bytes'], 'unmapped.module', { type: 'text/plain' })
  );
  await saveUpload();
  await assert.rejects(
    qualifyFamilyOutput(options),
    /family upload inventory differs/u
  );
});

test('rejects upload parts that escape the bundle directory', async (t) => {
  const { options, form, saveUpload } = await fixture(t);
  form.set(
    '../escape.js',
    new File(['bytes'], 'escape.js', {
      type: 'application/javascript+module',
    })
  );
  await saveUpload();
  await assert.rejects(
    qualifyFamilyOutput(options),
    /unsafe family module path/u
  );
});
