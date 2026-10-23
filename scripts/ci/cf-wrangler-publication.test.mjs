import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { normalizeWranglerConfig } from './cf-worker-parity.mjs';
import { prepareWranglerPublication } from './cf-wrangler-publication.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'do-publish-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const declaration = {
    name: 'fixture-do',
    account_id: 'fixture-account',
    compatibility_date: '2026-09-28',
    workers_dev: true,
    preview_urls: true,
    observability: {
      enabled: true,
      head_sampling_rate: 0.05,
      logs: { enabled: true, head_sampling_rate: 0.05, invocation_logs: true },
    },
    durable_objects: { bindings: [{ name: 'OBJECT', class_name: 'Object' }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['Object'] }],
  };
  const worker = {
    name: declaration.name,
    compatibilityDate: declaration.compatibility_date,
    workersDev: true,
    previewUrls: true,
    observability: {
      enabled: true,
      headSamplingRate: 0.05,
      logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: true },
    },
    env: { OBJECT: { type: 'durable-object', exportName: 'Object' } },
    exports: { Object: { type: 'durable-object', storage: 'sqlite' } },
    manifest: {
      type: 'complete',
      mainModule: 'index.js',
      modules: { 'index.js': { type: 'esm' } },
    },
  };
  const output = join(root, '.cloudflare/output/v0');
  const bundle = join(output, 'workers/default/bundle');
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(bundle, 'index.js'), 'export default {};');
  writeFileSync(
    join(output, 'config.json'),
    JSON.stringify({
      accountId: 'fixture-account',
      buildContext: { mode: 'production', isPreview: false },
    })
  );
  const workerFile = join(output, 'workers/default/worker.config.json');
  writeFileSync(workerFile, JSON.stringify(worker));
  const baseline = join(root, 'baseline.json');
  writeFileSync(
    baseline,
    JSON.stringify({ identity: normalizeWranglerConfig(declaration) })
  );
  const config = join(root, 'wrangler.publish.jsonc');
  writeFileSync(config, JSON.stringify(declaration));
  const run = (account = 'fixture-account') =>
    prepareWranglerPublication(root, baseline, config, account);
  return {
    root,
    bundle,
    declaration,
    config,
    worker,
    workerFile,
    baseline,
    run,
  };
}

test('production Wrangler consumes the qualified bundle with unchanged v1 migrations', (t) => {
  const { root, bundle, declaration, run } = fixture(t);
  const output = run();
  const generated = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(
    resolve(root, '.cloudflare', generated.main),
    join(bundle, 'index.js')
  );
  assert.deepEqual(generated.migrations, declaration.migrations);
  assert.equal(generated.no_bundle, true);
  assert.equal(generated.find_additional_modules, true);
});

test('wrong account and changed migration history fail closed', (t) => {
  const { declaration, config, run } = fixture(t);
  assert.throws(() => run('other'), /deployment account/);
  declaration.migrations[0].tag = 'v2';
  writeFileSync(config, JSON.stringify(declaration));
  assert.throws(() => run(), /retain the applied v1/);
});

test('undeclared modules and escaped module symlinks fail closed', (t) => {
  const { root, bundle, run } = fixture(t);
  writeFileSync(join(bundle, 'extra.js'), 'extra');
  assert.throws(() => run(), /exactly the qualified modules/);
  rmSync(join(bundle, 'extra.js'));
  rmSync(join(bundle, 'index.js'));
  writeFileSync(join(root, 'outside.js'), 'outside');
  symlinkSync(join(root, 'outside.js'), join(bundle, 'index.js'));
  assert.throws(() => run(), /module escapes bundle/);
});

test('dangling Vite metadata symlinks fail closed', (t) => {
  const { root, bundle, run } = fixture(t);
  mkdirSync(join(bundle, '.vite'), { recursive: true });
  symlinkSync(
    join(root, 'missing-manifest.json'),
    join(bundle, '.vite/manifest.json')
  );
  assert.throws(() => run(), /metadata is symlinked/);
});

test('unsupported module formats cannot silently change the publisher', (t) => {
  const { worker, workerFile, run } = fixture(t);
  worker.manifest.modules['index.js'].type = 'wasm';
  writeFileSync(workerFile, JSON.stringify(worker));
  assert.throws(() => run(), /only ES modules/);
});

test('credential-free CLI prepares the artifact profile while deployment rejects an empty account', (t) => {
  const { root, baseline, config } = fixture(t);
  const script = new URL('./cf-wrangler-publication.mjs', import.meta.url);
  const run = (account) =>
    spawnSync(
      process.execPath,
      [script.pathname, root, baseline, config, ...account],
      { encoding: 'utf8' }
    );
  const qualified = run([]);
  assert.equal(qualified.status, 0, qualified.stderr);
  const rejected = run(['']);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /ACCOUNT_ID is required/);
});
