import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertPacketTap,
  assertRollbackSource,
  foundationPackets,
  schemaReceipt,
  selectSchemaPackets,
} from './employee-schema-tap.mjs';
import { runSchemaTypegen } from './employee-schema-typegen.mjs';

const file = 'employee-retained-mailbox-adoption.sql';
const sql = readFileSync(
  new URL(`../supabase/tests/${file}`, import.meta.url),
  'utf8'
);
const packets = selectSchemaPackets(false, false, true).map(
  ([file, assertions]) => ({ file, assertions })
);
const tap = () =>
  [
    'BEGIN',
    ...Array.from({ length: 40 }, (_, i) => `ok ${i + 1} - retained assertion`),
    '1..40',
    'ROLLBACK',
    '',
  ].join('\n');
const receipt = (extra = {}) =>
  schemaReceipt({
    sourceSha: 'a'.repeat(40),
    addressMigration: true,
    packets,
    generatedTypesSha256: 'b'.repeat(64),
    lifecycleCode: 0,
    cleanupSucceeded: true,
    ...extra,
  });

test('canonical address selection includes the frozen actual adoption40 packet', () => {
  assert.deepEqual(
    selectSchemaPackets(false, false, true).slice(foundationPackets.length),
    [
      ['employee-google-destination-migration.sql', 30],
      ['employee-address-migration.sql', 10],
      [file, 40],
    ]
  );
  assertRollbackSource(sql);
  assert.match(sql, /select plan\(40\);/u);
  assert.equal(
    [...sql.matchAll(/^select (?:is|isnt|ok|throws_ok)\(/gmu)].length,
    40
  );
  assert.equal(receipt().schemaQualified, true);
  assert.equal(receipt().assertions, 252);
});

for (const [name, mutate] of [
  ['omitted retained packet', (p) => p.slice(0, -1)],
  ['duplicated retained packet', (p) => [...p, p.at(-1)]],
  [
    'old Google30 plus legacy10 receipt',
    (p) => p.filter((x) => x.file !== file),
  ],
  [
    'different retained count',
    (p) => p.map((x) => (x.file === file ? { ...x, assertions: 39 } : x)),
  ],
  ['reordered packets', (p) => [...p].reverse()],
]) {
  test(`receipt cannot qualify ${name}`, () =>
    assert.equal(receipt({ packets: mutate(packets) }).schemaQualified, false));
}
for (const [name, malformed] of [
  ['missing assertion', tap().replace('ok 40 - retained assertion\n', '')],
  [
    'double assertion',
    tap().replace('ok 40 - retained assertion', 'ok 39 - retained assertion'),
  ],
  ['failed assertion', tap().replace('ok 40 -', 'not ok 40 -')],
  [
    'skipped assertion',
    tap().replace(
      'ok 40 - retained assertion',
      'ok 40 - retained assertion # SKIP'
    ),
  ],
  [
    'TODO assertion',
    tap().replace(
      'ok 40 - retained assertion',
      'ok 40 - retained assertion # TODO'
    ),
  ],
  ['missing rollback', tap().replace('ROLLBACK', '')],
  ['different plan', tap().replace('1..40', '1..39')],
]) {
  test(`actual retained count parser rejects ${name}`, () =>
    assert.throws(() => assertPacketTap(malformed, 40)));
}
test('all 40 complete sequential assertions are required', () =>
  assert.equal(assertPacketTap(tap(), 40), 40));
for (const generatedTypesSha256 of [
  undefined,
  null,
  '',
  'x'.repeat(64),
  'a'.repeat(63),
]) {
  test(`address qualification requires a generated artifact digest: ${String(generatedTypesSha256).slice(0, 8)}`, () =>
    assert.equal(receipt({ generatedTypesSha256 }).schemaQualified, false));
}
test('typegen, SQL lifecycle and cleanup are required together', () => {
  for (const extra of [{ lifecycleCode: 1 }, { cleanupSucceeded: false }])
    assert.equal(receipt(extra).schemaQualified, false);
});

for (const selected of [
  'journal',
  'personalJournal',
  'addressMigration',
  'feedback',
]) {
  test(`${selected} invokes canonical typegen against the same owned database and emits exact artifact bytes`, async (t) => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), 'employee-schema-typegen-')
    );
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const metadata = { disposableRoot: '/owned-disposable-source-snapshot' };
    const types = 'export type Database = { private: { Tables: {} } };\n';
    const events = [];
    const result = await runSchemaTypegen({
      journal: false,
      personalJournal: false,
      addressMigration: false,
      feedback: false,
      publicConsumer: false,
      [selected]: true,
      metadata,
      binaryPath: '/owned-source/supabase',
      receiptDirectory: directory,
      beforeGenerate() {
        events.push('typegen-phase');
      },
      bounded(command, args, cwd, timeout) {
        events.push('generate');
        assert.equal(command, '/owned-source/supabase');
        assert.equal(cwd, metadata.disposableRoot);
        assert.deepEqual(args, [
          'gen',
          'types',
          'typescript',
          '--local',
          '--schema',
          'public,private,storage',
        ]);
        assert.equal(timeout, 120000);
        return types;
      },
    });
    assert.deepEqual(events, ['typegen-phase', 'generate']);
    assert.equal(
      readFileSync(path.join(directory, 'generated-types.ts'), 'utf8'),
      types
    );
    assert.equal(
      result.generatedTypesSha256,
      createHash('sha256').update(types).digest('hex')
    );
    assert.equal(result.publicConsumerState, null);
  });
}
test('default foundation keeps its prior no-typegen selection', async () => {
  const result = await runSchemaTypegen({
    beforeGenerate() {
      assert.fail('unselected typegen');
    },
  });
  assert.deepEqual(result, {
    generatedTypesSha256: null,
    publicConsumerState: null,
  });
});
test('typegen failure propagates instead of qualifying SQL-only success', async () => {
  await assert.rejects(
    runSchemaTypegen({
      addressMigration: true,
      metadata: { disposableRoot: '/owned' },
      beforeGenerate() {},
      bounded() {
        throw new Error('typegen failed');
      },
    }),
    /typegen failed/u
  );
  await assert.rejects(
    runSchemaTypegen({
      addressMigration: true,
      metadata: { disposableRoot: '/owned' },
      beforeGenerate() {},
      bounded() {
        return '';
      },
    }),
    /Generated database types absent/u
  );
});
