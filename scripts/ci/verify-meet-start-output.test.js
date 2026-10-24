const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} = require('node:fs');
const { atomicWriteFileSync, readOptionalFileSync } = require('../safe-fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const {
  artifactManifest,
  identity,
  secretNames,
  validateOutput,
  verifyManifest,
} = require('./verify-meet-start-output');
const {
  EMITTED_DEFAULTS,
  NORMALIZATION_PROFILE,
  checkLiveProbe,
  captureNormalizationWithReaders,
  checkInputHashes,
  checkInputRelation,
  checkNormalization,
  checkPolicy,
} = require('./meet-emitted-defaults.mjs');
const sha = 'a'.repeat(40);
const hash = (raw) => createHash('sha256').update(raw).digest('hex');
const record = () => ({
  schema: 1,
  profile: structuredClone(NORMALIZATION_PROFILE),
  inputPath: '/synthetic-original/.void-wrangler.jsonc',
  inputHash: hash('synthetic input'),
  platform: 'non-windows',
});
function emitted() {
  return {
    ...structuredClone(identity),
    ...structuredClone(EMITTED_DEFAULTS),
    main: 'index.js',
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    secrets: { required: [...secretNames] },
    configPath: record().inputPath,
    userConfigPath: record().inputPath,
    topLevelName: identity.name,
    definedEnvironments: [],
    no_bundle: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    upload_source_maps: true,
    dev: {
      ip: 'localhost',
      local_protocol: 'http',
      upstream_protocol: 'http',
      enable_containers: true,
      generate_types: false,
    },
  };
}
function authored() {
  return {
    ...structuredClone(identity),
    main: 'cloudflare/worker.ts',
    assets: {
      binding: 'ASSETS',
      directory: './dist/client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    secrets: { required: [...secretNames].reverse() },
  };
}
function fixture(t) {
  const app = mkdtempSync(join(tmpdir(), 'meet-trusted-seal-'));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  for (const path of ['.wrangler/deploy', 'dist/ssr', 'dist/client'])
    mkdirSync(join(app, path), { recursive: true });
  writeFileSync(
    join(app, '.wrangler/deploy/config.json'),
    JSON.stringify({
      configPath: '../../dist/ssr/wrangler.json',
      auxiliaryWorkers: [],
    })
  );
  writeFileSync(
    join(app, 'dist/ssr/index.js'),
    'export default {}; export class MeetLiveDurableObject {} export class MeetingAIProvider {}'
  );
  writeFileSync(
    join(app, 'dist/client/asset.js'),
    'export const ready = true;'
  );
  const config = emitted();
  let pointer = '.wrangler/deploy/config.json';
  // Synthetic trusted CI archive, explicitly constructed here, never via a production bypass.
  function trust() {
    const files = {};
    function visit(path) {
      for (const entry of readdirSync(join(app, path), {
        withFileTypes: true,
      })) {
        const name = `${path}/${entry.name}`;
        if (entry.isDirectory()) visit(name);
        else files[name] = hash(readFileSync(join(app, name)));
      }
    }
    visit('dist');
    files[pointer] = hash(readFileSync(join(app, pointer)));
    const manifest = {
      schema: 2,
      sha,
      config: 'dist/ssr/wrangler.json',
      files,
      normalization: record(),
    };
    writeFileSync(join(app, 'meet-artifact.json'), JSON.stringify(manifest));
    return manifest;
  }
  function save() {
    writeFileSync(join(app, 'dist/ssr/wrangler.json'), JSON.stringify(config));
    return trust();
  }
  function saved() {
    mkdirSync(join(app, '.void'));
    renameSync(
      join(app, pointer),
      join(app, '.void/preview-deploy-config.json')
    );
    pointer = '.void/preview-deploy-config.json';
    return trust();
  }
  save();
  return { app, config, save, trust, saved };
}
function validate(app) {
  return validateOutput(app, { sha, mode: 'restore-required' });
}
function relocate(t, app) {
  const target = mkdtempSync(join(tmpdir(), 'meet-relocated-'));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  cpSync(app, target, { recursive: true });
  return target;
}
function policy(config) {
  checkPolicy(config, identity, secretNames);
  checkNormalization(config, record());
}

test('authored positive DO/R2/placement/history and absent defaults qualify independently', () => {
  checkInputRelation(emitted(), authored(), record(), identity, secretNames);
  const input = authored();
  input.queues = { producers: [], consumers: [] };
  checkInputRelation(emitted(), input, record(), identity, secretNames);
});
for (const field of Object.keys(identity)) {
  test(`rejects authored and emitted ${field} drift`, () => {
    const input = authored();
    input[field] = null;
    assert.throws(() =>
      checkInputRelation(emitted(), input, record(), identity, secretNames)
    );
    const config = emitted();
    config[field] = null;
    assert.throws(() => policy(config));
  });
}
for (const [field, value] of Object.entries(EMITTED_DEFAULTS)) {
  test(`accepts exact typed ${field}, rejects its type opposite and authored override`, () => {
    const input = authored();
    input[field] = structuredClone(value);
    checkInputRelation(emitted(), input, record(), identity, secretNames);
    for (const wrong of [null, false, 0, '', Array.isArray(value) ? {} : []]) {
      const config = emitted();
      config[field] = wrong;
      assert.throws(() => policy(config));
      input[field] = wrong;
      assert.throws(() =>
        checkInputRelation(emitted(), input, record(), identity, secretNames)
      );
    }
  });
}
for (const side of ['producers', 'consumers']) {
  test(`rejects each populated queues ${side} in input and output`, () => {
    const config = emitted();
    config.queues[side].push({ binding: 'UNAPPROVED' });
    assert.throws(() => policy(config));
    const input = authored();
    input.queues = config.queues;
    assert.throws(() =>
      checkInputRelation(emitted(), input, record(), identity, secretNames)
    );
  });
}
for (const [name, mutate] of [
  [
    'root',
    (c) => {
      c.new_resource = [];
    },
  ],
  [
    'assets',
    (c) => {
      c.assets.extra = true;
    },
  ],
  [
    'secrets',
    (c) => {
      c.secrets.extra = [];
    },
  ],
  [
    'queues',
    (c) => {
      c.queues.extra = [];
    },
  ],
  [
    'DO binding',
    (c) => {
      c.durable_objects.bindings[0].extra = true;
    },
  ],
  [
    'DO resource',
    (c) => {
      c.durable_objects.extra = [];
    },
  ],
  [
    'R2',
    (c) => {
      c.r2_buckets[0].extra = true;
    },
  ],
  [
    'placement',
    (c) => {
      c.placement.mode = 'smart';
    },
  ],
  [
    'migration history',
    (c) => {
      c.migrations.push({ tag: 'other' });
    },
  ],
  [
    'dev',
    (c) => {
      c.dev.extra = true;
    },
  ],
  [
    'rules',
    (c) => {
      c.rules[0].fallthrough = true;
    },
  ],
  [
    'rule order',
    (c) => {
      c.rules[0].globs.reverse();
    },
  ],
  [
    'upload candidate',
    (c) => {
      c.upload_source_maps = false;
    },
  ],
  [
    'bundle candidate',
    (c) => {
      c.no_bundle = false;
    },
  ],
  [
    'build hook',
    (c) => {
      c.build = {};
    },
  ],
  [
    'named env',
    (c) => {
      c.env = { staging: {} };
    },
  ],
  [
    'secret names',
    (c) => {
      c.secrets.required.push('UNAPPROVED');
    },
  ],
  [
    'assets bypass',
    (c) => {
      c.assets.run_worker_first = false;
    },
  ],
  [
    'SPA',
    (c) => {
      c.assets.not_found_handling = 'single-page-application';
    },
  ],
]) {
  test(`rejects ${name} without printing values`, () => {
    const config = emitted();
    mutate(config);
    assert.throws(
      () => policy(config),
      (error) => {
        assert.match(error.message, /^meet_normalization:/);
        assert.ok(Buffer.byteLength(error.message) < 1200);
        assert.doesNotMatch(error.message, /UNAPPROVED|synthetic-original/);
        return true;
      }
    );
  });
}
for (const key of [
  'dev',
  'rules',
  'no_bundle',
  'upload_source_maps',
  'build',
]) {
  test(`rejects unsupported authored ${key} even when emission matches`, () => {
    const input = authored();
    input[key] = emitted()[key] ?? {};
    assert.throws(() =>
      checkInputRelation(emitted(), input, record(), identity, secretNames)
    );
  });
}
test('exact platform defaults and profile identity are mandatory', () => {
  const config = emitted();
  const proof = record();
  proof.platform = 'win32';
  assert.throws(() => checkNormalization(config, proof));
  config.dev.ip = '127.0.0.1';
  checkNormalization(config, proof);
  proof.profile.suppliers.plugin.version = '1.63.1';
  assert.throws(() => checkNormalization(config, proof), /profilematch/);
});
test('typed metadata and closed proof schema reject opposites and extras', () => {
  for (const key of [
    'configPath',
    'userConfigPath',
    'topLevelName',
    'definedEnvironments',
  ]) {
    const config = emitted();
    config[key] = null;
    assert.throws(() => checkNormalization(config, record()));
  }
  for (const [key, value] of [
    ['extra', true],
    ['schema', 0],
    ['inputHash', 'bad'],
    ['inputPath', './relative'],
    ['platform', 'other'],
  ]) {
    const proof = record();
    proof[key] = value;
    assert.throws(() => checkNormalization(emitted(), proof));
  }
});
test('input hash race fails independently of policy equality', () => {
  checkInputHashes(Buffer.from('same'), Buffer.from('same'), hash('same'));
  assert.throws(
    () =>
      checkInputHashes(
        Buffer.from('same'),
        Buffer.from('changed'),
        hash('same')
      ),
    /hashrace/
  );
  assert.throws(
    () =>
      checkInputHashes(Buffer.from('same'), Buffer.from('same'), hash('other')),
    /hashrace/
  );
});
test('trusted identity archive survives original and two relocations without original input', (t) => {
  for (const saved of [false, true]) {
    const f = fixture(t);
    if (saved) f.saved();
    const before = readFileSync(join(f.app, 'dist/ssr/wrangler.json'));
    assert.equal(validate(f.app).config.name, identity.name);
    const first = relocate(t, f.app);
    const second = relocate(t, first);
    validate(first);
    validate(second);
    assert.deepEqual(
      readFileSync(join(second, 'dist/ssr/wrangler.json')),
      before
    );
    assert.equal(validate(second).config.configPath, record().inputPath);
  }
});
test('public seal acquires live proof and cannot seal a synthetic trusted fixture', (t) => {
  const f = fixture(t);
  assert.throws(() => artifactManifest(f.app, sha));
});
test('missing, partial, malformed and symlink seals never fall back to live capture', (t) => {
  for (const change of ['missing', 'partial', 'malformed', 'symlink']) {
    const f = fixture(t);
    const path = join(f.app, 'meet-artifact.json');
    rmSync(path);
    if (change === 'partial') writeFileSync(path, '{}');
    if (change === 'malformed') writeFileSync(path, '{');
    if (change === 'symlink')
      symlinkSync(join(f.app, 'dist/ssr/wrangler.json'), path);
    assert.throws(() => validate(f.app));
    if (change !== 'missing')
      assert.throws(() => validateOutput(f.app, { sha }));
  }
});
test('external expected SHA is required before restore policy and cannot come from receipt', (t) => {
  const f = fixture(t);
  const manifest = f.trust();
  for (const expected of [undefined, '', 'b'.repeat(40)])
    assert.throws(() => verifyManifest(f.app, manifest, expected));
  assert.throws(() => validateOutput(f.app, { sha: 'b'.repeat(40) }));
});
test('all archive hashes reject missing/changed/extra files and pointer drift', (t) => {
  for (const change of ['missing', 'module', 'extra', 'pointer']) {
    const f = fixture(t);
    const manifest = f.trust();
    if (change === 'missing') rmSync(join(f.app, 'dist/client/asset.js'));
    if (change === 'module')
      writeFileSync(join(f.app, 'dist/ssr/index.js'), 'changed');
    if (change === 'extra')
      writeFileSync(join(f.app, 'dist/client/extra'), 'new');
    if (change === 'pointer')
      writeFileSync(join(f.app, '.wrangler/deploy/config.json'), '{}');
    assert.throws(() => verifyManifest(f.app, manifest, sha));
  }
});
test('hash verification precedes normalization metadata validation', (t) => {
  const f = fixture(t);
  const manifest = f.trust();
  manifest.normalization = null;
  writeFileSync(join(f.app, 'dist/client/asset.js'), 'changed');
  assert.throws(
    () => verifyManifest(f.app, manifest, sha),
    /restored artifact differs/
  );
});
test('trusted hash updates cannot authorize DO/R2/placement/migration policy drift', (t) => {
  for (const key of [
    'durable_objects',
    'r2_buckets',
    'placement',
    'migrations',
  ]) {
    const f = fixture(t);
    f.config[key] = {};
    f.save();
    assert.throws(() => validate(f.app));
  }
});
for (const redirect of [
  { configPath: '/tmp/wrangler.json', auxiliaryWorkers: [] },
  { configPath: '../../void.config.ts', auxiliaryWorkers: [] },
  { configPath: '../dist/ssr/wrangler.json', auxiliaryWorkers: [] },
  { configPath: '../../dist/ssr/wrangler.json', auxiliaryWorkers: [{}] },
  {
    configPath: '../../dist/ssr/wrangler.json',
    auxiliaryWorkers: [],
    extra: true,
  },
  { configPath: '../../dist/ssr/wrangler.json' },
]) {
  test('rejects invalid native and saved pointer shape/destination after trusted hash verification', (t) => {
    for (const saved of [false, true]) {
      const f = fixture(t);
      if (saved) f.saved();
      writeFileSync(
        join(
          f.app,
          saved
            ? '.void/preview-deploy-config.json'
            : '.wrangler/deploy/config.json'
        ),
        JSON.stringify(redirect)
      );
      f.trust();
      assert.throws(() => validate(f.app));
    }
  });
}
test('rejects simultaneous/missing pointers, artifact symlinks and packaged environment', (t) => {
  const f = fixture(t);
  f.saved();
  writeFileSync(
    join(f.app, '.wrangler/deploy/config.json'),
    readFileSync(join(f.app, '.void/preview-deploy-config.json'))
  );
  assert.throws(() => validate(f.app));
  rmSync(join(f.app, '.wrangler/deploy/config.json'));
  symlinkSync(
    join(f.app, 'dist/ssr/index.js'),
    join(f.app, 'dist/client/link')
  );
  assert.throws(() => validate(f.app), /symlink/);
  rmSync(join(f.app, 'dist/client/link'));
  writeFileSync(join(f.app, 'dist/client/.env.production'), 'synthetic');
  assert.throws(() => validate(f.app), /environment files/);
  rmSync(join(f.app, 'dist/client/.env.production'));
  rmSync(join(f.app, '.void/preview-deploy-config.json'));
  assert.throws(() => validate(f.app));
});

function liveFacts() {
  return {
    preconditions: {
      supplierProfileMatches: true,
      parserProfileMatches: true,
      stateMatchesInput: null,
      stateTextEqualsInput: null,
    },
    loaderSelection: {
      proven: true,
      typedConfig: {
        exists: true,
        canonical: true,
        symlink: false,
        hash: 'b'.repeat(64),
      },
      legacyJsonExists: false,
      legacyJsoncExists: false,
      metadataSelectsMaterialized: true,
    },
    materialized: { jsonObject: true },
    materializerHash: NORMALIZATION_PROFILE.materializer,
    metadata: {
      configPathEqualsInput: true,
      userConfigPathEqualsInput: true,
      topLevelNameEqualsInput: true,
      definedEnvironmentsEqualsInput: true,
    },
    status: 'unqualified',
  };
}
test('live probe requires measured loader/profile/metadata facts while unknown history stays unknown', () => {
  const unknown = liveFacts();
  checkLiveProbe(unknown);
  assert.equal(unknown.preconditions.stateMatchesInput, null);
  for (const key of ['supplierProfileMatches', 'parserProfileMatches']) {
    const probe = liveFacts();
    probe.preconditions[key] = false;
    probe.status = 'pass';
    assert.throws(() => checkLiveProbe(probe), /profilematch/);
  }
  for (const key of ['legacyJsonExists', 'legacyJsoncExists']) {
    const probe = liveFacts();
    probe.loaderSelection[key] = true;
    assert.throws(() => checkLiveProbe(probe), /loader/);
  }
  const ambiguous = liveFacts();
  ambiguous.loaderSelection.proven = false;
  assert.throws(() => checkLiveProbe(ambiguous), /inputrelation/);
  const drift = liveFacts();
  drift.preconditions.stateMatchesInput = false;
  assert.throws(() => checkLiveProbe(drift), /retained/);
});

// Explicit measured-reader fixtures; these do not qualify the public CLI.
test('capture remeasures complete loader/materializer state exactly twice', (t) => {
  for (const change of [
    'unchanged',
    'materializer',
    'typed-bytes',
    'typed-remove',
    'legacy-json',
    'legacy-jsonc',
    'typed-identity',
    'input-race',
    'profile-race',
  ]) {
    const app = mkdtempSync(join(tmpdir(), 'meet-capture-race-'));
    t.after(() => rmSync(app, { recursive: true, force: true }));
    const inputPath = join(app, '.void-wrangler.jsonc');
    const typedPath = join(app, 'void.config.ts');
    const chunkPath = join(app, 'materializer.js');
    writeFileSync(inputPath, JSON.stringify(authored()));
    writeFileSync(typedPath, 'typed fixture');
    writeFileSync(chunkPath, 'materializer fixture');
    const initialChunk = hash(readFileSync(chunkPath));
    const config = emitted();
    config.configPath = config.userConfigPath = inputPath;
    let snapshots = 0;
    let profiles = 0;
    const readers = {
      input: readFileSync,
      parser: () => JSON.parse,
      profile: () => {
        profiles++;
        return {
          fixture: true,
          drift: profiles === 2 && change === 'profile-race',
        };
      },
      measure: () => {
        snapshots++;
        const probe = liveFacts();
        probe.typedSourceIdentity = typedPath;
        probe.materialized.hash = hash(readFileSync(inputPath));
        const typed = probe.loaderSelection.typedConfig;
        const typedBytes = readOptionalFileSync(typedPath);
        typed.exists = typedBytes !== undefined;
        typed.hash = typed.exists ? hash(typedBytes) : null;
        probe.loaderSelection.legacyJsonExists = existsSync(
          join(app, 'wrangler.json')
        );
        probe.loaderSelection.legacyJsoncExists = existsSync(
          join(app, 'wrangler.jsonc')
        );
        // Map this fixture's unchanged chunk to the approved measurement category.
        // No actual supplier bytes or approved hash literals are fabricated.
        if (hash(readFileSync(chunkPath)) !== initialChunk)
          probe.materializerHash = hash(readFileSync(chunkPath));
        if (snapshots === 2 && change === 'typed-identity')
          probe.typedSourceIdentity = join(app, 'other-config.ts');
        if (snapshots === 1) {
          if (change === 'input-race') writeFileSync(inputPath, '{}');
          if (change === 'materializer') writeFileSync(chunkPath, 'changed');
          if (change === 'typed-bytes')
            atomicWriteFileSync(typedPath, 'changed');
          if (change === 'typed-remove') rmSync(typedPath);
          if (change === 'legacy-json')
            writeFileSync(join(app, 'wrangler.json'), '{}');
          if (change === 'legacy-jsonc')
            writeFileSync(join(app, 'wrangler.jsonc'), '{}');
        }
        return probe;
      },
    };
    const capture = () =>
      captureNormalizationWithReaders(
        app,
        config,
        identity,
        secretNames,
        readers
      );
    if (change === 'unchanged') {
      assert.equal(capture().inputHash, hash(readFileSync(inputPath)));
      assert.equal(profiles, 2);
    } else
      assert.throws(
        capture,
        /meet_normalization:(hashrace|inputrelation|profilematch):/
      );
    assert.equal(snapshots, 2, change);
  }
});
