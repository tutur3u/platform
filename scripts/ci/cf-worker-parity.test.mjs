import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertBuildOutputParity,
  normalizeCfConfig as normalizeCfRaw,
  normalizeWranglerConfig as normalizeWranglerRaw,
  parseJsonc,
  readBuildOutputConfig,
} from './cf-worker-parity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = join(REPO_ROOT, 'scripts/ci/fixtures/cf-worker-parity');

const observability = {
  enabled: true,
  headSamplingRate: 0.05,
  logs: { enabled: true, headSamplingRate: 0.05, invocationLogs: true },
};
const legacyObservability = {
  enabled: true,
  head_sampling_rate: 0.05,
  logs: { enabled: true, head_sampling_rate: 0.05, invocation_logs: true },
};
const normalizeCfConfig = (config) =>
  normalizeCfRaw({
    ...config,
    worker: {
      previewUrls: true,
      ...config.worker,
      observability: {
        ...observability,
        ...config.worker?.observability,
        logs: { ...observability.logs, ...config.worker?.observability?.logs },
      },
    },
  });
const normalizeWranglerConfig = (raw) =>
  normalizeWranglerRaw({
    preview_urls: true,
    ...raw,
    observability: {
      ...legacyObservability,
      ...raw.observability,
      logs: { ...legacyObservability.logs, ...raw.observability?.logs },
    },
  });

test('effective runtime settings must be explicitly pinned', () => {
  assert.throws(() => normalizeCfRaw({ worker: {} }), /pin preview/);
  assert.throws(() => normalizeWranglerRaw({}), /pin preview/);
  assert.throws(
    () => normalizeCfRaw({ worker: { previewUrls: true } }),
    /pin observability/
  );
  assert.throws(
    () =>
      normalizeCfRaw({
        worker: {
          previewUrls: true,
          observability: { enabled: true, headSamplingRate: 0.05 },
        },
      }),
    /pin observability.logs/
  );
});

test('unknown source class in a rename is rejected', () => {
  assert.throws(
    () =>
      normalizeWranglerConfig({
        migrations: [
          { tag: 'v1', renamed_classes: [{ from: 'Missing', to: 'Target' }] },
        ],
      }),
    /missing source class Missing/
  );
});

test('Build Output permits only the default Worker and pins deployment account', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'cf-parity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, '.cloudflare/output/v0');
  mkdirSync(join(output, 'workers/default'), { recursive: true });
  const rootConfig = {
    accountId: 'fixture-account',
    buildContext: { mode: 'production', isPreview: false },
  };
  const worker = {
    name: 'fixture',
    previewUrls: true,
    observability,
    manifest: { type: 'complete', mainModule: 'index.js', modules: {} },
  };
  writeFileSync(join(output, 'config.json'), JSON.stringify(rootConfig));
  writeFileSync(
    join(output, 'workers/default/worker.config.json'),
    JSON.stringify(worker)
  );
  const baseline = join(root, 'baseline.json');
  writeFileSync(
    baseline,
    JSON.stringify({ identity: normalizeCfRaw({ ...rootConfig, worker }) })
  );
  assertBuildOutputParity(root, baseline, 'fixture-account');
  assert.throws(
    () => assertBuildOutputParity(root, baseline, 'wrong-account'),
    /deployment account/
  );
  assert.throws(
    () => assertBuildOutputParity(root, baseline, ''),
    /ACCOUNT_ID is required/
  );
  mkdirSync(join(output, 'workers/extra'));
  assert.throws(() => readBuildOutputConfig(root), /only the default Worker/);
});

test('unmapped settings stay visible so they fail parity', () => {
  const wrangler = normalizeWranglerConfig({
    name: 'w',
    main: 'src/worker.ts',
    kv_namespaces: [{ binding: 'KV', id: 'x' }],
    upload_source_maps: true,
    secrets: { required: ['A'], other: true },
    triggers: { crons: ['* * * * *'], extra: 1 },
    routes: [
      { pattern: 'a.example.com/*', zone_name: 'example.com', zone_id: 'z' },
    ],
  });
  assert.deepEqual(Object.keys(wrangler.unmapped), [
    'kv_namespaces',
    'secrets',
    'triggers',
  ]);
  assert.equal(wrangler.sourceMaps, true);
  assert.deepEqual(wrangler.routes, [
    { pattern: 'a.example.com/*', zone: 'example.com', extra: { zoneId: 'z' } },
  ]);
  const cf = normalizeCfConfig({
    worker: {
      name: 'w',
      entrypoint: 'src/worker.ts',
      env: {
        KV: { type: 'kv', id: 'x' },
        S: { type: 'secret', extra: true },
      },
      placement: { region: 'aws:ap-southeast-1' },
      triggers: [
        { type: 'queue', name: 'a' },
        { type: 'queue', name: 'b' },
      ],
      exports: {
        Box: { type: 'durable-object', storage: 'sqlite', container: {} },
        Moved: {
          type: 'durable-object',
          state: 'transferred',
          transferredTo: 'x',
        },
      },
      manifest: { modules: { 'index.js.map': { type: 'sourcemap' } } },
    },
  });
  assert.deepEqual(Object.keys(cf.unmapped), [
    'env.KV',
    'env.S',
    'exports.Box',
    'exports.Moved',
    'placement',
    'triggers.queue',
  ]);
  assert.equal(cf.unmapped['triggers.queue'].length, 2, 'repeats accumulate');
  assert.equal(cf.sourceMaps, true);
});

test('observability, domains and zones compare whole', () => {
  const wrangler = normalizeWranglerConfig({
    observability: {
      enabled: true,
      head_sampling_rate: 0.1,
      logs: { invocation_logs: false },
    },
    routes: [
      {
        pattern: 'app.example.com',
        custom_domain: true,
        zone_name: 'example.com',
      },
    ],
  });
  const cf = normalizeCfConfig({
    worker: {
      observability: {
        enabled: true,
        headSamplingRate: 0.1,
        logs: { invocationLogs: false },
      },
      domains: [{ hostname: 'app.example.com', zone: 'example.com' }],
    },
  });
  assert.deepEqual(cf, wrangler);
  const other = normalizeCfConfig({
    worker: {
      observability: { enabled: true, headSamplingRate: 0.1 },
      domains: ['app.example.com'],
    },
  });
  assert.notDeepEqual(other, wrangler);
});

test('each nested setting and zone change independently fails identity parity', () => {
  const config = {
    worker: {
      observability: { enabled: true, logs: { invocationLogs: false } },
      domains: [{ hostname: 'app.example.com', zone: 'example.com' }],
      env: { BOX: { type: 'durable-object', exportName: 'Box' } },
      exports: { Box: { type: 'durable-object', storage: 'sqlite' } },
    },
  };
  const identity = normalizeCfConfig(config);
  for (const mutate of [
    (worker) => {
      worker.observability.logs.invocationLogs = true;
    },
    (worker) => {
      worker.domains[0].zone = 'other.example';
    },
    (worker) => {
      worker.env.BOX.environment = 'other';
    },
    (worker) => {
      worker.exports.Box.container = { maxInstances: 1 };
    },
  ]) {
    const changed = structuredClone(config);
    mutate(changed.worker);
    assert.notDeepEqual(normalizeCfConfig(changed), identity);
  }
  const raw = {
    routes: [
      {
        pattern: 'app.example.com/*',
        zone_name: 'example.com',
        zone_id: 'one',
      },
    ],
  };
  const changed = structuredClone(raw);
  changed.routes[0].zone_id = 'two';
  assert.notDeepEqual(
    normalizeWranglerConfig(changed),
    normalizeWranglerConfig(raw)
  );
});

test('JSONC configuration parses with comments and trailing commas', () => {
  assert.deepEqual(
    parseJsonc('{\n  // c\n  "a": "x//y", /* b */ "b": [1, 2,],\n}'),
    { a: 'x//y', b: [1, 2] }
  );
});

test('Durable Object migrations fold into live storage classes', () => {
  const identity = normalizeWranglerConfig({
    migrations: [
      { tag: 'v1', new_sqlite_classes: ['A', 'B'], new_classes: ['K'] },
      { tag: 'v2', renamed_classes: [{ from: 'B', to: 'C' }] },
      { tag: 'v3', deleted_classes: ['K'] },
    ],
  });
  assert.deepEqual(identity.durableObjectClasses, { A: 'sqlite', C: 'sqlite' });
  assert.throws(
    () => normalizeWranglerConfig({ migrations: [{ tag: 'x', other: [] }] }),
    /unsupported Durable Object migration/
  );
  const cf = normalizeCfConfig({
    worker: {
      name: 'w',
      exports: {
        A: { type: 'durable-object', storage: 'sqlite' },
        B: { type: 'durable-object', state: 'renamed', renamedTo: 'C' },
        C: { type: 'durable-object', storage: 'sqlite' },
        K: { type: 'durable-object', state: 'deleted' },
      },
    },
  });
  assert.deepEqual(cf.durableObjectClasses, { A: 'sqlite', C: 'sqlite' });
  const dangling = normalizeCfConfig({
    worker: {
      exports: {
        B: { type: 'durable-object', state: 'renamed', renamedTo: 'Missing' },
      },
    },
  });
  assert.deepEqual(dangling.unmapped, {
    'exports.B': [{ renamedTo: 'Missing' }],
  });
});

test('bindings map to the same identity in both shapes', () => {
  const wrangler = normalizeWranglerConfig({
    name: 'w',
    vars: { ORIGIN: 'https://example.com' },
    secrets: { required: ['B', 'A'] },
    durable_objects: {
      bindings: [
        { name: 'LOCAL', class_name: 'Local' },
        { name: 'REMOTE', class_name: 'Remote', script_name: 'other' },
      ],
    },
    triggers: { crons: ['*/5 * * * *'] },
  });
  const cf = normalizeCfConfig({
    worker: {
      name: 'w',
      triggers: [{ type: 'scheduled', schedule: '*/5 * * * *' }],
      env: {
        ORIGIN: { type: 'text', value: 'https://example.com' },
        A: { type: 'secret' },
        B: { type: 'secret' },
        LOCAL: { type: 'durable-object', exportName: 'Local', worker: 'w' },
        REMOTE: {
          type: 'durable-object',
          exportName: 'Remote',
          worker: 'other',
        },
      },
    },
  });
  assert.deepEqual(cf, wrangler);
  assert.equal(cf.durableObjects.LOCAL.scriptName, undefined);
  assert.equal(cf.durableObjects.REMOTE.scriptName, 'other');
});

// Each baseline was normalized from the service's final wrangler.jsonc. Until a
// service migrates, that file must still match; afterwards cloudflare.config.ts
// must. CI separately compares the emitted Build Output after the build.
for (const fixture of readdirSync(FIXTURES).filter((f) =>
  f.endsWith('.json')
)) {
  const app = fixture.replace(/\.json$/, '');
  test(`${app} configuration matches its deployment-identity baseline`, async () => {
    const baseline = JSON.parse(readFileSync(join(FIXTURES, fixture), 'utf8'));
    const appDir = join(REPO_ROOT, 'apps', app);
    const cfConfig = join(appDir, 'cloudflare.config.ts');
    const wranglerConfig = join(appDir, 'wrangler.jsonc');
    assert.ok(
      existsSync(cfConfig) !== existsSync(wranglerConfig),
      `${app} must have exactly one authoritative Worker configuration`
    );
    if (existsSync(wranglerConfig)) {
      const raw = parseJsonc(readFileSync(wranglerConfig, 'utf8'));
      assert.deepEqual(normalizeWranglerRaw(raw), baseline.identity);
      return;
    }
    const { default: config } = await import(pathToFileURL(cfConfig).href);
    const resolved =
      typeof config === 'function'
        ? await config({ mode: 'production', isPreview: false })
        : await config;
    assert.deepEqual(normalizeCfRaw(resolved), baseline.identity);
  });
}
