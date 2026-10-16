import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  evaluateEmployeeComposedPackets,
  selectEmployeeComposedProfile,
  validateEmployeeComposedManifest,
} from './employee-schema-composed-profile.mjs';
import { foundationPackets, schemaReceipt } from './employee-schema-tap.mjs';

const name = 'employee-creation-composed-v1';
// Synthetic commit-shaped bindings exercise validation, never attest Git objects.
const source = '0123456789abcdef0123456789abcdef01234567';
const otherSource = 'fedcba9876543210fedcba9876543210fedcba98';
const base = '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea';
const clone = (value) => structuredClone(value);
function manifest() {
  const profile = selectEmployeeComposedProfile(name);
  return {
    profile: name,
    baseSourceSha: base,
    sourceSha: source,
    files: clone(profile.sourceFiles),
    migrations: clone(profile.migrations),
  };
}
function tap(count) {
  return `BEGIN\n${Array.from({ length: count }, (_, i) => `ok ${i + 1} - fixture assertion`).join('\n')}\n1..${count}\nROLLBACK\n`;
}
function input() {
  return {
    manifest: manifest(),
    packets: selectEmployeeComposedProfile(name).packets.map((packet) => ({
      file: packet.file,
      sourceSha: source,
      sha256: packet.sha256,
      exitCode: 0,
      tap: tap(packet.assertions),
    })),
  };
}
const evaluate = (value = input()) =>
  evaluateEmployeeComposedPackets(value, source);

test('explicit profile retains foundation172 and requires journal48 plus repair61', () => {
  const profile = selectEmployeeComposedProfile(name);
  assert.equal(profile.baseSourceSha, base);
  assert.equal(profile.sourceFiles.length, 40);
  assert.deepEqual(
    profile.packets.map(({ file, assertions }) => [file, assertions]),
    [
      ...foundationPackets,
      ['employee-creation-operations.sql', 48],
      ['employee-creation-reserved-preflight.sql', 61],
    ]
  );
  assert.deepEqual(
    profile.migrations.map(({ path }) => path.split('/').at(-1)),
    [
      '20261011002107_employee_creation_identity.sql',
      '20261011002108_employee_creation_finalization.sql',
      '20261011002109_employee_restoration.sql',
      '20261016093001_employee_creation_operations.sql',
      '20261016093002_employee_creation_reserved_preflight.sql',
    ]
  );
  assert.equal(Object.hasOwn(profile, 'sourceSha'), false);
});

for (const bad of [
  undefined,
  null,
  '',
  'employee-creation-restoration',
  `${name} `,
  1,
  {},
  ['employee-creation-composed-v1'],
]) {
  test(`profile selection rejects ${JSON.stringify(bad)}`, () => {
    assert.throws(() => selectEmployeeComposedProfile(bad));
  });
}

test('profile and nested plans cannot be mutated by callers', () => {
  const profile = selectEmployeeComposedProfile(name);
  assert.throws(() => {
    profile.packets[0].assertions = 1;
  });
  assert.throws(() => {
    profile.sourceFiles[0].sha256 = '0'.repeat(64);
  });
  assert.throws(() => {
    profile.migrations.reverse();
  });
  assert.equal(selectEmployeeComposedProfile(name).packets[0].assertions, 25);
});

test('frozen SQL and original packet hashes match actual receiver bytes', () => {
  const profile = selectEmployeeComposedProfile(name);
  const local = profile.sourceFiles.filter(
    ({ path }) =>
      path.includes('2026101100210') ||
      path.includes('20261016093002') ||
      profile.packets
        .filter(({ group }) => group === 'foundation')
        .some(({ file }) => path.endsWith(`/${file}`)) ||
      path.endsWith('/employee-creation-reserved-preflight.sql')
  );
  assert.equal(local.length, 10);
  for (const entry of local) {
    const bytes = readFileSync(
      new URL(`../../../${entry.path}`, import.meta.url)
    );
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      entry.sha256,
      entry.path
    );
  }
});

test('manifest binds a supplied new source and stable source-only digest', () => {
  const actual = validateEmployeeComposedManifest(manifest(), source);
  assert.equal(actual.sourceSha, source);
  assert.equal(actual.baseSourceSha, base);
  assert.match(actual.sourceManifestSha256, /^[a-f0-9]{64}$/);
  const changed = manifest();
  changed.sourceSha = otherSource;
  assert.notEqual(
    validateEmployeeComposedManifest(changed, otherSource).sourceManifestSha256,
    actual.sourceManifestSha256
  );
});

function withField(path, value) {
  return (input) => {
    const keys = path.split('.');
    const parent = keys.slice(0, -1).reduce((row, key) => row[key], input);
    parent[keys.at(-1)] = value;
    return input;
  };
}
function withoutField(key) {
  return (input) => {
    delete input[key];
    return input;
  };
}
const manifestCuts = [
  ['missing manifest', () => undefined],
  ['null manifest', () => null],
  ['unknown profile', withField('profile', 'unknown')],
  ['wrong base', withField('baseSourceSha', otherSource)],
  ['wrong source', withField('sourceSha', otherSource)],
  ['unbound placeholder', withField('sourceSha', 'ROOT_COMPOSED_SOURCE_SHA')],
  ['missing field', withoutField('files')],
  ['extra qualification', withField('schemaQualified', true)],
  ['absent file', (m) => ({ ...m, files: m.files.slice(0, -1) })],
  ['extra file', (m) => ({ ...m, files: [...m.files, m.files[0]] })],
  ['duplicate file', (m) => withField('files.1', m.files[0])(m)],
  ['file order', (m) => ({ ...m, files: m.files.reverse() })],
  ['wrong file hash', withField('files.0.sha256', '0'.repeat(64))],
  ['nonstring hash', withField('files.0.sha256', null)],
  ['path traversal', withField('files.0.path', '../foreign')],
  ['extra file metadata', withField('files.0.applied', true)],
  [
    'missing migration',
    (m) => ({ ...m, migrations: m.migrations.slice(0, -1) }),
  ],
  ['migration order', (m) => ({ ...m, migrations: m.migrations.reverse() })],
  ['duplicate migration', (m) => withField('migrations.4', m.migrations[3])(m)],
  ['wrong migration hash', withField('migrations.4.sha256', 'f'.repeat(64))],
  ['wrong migration path', withField('migrations.4.path', 'unknown.sql')],
  ['array manifest', () => []],
];
for (const [label, cut] of manifestCuts) {
  test(`manifest denies ${label}`, () =>
    assert.throws(() =>
      validateEmployeeComposedManifest(cut(manifest()), source)
    ));
}
for (const binding of [
  undefined,
  null,
  '',
  base,
  '0'.repeat(40),
  'ROOT_COMPOSED_SOURCE_SHA',
  source.toUpperCase(),
  {},
  123,
]) {
  test(`Root binding denies ${JSON.stringify(binding)}`, () => {
    const m = manifest();
    m.sourceSha = binding;
    assert.throws(() => validateEmployeeComposedManifest(m, binding));
  });
}

test('synthetic valid transcripts validate281 without asserting execution or account delivery', () => {
  const result = evaluate();
  assert.equal(result.packetTranscriptValidated, true);
  assert.equal(result.foundationAssertions, 172);
  assert.equal(result.additionalAssertions, 109);
  assert.equal(result.assertions, 281);
  assert.equal(result.packets.length, 7);
  for (const key of [
    'schemaQualified',
    'typesQualified',
    'consumerQualified',
    'catalogQualified',
    'tlsQualified',
    'commitQualified',
    'racesQualified',
    'runtimeQualified',
    'combinedQualified',
    'accountQualified',
    'providerQualified',
    'productionApplied',
  ])
    assert.equal(result[key], false, key);
  assert.equal(result.actualCatalogDefinitionHash, null);
  assert.equal(result.generatedTypesSha256, null);
  assert.throws(() => {
    result.schemaQualified = true;
  });
  assert.throws(() => {
    result.packets[0].assertions = 0;
  });
});

const packetCuts = [
  ['missing packets', withoutField('packets')],
  ['partial packet set', (v) => ({ ...v, packets: v.packets.slice(0, -1) })],
  ['extra packet', (v) => ({ ...v, packets: [...v.packets, v.packets[0]] })],
  ['duplicate packet', (v) => withField('packets.6', v.packets[5])(v)],
  ['wrong order', (v) => ({ ...v, packets: v.packets.reverse() })],
  ['wrong packet source', withField('packets.0.sourceSha', otherSource)],
  ['wrong packet hash', withField('packets.6.sha256', '0'.repeat(64))],
  ['wrong packet name', withField('packets.0.file', 'unknown.sql')],
  ['false ACK', withField('packets.0.exitCode', false)],
  ['true ACK', withField('packets.0.exitCode', true)],
  ['string exit code', withField('packets.0.exitCode', '0')],
  ['failed process', withField('packets.0.exitCode', 1)],
  [
    'missing exit',
    (v) => {
      delete v.packets[0].exitCode;
      return v;
    },
  ],
  ['fake committed ACK', withField('packets.0.committed', true)],
  [
    'unadmitted external receipts',
    withField('externalReceipts', { catalogQualified: true }),
  ],
  ['foreign manifest', withField('manifest.sourceSha', otherSource)],
];
for (const [label, cut] of packetCuts) {
  test(`packet evidence denies ${label}`, () =>
    assert.throws(() => evaluate(cut(input()))));
}
const transcriptCuts = [
  ['missing TAP', () => undefined],
  ['null TAP', () => null],
  ['nonstring TAP', () => {}],
  ['wrong plan and matching assertions', () => tap(24)],
  ['missing assertion', (t) => t.replace('ok 1 - fixture assertion\n', '')],
  ['wrong ordinal', (t) => t.replace('ok 1 -', 'ok 2 -')],
  ['failed assertion', (t) => t.replace('ok 1 -', 'not ok 1 -')],
  ['duplicate plan', (t) => t.replace('1..25', '1..25\n1..25')],
  [
    'skip',
    (t) => t.replace('ok 1 - fixture assertion', 'ok 1 - fixture # SKIP'),
  ],
  [
    'TODO',
    (t) => t.replace('ok 1 - fixture assertion', 'ok 1 - fixture # TODO'),
  ],
  ['standalone TODO', (t) => t.replace('1..25', '# TODO\n1..25')],
  ['standalone skip', (t) => t.replace('1..25', '# skip\n1..25')],
  ['bailout', (t) => t.replace('1..25', 'Bail out! fixture\n1..25')],
  ['missing begin', (t) => t.replace('BEGIN\n', '')],
  ['missing rollback', (t) => t.replace('ROLLBACK\n', '')],
  ['partial rollback', (t) => t.replace('ROLLBACK', 'ROLLBAC')],
  ['commit', (t) => t.replace('ROLLBACK', 'COMMIT')],
  ['embedded commit', (t) => t.replace('1..25', 'COMMIT\n1..25')],
  ['embedded lowercase commit', (t) => t.replace('1..25', 'commit;\n1..25')],
  ['duplicate begin', (t) => `BEGIN\n${t}`],
  [
    'early rollback',
    (t) => t.replace('BEGIN', 'BEGIN\nROLLBACK').replace(/ROLLBACK\n$/, ''),
  ],
  ['output after rollback', (t) => `${t}SELECT 1\n`],
  ['oversized transcript', () => 'x'.repeat(1024 * 1024 + 1)],
];
for (const [label, cut] of transcriptCuts) {
  test(`actual parser denies ${label}`, () => {
    const value = input();
    value.packets[0].tap = cut(value.packets[0].tap);
    assert.throws(() => evaluate(value));
  });
}

test('the unchanged foundation profile still reports exactly its original172 contract', () => {
  const packets = foundationPackets.map(([file, assertions]) => ({
    file,
    assertions,
  }));
  const before = schemaReceipt({
    sourceSha: base,
    packets,
    lifecycleCode: 0,
    cleanupSucceeded: true,
  });
  evaluate();
  const after = schemaReceipt({
    sourceSha: base,
    packets,
    lifecycleCode: 0,
    cleanupSucceeded: true,
  });
  assert.deepEqual(after, before);
  assert.equal(after.assertions, 172);
  assert.equal(after.scope, 'employee-creation-restoration');
});
