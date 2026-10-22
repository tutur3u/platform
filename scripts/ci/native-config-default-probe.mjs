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

const MAX_INPUT = 4 * 1024 * 1024;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const reject = (code) => {
  throw Object.assign(new Error(code), { receiptCode: code });
};
const type = (value) =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const within = (root, path) => {
  const part = relative(root, path);
  return (
    part === '' ||
    (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`))
  );
};

function bytes(path, limit = MAX_INPUT) {
  const absolute = resolve(path);
  if (realpathSync(absolute) !== absolute || !lstatSync(absolute).isFile())
    reject('unsafe_file');
  const fd = openSync(absolute, 'r');
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) reject('input_limit');
    const result = readFileSync(fd);
    if (result.length > limit) reject('input_limit');
    return result;
  } finally {
    closeSync(fd);
  }
}

function json(path) {
  return JSON.parse(bytes(path).toString('utf8'));
}
function keyShape(value) {
  const keys = Object.keys(value);
  return { keyCount: keys.length, keyHashes: keys.map(hash).sort() };
}
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

const DEFAULT_PROFILE = {
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
  materializer:
    '123762196d5964dbf008f26457b29388e6e9858902364676f860231c6ef7b4b3',
};
const RESOURCE_KEYS = `durable_objects queues logfwdr kv_namespaces r2_buckets
 d1_databases services workflows containers hyperdrive unsafe assets vars secrets
 bindings build dev python_modules send_email cloudchamber connect migrations exports
 vectorize ai_search_namespaces ai_search agent_memory analytics_engine_datasets
 dispatch_namespaces mtls_certificates tail_consumers streaming_tail_consumers
 browser analytics ai images stream media pipelines k2 secrets_store_secrets
 artifacts worker_loaders ratelimits vpc_services vpc_networks version_metadata`
  .split(/\s+/)
  .filter(Boolean);
const DEFAULTS = {
  jsx_factory: 'React.createElement',
  jsx_fragment: 'React.Fragment',
  durable_objects: { bindings: [] },
  queues: { producers: [], consumers: [] },
  logfwdr: { bindings: [] },
  python_modules: { exclude: ['**/*.pyc'] },
};

function fileFact(path) {
  const fact = { exists: false, canonical: false, symlink: false };
  try {
    const stat = lstatSync(path);
    fact.exists = true;
    fact.symlink = stat.isSymbolicLink();
    fact.canonical = realpathSync(path) === resolve(path);
    fact.symlink ||= !fact.canonical;
    if (!fact.canonical || !stat.isFile()) return { fact };
    const raw = bytes(path);
    fact.hash = hash(raw);
    return { fact, raw };
  } catch {
    return { fact };
  }
}

const PARSER_PROFILE = {
  version: '3.3.1',
  packageHash:
    'a7a9192caaac00d9330592f4fd572908bee037518128a0fc3db96d2cd652e2b5',
  sourceHash:
    '6dc132e2e792a9616688ff93d10dd671c1fbcfa3301d76bff3e81193d049337d',
};

function parserFromVoid(voidEntry, suppliers) {
  const owner = packageFrom(voidEntry, 'void');
  if (
    !within(owner.directory, voidEntry) ||
    !isDeepStrictEqual(
      publicPackage(owner, voidEntry),
      DEFAULT_PROFILE.suppliers.void
    ) ||
    !isDeepStrictEqual(suppliers.void, DEFAULT_PROFILE.suppliers.void) ||
    owner.metadata.dependencies?.['jsonc-parser'] !== '^3.3.1'
  )
    reject('parser_owner_mismatch');
  const require = createRequire(voidEntry);
  const entry = realpathSync(require.resolve('jsonc-parser'));
  const pkg = packageFrom(voidEntry, 'jsonc-parser');
  if (
    pkg.metadata.main !== './lib/umd/main.js' ||
    resolve(pkg.directory, pkg.metadata.main) !== entry ||
    !isDeepStrictEqual(publicPackage(pkg, entry), PARSER_PROFILE)
  )
    reject('parser_profile_mismatch');
  // Only the pinned data parser executes; never load the Void/project entry.
  const api = require(entry);
  if (typeof api.parse !== 'function') reject('parser_api_unavailable');
  return { parse: api.parse, profile: PARSER_PROFILE };
}

// Public parser recovery is never accepted without an empty error list.
export function parseConfigData(raw, parse) {
  const errors = [];
  const input = parse(raw.toString('utf8'), errors, {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: false,
  });
  if (errors.length) return { reason: 'materialized_parse_errors' };
  return object(input)
    ? { input }
    : { reason: 'materialized_shape_unavailable' };
}

function structuralMatch(actual, expected, keysOnly) {
  if (type(actual) !== type(expected)) return false;
  if (object(expected)) {
    const names = Object.keys(expected).sort();
    return (
      isDeepStrictEqual(Object.keys(actual).sort(), names) &&
      names.every((key) =>
        structuralMatch(actual[key], expected[key], keysOnly)
      )
    );
  }
  if (Array.isArray(expected))
    return (
      actual.length === expected.length &&
      expected.every((item, index) =>
        structuralMatch(actual[index], item, keysOnly)
      )
    );
  return keysOnly || type(actual) === type(expected);
}

export function defaultComparisons(
  config,
  input,
  { inputKnown = false, inputPath, source = {}, sourceKnown = false } = {}
) {
  const dev = (ip) => ({
    ip,
    local_protocol: 'http',
    upstream_protocol: 'http',
    enable_containers: true,
    generate_types: false,
  });
  const candidates = {
    configPath: [['materialized_path', inputPath]],
    userConfigPath: [['materialized_path', inputPath]],
    topLevelName: [['materialized_name', input.name]],
    ...Object.fromEntries(
      Object.entries(DEFAULTS).map(([name, value]) => [
        name,
        [['pinned_normalizer_default', value]],
      ])
    ),
    upload_source_maps: [['emitted_true_candidate', true]],
    dev: [
      ['pinned_cli_non_windows', dev('localhost')],
      ['pinned_cli_windows', dev('127.0.0.1')],
    ],
  };
  return Object.entries(candidates).map(([name, values]) => {
    const identity = ['configPath', 'userConfigPath', 'topLevelName'].includes(
      name
    );
    const reason = !inputKnown
      ? 'materialized_input_unavailable'
      : name === 'topLevelName' && typeof input.name !== 'string'
        ? 'input_name_unavailable'
        : undefined;
    const available = !reason;
    const present = Object.hasOwn(input, name);
    return {
      name,
      status: available ? 'recorded' : 'unavailable',
      ...(reason ? { reason } : {}),
      inputPresent: inputKnown ? present : null,
      authoredPresent: null,
      retainedSourcePresent: sourceKnown ? Object.hasOwn(source, name) : null,
      origin: !inputKnown
        ? 'unavailable'
        : identity
          ? 'input_identity'
          : present
            ? 'materialized_input'
            : 'value_candidate',
      emittedType: Object.hasOwn(config, name) ? type(config[name]) : 'absent',
      nestedKeysMatch: available
        ? values.some(([, value]) => structuralMatch(config[name], value, true))
        : null,
      typesMatch: available
        ? values.some(([, value]) =>
            structuralMatch(config[name], value, false)
          )
        : null,
      candidateMatch: available
        ? values.some(([, value]) => isDeepStrictEqual(config[name], value))
        : null,
      candidates: values.map(([candidate, value]) => ({
        candidate,
        exactValueMatch: available
          ? isDeepStrictEqual(config[name], value)
          : null,
      })),
    };
  });
}

// Internal data seam: projected facts only; no environment or CLI bypass.
export function probeDecision(config, input, facts) {
  const fields = defaultComparisons(config, input, facts);
  const evidence = [
    ['supplier', facts.supplierProfileMatches, 'supplier_profile'],
    ['parser', facts.parserProfileMatches, 'parser_profile'],
    ['loader', facts.loaderProven, 'loader_selection'],
    ['configPath', facts.configPathEqualsInput, 'metadata_config_path'],
    [
      'userConfigPath',
      facts.userConfigPathEqualsInput,
      'metadata_user_config_path',
    ],
    ['topLevelName', facts.topLevelNameEqualsInput, 'metadata_top_level_name'],
    [
      'environments',
      facts.definedEnvironmentsEqualsInput,
      'metadata_environments',
    ],
    ['stateShape', facts.stateValid, 'retained_state_shape'],
    ['stateResolved', facts.stateMatchesInput, 'retained_state_resolved'],
    ['stateText', facts.stateTextEqualsInput, 'retained_state_text'],
  ].map(([name, value, reason]) => ({
    name,
    status:
      value === true ? 'matched' : value === false ? 'mismatch' : 'unknown',
    reason: `${reason}_${value === true ? 'matched' : value === false ? 'mismatch' : 'unknown'}`,
  }));
  const recorded = fields.every((field) => field.status === 'recorded');
  return {
    fields,
    evidence,
    status: recorded ? 'recorded' : 'unavailable',
    reason: recorded
      ? 'value_candidates_only'
      : 'materialized_input_unavailable',
    diagnosticOnly: true,
    causalProvenance: {
      status: 'unknown',
      reason: 'historical_process_and_authored_source_unproven',
      cliDefaultsProven: false,
      normalizerPlatformProven: false,
      resolvedSourcemapProven: false,
      authoredSourceProven: false,
    },
  };
}

export function nativeDefaultProbe(app, config, suppliers) {
  const inputPath = resolve(app, '.void-wrangler.jsonc');
  const materialized = fileFact(inputPath);
  const retained = fileFact(resolve(app, 'void.lock.json'));
  const result = {
    materialized: materialized.fact,
    retainedState: retained.fact,
    loaderSelection: {
      typedConfig: fileFact(resolve(app, 'void.config.ts')).fact,
      legacyJsonExists: existsSync(resolve(app, 'wrangler.json')),
      legacyJsoncExists: existsSync(resolve(app, 'wrangler.jsonc')),
    },
    metadata: {
      configPathEqualsInput: config.configPath === inputPath,
      userConfigPathEqualsInput: config.userConfigPath === inputPath,
      topLevelNameEqualsInput: null,
      definedEnvironmentsEqualsInput: null,
      definedEnvironmentsEmpty:
        Array.isArray(config.definedEnvironments) &&
        config.definedEnvironments.length === 0,
    },
    preconditions: {
      supplierProfileMatches: null,
      parserProfileMatches: null,
      stateMatchesInput: null,
      stateTextEqualsInput: null,
    },
  };
  let parser;
  try {
    const voidEntry = realpathSync(
      createRequire(resolve(app, 'package.json')).resolve('void')
    );
    try {
      const text = bytes(voidEntry, 64 * 1024 * 1024).toString('utf8');
      const links = [
        ...text.matchAll(
          /import \{[^\n]*\bmaterializeCloudflareConfig\b[^\n]*\} from "(\.\/cloudflare-config-[A-Za-z0-9_-]+\.mjs)";/g
        ),
      ];
      if (links.length !== 1) reject('materializer_unavailable');
      const chunk = resolve(dirname(voidEntry), links[0][1]);
      if (!within(dirname(voidEntry), chunk))
        reject('materializer_unavailable');
      result.materializerHash = hash(bytes(chunk));
      result.preconditions.supplierProfileMatches =
        isDeepStrictEqual(suppliers, DEFAULT_PROFILE.suppliers) &&
        result.materializerHash === DEFAULT_PROFILE.materializer;
    } catch {
      result.materializerReason = 'materializer_unavailable';
    }
    try {
      parser = parserFromVoid(voidEntry, suppliers);
      result.parser = parser.profile;
      result.preconditions.parserProfileMatches = true;
    } catch (error) {
      result.preconditions.parserProfileMatches = [
        'parser_owner_mismatch',
        'parser_profile_mismatch',
      ].includes(error.receiptCode)
        ? false
        : null;
      result.materialized.reason = 'parser_supplier_unavailable';
    }
  } catch {
    result.materialized.reason = 'materializer_unavailable';
  }
  let input, state;
  if (!materialized.raw)
    result.materialized.reason = 'materialized_unavailable';
  else if (parser) {
    try {
      const parsed = parseConfigData(materialized.raw, parser.parse);
      input = parsed.input;
      result.materialized.reason = parsed.reason;
    } catch {
      result.materialized.reason = 'materialized_parse_unavailable';
    }
  }
  result.materialized.jsonObject = object(input);
  try {
    if (!retained.raw) reject('retained_state_unavailable');
    state = JSON.parse(retained.raw.toString('utf8'));
    if (
      !object(state) ||
      state.version !== 1 ||
      !object(state.source) ||
      !object(state.resolved) ||
      typeof state.text !== 'string'
    )
      reject('retained_state_shape');
    result.retainedState.validShape = true;
    if (input) {
      result.preconditions.stateMatchesInput = isDeepStrictEqual(
        input,
        state.resolved
      );
      result.preconditions.stateTextEqualsInput =
        state.text === materialized.raw.toString('utf8');
    }
  } catch {
    result.retainedState.validShape = retained.raw ? false : null;
    state = undefined;
  }
  if (input) {
    const environments = object(input.env)
      ? Object.keys(input.env)
      : input.env === undefined
        ? []
        : null;
    result.metadata.topLevelNameEqualsInput =
      typeof input.name === 'string' && config.topLevelName === input.name;
    result.metadata.definedEnvironmentsEqualsInput =
      environments !== null &&
      isDeepStrictEqual(config.definedEnvironments, environments);
    result.input = {
      buildPresent: Object.hasOwn(input, 'build'),
      buildType: type(input.build),
      buildCommandPresent:
        object(input.build) && Object.hasOwn(input.build, 'command'),
      buildCwdPresent: object(input.build) && Object.hasOwn(input.build, 'cwd'),
      buildCommandType:
        object(input.build) && Object.hasOwn(input.build, 'command')
          ? type(input.build.command)
          : 'absent',
      buildCwdType:
        object(input.build) && Object.hasOwn(input.build, 'cwd')
          ? type(input.build.cwd)
          : 'absent',
      buildShape: object(input.build) ? keyShape(input.build) : null,
      resourcePresence: RESOURCE_KEYS.map((name) => ({
        name,
        present: Object.hasOwn(input, name),
      })),
    };
  }
  result.loaderSelection.metadataSelectsMaterialized =
    result.metadata.configPathEqualsInput &&
    result.metadata.userConfigPathEqualsInput;
  result.loaderSelection.proven =
    typeof result.loaderSelection.typedConfig.hash === 'string' &&
    result.loaderSelection.typedConfig.canonical &&
    result.loaderSelection.typedConfig.exists &&
    !result.loaderSelection.legacyJsonExists &&
    !result.loaderSelection.legacyJsoncExists &&
    result.loaderSelection.metadataSelectsMaterialized;
  return {
    ...result,
    ...probeDecision(config, input ?? {}, {
      inputKnown: object(input),
      inputPath,
      source: state?.source ?? {},
      sourceKnown: result.retainedState.validShape === true,
      ...result.preconditions,
      ...result.metadata,
      loaderProven: result.loaderSelection.proven,
      stateValid: result.retainedState.validShape,
    }),
  };
}
