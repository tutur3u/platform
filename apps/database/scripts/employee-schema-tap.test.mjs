import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertPacketTap,
  assertRollbackSource,
  exactSourceSha,
  failedAssertionOrdinals,
  foundationPackets,
  schemaFailureDiagnostic,
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

test('schema failure diagnostic exposes only fixed fields and ordinal', () => {
  const diagnostic = schemaFailureDiagnostic('packet-execution', 1, {
    status: 3,
    error: { code: 'SECRET', message: 'password=private' },
    signal: 'PRIVATE',
    stdout: 'ERROR: private SQL',
    stderr: 'secret-token',
  });
  assert.equal(diagnostic.exitCode, 3);
  assert.equal(diagnostic.processError, true);
  assert.equal(diagnostic.signaled, true);
  assert.equal(JSON.stringify(diagnostic).includes('private'), false);
  assert.equal(JSON.stringify(diagnostic).includes('SECRET'), false);
});
test('schema failure diagnostic retains no TAP assertion descriptions', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout:
      'not ok 1 - PRIVATE USER\nBail out! secret-token\nok 2 # SKIP private\n',
  });
  assert.equal(diagnostic.failingAssertions, 1);
  assert.equal(diagnostic.bailout, true);
  assert.equal(diagnostic.skippedOrTodo, true);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(diagnostic).includes('secret-token'), false);
});
test('schema failure diagnostic bounds private output parsing', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout: `not ok 1 - private\n${'x'.repeat(1048576)}`,
  });
  assert.equal(diagnostic.failingAssertions, 0);
});
test('schema failure diagnostic preserves timeout without raw error text', () => {
  assert.equal(
    schemaFailureDiagnostic('start', 0, {
      error: { code: 'ETIMEDOUT', message: 'private command' },
    }).timedOut,
    true
  );
});
test('schema failure diagnostic rejects untrusted phase or ordinal', () => {
  assert.throws(() => schemaFailureDiagnostic('secret', 1));
  assert.throws(() => schemaFailureDiagnostic('packet-tap', 6));
  assert.throws(() => schemaFailureDiagnostic('packet-tap', '1'));
});
test('schema failure diagnostic sanitizes unknown exit statuses', () => {
  for (const status of ['secret', -1, 256]) {
    assert.equal(
      schemaFailureDiagnostic('packet-execution', 1, { status }).exitCode,
      null
    );
  }
});
test('cleanup diagnostics use no fixture ordinal and retain no container name', () => {
  const diagnostic = schemaFailureDiagnostic('cleanup-proof', 0, {
    stderr: 'supabase_db_PRIVATE',
  });
  assert.equal(diagnostic.packetOrdinal, 0);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
});

test('failed assertion ordinals preserve numeric positions and count', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout: 'not ok 3 - first failure\nnot ok 21 - second failure\n',
  });
  assert.deepEqual(diagnostic.failedAssertionOrdinals, [3, 21]);
  assert.equal(diagnostic.assertionOrdinalsValid, true);
  assert.equal(diagnostic.failingAssertions, 2);
});
test('failed assertion ordinals retain no private descriptions or values', () => {
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
    stdout: 'not ok 2 - password=PRIVATE\n# have: PRIVATE\n# want: SECRET\n',
  });
  assert.deepEqual(diagnostic.failedAssertionOrdinals, [2]);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(diagnostic).includes('SECRET'), false);
});
test('failed assertion ordinals reject duplicates or reversed order', () => {
  for (const tap of ['not ok 2\nnot ok 2', 'not ok 3\nnot ok 2']) {
    assert.throws(() => failedAssertionOrdinals(tap, 25));
    const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
      stdout: tap,
    });
    assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
    assert.equal(diagnostic.assertionOrdinalsValid, false);
  }
});
test('failed assertion ordinals reject out of range and unsafe integers', () => {
  for (const tap of ['not ok 26', 'not ok 0', 'not ok 9007199254740993']) {
    assert.throws(() => failedAssertionOrdinals(tap, 25));
    assert.equal(
      schemaFailureDiagnostic('packet-tap', 1, {
        stdout: tap,
      }).assertionOrdinalsValid,
      false
    );
  }
});
test('failed assertion ordinals reject malformed numeric TAP', () => {
  for (const tap of [
    'not ok',
    'not ok -1',
    'not ok 01',
    'not ok 1x',
    'not ok 1.5',
    'not ok 1 PRIVATE',
    'not ok 1\t- PRIVATE',
  ]) {
    assert.throws(() => failedAssertionOrdinals(tap, 25));
    const diagnostic = schemaFailureDiagnostic('packet-tap', 1, {
      stdout: tap,
    });
    assert.equal(diagnostic.assertionOrdinalsValid, false);
    assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
  }
});
test('failed assertion ordinals enforce packet binding and agreement', () => {
  assert.deepEqual(failedAssertionOrdinals('ok 1\n# not ok 2', 25), []);
  assert.throws(() => failedAssertionOrdinals('not ok 1', 0));
  assert.throws(() => failedAssertionOrdinals('', '25'));
  const diagnostic = schemaFailureDiagnostic('packet-tap', 0, {
    stdout: 'not ok 1',
  });
  assert.equal(diagnostic.failingAssertions, 1);
  assert.equal(diagnostic.assertionOrdinalsValid, false);
  assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
});
test('failed assertion ordinals deny oversized output without raw leakage', () => {
  const tap = `not ok 1 - PRIVATE\n${'x'.repeat(1048576)}`;
  assert.throws(() => failedAssertionOrdinals(tap, 25));
  const diagnostic = schemaFailureDiagnostic('packet-tap', 1, { stdout: tap });
  assert.equal(diagnostic.assertionOrdinalsValid, false);
  assert.deepEqual(diagnostic.failedAssertionOrdinals, []);
  assert.equal(JSON.stringify(diagnostic).includes('PRIVATE'), false);
});
