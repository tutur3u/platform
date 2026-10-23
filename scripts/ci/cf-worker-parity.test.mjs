import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  normalizeCfConfig,
  normalizeWranglerConfig,
  parseJsonc,
} from './cf-worker-parity.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = join(REPO_ROOT, 'scripts/ci/fixtures/cf-worker-parity');

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
      assert.deepEqual(normalizeWranglerConfig(raw), baseline.identity);
      return;
    }
    const { default: config } = await import(pathToFileURL(cfConfig).href);
    const resolved =
      typeof config === 'function'
        ? await config({ mode: 'production', isPreview: false })
        : await config;
    assert.deepEqual(normalizeCfConfig(resolved), baseline.identity);
  });
}
