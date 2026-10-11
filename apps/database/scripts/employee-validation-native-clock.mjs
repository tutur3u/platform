import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  readlinkSync,
} from 'node:fs';

function identityFile(file, pattern) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    assert(before.isFile() && before.size <= 4096, 'Bounded native identity');
    const contents = readFileSync(fd, 'utf8');
    assert(
      Buffer.byteLength(contents) <= 4096,
      'Bounded native identity bytes'
    );
    const value = contents.trim();
    const after = fstatSync(fd);
    assert(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs,
      'Native identity changed while reading'
    );
    assert(pattern.test(value), 'Invalid native identity');
    return value;
  } finally {
    closeSync(fd);
  }
}

// Clock identity is shared across an attested boot/time namespace. Lease
// generation and fence authority remain the native supervisor's responsibility.
export function createNativeClock({
  expectedMachineId,
  expectedBootId,
  expectedTimeNamespace,
  expectedOrigin,
  expectedNodeSha256,
}) {
  assert.equal(process.platform, 'linux', 'Native Linux clock required');
  assert.match(expectedNodeSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    createHash('sha256').update(readFileSync(process.execPath)).digest('hex'),
    expectedNodeSha256,
    'Reviewed Node executable changed'
  );
  const machinePattern = /^[a-f0-9]{32}$/u;
  const bootPattern =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
  assert(
    machinePattern.test(expectedMachineId) && bootPattern.test(expectedBootId),
    'Reviewed host identity required'
  );
  assert.match(expectedTimeNamespace, /^time:\[[0-9]+\]$/u);
  const origin = `clock-${createHash('sha256')
    .update(
      `${expectedMachineId}\n${expectedBootId}\n${expectedTimeNamespace}\n`
    )
    .digest('hex')}`;
  assert.equal(origin, expectedOrigin, 'Reviewed monotonic origin required');
  let last = null;
  return () => {
    assert.equal(
      identityFile('/etc/machine-id', machinePattern),
      expectedMachineId,
      'Machine identity drift'
    );
    assert.equal(
      identityFile('/proc/sys/kernel/random/boot_id', bootPattern),
      expectedBootId,
      'Boot identity drift'
    );
    assert.equal(
      readlinkSync('/proc/self/ns/time'),
      expectedTimeNamespace,
      'Time namespace drift'
    );
    const nanos = process.hrtime.bigint();
    assert(
      nanos >= 0n && (last === null || nanos >= last),
      'Monotonic clock reset'
    );
    assert(nanos / 1000000n <= BigInt(Number.MAX_SAFE_INTEGER), 'Clock range');
    last = nanos;
    const civilMs = Date.now();
    assert(Number.isSafeInteger(civilMs), 'Civil clock fault');
    return Object.freeze({
      monotonicMs: Number(nanos / 1000000n),
      civilMs,
      machineId: expectedMachineId,
      bootId: expectedBootId,
      origin,
    });
  };
}
