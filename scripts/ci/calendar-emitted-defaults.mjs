import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { nativeDefaultProbe } from './native-config-default-probe.mjs';

const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const bytes = (path) => readFileSync(path);
const json = (path) => JSON.parse(bytes(path).toString('utf8'));
const reject = (message) => {
  throw new Error(message);
};
const within = (root, path) => {
  const part = relative(root, path);
  return (
    part === '' ||
    (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
  );
};
function packageFrom(owner, name) {
  let directory = dirname(owner);
  while (true) {
    const candidate = resolve(directory, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) {
      const path = realpathSync(candidate);
      const metadata = json(path);
      if (
        metadata.name !== name ||
        !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(metadata.version)
      ) {
        reject('provenance_unavailable');
      }
      return { directory: dirname(path), path, metadata };
    }
    const parent = dirname(directory);
    if (parent === directory) reject('provenance_unavailable');
    directory = parent;
  }
}

function publicPackage(pkg, entry) {
  const path = realpathSync(entry);
  if (!within(pkg.directory, path)) reject('provenance_unavailable');
  return {
    version: pkg.metadata.version,
    packageHash: hash(bytes(pkg.path)),
    sourceHash: hash(bytes(path, 64 * 1024 * 1024)),
  };
}

function provenance(app) {
  const appPackage = resolve(app, 'package.json');
  const voidEntry = realpathSync(createRequire(appPackage).resolve('void'));
  const voidPackage = packageFrom(appPackage, 'void');
  const plugin = packageFrom(voidEntry, '@cloudflare/vite-plugin');
  const exported = plugin.metadata.exports?.['.'] ?? plugin.metadata.exports;
  const importEntry =
    typeof exported === 'string' ? exported : exported?.import;
  if (typeof importEntry !== 'string') reject('provenance_unavailable');
  const pluginEntry = resolve(plugin.directory, importEntry);
  if (!within(plugin.directory, pluginEntry)) reject('provenance_unavailable');
  const wranglerEntry = realpathSync(
    createRequire(pluginEntry).resolve('wrangler')
  );
  const wrangler = packageFrom(pluginEntry, 'wrangler');
  return {
    void: publicPackage(voidPackage, voidEntry),
    plugin: publicPackage(plugin, pluginEntry),
    wrangler: publicPackage(wrangler, wranglerEntry),
  };
}

// Exact values from the pinned normalizer. No claim about historical authorship.
export const EMITTED_DEFAULTS = {
  jsx_factory: 'React.createElement',
  jsx_fragment: 'React.Fragment',
  durable_objects: { bindings: [] },
  queues: { producers: [], consumers: [] },
  logfwdr: { bindings: [] },
  python_modules: { exclude: ['**/*.pyc'] },
  upload_source_maps: true,
};
const metadataKeys = [
  'configPath',
  'userConfigPath',
  'topLevelName',
  'definedEnvironments',
];
export const NORMALIZATION_KEYS = [
  ...Object.keys(EMITTED_DEFAULTS),
  ...metadataKeys,
  'dev',
];
const profile = 'void-1.1.12/plugin-1.64.0/wrangler-4.151.0/jsonc-3.3.1';

export function checkNormalization(config, provenance) {
  assert.deepEqual(Object.keys(provenance).sort(), [
    'inputHash',
    'inputPath',
    'platform',
    'profile',
    'schema',
  ]);
  assert.equal(provenance.schema, 1);
  assert.equal(provenance.profile, profile);
  assert.match(provenance.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(typeof provenance.inputPath, 'string');
  assert.ok(
    isAbsolute(provenance.inputPath) && !/[\r\n]/.test(provenance.inputPath)
  );
  assert.ok(['win32', 'non-windows'].includes(provenance.platform));
  assert.equal(config.configPath, provenance.inputPath);
  assert.equal(config.userConfigPath, provenance.inputPath);
  assert.equal(config.topLevelName, 'tuturuuu-calendar');
  assert.deepEqual(config.definedEnvironments, []);
  for (const [key, value] of Object.entries(EMITTED_DEFAULTS)) {
    if (Object.hasOwn(config, key))
      assert.deepEqual(
        config[key],
        value,
        `unqualified normalized field: ${key}`
      );
  }
  if (Object.hasOwn(config, 'dev'))
    assert.deepEqual(config.dev, {
      ip: provenance.platform === 'win32' ? '127.0.0.1' : 'localhost',
      local_protocol: 'http',
      upstream_protocol: 'http',
      enable_containers: true,
      generate_types: false,
    });
}

export function captureNormalization(app, config) {
  const probe = nativeDefaultProbe(app, config, provenance(app));
  assert.equal(
    probe.preconditions.supplierProfileMatches,
    true,
    'unsupported supplier profile'
  );
  assert.equal(
    probe.preconditions.parserProfileMatches,
    true,
    'unsupported parser profile'
  );
  assert.equal(
    probe.loaderSelection.proven,
    true,
    'materialized loader not established'
  );
  for (const key of [
    'configPathEqualsInput',
    'userConfigPathEqualsInput',
    'topLevelNameEqualsInput',
    'definedEnvironmentsEqualsInput',
  ])
    assert.equal(probe.metadata[key], true, `input metadata mismatch: ${key}`);
  assert.equal(probe.materialized.jsonObject, true);
  assert.equal(probe.input.buildPresent, false, 'input build hooks forbidden');
  for (const field of probe.fields) {
    assert.equal(
      field.candidateMatch,
      true,
      `unsupported default: ${field.name}`
    );
    assert.equal(
      field.inputPresent,
      false,
      `explicit normalized override: ${field.name}`
    );
  }
  const inputPath = resolve(app, '.void-wrangler.jsonc');
  assert.equal(realpathSync(inputPath), inputPath);
  const inputHash = hash(bytes(inputPath));
  assert.equal(
    inputHash,
    probe.materialized.hash,
    'materialized input changed during qualification'
  );
  const result = {
    schema: 1,
    profile,
    inputPath,
    inputHash,
    platform: process.platform === 'win32' ? 'win32' : 'non-windows',
  };
  checkNormalization(config, result);
  return result;
}
