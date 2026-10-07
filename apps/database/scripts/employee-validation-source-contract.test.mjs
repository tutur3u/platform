import assert from 'node:assert/strict';
import {
  employeeDrafts, expectedTapCounts, packets, runtimeFiles,
  verifyPacketCounts, verifySources, closedTap,
} from './employee-validation-core.mjs';
import {
  admissionProfile, canonicalJson, createAttemptContext, dedicatedPolicy,
} from './employee-validation-supervisor.mjs';
import { parseAdmission } from './verify-employee-validation.mjs';
import { createHash } from 'node:crypto';

// Pure contracts only. No driver, source verifier success path, host, command,
// filesystem, SQL, typegen, HTTP, provider or native adapter is invoked.
const current = {
  'employee-signup-guards.sql': 25,
  'employee-administrator.sql': 20,
  'employee-finalization.sql': 34,
  'employee-identity-contract.sql': 52,
  'employee-restoration.sql': 41,
};
const names = [
  '20261008020000_employee_creation_identity.sql',
  '20261008020100_employee_creation_finalization.sql',
  '20261008020200_employee_restoration.sql',
].map(name => `apps/database/supabase/migrations/${name}`);
const oldNames = employeeDrafts.map(name => name
  .replace('20261008020000', '20261007100000')
  .replace('20261008020100', '20261007100100')
  .replace('20261008020200', '20261007100200'));
let passed = 0;
async function check(label, fn) {
  await fn();
  passed++;
  console.log(`PASS ${passed}: ${label}`);
}
await check('current eight source names and fixed packet order', () => {
  assert.deepEqual(employeeDrafts, [
    ...names, ...Object.keys(current).map(name => `apps/database/supabase/tests/${name}`),
  ]);
  assert.deepEqual(packets, employeeDrafts.slice(3));
  assert.equal(runtimeFiles.length, 13);
  assert.equal(new Set(runtimeFiles).size, 13);
});
await check('current 25/20/34/52/41 map accepts 172', () => {
  verifyPacketCounts(current);
  assert.deepEqual(expectedTapCounts, current);
  assert.equal(Object.values(expectedTapCounts).reduce((a, b) => a + b, 0), 172);
});
await check('old 31 finalization /169 and extra counts rejected', () => {
  assert.throws(() => verifyPacketCounts({ ...current, 'employee-finalization.sql': 31 }));
  assert.throws(() => verifyPacketCounts({ ...current, unexpected: 1 }));
});
await check('old ownedDrafts rejected before any source I/O', () => {
  // verifySources checks ownedDrafts before touching files or running git.
  assert.throws(() => verifySources(null, {
    version: 1, headSha: 'pure-contract', ownedDrafts: oldNames,
  }, [], [], 'pure-contract'), /Expected values to be strictly deep-equal/);
});
const tap = n => ['BEGIN', ...Array.from({ length: n }, (_, i) =>
  `ok ${i + 1} - pure fixture assertion`), `1..${n}`, 'ROLLBACK'].join('\n');
await check('all five exact current TAP text plans accepted', () => {
  for (const count of Object.values(current)) assert.equal(closedTap(tap(count), count), count);
});
await check('old finalization plan and current wrong count rejected', () => {
  assert.throws(() => closedTap(tap(31), current['employee-finalization.sql']));
  assert.throws(() => closedTap(tap(34), 31));
});
await check('skip / TODO / bailout / extra-plan rejected', () => {
  const good = tap(34);
  for (const bad of [
    good.replace('ok 1 - pure fixture assertion', 'ok 1 - skipped # SKIP'),
    good.replace('ok 1 - pure fixture assertion', 'ok 1 - deferred # TODO'),
    good.replace('1..34', 'Bail out! pure text\n1..34'),
    good.replace('1..34', '1..34\n1..34'),
  ]) assert.throws(() => closedTap(bad, 34));
});
await check('failed / duplicate / truncation / commit / open packet rejected', () => {
  const good = tap(34);
  for (const bad of [
    good.replace('ok 1 -', 'not ok 1 -'),
    good.replace('ok 2 -', 'ok 1 -'),
    good.replace('ok 34 - pure fixture assertion\n', ''),
    good.replace('ROLLBACK', 'COMMIT'),
    good.replace('\nROLLBACK', ''),
  ]) assert.throws(() => closedTap(bad, 34));
});
await check('missing entry arguments and empty admission denied', () => {
  assert.throws(() => parseAdmission([]));
  assert.throws(() => admissionProfile({}));
  assert.equal(admissionProfile({ version: 2, host: { policy: dedicatedPolicy } }), 'dedicated');
});
await check('dedicated context denies absent native backend before clock/effects', async () => {
  // Synthetic shape is only a rejection fixture, never a registration or receipt.
  const h = '0'.repeat(64);
  const supervisor = Object.fromEntries([
    'externalAuthorization', 'targetMapping', 'policy', 'binary', 'dockerBinary',
    'nodeBinary', 'config', 'effectiveConfig', 'imageClosure', 'network',
  ].map(name => [`${name}Sha256`, h]));
  Object.assign(supervisor, {
    invocationId: '00000000-0000-4000-8000-000000000000',
    quotaId: 'synthetic-quota', temporaryRoot: '/synthetic-temp',
    controlRoot: '/synthetic-control', logRoot: '/synthetic-log',
    brokerFence: 'synthetic-fence', clockOrigin: 'synthetic-origin',
    issuedMonotonicMs: 0, hardDeadlineMs: 900000, closureReserveMs: 60000,
    basePort: 12000, configBytes: '',
    effectiveConfigSha256: createHash('sha256').update('').digest('hex'),
  });
  const admission = {
    version: 2, phase: 'employee-historical-sql-and-types',
    sourceManifestSha256: h, rootReviewedDriver: false, rootReviewedCleanup: false,
    rootApprovedStartup: false, rootReviewedImageSelection: false,
    reviewReceiptSha256: h, expiresAt: '2000-01-01T00:00:00Z',
    host: {
      policy: dedicatedPolicy, machineId: 'synthetic-machine', bootId: 'synthetic-boot',
      executionRoot: '/synthetic-execution', daemonIdentity: 'synthetic-daemon',
      daemonEndpoint: 'unix:///synthetic-daemon/control.sock', daemonDataRoot: '/synthetic-data',
    },
    cliSourceCommit: '', images: [], dependencyIdentitySha256: h,
    dependencyIdentity: null, cliBinarySha256: h, tapCounts: current, supervisor,
  };
  const admissionSha256 = createHash('sha256').update(canonicalJson(admission)).digest('hex');
  await assert.rejects(createAttemptContext({ admission, admissionSha256 }),
    /Native supervisor backend unavailable; DENIED/);
});
console.log(JSON.stringify({ sourceContractsPassed: passed, runtimeAdmission: null,
  admission: 'DENIED', sql: 'UNEXECUTED', nativeOperations: 0 }));
