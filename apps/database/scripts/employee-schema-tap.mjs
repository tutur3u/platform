import { assertStrictTap } from './programming-database-tap.mjs';

export const foundationPackets = Object.freeze([
  ['employee-signup-guards.sql', 25],
  ['employee-administrator.sql', 20],
  ['employee-finalization.sql', 34],
  ['employee-identity-contract.sql', 52],
  ['employee-restoration.sql', 41],
]);

export function exactSourceSha(value) {
  if (!/^[a-f0-9]{40}$/u.test(value ?? '')) {
    throw new Error('An exact source commit is required');
  }
  return value;
}

export function assertRollbackSource(sql) {
  const statements = sql.replace(/--[^\n]*/gu, '').trim();
  if (
    !/^begin\s*;/iu.test(statements) ||
    !/select\s+\*\s+from\s+finish\(\)\s*;\s*rollback\s*;$/iu.test(statements) ||
    /\bcommit\s*;/iu.test(statements)
  ) {
    throw new Error('Fixture must close with finish and rollback');
  }
}

export function assertPacketTap(tap, expected) {
  if (Buffer.byteLength(tap, 'utf8') > 1024 * 1024) {
    throw new Error('Fixture output exceeds the bound');
  }
  assertStrictTap(tap);
  const plan = [...tap.matchAll(/^1\.\.(\d+)$/gm)];
  if (
    Number(plan[0][1]) !== expected ||
    tap.split(/\r?\n/u).filter((line) => line === 'BEGIN').length !== 1 ||
    tap.split(/\r?\n/u).filter((line) => line === 'ROLLBACK').length !== 1 ||
    /^COMMIT$/mu.test(tap)
  ) {
    throw new Error('Fixture count or rollback closure differs');
  }
  return expected;
}

export function schemaReceipt({
  sourceSha,
  packets,
  lifecycleCode,
  cleanupSucceeded,
}) {
  const expected = foundationPackets.map(([file, assertions]) => ({
    file,
    assertions,
  }));
  const passed =
    lifecycleCode === 0 &&
    cleanupSucceeded === true &&
    JSON.stringify(packets) === JSON.stringify(expected);
  return {
    version: 1,
    sourceSha: exactSourceSha(sourceSha),
    scope: 'employee-creation-restoration',
    schemaQualified: passed,
    assertions: packets.reduce((sum, packet) => sum + packet.assertions, 0),
    packets,
    lifecycleCode,
    cleanupSucceeded,
    nativeBackendQualified: false,
    providerQualified: false,
    productionApplied: false,
  };
}
