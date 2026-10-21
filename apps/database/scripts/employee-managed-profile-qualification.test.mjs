import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { httpQualificationReceipt } from './employee-http-receipt.mjs';
import {
  managedProfilePackets,
  schemaFailureDiagnostic,
  schemaReceipt,
  selectSchemaPackets,
} from './employee-managed-profile-qualification.mjs';
import {
  assertPacketTap,
  assertRollbackSource,
  selectSchemaPackets as basePackets,
} from './employee-schema-tap.mjs';

test('managed profile selection preserves defaults and requires journal/typegen/cleanup', () => {
  const previous = process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
  try {
    delete process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
    assert.deepEqual(selectSchemaPackets(true), basePackets(true));
    process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE = 'true';
    assert.throws(
      () => selectSchemaPackets(false),
      /Managed profile qualification requires employee journal/u
    );
    const packets = selectSchemaPackets(true).map(([file, assertions]) => ({
      file,
      assertions,
    }));
    assert.deepEqual(
      selectSchemaPackets(true).slice(-managedProfilePackets.length),
      managedProfilePackets
    );
    const input = {
      sourceSha: '1'.repeat(40),
      journal: true,
      packets,
      lifecycleCode: 0,
      cleanupSucceeded: true,
      generatedTypesSha256: 'a'.repeat(64),
    };
    assert.equal(schemaReceipt(input).managedProfileQualified, true);
    assert.equal(
      schemaReceipt({ ...input, generatedTypesSha256: null }).schemaQualified,
      false
    );
    assert.equal(
      schemaReceipt({ ...input, cleanupSucceeded: false })
        .managedProfileQualified,
      false
    );
    assert.equal(
      schemaReceipt({ ...input, packets: packets.slice(0, -1) })
        .schemaQualified,
      false
    );
  } finally {
    if (previous === undefined)
      delete process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
    else process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE = previous;
  }
});

test('feedback profile and causal matrices isolate managed selection inherited from dispatch', () => {
  const env = {
    ...process.env,
    EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE: 'true',
    EMPLOYEE_SCHEMA_INCLUDE_JOURNAL: 'true',
    EMPLOYEE_SCHEMA_INCLUDE_HTTP: 'true',
    EMPLOYEE_SCHEMA_INCLUDE_RESTORE: 'true',
  };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      new URL('./product-feedback-schema-profile.test.mjs', import.meta.url)
        .pathname,
      new URL('./product-feedback-causal-controls.test.mjs', import.meta.url)
        .pathname,
    ],
    { env, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024 }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /runner rejects incompatible feedback profiles before hosted admission and retains the hosted guard/u
  );
  assert.match(
    result.stdout,
    /real runner validates causal selection before hosted setup without spoofing identity/u
  );
});

test('every selected journal and managed fixture satisfies the unchanged rollback source guard', () => {
  for (const [file] of [...basePackets(true), ...managedProfilePackets]) {
    const sql = readFileSync(
      new URL(`../supabase/tests/${file}`, import.meta.url),
      'utf8'
    );
    assert.doesNotThrow(() => assertRollbackSource(sql), file);
  }
});

test('the original embedded setup COMMIT remains RED while dedicated remote control passes', () => {
  const sql = readFileSync(
    new URL(
      '../supabase/tests/employee-managed-profile-concurrency.sql',
      import.meta.url
    ),
    'utf8'
  );
  const boundary = "  $remote$);\n  perform dblink_exec('profile_a','commit');";
  assert.equal(sql.split(boundary).length, 2);
  const before = sql.replace(boundary, '    commit;\n  $remote$);');
  assert.throws(
    () => assertRollbackSource(before),
    /Fixture must close with finish and rollback/u
  );
  assert.doesNotThrow(() => assertRollbackSource(sql));
  assert.throws(
    () => assertRollbackSource(sql.replace(/rollback;\s*$/u, 'commit;')),
    /Fixture must close with finish and rollback/u
  );
});

function managedDiagnostic(
  result,
  ordinal = basePackets(true).length +
    managedProfilePackets.findIndex(
      ([file]) => file === 'employee-managed-profile-concurrency.sql'
    ) +
    1,
  phase = 'packet-tap'
) {
  const previous = process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
  process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE = 'true';
  try {
    return schemaFailureDiagnostic(phase, ordinal, result, true);
  } finally {
    if (previous === undefined)
      delete process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
    else process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE = previous;
  }
}
const concurrencyTap = [
  'BEGIN',
  '1..10',
  ...Array.from({ length: 10 }, (_, i) => `ok ${i + 1} - synthetic`),
  'ROLLBACK',
].join('\n');
test('managed diagnostics distinguish forbidden remote result tags from complete TAP without relaxing the parser', () => {
  const valid = managedDiagnostic({ stdout: concurrencyTap, status: 0 });
  assert.equal(valid.packetTapValid, true);
  assert.equal(valid.expectedAssertions, 10);
  assert.equal(valid.observedPlannedAssertions, 10);
  assert.equal(valid.observedAssertionCount, 10);
  assert.equal(valid.commitTagCount, 0);
  const bad = managedDiagnostic({
    stdout: concurrencyTap.replace('ROLLBACK', 'COMMIT\nCOMMIT\nROLLBACK'),
  });
  assert.equal(bad.packetTapValid, false);
  assert.equal(bad.commitTagCount, 2);
  assert.equal(bad.beginTagCount, 1);
  assert.equal(bad.rollbackTagCount, 1);
  assert.equal(bad.exitCode, null);
  assert.deepEqual(bad.failedAssertionOrdinals, []);
  assert.match(bad.stdoutSha256, /^[a-f0-9]{64}$/u);
});
test('managed diagnostics retain only failed ordinals and hashes, never arbitrary private TAP or SQL values', () => {
  const secret = 'private-password-email-user-id-synthetic-sentinel';
  const diagnostic = managedDiagnostic({
    stdout: concurrencyTap.replace(
      'ok 5 - synthetic',
      `not ok 5 - ${secret}\n# got: ${secret}`
    ),
    stderr: `psql:/tmp/employee-schema-contract.sql:48: ERROR:  ${secret}\n`,
    status: 0,
  });
  assert.equal(diagnostic.packetTapValid, false);
  assert.deepEqual(diagnostic.failedAssertionOrdinals, [5]);
  assert.equal(diagnostic.failingAssertions, 1);
  assert.equal(diagnostic.sqlSourceLine, 48);
  assert.match(diagnostic.sqlErrorMessageSha256, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(diagnostic).includes(secret), false);
  assert.equal(JSON.stringify(diagnostic).includes('psql:'), false);
});
test('managed diagnostics bound hostile output, reject invalid packet binding, and preserve process failures', () => {
  const oversized = managedDiagnostic({
    stdout: 'sensitive'.repeat(140000),
    status: 1,
    error: { code: 'ETIMEDOUT', message: 'private process text' },
    signal: 'SIGKILL',
  });
  assert.equal(oversized.stdoutBounded, false);
  assert.equal(oversized.stdoutSha256, null);
  assert.equal(oversized.packetTapValid, false);
  assert.equal(oversized.timedOut, true);
  assert.equal(oversized.signaled, true);
  assert.equal(oversized.exitCode, 1);
  assert.equal(JSON.stringify(oversized).includes('sensitive'), false);
  assert.equal(
    JSON.stringify(oversized).includes('private process text'),
    false
  );
  assert.throws(
    () =>
      managedDiagnostic(
        {},
        basePackets(true).length + managedProfilePackets.length + 1
      ),
    /Invalid managed profile diagnostic binding/u
  );
  assert.throws(
    () => managedDiagnostic({}, basePackets(true).length + 1.5),
    /Invalid managed profile diagnostic binding/u
  );
});

test('actual concurrency fixture suppresses only the two confirmed remote COMMIT result rows', () => {
  const sql = readFileSync(
    new URL(
      '../supabase/tests/employee-managed-profile-concurrency.sql',
      import.meta.url
    ),
    'utf8'
  );
  const silent =
    "do $$ begin perform dblink_exec('profile_a','commit'); end $$;";
  const printed = "select dblink_exec('profile_a','commit');";
  assert.equal(sql.split(silent).length - 1, 2);
  assert.equal(sql.includes(printed), false);
  const before = sql.replaceAll(silent, printed);
  // The same remote commands remain in the same order; only result emission differs.
  const controls = (source) =>
    [...source.matchAll(/dblink_exec\('profile_a','commit'\)/gu)].map(
      (match) => match[0]
    );
  assert.deepEqual(controls(sql), controls(before));
  assert.equal(controls(sql).length, 3);
  const shape = (source) => {
    const statusRows = source
      .split(/\r?\n/u)
      .filter((line) => line === printed)
      .map(() => 'COMMIT');
    return concurrencyTap.replace(
      'ROLLBACK',
      [...statusRows, 'ROLLBACK'].join('\n')
    );
  };
  assert.equal(
    shape(before)
      .split('\n')
      .filter((line) => line === 'COMMIT').length,
    2
  );
  assert.throws(() => assertPacketTap(shape(before), 10));
  assert.equal(assertPacketTap(shape(sql), 10), 10);
  assert.doesNotThrow(() => assertRollbackSource(sql));
});

test('concurrency fixture captures owned PIDs before dispatch and gates both races on bounded Auth lock proof', () => {
  const sql = readFileSync(
    new URL(
      '../supabase/tests/employee-managed-profile-concurrency.sql',
      import.meta.url
    ),
    'utf8'
  );
  assert.ok(
    sql.indexOf('create temporary table profile_sessions') <
      sql.indexOf('dblink_send_query')
  );
  for (const read of [
    "dblink('profile_a','select pg_backend_pid()')",
    "dblink('profile_b','select pg_backend_pid()')",
  ])
    assert.ok(sql.includes(read));
  for (const proof of [
    'waiting.pid=sessions.b_pid and not waiting.granted',
    "waiting.locktype='transactionid' and waiting.mode='ShareLock'",
    'held.transactionid=waiting.transactionid and held.granted',
    'held.pid=sessions.a_pid',
    'sessions.a_pid=any(pg_catalog.pg_blocking_pids(sessions.b_pid))',
    "relation_lock.relation='auth.users'::regclass",
    "relation_lock.mode='RowShareLock'",
    "clock_timestamp()+interval '2 seconds'",
    'pg_sleep(least(0.01,remaining))',
  ])
    assert.ok(sql.includes(proof), proof);
  assert.ok(
    sql.indexOf('if clock_timestamp()>=deadline then return false') <
      sql.indexOf(
        'if pg_temp.profile_owned_waiter() then return clock_timestamp()<deadline'
      )
  );
  assert.equal(
    sql.match(
      /insert into profile_waits values\('(rename|restore)',pg_temp.await_profile_waiter\(\)\);/gu
    )?.length,
    2
  );
  assert.equal(sql.match(/^select (?:is|ok|matches)\(/gmu)?.length, 10);
  assert.equal(sql.includes('pg_sleep(0.15)'), false);
  assert.equal(sql.includes('pid<>pg_backend_pid()'), false);
});

// Deterministic models exercise the predicate/deadline design, not PostgreSQL.
function modelOwnedWait(snapshot) {
  return (
    snapshot.authRelations.includes(101) &&
    snapshot.authRelations.includes(102) &&
    snapshot.blockers.includes(101) &&
    snapshot.waiting.some(
      (wait) =>
        wait.pid === 102 &&
        !wait.granted &&
        wait.type === 'transactionid' &&
        wait.mode === 'ShareLock' &&
        snapshot.held.some(
          (held) =>
            held.pid === 101 &&
            held.granted &&
            held.mode === 'ExclusiveLock' &&
            held.transaction === wait.transaction
        )
    )
  );
}
function modelPoll(snapshotAt) {
  for (let elapsedMs = 0; elapsedMs < 2000; elapsedMs += 10) {
    const snapshot = snapshotAt(elapsedMs);
    if (modelOwnedWait(snapshot)) {
      const completedAtMs = elapsedMs + (snapshot.probeDurationMs ?? 0);
      return { observed: completedAtMs < 2000, elapsedMs: completedAtMs };
    }
    if (!snapshot.busy) return { observed: false, elapsedMs };
  }
  return { observed: false, elapsedMs: 2000 };
}
const ownedWait = {
  busy: true,
  authRelations: [101, 102],
  blockers: [101],
  waiting: [
    {
      pid: 102,
      granted: false,
      type: 'transactionid',
      mode: 'ShareLock',
      transaction: 77,
    },
  ],
  held: [{ pid: 101, granted: true, mode: 'ExclusiveLock', transaction: 77 }],
};
test('pure wait model never qualifies unrelated, missing, wrong-owner or wrong-relation waiters from busy alone', () => {
  for (const snapshot of [
    { ...ownedWait, waiting: [{ ...ownedWait.waiting[0], pid: 999 }] },
    { ...ownedWait, waiting: [] },
    { ...ownedWait, blockers: [999] },
    { ...ownedWait, held: [{ ...ownedWait.held[0], transaction: 88 }] },
    { ...ownedWait, authRelations: [101] },
  ])
    assert.deepEqual(
      modelPoll(() => snapshot),
      { observed: false, elapsedMs: 2000 }
    );
});
test('pure wait model accepts a delayed owned waiter before the deadline, never at or after it', () => {
  const absent = { ...ownedWait, waiting: [] };
  assert.deepEqual(
    modelPoll((now) => (now >= 1700 ? ownedWait : absent)),
    { observed: true, elapsedMs: 1700 }
  );
  for (const arrival of [2000, 2010])
    assert.deepEqual(
      modelPoll((now) => (now >= arrival ? ownedWait : absent)),
      { observed: false, elapsedMs: 2000 }
    );
  assert.deepEqual(
    modelPoll((now) =>
      now >= 1990 ? { ...ownedWait, probeDurationMs: 10 } : absent
    ),
    { observed: false, elapsedMs: 2000 }
  );
  assert.deepEqual(
    modelPoll((now) =>
      now >= 1990 ? { ...ownedWait, probeDurationMs: 9 } : absent
    ),
    { observed: true, elapsedMs: 1999 }
  );
  assert.deepEqual(
    modelPoll(() => ({ ...absent, busy: false })),
    { observed: false, elapsedMs: 0 }
  );
});

test('managed HTTP receipt rejects the old length-limited fixture and missing length cases', () => {
  const receipt = {
    qualified: true,
    phase: 'complete',
    assertions: 30,
    routeAuthorizationProof: false,
    productionProof: false,
    managedProfileQualification: {
      qualified: true,
      assertions: 47,
      writes: 1,
      usernameLengths: [4, 1, 33, 65, 81, 1001],
      unmanagedProfileQualification: {
        version: 1,
        qualified: true,
        assertions: 75,
        writes: 6,
        lostAcknowledgements: 6,
        usernameLengths: [1, 4, 33, 65, 81, 1001],
        routeAuthorizationProof: false,
        productionProof: false,
      },
      lostAcknowledgementReadback: true,
      routeAuthorizationProof: false,
      productionProof: false,
    },
  };
  const parse = (managedProfileQualification) =>
    httpQualificationReceipt(
      JSON.stringify({
        ...receipt,
        managedProfileQualification,
      })
    );
  assert.deepEqual(parse(receipt.managedProfileQualification), receipt);
  const { unmanagedProfileQualification, ...oldManagedOnly } =
    receipt.managedProfileQualification;
  assert.throws(
    () => parse(oldManagedOnly),
    /Unmanaged profile HTTP receipt invalid/u
  );
  for (const incomplete of [
    { ...unmanagedProfileQualification, version: 0 },
    { ...unmanagedProfileQualification, assertions: 74 },
    { ...unmanagedProfileQualification, writes: 5 },
    { ...unmanagedProfileQualification, lostAcknowledgements: 5 },
    ...unmanagedProfileQualification.usernameLengths.map((length) => ({
      ...unmanagedProfileQualification,
      usernameLengths: unmanagedProfileQualification.usernameLengths.filter(
        (value) => value !== length
      ),
    })),
  ])
    assert.throws(
      () =>
        parse({
          ...receipt.managedProfileQualification,
          unmanagedProfileQualification: incomplete,
        }),
      /Unmanaged profile HTTP receipt invalid/u
    );

  assert.throws(
    () => parse({ ...receipt.managedProfileQualification, assertions: 11 }),
    /Managed profile HTTP receipt invalid/u
  );
  for (const length of receipt.managedProfileQualification.usernameLengths) {
    assert.throws(
      () =>
        parse({
          ...receipt.managedProfileQualification,
          usernameLengths:
            receipt.managedProfileQualification.usernameLengths.filter(
              (value) => value !== length
            ),
        }),
      /Managed profile HTTP receipt invalid/u
    );
  }
});

test('administrator username packet has an exact closed rollback plan', () => {
  const file = 'employee-admin-profile-usernames.sql';
  const sql = readFileSync(
    new URL(`../supabase/tests/${file}`, import.meta.url),
    'utf8'
  );
  const count = sql.match(/^select (?:is|ok|throws_ok)\(/gmu)?.length;
  assert.equal(count, 74);
  assert.deepEqual(
    managedProfilePackets.find(([name]) => name === file),
    [file, count]
  );
  assert.doesNotThrow(() => assertRollbackSource(sql));
});

test('rollback username packet precedes committed concurrency fixtures', () => {
  const username = managedProfilePackets.findIndex(
    ([file]) => file === 'employee-admin-profile-usernames.sql'
  );
  const concurrency = managedProfilePackets.findIndex(
    ([file]) => file === 'employee-managed-profile-concurrency.sql'
  );
  assert.ok(username >= 0 && concurrency >= 0 && username < concurrency);
});

test('unmanaged packet has a closed exact rollback plan before committed sessions', () => {
  const file = 'employee-unmanaged-profile-usernames.sql';
  const sql = readFileSync(
    new URL(`../supabase/tests/${file}`, import.meta.url),
    'utf8'
  );
  const count = sql.match(/^select (?:is|ok|throws_ok)\(/gmu)?.length;
  assert.equal(count, 100);
  assert.deepEqual(
    managedProfilePackets.find(([name]) => name === file),
    [file, count]
  );
  assert.doesNotThrow(() => assertRollbackSource(sql));
  const position = managedProfilePackets.findIndex(([name]) => name === file);
  const committed = managedProfilePackets.findIndex(
    ([name]) => name === 'employee-managed-profile-concurrency.sql'
  );
  assert.ok(position >= 0 && position < committed);
});
