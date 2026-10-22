import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  nativeDefaultProbe,
  parseConfigData,
} from './native-config-default-probe.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
function reject(reason, field = 'normalization') {
  throw new Error(`meet_normalization:${reason}:${field}`);
}
function equal(actual, expected, field, reason = 'candidate') {
  if (!isDeepStrictEqual(actual, expected)) reject(reason, field);
}
function keys(value, names, field) {
  if (!object(value)) reject('type', field);
  equal(
    Object.keys(value).sort(),
    [...names].sort(),
    field,
    'unexpectedkeycount'
  );
}
function within(root, path) {
  const part = relative(root, path);
  return (
    part === '' ||
    (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
  );
}
function bytes(path, limit = 4 * 1024 * 1024) {
  if (realpathSync(path) !== path || !lstatSync(path).isFile()) reject('type');
  const fd = openSync(path, 'r');
  try {
    const before = fstatSync(fd);
    if (!before.isFile() || before.size > limit) reject('type');
    const raw = readFileSync(fd);
    const after = lstatSync(path);
    if (
      raw.length > limit ||
      realpathSync(path) !== path ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size
    )
      reject('hashrace');
    return raw;
  } finally {
    closeSync(fd);
  }
}
function packageFrom(owner, name) {
  let directory = dirname(owner);
  while (true) {
    const candidate = resolve(directory, 'node_modules', name, 'package.json');
    if (existsSync(candidate)) {
      const path = realpathSync(candidate);
      const metadata = JSON.parse(bytes(path));
      if (metadata.name !== name) reject('profilematch');
      return { directory: dirname(path), path, metadata };
    }
    const parent = dirname(directory);
    if (parent === directory) reject('profilematch');
    directory = parent;
  }
}
function publicPackage(pkg, entry) {
  const path = realpathSync(entry);
  if (!within(pkg.directory, path)) reject('profilematch');
  return {
    version: pkg.metadata.version,
    packageHash: hash(bytes(pkg.path)),
    sourceHash: hash(bytes(path, 64 * 1024 * 1024)),
  };
}
export const NORMALIZATION_PROFILE = {
  suppliers: {
    void: {
      version: '1.1.12',
      packageHash:
        '8cf78a900788338d0fc6a933aa472d092eb58ee7fbbf07d41f10c05cc8a8f000',
      sourceHash:
        '53ef8c9d984eddfde3e866e584b81d1a2da9c749a11e9ba9d20b6584dde1d061',
    },
    plugin: {
      version: '1.64.0',
      packageHash:
        'af6ce02f554c2f4eb772e854d63e82b7360cb54631a63d78e8ef90c067b41f94',
      sourceHash:
        'fe86b2c409772cb658564eec127c71b79f7e024acf4eeeff784e2ef1cafd8849',
    },
    wrangler: {
      version: '4.151.0',
      packageHash:
        '777a844512eb61977eafad63daa5dcebc0f47bfe18f761e1106c05384d31b3fa',
      sourceHash:
        'fdc72018f9cdd5cecff191ec00876825ac90620113996c9bf7d343914fbc842d',
    },
  },
  parser: {
    version: '3.3.1',
    packageHash:
      'a7a9192caaac00d9330592f4fd572908bee037518128a0fc3db96d2cd652e2b5',
    sourceHash:
      '6dc132e2e792a9616688ff93d10dd671c1fbcfa3301d76bff3e81193d049337d',
  },
  materializer:
    '123762196d5964dbf008f26457b29388e6e9858902364676f860231c6ef7b4b3',
};
export const EMITTED_DEFAULTS = {
  jsx_factory: 'React.createElement',
  jsx_fragment: 'React.Fragment',
  logfwdr: { bindings: [] },
  python_modules: { exclude: ['**/*.pyc'] },
  exports: {},
  cloudchamber: {},
  connect: [],
  ai_search_namespaces: [],
  ai_search: [],
  agent_memory: [],
  k2: [],
  artifacts: [],
  unsafe_hello_world: [],
  flagship: [],
  worker_loaders: [],
  vpc_networks: [],
  queues: { producers: [], consumers: [] },
};
const transformed = {
  no_bundle: true,
  rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
  upload_source_maps: true,
};
const forbidden = {
  d1_databases: [],
  kv_namespaces: [],
  hyperdrive: [],
  workflows: [],
  dispatch_namespaces: [],
  unsafe: {},
  containers: [],
  vpc_services: [],
  send_email: [],
  ai: {},
  vectorize: [],
  browser: {},
  analytics_engine_datasets: [],
  ratelimits: [],
  mtls_certificates: [],
  pipelines: [],
  secrets_store_secrets: [],
  triggers: {},
};
const metadataKeys = [
  'configPath',
  'userConfigPath',
  'topLevelName',
  'definedEnvironments',
];
const dev = (platform) => ({
  ip: platform === 'win32' ? '127.0.0.1' : 'localhost',
  local_protocol: 'http',
  upstream_protocol: 'http',
  enable_containers: true,
  generate_types: false,
});
export function checkPolicy(config, identity, secretNames, input = false) {
  if (!object(config)) reject('type');
  const allowed = new Set([
    ...Object.keys(identity),
    'main',
    'assets',
    'secrets',
    'env',
    ...Object.keys(EMITTED_DEFAULTS),
    ...Object.keys(forbidden),
    ...Object.keys(transformed),
    'dev',
    ...(input ? [] : metadataKeys),
  ]);
  if (Object.keys(config).some((key) => !allowed.has(key)))
    reject('unexpectedkeycount', 'root');
  for (const [key, value] of Object.entries(identity))
    equal(config[key], value, key, 'inputrelation');
  keys(
    config.assets,
    ['binding', 'directory', 'run_worker_first', 'not_found_handling'],
    'assets'
  );
  equal(config.assets.binding, 'ASSETS', 'assets');
  equal(config.assets.run_worker_first, true, 'assets');
  equal(config.assets.not_found_handling, 'none', 'assets');
  if (
    typeof config.main !== 'string' ||
    typeof config.assets.directory !== 'string'
  )
    reject('type', 'assets');
  if (input) {
    equal(config.main, 'cloudflare/worker.ts', 'main', 'inputrelation');
    equal(config.assets.directory, './dist/client', 'assets', 'inputrelation');
  }
  keys(config.secrets, ['required'], 'secrets');
  if (
    !Array.isArray(config.secrets.required) ||
    config.secrets.required.some((name) => typeof name !== 'string')
  )
    reject('type', 'secrets');
  equal([...config.secrets.required].sort(), secretNames, 'secrets');
  if (own(config, 'env')) equal(config.env, {}, 'env');
  for (const [key, value] of Object.entries(forbidden))
    if (own(config, key)) equal(config[key], value, key);
  for (const [key, value] of Object.entries(EMITTED_DEFAULTS))
    if (own(config, key)) equal(config[key], value, key);
  if (
    input &&
    [...Object.keys(transformed), 'dev'].some((key) => own(config, key))
  )
    reject('inputrelation');
}
export function checkNormalization(config, record) {
  keys(
    record,
    ['schema', 'profile', 'inputPath', 'inputHash', 'platform'],
    'record'
  );
  equal(record.schema, 1, 'schema');
  equal(record.profile, NORMALIZATION_PROFILE, 'profile', 'profilematch');
  if (
    typeof record.inputHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.inputHash)
  )
    reject('type', 'hash');
  if (
    typeof record.inputPath !== 'string' ||
    !isAbsolute(record.inputPath) ||
    resolve(record.inputPath) !== record.inputPath ||
    /[\r\n\0]/.test(record.inputPath) ||
    !record.inputPath.endsWith('/.void-wrangler.jsonc')
  )
    reject('type', 'input');
  if (!['win32', 'non-windows'].includes(record.platform))
    reject('type', 'platform');
  equal(config.configPath, record.inputPath, 'configPath', 'inputrelation');
  equal(
    config.userConfigPath,
    record.inputPath,
    'userConfigPath',
    'inputrelation'
  );
  equal(config.topLevelName, 'tuturuuu-meet', 'topLevelName', 'inputrelation');
  equal(config.definedEnvironments, [], 'definedEnvironments', 'inputrelation');
  for (const [key, value] of Object.entries(transformed))
    equal(config[key], value, key);
  for (const [key, value] of Object.entries(EMITTED_DEFAULTS))
    if (own(config, key)) equal(config[key], value, key);
  if (own(config, 'dev')) equal(config.dev, dev(record.platform), 'dev');
}
export function checkInputRelation(
  config,
  input,
  record,
  identity,
  secretNames
) {
  checkPolicy(input, identity, secretNames, true);
  checkPolicy(config, identity, secretNames);
  checkNormalization(config, record);
  // Presence is per field: authored DO/R2/migrations never enter the default loop.
  for (const key of [
    ...Object.keys(EMITTED_DEFAULTS),
    ...Object.keys(forbidden),
  ]) {
    if (own(input, key) && !own(config, key)) reject('inputrelation', key);
    if (own(input, key)) equal(config[key], input[key], key, 'inputrelation');
  }
}
export function checkInputHashes(initial, final, measured) {
  if (hash(initial) !== hash(final) || hash(initial) !== measured)
    reject('hashrace');
}
function provenance(app) {
  const appPackage = resolve(app, 'package.json');
  const voidEntry = realpathSync(createRequire(appPackage).resolve('void'));
  const voidPackage = packageFrom(appPackage, 'void');
  const plugin = packageFrom(voidEntry, '@cloudflare/vite-plugin');
  const exported = plugin.metadata.exports?.['.'] ?? plugin.metadata.exports;
  const importEntry =
    typeof exported === 'string' ? exported : exported?.import;
  if (typeof importEntry !== 'string') reject('profilematch');
  const pluginEntry = resolve(plugin.directory, importEntry);
  const wranglerEntry = realpathSync(
    createRequire(pluginEntry).resolve('wrangler')
  );
  const suppliers = {
    void: publicPackage(voidPackage, voidEntry),
    plugin: publicPackage(plugin, pluginEntry),
    wrangler: publicPackage(
      packageFrom(pluginEntry, 'wrangler'),
      wranglerEntry
    ),
  };
  equal(
    suppliers,
    NORMALIZATION_PROFILE.suppliers,
    'suppliers',
    'profilematch'
  );
  const parserPackage = packageFrom(voidEntry, 'jsonc-parser');
  const parserEntry = realpathSync(
    createRequire(voidEntry).resolve('jsonc-parser')
  );
  equal(
    voidPackage.metadata.dependencies?.['jsonc-parser'],
    '^3.3.1',
    'parser',
    'profilematch'
  );
  equal(
    parserPackage.metadata.main,
    './lib/umd/main.js',
    'parser',
    'profilematch'
  );
  equal(
    resolve(parserPackage.directory, parserPackage.metadata.main),
    parserEntry,
    'parser',
    'profilematch'
  );
  equal(
    publicPackage(parserPackage, parserEntry),
    NORMALIZATION_PROFILE.parser,
    'parser',
    'profilematch'
  );
  return { suppliers, parserEntry };
}
export function checkLiveProbe(probe) {
  for (const key of ['supplierProfileMatches', 'parserProfileMatches'])
    equal(probe.preconditions[key], true, 'profile', 'profilematch');
  equal(probe.loaderSelection.proven, true, 'loader', 'inputrelation');
  const loader = probe.loaderSelection;
  if (
    !loader.typedConfig?.exists ||
    !loader.typedConfig.canonical ||
    loader.typedConfig.symlink ||
    !/^[a-f0-9]{64}$/.test(loader.typedConfig.hash ?? '') ||
    loader.legacyJsonExists !== false ||
    loader.legacyJsoncExists !== false ||
    loader.metadataSelectsMaterialized !== true ||
    probe.materialized.jsonObject !== true
  )
    reject('inputrelation', 'loader');
  equal(
    probe.materializerHash,
    NORMALIZATION_PROFILE.materializer,
    'materializer',
    'profilematch'
  );
  for (const key of [
    'configPathEqualsInput',
    'userConfigPathEqualsInput',
    'topLevelNameEqualsInput',
    'definedEnvironmentsEqualsInput',
  ])
    equal(probe.metadata[key], true, 'metadata', 'inputrelation');
  if (
    probe.preconditions.stateMatchesInput === false ||
    probe.preconditions.stateTextEqualsInput === false
  )
    reject('inputrelation', 'retained');
}
// Internal orchestration seam: fixture readers are not live acquisition proof.
export function captureNormalizationWithReaders(
  app,
  config,
  identity,
  secretNames,
  readers
) {
  try {
    const inputPath = resolve(app, '.void-wrangler.jsonc');
    const initial = readers.input(inputPath);
    const profile = readers.profile();
    const probe = readers.measure(profile.suppliers);
    checkLiveProbe(probe);
    const { input } = parseConfigData(initial, readers.parser(profile));
    const record = {
      schema: 1,
      profile: structuredClone(NORMALIZATION_PROFILE),
      inputPath,
      inputHash: hash(initial),
      platform: process.platform === 'win32' ? 'win32' : 'non-windows',
    };
    checkInputRelation(config, input, record, identity, secretNames);
    const finalProbe = readers.measure(profile.suppliers);
    checkLiveProbe(finalProbe);
    equal(
      finalProbe.typedSourceIdentity,
      probe.typedSourceIdentity,
      'typedsource',
      'hashrace'
    );
    equal(
      finalProbe.loaderSelection.typedConfig,
      probe.loaderSelection.typedConfig,
      'typedsource',
      'hashrace'
    );
    const final = readers.input(inputPath);
    checkInputHashes(initial, final, probe.materialized.hash);
    checkInputHashes(initial, final, finalProbe.materialized.hash);
    equal(readers.profile(), profile, 'suppliers', 'hashrace');
    return record;
  } catch (error) {
    if (
      /^meet_normalization:(candidate|inputrelation|type|profilematch|hashrace|unexpectedkeycount):[A-Za-z0-9_]+$/.test(
        error.message
      )
    )
      throw error;
    reject('profilematch');
  }
}
export function captureNormalization(app, config, identity, secretNames) {
  return captureNormalizationWithReaders(app, config, identity, secretNames, {
    input: bytes,
    profile: () => provenance(app),
    measure: (suppliers) => ({
      ...nativeDefaultProbe(app, config, suppliers),
      typedSourceIdentity: realpathSync(resolve(app, 'void.config.ts')),
    }),
    parser: ({ parserEntry }) => {
      const parse = createRequire(parserEntry)(parserEntry).parse;
      if (typeof parse !== 'function') reject('type', 'parser');
      return parse;
    },
  });
}
