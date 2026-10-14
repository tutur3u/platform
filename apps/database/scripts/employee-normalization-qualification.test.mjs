import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  normalizationPacket,
  normalizationReceipt,
  verifyMailboxCatalog,
  verifyNormalizationInputs,
} from './employee-normalization-qualification.mjs';
import { assertPacketTap, foundationPackets } from './employee-schema-tap.mjs';

const before = {
  oid: 123,
  owner: 'postgres',
  acl: '{postgres=X/postgres,service_role=X/postgres}',
  security_definer: true,
  config: ['search_path=""'],
  body: 'old body',
  definition: 'old definition',
  result: 'jsonb',
  language: 'plpgsql',
  anon_execute: false,
  authenticated_execute: false,
  public_execute: false,
  service_execute: true,
};
const after = { ...before, body: 'new body', definition: 'new definition' };
const successful = {
  sourceSha: 'a'.repeat(40),
  controlSha: 'b'.repeat(40),
  packets: [{ file: normalizationPacket[0], assertions: 20 }],
  lifecycleCode: 0,
  cleanupSucceeded: true,
  catalogVerified: true,
  catalog: { before, after },
  fixtureHashes: [],
};

test('accepts changed body only while preserving identity and restricted execution', () => {
  assert.equal(verifyMailboxCatalog(before, after, 'new body'), true);
});
test('rejects owner, ACL, identity and signature drift', () => {
  for (const [key, value] of [
    ['owner', 'other'],
    ['acl', null],
    ['oid', 456],
    ['result', 'text'],
    ['language', 'sql'],
  ]) {
    assert.throws(() =>
      verifyMailboxCatalog(before, { ...after, [key]: value }, 'new body')
    );
  }
});
test('rejects security definer, search path and role privilege changes', () => {
  for (const [key, value] of [
    ['security_definer', false],
    ['config', ['search_path=public']],
    ['anon_execute', true],
    ['authenticated_execute', true],
    ['public_execute', true],
    ['service_execute', false],
  ]) {
    assert.throws(() =>
      verifyMailboxCatalog(before, { ...after, [key]: value }, 'new body')
    );
  }
});
test('rejects wrong or unchanged applied body and insecure baseline', () => {
  assert.throws(() => verifyMailboxCatalog(before, after, 'wrong'));
  assert.throws(() => verifyMailboxCatalog(before, before, before.body));
  assert.throws(() =>
    verifyMailboxCatalog({ ...before, public_execute: true }, after, after.body)
  );
});
test('wrong frozen migration or fixture fails before execution', () => {
  assert.throws(() =>
    verifyNormalizationInputs(Buffer.from('other'), Buffer.from('other'))
  );
});
test('20 packet receipt never certifies the 172 suite', () => {
  const value = normalizationReceipt(successful);
  assert.equal(value.normalizationQualified, true);
  assert.equal(value.assertions, 20);
  assert.equal(value.schemaQualified, false);
  assert.equal(value.foundation172Qualified, false);
  assert.equal(value.providerQualified, false);
  assert.equal(value.productionApplied, false);
  assert.equal(
    foundationPackets.reduce((sum, [, n]) => sum + n, 0),
    172
  );
});
test('missing catalog, cleanup, lifecycle or exact packet cannot qualify', () => {
  for (const delta of [
    { catalogVerified: false },
    { cleanupSucceeded: false },
    { lifecycleCode: 1 },
    { packets: [] },
    { packets: [{ file: normalizationPacket[0], assertions: 19 }] },
    {
      packets: foundationPackets.map(([file, assertions]) => ({
        file,
        assertions,
      })),
    },
  ]) {
    assert.equal(
      normalizationReceipt({ ...successful, ...delta }).normalizationQualified,
      false
    );
  }
});
test('normalization uses strict plan20, no skips, and observed rollback', () => {
  const tap = [
    'BEGIN',
    ...Array.from({ length: 20 }, (_, i) => `ok ${i + 1} - case`),
    '1..20',
    'ROLLBACK',
    '',
  ].join('\n');
  assert.equal(assertPacketTap(tap, 20), 20);
  for (const value of [
    tap.replace('ok 3', 'not ok 3'),
    tap.replace('1..20', '1..19'),
    tap.replace('ok 1 - case', 'ok 1 - case # SKIP'),
    tap.replace('ROLLBACK', 'COMMIT'),
  ]) {
    assert.throws(() => assertPacketTap(value, 20));
  }
});
test('runner stages the baseline without the additive migration, applies it then captures catalog', () => {
  const runner = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    runner,
    /trackedFiles\.filter\(\(file\) => file !== normalizationMigration\)/u
  );
  assert.match(runner, /trackedFiles: stagedFiles/u);
  assert.ok(
    runner.indexOf('catalog.before =') <
      runner.indexOf("'-f', '/tmp/employee-normalization.sql'")
  );
  assert.ok(
    runner.indexOf("'-f', '/tmp/employee-normalization.sql'") <
      runner.indexOf('catalog.after =')
  );
  assert.ok(
    runner.indexOf('verifyMailboxCatalog(catalog.before') <
      runner.indexOf('for (const [position')
  );
});
