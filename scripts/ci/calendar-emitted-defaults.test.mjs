import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import {
  checkNormalization,
  EMITTED_DEFAULTS,
} from './calendar-emitted-defaults.mjs';
import {
  manifest,
  validateOutput,
  verify,
} from './calendar-native-artifact.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = 'a'.repeat(40);
const provenance = () => ({
  schema: 1,
  profile: 'void-1.1.12/plugin-1.64.0/wrangler-4.151.0/jsonc-3.3.1',
  inputPath: '/historical/build/apps/calendar/.void-wrangler.jsonc',
  inputHash: 'b'.repeat(64),
  platform: 'non-windows',
});
const normalized = (proof = provenance()) => ({
  ...structuredClone(EMITTED_DEFAULTS),
  configPath: proof.inputPath,
  userConfigPath: proof.inputPath,
  topLevelName: 'tuturuuu-calendar',
  definedEnvironments: [],
  dev: {
    ip: 'localhost',
    local_protocol: 'http',
    upstream_protocol: 'http',
    enable_containers: true,
    generate_types: false,
  },
});

test('exact normalized values and supported platform values', () => {
  const proof = provenance();
  checkNormalization(normalized(), proof);
  proof.platform = 'win32';
  const config = normalized(proof);
  config.dev.ip = '127.0.0.1';
  checkNormalization(config, proof);
});

test('wrong types, opposite values and nested resource extras fail', () => {
  const cases = [
    ['jsx_factory', 'React.h'],
    ['jsx_fragment', false],
    ['upload_source_maps', false],
    ['upload_source_maps', 'true'],
    ['queues', { producers: [], consumers: [], extra: [] }],
    ['queues', { producers: [{}], consumers: [] }],
    ['queues', { producers: [], consumers: [{}] }],
    ['durable_objects', { bindings: [], extra: [] }],
    ['logfwdr', { bindings: [{}] }],
    ['python_modules', { exclude: ['**/*.py'] }],
    ['dev', { ...normalized().dev, generate_types: true }],
    ['dev', { ...normalized().dev, ip: '127.0.0.1' }],
    ['dev', { ...normalized().dev, extra: false }],
    ['definedEnvironments', ['preview']],
    ['topLevelName', 'other'],
    ['configPath', '/unrelated/.void-wrangler.jsonc'],
    ['userConfigPath', '/unrelated/.void-wrangler.jsonc'],
  ];
  for (const [key, value] of cases) {
    const config = normalized();
    config[key] = value;
    assert.throws(() => checkNormalization(config, provenance()), key);
  }
});

test('malformed or unsupported sealed provenance fails', () => {
  for (const change of [
    { schema: 2 },
    { profile: 'other' },
    { platform: 'linux' },
    { inputHash: 'bad' },
    { inputPath: 'relative' },
    { extra: true },
  ])
    assert.throws(() =>
      checkNormalization(normalized(), { ...provenance(), ...change })
    );
});

function fixture(run) {
  const app = mkdtempSync(resolve(tmpdir(), 'calendar-defaults-'));
  const put = (name, value) => {
    const path = resolve(app, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  };
  const config = {
    name: 'tuturuuu-calendar',
    main: 'index.js',
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    compatibility_date: '2026-10-19',
    compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public'],
    workers_dev: false,
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
      html_handling: 'none',
    },
  };
  put('.wrangler/deploy/config.json', {
    configPath: '../../dist/server/wrangler.json',
    auxiliaryWorkers: [],
  });
  put('dist/server/wrangler.json', config);
  put('dist/server/index.js', 'export default {};');
  put('dist/client/serwist/sw.js', '// offline');
  put('cloudflare-env.d.ts', 'interface CloudflareEnv {}');
  try {
    run({ app, config, put });
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}

test('unknown empty fields, resource extras and build hooks stay rejected', () => {
  for (const [key, value] of [
    ['unrelated', {}],
    ['unrelated', []],
    ['build', {}],
    ['workflows', [{}]],
    ['triggers', { crons: [] }],
  ])
    fixture(({ app, config, put }) => {
      config[key] = value;
      put('dist/server/wrangler.json', config);
      assert.throws(() => manifest(app, sha));
    });
});

test('seal requires live materialized provenance, never a diagnostic receipt', () => {
  fixture(({ app, config, put }) => {
    Object.assign(config, normalized());
    put('dist/server/wrangler.json', config);
    put('calendar-config-receipt.json', {
      defaultProbe: { status: 'recorded' },
    });
    assert.throws(() => manifest(app, sha));
  });
});

test('relocation retains historical metadata and detects emitted-byte drift', () => {
  fixture(({ app, config, put }) => {
    // Synthetic trusted seal for restore-only tests; this does not test live qualification.
    const baseline = manifest(app, sha);
    const proof = provenance();
    Object.assign(config, normalized(proof));
    put('dist/server/wrangler.json', config);
    const raw = readFileSync(resolve(app, 'dist/server/wrangler.json'));
    // Hash is computed independently of the restore verifier.
    const receipt = {
      ...baseline,
      normalization: proof,
      files: { ...baseline.files, 'dist/server/wrangler.json': hash(raw) },
    };
    put('calendar-artifact.json', receipt);
    const relocated = mkdtempSync(
      resolve(tmpdir(), 'calendar-defaults-restored-')
    );
    try {
      cpSync(app, relocated, { recursive: true });
      verify(relocated, receipt, sha);
      assert.equal(
        validateOutput(relocated, sha).config.configPath,
        proof.inputPath
      );
      assert.throws(() => validateOutput(relocated, 'c'.repeat(40)));
      const path = resolve(relocated, 'dist/server/wrangler.json');
      assert.deepEqual(readFileSync(path), raw);
      assert.throws(() =>
        verify(
          relocated,
          {
            ...receipt,
            normalization: {
              ...proof,
              inputPath: '/different/.void-wrangler.jsonc',
            },
          },
          sha
        )
      );
      writeFileSync(resolve(relocated, 'calendar-artifact.json'), '{}');
      assert.throws(() => validateOutput(relocated, sha));
      writeFileSync(path, `${raw.toString('utf8')}\n`);
      assert.throws(() => verify(relocated, receipt, sha));
    } finally {
      rmSync(relocated, { recursive: true, force: true });
    }
  });
});
