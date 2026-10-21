import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  managedProfilePackets,
  schemaReceipt,
  selectSchemaPackets,
} from './employee-managed-profile-qualification.mjs';
import {
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
      selectSchemaPackets(true).slice(-2),
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
