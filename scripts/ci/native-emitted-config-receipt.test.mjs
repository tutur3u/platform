import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bounded } from './native-emitted-config-receipt.mjs';
import { decodeReceipt } from './native-receipt-layout.mjs';

const helper = fileURLToPath(
  new URL('./native-emitted-config-receipt.mjs', import.meta.url)
);
const sha = 'a'.repeat(40);
const canary = 'SECRET_CANARY_NEVER_DISCLOSE';
const hash = (value) => createHash('sha256').update(value).digest('hex');

function fixture(t, { saved = false, config = {} } = {}) {
  const root = realpathSync(mkdtempSync(resolve(tmpdir(), 'native-receipt-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, content) => {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      typeof content === 'string' ? content : JSON.stringify(content)
    );
    return target;
  };
  put('.git/HEAD', `ref: refs/heads/fixture\n`);
  put('.git/refs/heads/fixture', `${sha}\n`);
  put('apps/example/package.json', { name: 'fixture', type: 'module' });
  put('apps/example/node_modules/void/package.json', {
    name: 'void',
    version: '1.1.12',
    main: './index.cjs',
  });
  put(
    'apps/example/node_modules/void/index.cjs',
    `throw new Error('${canary}');`
  );
  const plugin =
    'apps/example/node_modules/void/node_modules/@cloudflare/vite-plugin';
  put(`${plugin}/package.json`, {
    name: '@cloudflare/vite-plugin',
    version: '1.64.0',
    exports: { '.': { import: './dist/index.mjs' } },
  });
  put(`${plugin}/dist/index.mjs`, `throw new Error('${canary}');`);
  put(`${plugin}/node_modules/wrangler/package.json`, {
    name: 'wrangler',
    version: '4.151.0',
    main: './index.cjs',
  });
  put(
    `${plugin}/node_modules/wrangler/index.cjs`,
    `throw new Error('${canary}');`
  );
  // A visible app Wrangler is deliberately different from the plugin's owner.
  put('apps/example/node_modules/wrangler/package.json', {
    name: 'wrangler',
    version: '99.0.0',
    main: './index.cjs',
  });
  put(
    'apps/example/node_modules/wrangler/index.cjs',
    `throw new Error('${canary}');`
  );
  const emitted = put('apps/example/dist/server/wrangler.json', config);
  const pointer = put(
    `apps/example/${saved ? '.void/preview-deploy-config.json' : '.wrangler/deploy/config.json'}`,
    { configPath: '../../dist/server/wrangler.json', auxiliaryWorkers: [] }
  );
  mkdirSync(resolve(root, 'runner'));
  const invoke = (
    event = sha,
    output = resolve(root, 'runner/receipt.json')
  ) => {
    const result = spawnSync(
      process.execPath,
      [helper, 'apps/example', event, output],
      {
        cwd: root,
        env: { RUNNER_TEMP: resolve(root, 'runner') },
        encoding: 'utf8',
      }
    );
    assert.equal(result.error, undefined);
    assert.ok(Buffer.byteLength(result.stdout + result.stderr) <= 1200);
    assert.match(
      result.stdout + result.stderr,
      /^receipt=(recorded|unavailable)\n$/
    );
    assert.ok(!(result.stdout + result.stderr).includes(canary));
    const raw = readFileSync(output, 'utf8');
    assert.ok(Buffer.byteLength(raw) <= 16 * 1024);
    assert.ok(!raw.includes(canary));
    assert.ok(!raw.includes(root));
    return { result, raw, receipt: decodeReceipt(raw) };
  };
  return { root, put, emitted, pointer, invoke };
}

for (const saved of [false, true]) {
  test(`${saved ? 'saved' : 'native'} pointer uses the native relative base`, (t) => {
    const f = fixture(t, {
      saved,
      config: {
        name: canary,
        configPath: canary,
        userConfigPath: null,
        definedEnvironments: [canary],
        vars: { [canary]: canary },
        [canary]: { [canary]: canary },
        emptyObject: {},
        emptyArray: [],
        falseValue: false,
        nullValue: null,
        stringValue: '',
      },
    });
    const pointerBefore = readFileSync(f.pointer);
    const configBefore = readFileSync(f.emitted);
    const { receipt, result } = f.invoke('b'.repeat(40));
    assert.equal(result.status, 0);
    assert.equal(receipt.pointer.form, saved ? 'saved' : 'native');
    assert.equal(receipt.pointer.configPath.equalsEmitted, true);
    assert.equal(receipt.source.head, sha);
    assert.equal(receipt.source.eventSha, 'b'.repeat(40));
    assert.equal(receipt.source.equal, false);
    assert.equal(receipt.suppliers.wrangler.version, '4.151.0');
    assert.equal(receipt.keyCount, 11);
    const unknown = receipt.inventory.find(
      (item) => item.unknownNameHash === hash(canary)
    );
    assert.equal(unknown.type, 'object');
    assert.equal(unknown.empty, false);
    for (const name of ['emptyObject', 'emptyArray']) {
      assert.equal(
        receipt.inventory.find((item) => item.unknownNameHash === hash(name))
          .empty,
        true
      );
    }
    for (const name of ['falseValue', 'nullValue', 'stringValue']) {
      assert.equal(
        receipt.inventory.find((item) => item.unknownNameHash === hash(name))
          .empty,
        false
      );
    }
    assert.deepEqual(readFileSync(f.pointer), pointerBefore);
    assert.deepEqual(readFileSync(f.emitted), configBefore);
  });
}

test('queues distinguish absent, empty object, empty arrays and configured resources', (t) => {
  const cases = [
    [{}, 'absent', undefined, undefined],
    [{ queues: {} }, 'object', true, undefined],
    [{ queues: { producers: [], consumers: [] } }, 'object', false, 0],
    [
      {
        queues: {
          producers: [{ queue: canary, binding: canary }],
          consumers: [{ queue: canary, max_batch_size: 10 }],
        },
      },
      'object',
      false,
      1,
    ],
  ];
  for (const [config, kind, empty, count] of cases) {
    const f = fixture(t, { config });
    const { receipt, result } = f.invoke();
    assert.equal(result.status, 0);
    assert.equal(receipt.queues.type, kind);
    assert.equal(receipt.queues.empty, empty);
    if (count !== undefined) {
      assert.equal(receipt.queues.producers.count, count);
      assert.equal(receipt.queues.consumers.count, count);
      if (count)
        assert.deepEqual(
          receipt.queues.producers.objectKeyHashes,
          [hash('queue'), hash('binding')].sort()
        );
    }
  }
});

for (const scenario of [
  'ambiguous',
  'pointer-symlink',
  'config-symlink',
  'ancestor-symlink',
  'escape',
  'nonregular',
  'malformed-emitted-config',
  'missing',
]) {
  test(`rejects ${scenario} without raw errors`, (t) => {
    const f = fixture(t);
    if (scenario === 'ambiguous')
      f.put('apps/example/.void/preview-deploy-config.json', {});
    if (scenario === 'pointer-symlink') {
      rmSync(f.pointer);
      symlinkSync(f.emitted, f.pointer);
    }
    if (scenario === 'config-symlink') {
      rmSync(f.emitted);
      symlinkSync(f.put('elsewhere.json', {}), f.emitted);
    }
    if (scenario === 'ancestor-symlink') {
      rmSync(dirname(f.emitted), { recursive: true });
      f.put('other/wrangler.json', {});
      symlinkSync(resolve(f.root, 'other'), dirname(f.emitted));
    }
    if (scenario === 'escape')
      f.put('apps/example/.wrangler/deploy/config.json', {
        configPath: '../../../../outside.json',
        auxiliaryWorkers: [],
      });
    if (scenario === 'nonregular') {
      rmSync(f.emitted);
      mkdirSync(f.emitted);
    }
    if (scenario === 'malformed-emitted-config')
      writeFileSync(f.emitted, canary);
    if (scenario === 'missing') rmSync(f.pointer);
    const { result, receipt } = f.invoke();
    assert.equal(result.status, 1);
    assert.equal(receipt.status, 'unavailable');
    assert.equal(receipt.inventory, undefined);
  });
}

for (const saved of [false, true]) {
  const configPath = '../../dist/server/wrangler.json';
  const cases = [
    ['invalid-json', `{${canary}`],
    ['missing-configPath', { auxiliaryWorkers: [] }],
    [
      'non-string-configPath',
      { configPath: { value: canary }, auxiliaryWorkers: [] },
    ],
    ['empty-configPath', { configPath: '', auxiliaryWorkers: [] }],
    ['unexpected-keys', { configPath, auxiliaryWorkers: [], [canary]: canary }],
    ['nonempty-auxiliaryWorkers', { configPath, auxiliaryWorkers: [canary] }],
    [
      'nonarray-auxiliaryWorkers',
      { configPath, auxiliaryWorkers: { value: canary } },
    ],
  ];
  for (const [scenario, pointer] of cases) {
    test(`${saved ? 'saved' : 'native'} malformed pointer rejects ${scenario}`, (t) => {
      const f = fixture(t, {
        saved,
        config: { name: canary, vars: { secret: canary } },
      });
      writeFileSync(
        f.pointer,
        typeof pointer === 'string' ? pointer : JSON.stringify(pointer)
      );
      const pointerBefore = readFileSync(f.pointer);
      const configBefore = readFileSync(f.emitted);
      const { result, receipt, raw } = f.invoke();
      assert.equal(result.status, 1);
      assert.equal(receipt.status, 'unavailable');
      assert.equal(receipt.inventory, undefined);
      assert.equal(result.stdout, 'receipt=unavailable\n');
      assert.equal(result.stderr, '');
      const logs = result.stdout + result.stderr;
      assert.ok(Buffer.byteLength(logs) <= 1200);
      assert.ok(!logs.includes(canary));
      assert.ok(!raw.includes(canary));
      assert.deepEqual(readFileSync(f.pointer), pointerBefore);
      assert.deepEqual(readFileSync(f.emitted), configBefore);
    });
  }
}

test('empty inventory objects derive zero child keys; changed objects retain full shape', (t) => {
  const config = {
    vars: {},
    [canary]: {},
    changed: { [canary]: true, other: {} },
  };
  const { receipt, result, raw } = fixture(t, { config }).invoke();
  assert.equal(result.status, 0);
  assert.deepEqual(receipt.inventory, [
    { name: 'vars', type: 'object', empty: true },
    { unknownNameHash: hash(canary), type: 'object', empty: true },
    {
      unknownNameHash: hash('changed'),
      type: 'object',
      empty: false,
      keyCount: 2,
      keyHashes: [hash(canary), hash('other')].sort(),
    },
  ]);
  for (const row of receipt.inventory.filter((item) => item.empty)) {
    const name = row.name ?? canary;
    assert.equal(Object.keys(config[name]).length, 0);
    assert.equal(row.type, 'object');
    assert.equal(Object.hasOwn(row, 'keyCount'), false);
    assert.equal(Object.hasOwn(row, 'keyHashes'), false);
  }
  assert.equal(receipt.inventoryHash, hash(JSON.stringify(receipt.inventory)));
  assert.ok(!raw.includes(canary));
});

test('exact receipt byte boundary preserves full inventory or fails closed', () => {
  const receipt = {
    schema: 1,
    diagnosticOnly: true,
    status: 'recorded',
    keyCount: 1,
    configHash: hash('config'),
    pointerHash: hash('pointer'),
    inventoryHash: hash('inventory'),
    inventory: [{ unknownNameHash: hash(canary), type: 'object', empty: true }],
    padding: '',
  };
  receipt.padding = 'x'.repeat(16 * 1024 - Buffer.byteLength(bounded(receipt)));
  const full = bounded(receipt);
  assert.equal(Buffer.byteLength(full), 16 * 1024);
  assert.deepEqual(decodeReceipt(full), receipt);
  receipt.padding += 'x';
  const overflow = bounded(receipt);
  assert.deepEqual(JSON.parse(overflow), {
    schema: 1,
    diagnosticOnly: true,
    status: 'unavailable',
    reason: 'overflow',
    keyCount: 1,
    configHash: receipt.configHash,
    pointerHash: receipt.pointerHash,
    inventoryHash: receipt.inventoryHash,
  });
  assert.ok(!overflow.includes(canary));
});

test('overflow retains hashes/counts, fails and never presents a partial inventory', (t) => {
  const config = Object.fromEntries(
    Array.from({ length: 400 }, (_, i) => [`${canary}${i}`, {}])
  );
  const f = fixture(t, { config });
  const { receipt, result } = f.invoke();
  assert.equal(result.status, 1);
  assert.equal(receipt.reason, 'overflow');
  assert.equal(receipt.keyCount, 400);
  assert.equal(receipt.configHash, hash(readFileSync(f.emitted)));
  assert.match(receipt.inventoryHash, /^[a-f0-9]{64}$/);
  assert.match(receipt.pointerHash, /^[a-f0-9]{64}$/);
  assert.equal(receipt.inventory, undefined);
});

test('public provenance failure is unavailable even with a readable config', (t) => {
  const f = fixture(t, { config: { queues: {} } });
  rmSync(resolve(f.root, 'apps/example/node_modules/void'), {
    recursive: true,
  });
  const { receipt, result } = f.invoke();
  assert.equal(result.status, 1);
  assert.equal(receipt.reason, 'public_provenance_unavailable');
  assert.equal(receipt.inventory.length, 1);
});

test('78-field inventory fits without an artificial 1100-byte receipt cap', (t) => {
  const config = Object.fromEntries(
    Array.from({ length: 78 }, (_, i) => [`field${i}`, {}])
  );
  const { receipt, result, raw } = fixture(t, { config }).invoke();
  assert.equal(
    result.status,
    0,
    JSON.stringify({
      status: result.status,
      reason: receipt.reason ?? null,
      keyCount: receipt.keyCount ?? null,
      inventoryLength: receipt.inventory?.length ?? null,
      defaultProbePresent: Object.hasOwn(receipt, 'defaultProbe'),
      serializedByteCount: Buffer.byteLength(raw),
    })
  );
  assert.equal(receipt.keyCount, 78);
  assert.equal(receipt.inventory.length, 78);
  assert.deepEqual(
    receipt.inventory,
    Object.keys(config).map((name) => ({
      unknownNameHash: hash(name),
      type: 'object',
      empty: true,
    }))
  );
  assert.equal(receipt.defaultProbe.fields.length, 11);
  assert.equal(receipt.inventoryHash, hash(JSON.stringify(receipt.inventory)));
  assert.ok(Buffer.byteLength(raw) > 1100);
});

test('output cannot escape RUNNER_TEMP, replace an existing file or follow a symlink', (t) => {
  const f = fixture(t);
  const untouched = f.put('untouched.json', canary);
  const existing = f.put('runner/existing.json', canary);
  const link = resolve(f.root, 'runner/link.json');
  symlinkSync(untouched, link);
  for (const output of [untouched, existing, link]) {
    const result = spawnSync(
      process.execPath,
      [helper, 'apps/example', sha, output],
      {
        cwd: f.root,
        env: { RUNNER_TEMP: resolve(f.root, 'runner') },
        encoding: 'utf8',
      }
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'receipt=unavailable\n');
    assert.ok(Buffer.byteLength(result.stdout + result.stderr) <= 1200);
  }
  assert.equal(readFileSync(untouched, 'utf8'), canary);
  assert.equal(readFileSync(existing, 'utf8'), canary);
});

test('missing source provenance fails instead of borrowing event identity', (t) => {
  const f = fixture(t);
  rmSync(resolve(f.root, '.git'), { recursive: true });
  const { result, receipt } = f.invoke();
  assert.equal(result.status, 1);
  assert.equal(receipt.status, 'unavailable');
  assert.equal(receipt.source, undefined);
});

// AUTHORED UNRUN: these are synthetic defaults, not actual runtime evidence.
// Resolve installed data from Void's own context; never execute Void or hooks.
function owningVoidDirectory() {
  let directory = dirname(
    realpathSync(
      createRequire(import.meta.url).resolve('void', {
        paths: [
          resolve(dirname(fileURLToPath(import.meta.url)), '../../apps/meet'),
        ],
      })
    )
  );
  while (directory !== dirname(directory)) {
    try {
      const metadata = JSON.parse(
        readFileSync(resolve(directory, 'package.json'))
      );
      if (metadata.name === 'void') return directory;
    } catch {
      /* Not a package boundary. */
    }
    directory = dirname(directory);
  }
  throw new Error('installed_void_unavailable');
}

function materializedFixture(t, input = { name: canary }) {
  const f = fixture(t);
  const directory = resolve(f.root, 'apps/example/node_modules/void');
  rmSync(directory, { recursive: true });
  symlinkSync(owningVoidDirectory(), directory, 'dir');
  const path = f.put('apps/example/.void-wrangler.jsonc', input);
  f.put('apps/example/void.config.ts', `throw new Error('${canary}');`);
  f.put('apps/example/void.lock.json', {
    version: 1,
    source: input,
    resolved: input,
    text: JSON.stringify(input),
  });
  const config = {
    configPath: path,
    userConfigPath: path,
    topLevelName: input.name,
    definedEnvironments: [],
    jsx_factory: 'React.createElement',
    jsx_fragment: 'React.Fragment',
    durable_objects: { bindings: [] },
    queues: { producers: [], consumers: [] },
    logfwdr: { bindings: [] },
    python_modules: { exclude: ['**/*.pyc'] },
    upload_source_maps: true,
    dev: {
      ip: 'localhost',
      local_protocol: 'http',
      upstream_protocol: 'http',
      enable_containers: true,
      generate_types: false,
    },
  };
  f.put('apps/example/dist/server/wrangler.json', config);
  return { ...f, path, input, config };
}

const evidence = (probe, name) =>
  probe.evidence.find((row) => row.name === name);
function recordedCandidates(probe) {
  assert.equal(probe.fields.length, 11);
  assert.equal(probe.status, 'recorded');
  assert.equal(probe.reason, 'value_candidates_only');
  assert.equal(probe.causalProvenance.status, 'unknown');
  for (const row of probe.fields) assert.equal(row.status, 'recorded');
}

test('actual collector derives a supplier-ready, redacted eleven-row baseline', (t) => {
  const f = materializedFixture(t);
  const probe = f.invoke().receipt.defaultProbe;
  recordedCandidates(probe);
  assert.ok(probe.fields.every((row) => row.candidateMatch === true));
  assert.equal(probe.preconditions.supplierProfileMatches, true);
  assert.equal(probe.preconditions.parserProfileMatches, true);
  assert.equal(probe.parser.version, '3.3.1');
  assert.equal(probe.loaderSelection.proven, true);
  assert.equal(probe.materialized.hash, hash(readFileSync(f.path)));
  for (const row of probe.evidence) assert.equal(row.status, 'matched');
  assert.ok(probe.fields.every((row) => row.authoredPresent === null));
});

test('unsafe source hooks and resource identities stay data and remain redacted', (t) => {
  const f = materializedFixture(t, {
    name: canary,
    build: { command: canary, cwd: canary, [canary]: canary },
    queues: { producers: [{ binding: canary, queue: canary }] },
  });
  f.config.queues = f.input.queues;
  f.put('apps/example/dist/server/wrangler.json', f.config);
  const probe = f.invoke().receipt.defaultProbe;
  recordedCandidates(probe);
  assert.equal(probe.input.buildCommandPresent, true);
  assert.equal(probe.input.buildCwdPresent, true);
  assert.equal(probe.input.buildShape.keyCount, 3);
  assert.equal(
    probe.fields.find((row) => row.name === 'queues').candidateMatch,
    false
  );
  assert.equal(
    probe.fields.find((row) => row.name === 'queues').inputPresent,
    true
  );
  assert.equal(
    probe.fields.find((row) => row.name === 'queues').retainedSourcePresent,
    true
  );
  assert.equal(
    probe.fields.find((row) => row.name === 'dev').candidateMatch,
    true
  );
});

for (const key of ['configPath', 'userConfigPath', 'topLevelName']) {
  test(`collector isolates a wrong ${key} without following its value`, (t) => {
    const f = materializedFixture(t);
    f.config[key] = `${canary}/never-open`;
    f.put('apps/example/dist/server/wrangler.json', f.config);
    const probe = f.invoke().receipt.defaultProbe;
    recordedCandidates(probe);
    assert.equal(evidence(probe, key).status, 'mismatch');
    assert.equal(
      evidence(probe, key).reason,
      {
        configPath: 'metadata_config_path_mismatch',
        userConfigPath: 'metadata_user_config_path_mismatch',
        topLevelName: 'metadata_top_level_name_mismatch',
      }[key]
    );
    for (const row of probe.fields)
      assert.equal(row.candidateMatch, row.name !== key);
  });
}

for (const scenario of [
  'missing-input',
  'symlink',
  'dangling-symlink',
  'oversize',
  'malformed-jsonc',
  'trailing-content',
]) {
  test(`collector rejects ${scenario} from an otherwise-ready baseline`, (t) => {
    const f = materializedFixture(t);
    if (['missing-input', 'symlink', 'dangling-symlink'].includes(scenario))
      rmSync(f.path);
    if (scenario === 'symlink') symlinkSync(f.emitted, f.path);
    if (scenario === 'dangling-symlink')
      symlinkSync(resolve(f.root, 'missing'), f.path);
    if (scenario === 'oversize')
      writeFileSync(f.path, ' '.repeat(4 * 1024 * 1024 + 1));
    if (scenario === 'malformed-jsonc') writeFileSync(f.path, '{ "name":, }');
    if (scenario === 'trailing-content')
      writeFileSync(f.path, `${JSON.stringify(f.input)} {}`);
    const probe = f.invoke().receipt.defaultProbe;
    assert.equal(probe.status, 'unavailable');
    assert.equal(
      probe.materialized.reason,
      ['malformed-jsonc', 'trailing-content'].includes(scenario)
        ? 'materialized_parse_errors'
        : 'materialized_unavailable'
    );
    assert.equal(evidence(probe, 'supplier').status, 'matched');
    assert.equal(evidence(probe, 'parser').status, 'matched');
    for (const row of probe.fields) {
      assert.equal(row.status, 'unavailable');
      assert.equal(row.reason, 'materialized_input_unavailable');
      assert.equal(row.candidateMatch, null);
    }
    if (scenario.includes('symlink'))
      assert.equal(probe.materialized.symlink, true);
  });
}

for (const scenario of [
  'comments-trailing-comma',
  'missing-state',
  'wrong-state',
  'malformed-state',
]) {
  test(`${scenario} retains value comparisons and truthful state provenance`, (t) => {
    const f = materializedFixture(t);
    if (scenario === 'comments-trailing-comma')
      writeFileSync(
        f.path,
        `// ${canary}\n{ "name": ${JSON.stringify(canary)}, /* data */ }`
      );
    if (scenario === 'missing-state')
      rmSync(resolve(f.root, 'apps/example/void.lock.json'));
    if (scenario === 'wrong-state')
      f.put('apps/example/void.lock.json', {
        version: 1,
        source: {},
        resolved: {},
        text: '{}',
      });
    if (scenario === 'malformed-state')
      f.put('apps/example/void.lock.json', '{');
    const probe = f.invoke().receipt.defaultProbe;
    recordedCandidates(probe);
    assert.ok(probe.fields.every((row) => row.candidateMatch === true));
    assert.equal(evidence(probe, 'supplier').status, 'matched');
    assert.equal(evidence(probe, 'parser').status, 'matched');
    const state = evidence(
      probe,
      scenario === 'comments-trailing-comma'
        ? 'stateText'
        : scenario === 'wrong-state'
          ? 'stateResolved'
          : 'stateShape'
    );
    assert.equal(
      state.status,
      scenario === 'missing-state' ? 'unknown' : 'mismatch'
    );
    assert.equal(
      state.reason,
      scenario === 'missing-state'
        ? 'retained_state_shape_unknown'
        : scenario === 'wrong-state'
          ? 'retained_state_resolved_mismatch'
          : scenario === 'malformed-state'
            ? 'retained_state_shape_mismatch'
            : 'retained_state_text_mismatch'
    );
  });
}

test('unmatched materializer is derived as a mismatch, never supplier proof', (t) => {
  const f = fixture(t);
  f.put(
    'apps/example/node_modules/void/index.cjs',
    'import { r as materializeCloudflareConfig } from "./cloudflare-config-fixture.mjs";'
  );
  const chunk = f.put(
    'apps/example/node_modules/void/cloudflare-config-fixture.mjs',
    `throw new Error('${canary}');`
  );
  const probe = f.invoke().receipt.defaultProbe;
  assert.equal(probe.materializerHash, hash(readFileSync(chunk)));
  assert.equal(probe.preconditions.supplierProfileMatches, false);
  assert.equal(evidence(probe, 'supplier').status, 'mismatch');
  assert.equal(evidence(probe, 'supplier').reason, 'supplier_profile_mismatch');
  assert.equal(probe.preconditions.parserProfileMatches, false);
});
