import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPacketTap,
  assertRollbackSource,
  exactSourceSha,
  foundationPackets,
  schemaReceipt,
} from './employee-schema-tap.mjs';

const tap = (count) =>
  [
    'BEGIN',
    ...Array.from({ length: count }, (_, i) => `ok ${i + 1} - assertion`),
    `1..${count}`,
    'ROLLBACK',
    '',
  ].join('\n');
const packets = foundationPackets.map(([file, assertions]) => ({
  file,
  assertions,
}));
const receipt = (extra = {}) =>
  schemaReceipt({
    sourceSha: 'a'.repeat(40),
    packets,
    lifecycleCode: 0,
    cleanupSucceeded: true,
    ...extra,
  });
test('accepts exactly all 172 closed assertions', () => {
  for (const [, count] of foundationPackets)
    assert.equal(assertPacketTap(tap(count), count), count);
  assert.equal(receipt().assertions, 172);
  assert.equal(receipt().schemaQualified, true);
});
test('rejects a different plan count', () =>
  assert.throws(() => assertPacketTap(tap(24), 25)));
test('rejects truncated TAP', () =>
  assert.throws(() =>
    assertPacketTap(tap(2).replace('ok 2 - assertion\n', ''), 2)
  ));
test('rejects failing assertions', () =>
  assert.throws(() => assertPacketTap(tap(2).replace('ok 2', 'not ok 2'), 2)));
test('rejects skipped assertions', () =>
  assert.throws(() =>
    assertPacketTap(tap(1).replace('assertion', 'assertion # SKIP'), 1)
  ));
test('rejects TODO assertions', () =>
  assert.throws(() =>
    assertPacketTap(tap(1).replace('assertion', 'assertion # TODO'), 1)
  ));
test('rejects duplicate numbers', () =>
  assert.throws(() => assertPacketTap(tap(2).replace('ok 2', 'ok 1'), 2)));
test('rejects multiple plans and bailout', () => {
  assert.throws(() => assertPacketTap(`${tap(1)}1..1\n`, 1));
  assert.throws(() => assertPacketTap(`${tap(1)}Bail out!\n`, 1));
});
test('requires observed rollback and forbids commit', () => {
  assert.throws(() => assertPacketTap(tap(1).replace('ROLLBACK', ''), 1));
  assert.throws(() => assertPacketTap(tap(1).replace('ROLLBACK', 'COMMIT'), 1));
});
test('rejects duplicate transaction closure', () =>
  assert.throws(() => assertPacketTap(`${tap(1)}ROLLBACK\n`, 1)));
test('rejects output beyond private bound', () =>
  assert.throws(() => assertPacketTap('a'.repeat(1048577), 1)));
test('requires rollback source', () => {
  assert.doesNotThrow(() =>
    assertRollbackSource('begin; select * from finish(); rollback;')
  );
  assert.throws(() =>
    assertRollbackSource('begin; select * from finish(); commit;')
  );
});
test('rejects partial packets despite successful cleanup', () =>
  assert.equal(
    receipt({ packets: packets.slice(0, 4) }).schemaQualified,
    false
  ));
test('rejects cleanup or lifecycle failure after successful assertions', () => {
  assert.equal(receipt({ cleanupSucceeded: false }).schemaQualified, false);
  assert.equal(receipt({ lifecycleCode: 1 }).schemaQualified, false);
});
test('does not promote schema proof into provider or production proof', () => {
  assert.equal(receipt().nativeBackendQualified, false);
  assert.equal(receipt().providerQualified, false);
  assert.equal(receipt().productionApplied, false);
});
test('rejects branch names or abbreviated commits', () => {
  assert.throws(() => exactSourceSha('main'));
  assert.throws(() => exactSourceSha('9e7'));
});
