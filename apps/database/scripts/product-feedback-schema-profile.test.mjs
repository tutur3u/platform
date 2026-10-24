import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertPacketTap,
  assertRollbackSource,
  feedbackPackets,
  foundationPackets,
  journalPackets,
  schemaFailureDiagnostic,
  schemaReceipt,
  selectFeedback,
  selectSchemaPackets,
} from './employee-schema-tap.mjs';

const packets = selectSchemaPackets(false, false, false, true).map(
  ([file, assertions]) => ({ file, assertions })
);
const receipt = (extra = {}) =>
  schemaReceipt({
    sourceSha: 'a'.repeat(40),
    feedback: true,
    packets,
    lifecycleCode: 0,
    cleanupSucceeded: true,
    ...extra,
  });
const syntheticTap = (count) =>
  [
    'BEGIN',
    `1..${count}`,
    ...Array.from({ length: count }, (_, i) => `ok ${i + 1} - synthetic`),
    'ROLLBACK',
    '',
  ].join('\n');

test('feedback selection defaults off and rejects malformed values', () => {
  for (const value of [undefined, 'false'])
    assert.equal(selectFeedback(value), false);
  assert.equal(selectFeedback('true'), true);
  for (const value of [null, true, false, '', 'TRUE', '1'])
    assert.throws(() => selectFeedback(value));
});

test('feedback appends exactly 106 assertions after the original employee foundation', () => {
  assert.deepEqual(
    packets.slice(0, 5),
    foundationPackets.map(([file, assertions]) => ({ file, assertions }))
  );
  assert.deepEqual(packets.slice(5), [
    { file: 'product-feedback-intake.sql', assertions: 34 },
    { file: 'product-feedback-staff-inbox.sql', assertions: 41 },
    { file: 'product-feedback-staff-eligibility.sql', assertions: 31 },
  ]);
  assert.equal(receipt().assertions, 278);
  assert.equal(receipt().scope, 'employee-creation-restoration-feedback');
  assert.equal(receipt().schemaQualified, true);
  assert.equal(receipt().providerQualified, false);
  assert.equal(receipt().productionApplied, false);
  for (const [file, count] of feedbackPackets) {
    const sql = readFileSync(
      new URL(`../supabase/tests/${file}`, import.meta.url),
      'utf8'
    );
    assertRollbackSource(sql);
    assert.match(sql, new RegExp(`SELECT plan\\(${count}\\);`, 'u'));
  }
});

test('feedback selection is separate from every existing optional profile', () => {
  for (let bits = 1; bits < 8; bits++)
    assert.throws(() =>
      selectSchemaPackets(
        Boolean(bits & 1),
        Boolean(bits & 2),
        Boolean(bits & 4),
        true
      )
    );
  for (const value of [null, 'true', 1])
    assert.throws(() => selectSchemaPackets(false, false, false, value));
  for (const [journal, personal, address, count] of [
    [false, false, false, 172],
    [true, false, false, 324],
    [false, true, false, 196],
    [false, false, true, 253],
    [true, false, true, 405],
  ]) {
    const selected = selectSchemaPackets(journal, personal, address, false);
    assert.deepEqual(selected, selectSchemaPackets(journal, personal, address));
    if (address)
      assert.deepEqual(selected, [
        ...(journal ? journalPackets : foundationPackets),
        ['employee-google-destination-migration.sql', 30],
        ['employee-address-migration.sql', 10],
        ['employee-retained-mailbox-adoption.sql', 41],
      ]);
    assert.equal(
      selected.reduce((n, [, assertions]) => n + assertions, 0),
      count
    );
  }
});

test('receipt refuses absent, reordered, duplicated or miscounted feedback and failed lifecycle/cleanup', () => {
  for (const broken of [
    packets.slice(0, 5),
    packets.slice(5),
    packets.toReversed(),
    [...packets, packets[7]],
    packets.map((p, i) => (i === 7 ? { ...p, assertions: 29 } : p)),
  ])
    assert.equal(receipt({ packets: broken }).schemaQualified, false);
  assert.equal(receipt({ feedback: false }).schemaQualified, false);
  assert.equal(receipt({ lifecycleCode: 1 }).schemaQualified, false);
  assert.equal(receipt({ cleanupSucceeded: false }).schemaQualified, false);
});

test('synthetic TAP controls reject failures, skips, truncation and commit without claiming SQL execution', () => {
  for (const [, count] of feedbackPackets) {
    const tap = syntheticTap(count);
    assert.equal(assertPacketTap(tap, count), count);
    for (const broken of [
      tap.replace('ok 1 - synthetic\n', 'not ok 1 - synthetic\n'),
      tap.replace('ok 1 - synthetic\n', 'ok 1 - synthetic # SKIP\n'),
      tap.replace(`ok ${count} - synthetic\n`, ''),
      tap.replace('ROLLBACK', 'COMMIT'),
    ])
      assert.throws(() => assertPacketTap(broken, count));
  }
});

test('feedback failure diagnostic binds eligibility ordinal to its own 31 assertions', () => {
  const diagnostic = (stdout) =>
    schemaFailureDiagnostic(
      'packet-tap',
      8,
      { stdout },
      false,
      false,
      false,
      true
    );
  assert.deepEqual(
    diagnostic('not ok 13 - synthetic\n').failedAssertionOrdinals,
    [13]
  );
  assert.equal(
    diagnostic('not ok 32 - synthetic\n').assertionOrdinalsValid,
    false
  );
  assert.throws(() =>
    schemaFailureDiagnostic('packet-tap', 9, {}, false, false, false, true)
  );
});

test('runner rejects incompatible feedback profiles before hosted admission and retains the hosted guard', () => {
  for (let bits = 0; bits < 8; bits++) {
    const result = spawnSync(
      process.execPath,
      [
        new URL('./verify-employee-schema-contract.mjs', import.meta.url)
          .pathname,
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          GITHUB_ACTIONS: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_CHAT_INITIAL_SETTINGS: 'false',
          EMPLOYEE_SCHEMA_DIAGNOSE_CHAT_PROCESS: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_STRUCTURED_PROVENANCE: 'false',
          EMPLOYEE_SCHEMA_SOURCE_SHA: 'a'.repeat(40),
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK: 'true',
          EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK_CAUSAL: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_PROFILE_ROUTE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_JOURNAL: String(Boolean(bits & 1)),
          EMPLOYEE_SCHEMA_INCLUDE_PERSONAL_JOURNAL: String(Boolean(bits & 2)),
          EMPLOYEE_SCHEMA_INCLUDE_ADDRESS_MIGRATION: String(Boolean(bits & 4)),
          EMPLOYEE_SCHEMA_INCLUDE_HTTP: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_RESTORE: 'false',
          EMPLOYEE_SCHEMA_INCLUDE_WEB_SESSION: 'false',
        },
      }
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      bits
        ? /Select one optional schema profile/u
        : /This gate requires a disposable hosted Linux runner/u
    );
  }
});

test('workflow exposes feedback only through an explicit default-off input', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/employee-schema-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(
    workflow,
    /include_feedback:\n {8}description: [^\n]+\n {8}required: false\n {8}default: false\n {8}type: boolean/u
  );
  assert.match(
    workflow,
    /EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK: \$\{\{ inputs.include_feedback \}\}/u
  );
  assert.match(
    workflow,
    /run: node --test apps\/database\/scripts\/product-feedback-schema-profile.test.mjs/u
  );
});

test('legacy workflow controls pass under the feedback dispatch environment', () => {
  const env = { ...process.env, EMPLOYEE_SCHEMA_INCLUDE_FEEDBACK: 'true' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      new URL('./employee-schema-workflow.test.mjs', import.meta.url).pathname,
    ],
    {
      encoding: 'utf8',
      // The spawned legacy suite takes ~15s alone; leave headroom under load.
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      env,
    }
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /combined profiles reject incompatible selections before hosted database setup/u
  );
});
