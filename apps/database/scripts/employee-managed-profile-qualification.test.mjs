import assert from 'node:assert/strict';
import test from 'node:test';
import {
  managedProfilePackets,
  schemaReceipt,
  selectSchemaPackets,
} from './employee-managed-profile-qualification.mjs';
import { selectSchemaPackets as basePackets } from './employee-schema-tap.mjs';

test('managed profile selection preserves defaults and requires journal/typegen/cleanup', () => {
  const previous = process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
  try {
    delete process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE;
    assert.deepEqual(selectSchemaPackets(true), basePackets(true));
    process.env.EMPLOYEE_SCHEMA_INCLUDE_MANAGED_PROFILE = 'true';
    assert.throws(() => selectSchemaPackets(false));
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
