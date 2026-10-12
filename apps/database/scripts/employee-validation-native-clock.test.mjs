import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { test } from 'node:test';
import { createNativeClock } from './employee-validation-native-clock.mjs';

// Native clock sampling only: no backend, lease, daemon, SQL or host mutation.
assert.equal(
  process.platform,
  'linux',
  'Run clock qualification on pinned Linux'
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function withOrigin(values) {
  return {
    ...values,
    expectedOrigin: `clock-${sha256(
      `${values.expectedMachineId}\n${values.expectedBootId}\n${values.expectedTimeNamespace}\n`
    )}`,
  };
}
const native = withOrigin({
  expectedMachineId: readFileSync('/etc/machine-id', 'utf8').trim(),
  expectedBootId: readFileSync(
    '/proc/sys/kernel/random/boot_id',
    'utf8'
  ).trim(),
  expectedTimeNamespace: readlinkSync('/proc/self/ns/time'),
  expectedNodeSha256: sha256(readFileSync(process.execPath)),
});

test('native samples have the existing budget interface and no lease authority', () => {
  const clock = createNativeClock(native);
  const before = clock();
  const after = clock();
  assert.deepEqual(Object.keys(before).sort(), [
    'bootId',
    'civilMs',
    'machineId',
    'monotonicMs',
    'origin',
  ]);
  assert.equal(before.machineId, native.expectedMachineId);
  assert.equal(before.bootId, native.expectedBootId);
  assert.equal(before.origin, native.expectedOrigin);
  assert(Number.isSafeInteger(before.monotonicMs));
  assert(after.monotonicMs >= before.monotonicMs);
  assert(Object.isFrozen(before));
  assert.equal(Object.hasOwn(before, 'generation'), false);
  assert.equal(Object.hasOwn(before, 'supervisor'), false);
});

test('same native boot/namespace yields one origin across two processes', () => {
  const clock = createNativeClock(native);
  const before = clock();
  const moduleUrl = new URL(
    './employee-validation-native-clock.mjs',
    import.meta.url
  );
  const script = `import { createNativeClock } from ${JSON.stringify(moduleUrl.href)};
const sample = createNativeClock(${JSON.stringify(native)})();
process.stdout.write(JSON.stringify(sample));`;
  const child = JSON.parse(
    execFileSync(
      process.execPath,
      ['--max-old-space-size=64', '--input-type=module', '-e', script],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 4096 }
    )
  );
  const after = clock();
  assert.equal(child.origin, native.expectedOrigin);
  assert.equal(child.machineId, before.machineId);
  assert.equal(child.bootId, before.bootId);
  assert(child.monotonicMs >= before.monotonicMs);
  assert(child.monotonicMs <= after.monotonicMs);
});

test('wrong reviewed Node hash rejects construction', () => {
  assert.throws(
    () => createNativeClock({ ...native, expectedNodeSha256: '0'.repeat(64) }),
    /Reviewed Node executable changed/
  );
});

test('wrong reviewed origin rejects construction', () => {
  assert.throws(
    () => createNativeClock({ ...native, expectedOrigin: 'clock-unreviewed' }),
    /Reviewed monotonic origin required/
  );
});

test('wrong machine identity rejects the first native sample', () => {
  const wrong = native.expectedMachineId === 'a'.repeat(32) ? 'b' : 'a';
  const clock = createNativeClock(
    withOrigin({
      ...native,
      expectedMachineId: wrong.repeat(32),
    })
  );
  assert.throws(clock, /Machine identity drift/);
});

test('wrong boot identity rejects the first native sample', () => {
  const wrong = native.expectedBootId.startsWith('a') ? 'b' : 'a';
  const clock = createNativeClock(
    withOrigin({
      ...native,
      expectedBootId: wrong + native.expectedBootId.slice(1),
    })
  );
  assert.throws(clock, /Boot identity drift/);
});

test('wrong time namespace rejects the first native sample', () => {
  const clock = createNativeClock(
    withOrigin({
      ...native,
      expectedTimeNamespace: 'time:[0]',
    })
  );
  assert.throws(clock, /Time namespace drift/);
});

test('malformed reviewed bindings deny before a sample', () => {
  assert.throws(() =>
    createNativeClock({ ...native, expectedNodeSha256: 'bad' })
  );
  assert.throws(() =>
    createNativeClock({ ...native, expectedMachineId: 'bad' })
  );
  assert.throws(() => createNativeClock({ ...native, expectedBootId: 'bad' }));
  assert.throws(() =>
    createNativeClock({ ...native, expectedTimeNamespace: 'bad' })
  );
});

// Mocked rejection/rollback cases below are synthetic source evidence, not
// native deadline or namespace qualification. Each test restores its own mocks.
test('backwards monotonic sample rejects', (t) => {
  const values = [20000000n, 10000000n];
  t.mock.method(process.hrtime, 'bigint', () => values.shift());
  const clock = createNativeClock(native);
  assert.equal(clock().monotonicMs, 20);
  assert.throws(clock, /Monotonic clock reset/);
});

test('negative or unsafe monotonic range rejects', (t) => {
  let value = -1n;
  t.mock.method(process.hrtime, 'bigint', () => value);
  assert.throws(createNativeClock(native), /Monotonic clock reset/);
  value = (BigInt(Number.MAX_SAFE_INTEGER) + 1n) * 1000000n;
  assert.throws(createNativeClock(native), /Clock range/);
});

test('unsafe civil sample rejects', (t) => {
  t.mock.method(Date, 'now', () => Number.NaN);
  assert.throws(createNativeClock(native), /Civil clock fault/);
});

test('civil rollback leaves the monotonic origin and elapsed clock intact', (t) => {
  let elapsed = 10000000n;
  const civil = [2000, 1000];
  t.mock.method(process.hrtime, 'bigint', () => elapsed);
  t.mock.method(Date, 'now', () => civil.shift());
  const clock = createNativeClock(native);
  const before = clock();
  elapsed += 1000000n;
  const after = clock();
  assert(after.civilMs < before.civilMs);
  assert.equal(after.monotonicMs - before.monotonicMs, 1);
  assert.equal(after.origin, before.origin);
});
