import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as control from './employee-normalization-qualification.mjs';

const sourceSha = '1887e137674f9a6216a9ee472b52cc1a72ee8741';
const controlSha = '5651b32f5148a644c79e560a8af515964b228da4';
const id = '00000000-0000-4000-8000-000000094501';
const catalog = [
  { schema: 'auth', table: 'users', constraint: 'users_synthetic_check' },
];
const message =
  'new row for relation "users" violates check constraint "users_synthetic_check"';
const base = `psql:/tmp/employee-schema-contract.sql:16: ERROR:  23514: ${message}\n`;
const project = (stderr = base, trusted = catalog) =>
  control.projectNormalizationDiagnostic
    ? control.projectNormalizationDiagnostic(stderr, trusted)
    : {
        ...control.normalizationSQLFailure(stderr),
        privateEvidence: { retained: true },
      };
const receipt = () => ({
  sourceSha,
  controlSha,
  normalizationQualified: false,
  failureDiagnostic: {
    phase: 'packet-execution',
    sqlState: '23514',
    fixtureLine: 16,
  },
  diagnosticTransport: control.normalizationDiagnosticEnvelope(
    project(),
    sourceSha,
    controlSha
  ),
});
const digest = (s) => createHash('sha256').update(s).digest('hex');

test('current retention-only receipt does not establish readable cause', () => {
  const d = project();
  assert.equal(d.constraint, 'users_synthetic_check');
  assert.equal(d.status, 'PARTIAL');
  assert.equal(d.row, null);
});
test('trusted verbose fields preserve exact identity', () => {
  const d = project(
    `${base}SCHEMA NAME: auth\nTABLE NAME: users\nCONSTRAINT NAME: users_synthetic_check\n`
  );
  assert.equal(d.constraint, 'users_synthetic_check');
  assert.equal(d.schema, 'auth');
  assert.equal(d.origin, 'verbose-fields');
});
test('standard message requires unique owned catalog membership', () => {
  assert.equal(project().origin, 'standard-message');
  assert.equal(project(base, []).status, 'UNKNOWN');
});
test('untrusted and conflicting catalog identities fail closed', () => {
  assert.equal(
    project(base, [{ ...catalog[0], constraint: 'other' }]).constraint,
    null
  );
  assert.equal(
    project(base, [...catalog, { ...catalog[0], schema: 'private' }])
      .constraint,
    null
  );
});
test('one explicit known synthetic row maps only its fixed label', () => {
  const d = project(
    `${base}DETAIL: Failing row contains (${id}, PRIVATE_VALUE).\n`
  );
  assert.equal(d.row, 'setup-auth-row-1');
  assert.equal(d.status, 'COMPLETE');
});
test('ambiguous or absent row is explicitly unknown', () => {
  assert.equal(
    project(
      `${base}DETAIL: Failing row contains (${id}, 00000000-0000-4000-8000-000000094502).\n`
    ).row,
    null
  );
  assert.equal(project().row, null);
});
test('malformed control and oversized input cannot expose a cause', () => {
  for (const value of [
    'ERROR: private',
    `${base}\u001b[31m`,
    'x'.repeat(65537),
    base.repeat(2),
  ]) {
    assert.equal(project(value).status, 'UNKNOWN');
  }
});
test('serialized diagnostic contains no raw private body or values', () => {
  const d = project(
    `${base}DETAIL: Failing row contains (${id}, PRIVATE_CUSTOMER_VALUE).\nCONTEXT: PRIVATE_CONTEXT\n`
  );
  const envelope = control.normalizationDiagnosticEnvelope(
    d,
    sourceSha,
    controlSha
  );
  const text = JSON.stringify(envelope);
  assert.ok(!text.includes('PRIVATE_'));
  assert.ok(!text.includes(id));
  assert.ok(!text.includes('Failing row'));
  assert.equal(
    envelope.projectionSHA256,
    digest(JSON.stringify(envelope.projection))
  );
});
test('private raw retention remains exclusive0700 and0600', () => {
  const root = mkdtempSync(join(tmpdir(), 'normalization-transport-'));
  try {
    const directory = join(root, 'raw');
    const d = control.retainNormalizationFailure(
      { stdout: '', stderr: base, status: 3 },
      {
        directory,
        phase: 'packet-execution',
        packetOrdinal: 1,
        sourceSha,
        controlSha,
      }
    );
    assert.equal(d.privateEvidence.retained, true);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(join(directory, 'failure.json')).mode & 0o777, 0o600);
    assert.equal(
      d.privateEvidence.rawSHA256,
      digest(readFileSync(join(directory, 'failure.json')))
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
test('complete artifact serialization readback validates exact envelope', () => {
  const root = mkdtempSync(join(tmpdir(), 'normalization-safe-artifact-'));
  try {
    const bytes = `${JSON.stringify(receipt())}\n`;
    writeFileSync(join(root, 'qualification.json'), bytes, { mode: 0o600 });
    assert.equal(
      control.validateNormalizationDiagnosticArtifact(
        readFileSync(join(root, 'qualification.json'))
      ).status,
      'PARTIAL'
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});
test('workflow validates safe exact artifact before selected upload', () => {
  const text = readFileSync(
    new URL(
      '../../../.github/workflows/employee-schema-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.ok(text.includes('id: diagnostic-transport'));
  assert.ok(text.includes("steps.diagnostic-transport.outcome == 'success'"));
  assert.ok(text.includes('employee-schema-receipts/qualification.json'));
  assert.ok(!text.includes('employee-schema-private-'));
});
test('tamper identity or raw fields cannot pass artifact validation', () => {
  for (const mutate of [
    (x) => {
      x.diagnosticTransport.sourceSha = '0'.repeat(40);
    },
    (x) => {
      x.diagnosticTransport.projection.stdout = 'PRIVATE';
    },
    (x) => {
      x.diagnosticTransport.projection.constraint = 'changed';
    },
  ]) {
    const value = receipt();
    mutate(value);
    assert.throws(
      () =>
        control.validateNormalizationDiagnosticArtifact(JSON.stringify(value)),
      /Diagnostic transport/
    );
  }
});
