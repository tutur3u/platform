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
import { runInNewContext } from 'node:vm';
import * as control from './employee-normalization-qualification.mjs';
import * as dependencyControl from './employee-normalization-test-dependency.mjs';

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

const catalogEvidenceCases = [
  {
    id: 'null-array',
    input: {
      rows: null,
    },
    predicate: 'ARRAY_REQUIRED',
    field: null,
    index: null,
  },
  {
    id: 'object-array',
    input: {
      rows: {},
    },
    predicate: 'ARRAY_REQUIRED',
    field: null,
    index: null,
  },
  {
    id: 'count-limit',
    input: {
      rowsCount: 2049,
    },
    predicate: 'COUNT_LIMIT',
    field: null,
    index: null,
  },
  {
    id: 'null-row',
    input: {
      rows: [null],
    },
    predicate: 'ROW_OBJECT_REQUIRED',
    field: 'row',
    index: 0,
  },
  {
    id: 'schema',
    input: {
      rows: [
        {
          schema: 'outside',
          table: 'users',
          constraint: 'users_synthetic_check',
        },
      ],
    },
    predicate: 'SCHEMA_NOT_ALLOWED',
    field: 'schema',
    index: 0,
  },
  {
    id: 'table-type',
    input: {
      rows: [
        {
          schema: 'auth',
          table: 42,
          constraint: 'users_synthetic_check',
        },
      ],
    },
    predicate: 'TABLE_IDENTIFIER_REJECTED',
    field: 'table',
    index: 0,
    identifierClass: 'NON_STRING',
  },
  {
    id: 'table-grammar',
    input: {
      rows: [
        {
          schema: 'auth',
          table: 'Quoted-Name',
          constraint: 'users_synthetic_check',
        },
      ],
    },
    predicate: 'TABLE_IDENTIFIER_REJECTED',
    field: 'table',
    index: 0,
    identifierClass: 'GRAMMAR_REJECTED',
  },
  {
    id: 'constraint-type',
    input: {
      rows: [
        {
          schema: 'auth',
          table: 'users',
          constraint: {},
        },
      ],
    },
    predicate: 'CONSTRAINT_IDENTIFIER_REJECTED',
    field: 'constraint',
    index: 0,
    identifierClass: 'NON_STRING',
  },
  {
    id: 'constraint-grammar',
    input: {
      rows: [
        {
          schema: 'auth',
          table: 'users',
          constraint: 'Bad-Value',
        },
      ],
    },
    predicate: 'CONSTRAINT_IDENTIFIER_REJECTED',
    field: 'constraint',
    index: 0,
    identifierClass: 'GRAMMAR_REJECTED',
  },
  {
    id: 'observed-actor',
    input: {
      rows: [
        {
          schema: 'auth',
          table: 'users',
          constraint: 'users_synthetic_check',
        },
      ],
      actor: 'supabase_admin',
      database: 'postgres',
    },
    predicate: 'VALID',
    field: null,
    index: null,
    actor: 'supabase_admin',
    actorObserved: true,
  },
  {
    id: 'unknown-actor',
    input: {
      rows: [
        {
          schema: 'auth',
          table: 'users',
          constraint: 'users_synthetic_check',
        },
      ],
      actor: 'unexpected_actor',
      database: 'unexpected_database',
    },
    predicate: 'VALID',
    field: null,
    index: null,
    actor: null,
    actorObserved: true,
  },
  {
    id: 'safe-roundtrip',
    input: {
      rows: [
        {
          schema: 'auth',
          table: 'users',
          constraint: 'users_synthetic_check',
        },
      ],
      actor: 'supabase_admin',
      database: 'postgres',
    },
    predicate: 'VALID',
    field: null,
    index: null,
    transport: true,
  },
];
for (const vector of catalogEvidenceCases) {
  test(`catalog evidence new: ${vector.id}`, () => {
    const input = vector.input.rowsCount
      ? {
          rows: Array.from({ length: vector.input.rowsCount }, () => ({
            ...catalog[0],
          })),
        }
      : vector.input;
    const evidence = control.catalogValidationEvidence?.(input) ?? {
      predicate: 'UNCLASSIFIED',
    };
    assert.equal(evidence.predicate, vector.predicate);
    assert.equal(evidence.field, vector.field);
    assert.equal(evidence.index, vector.index);
    assert.equal(
      evidence.count,
      Array.isArray(input.rows) ? input.rows.length : null
    );
    if ('identifierClass' in vector)
      assert.equal(evidence.identifierClass, vector.identifierClass);
    if ('actor' in vector) assert.equal(evidence.actor, vector.actor);
    if ('actorObserved' in vector)
      assert.equal(evidence.actorObserved, vector.actorObserved);
    assert.equal(
      evidence.querySHA256,
      digest(control.normalizationDiagnosticCatalogSQL)
    );
    assert.equal(JSON.stringify(evidence).includes('unexpected_actor'), false);
    assert.equal(JSON.stringify(evidence).includes('Quoted-Name'), false);
    assert.equal(JSON.stringify(evidence).includes('Bad-Value'), false);
    if (vector.transport) {
      const safe = { ...receipt(), catalogValidation: evidence };
      assert.equal(
        control.validateNormalizationDiagnosticArtifact(JSON.stringify(safe))
          .status,
        'PARTIAL'
      );
      const tampered = {
        ...safe,
        catalogValidation: { ...evidence, raw: 'synthetic-private' },
      };
      assert.throws(
        () =>
          control.validateNormalizationDiagnosticArtifact(
            JSON.stringify(tampered)
          ),
        /Diagnostic transport invalid/
      );
    }
  });
}

const relevantRunnerSource = readFileSync(
  new URL('./verify-employee-schema-contract.mjs', import.meta.url),
  'utf8'
);
const relevantFunction = relevantRunnerSource.match(
  /^export function collectRelevantCatalog\([\s\S]*?^\}/mu
);
assert(relevantFunction, 'actual runner pure collector must be present');
const collectRelevant = runInNewContext(
  '(' + relevantFunction[0].replace(/^export /u, '') + ')',
  {
    catalogValidationEvidence: control.catalogValidationEvidence,
    projectNormalizationDiagnostic: control.projectNormalizationDiagnostic,
    normalizationDiagnosticCatalogSQL:
      control.normalizationDiagnosticCatalogSQL,
    createHash,
    Buffer,
  }
);
const relevantReply = (rows, total = rows.length) => {
  const rowsJSON = total > 2048 ? null : JSON.stringify(rows);
  return JSON.stringify({
    actor: 'supabase_admin',
    database: 'postgres',
    total,
    rowsJSON,
    rowsMD5:
      rowsJSON === null
        ? null
        : createHash('md5').update(rowsJSON).digest('hex'),
  });
};
test('relevant selection new: complete relevant row replaces overbroad count denial', () => {
  for (const name of [
    'pgTapBootstrapSQL',
    'testDependencyCatalogSQL',
    'verifyTestDependencyEvidence',
    'prepareNormalizationTestDependency',
  ]) {
    assert.equal(control[name], dependencyControl[name]);
  }
  assert.throws(
    () =>
      dependencyControl.verifyTestDependencyEvidence({
        before: { actor: 'intruder' },
      }),
    assert.AssertionError
  );
  assert.equal(
    control.catalogValidationEvidence({ rows: Array(4594).fill(catalog[0]) })
      .predicate,
    'COUNT_LIMIT'
  );
  let calls = 0;
  const selected = collectRelevant(base, (sql) => {
    calls++;
    assert(!/\bLIMIT\b/u.test(sql));
    assert(sql.includes('total <= 2048'));
    assert(sql.includes("entry->>'table' = 'users'"));
    return relevantReply(catalog);
  });
  assert.equal(calls, 1);
  assert.equal(selected.validation.predicate, 'VALID');
  assert.equal(selected.selection.total, 1);
  assert.equal(selected.selection.returned, 1);
  assert.equal(selected.selection.complete, true);
  assert.equal(
    control.projectNormalizationDiagnostic(base, selected.catalog).constraint,
    catalog[0].constraint
  );
});
test('relevant selection new: complete ambiguity never chooses a schema', () => {
  const rows = [catalog[0], { ...catalog[0], schema: 'public' }];
  const selected = collectRelevant(base, () => relevantReply(rows));
  assert.equal(selected.selection.complete, true);
  assert.equal(selected.selection.total, 2);
  assert.equal(
    control.projectNormalizationDiagnostic(base, selected.catalog).reason,
    'IDENTITY_UNKNOWN'
  );
});
test('relevant selection new: verbose identity is complete across same owned universe', () => {
  const stderr =
    base +
    'SCHEMA NAME: public\nTABLE NAME: users\nCONSTRAINT NAME: users_synthetic_check\n';
  const selected = collectRelevant(stderr, (sql) => {
    assert(sql.includes("entry->>'schema' = 'public'"));
    return relevantReply([{ ...catalog[0], schema: 'public' }]);
  });
  assert.equal(selected.selection.complete, true);
  assert.equal(selected.catalog[0].schema, 'public');
});
test('relevant selection new: partial verbose fields cannot fall back', () => {
  let calls = 0;
  const selected = collectRelevant(base + 'SCHEMA NAME: auth\n', () => {
    calls++;
    return relevantReply(catalog);
  });
  assert.equal(calls, 0);
  assert.equal(selected.selection.reason, 'SELECTOR_UNAVAILABLE');
  assert.equal(selected.catalog, null);
});
test('relevant selection new: overbound relevant count is explicit without truncated rows', () => {
  const selected = collectRelevant(base, () => relevantReply([], 2049));
  assert.equal(selected.selection.reason, 'COUNT_LIMIT');
  assert.equal(selected.selection.total, 2049);
  assert.equal(selected.selection.complete, false);
  assert.equal(selected.catalog, null);
});
test('relevant selection new: exact 2048 boundary retains every duplicate match', () => {
  const rows = Array(2048).fill(catalog[0]);
  const selected = collectRelevant(base, () => relevantReply(rows));
  assert.equal(selected.selection.complete, true);
  assert.equal(selected.selection.returned, 2048);
  assert.equal(selected.catalog.length, 2048);
  assert.equal(
    control.projectNormalizationDiagnostic(base, selected.catalog).reason,
    'IDENTITY_UNKNOWN'
  );
});
test('relevant selection new: count and returned body must agree', () => {
  const selected = collectRelevant(base, () => relevantReply([], 1));
  assert.equal(selected.selection.reason, 'RESPONSE_INVALID');
  assert.equal(selected.selection.complete, false);
  assert.equal(selected.catalog, null);
});
test('relevant selection new: snapshot digest mismatch is rejected', () => {
  const value = JSON.parse(relevantReply(catalog));
  value.rowsMD5 = '0'.repeat(32);
  const selected = collectRelevant(base, () => JSON.stringify(value));
  assert.equal(selected.selection.reason, 'RESPONSE_INVALID');
  assert.equal(selected.catalog, null);
});
test('relevant selection new: complete ordering is checked without removing rows', () => {
  const selected = collectRelevant(base, () =>
    relevantReply([{ ...catalog[0], schema: 'public' }, catalog[0]])
  );
  assert.equal(selected.selection.reason, 'RESPONSE_INVALID');
  assert.equal(selected.selection.complete, false);
});
test('relevant selection new: query failure returns unknown without a second callback', () => {
  let calls = 0;
  const selected = collectRelevant(base, () => {
    calls++;
    throw new Error('PRIVATE_SERVER_SECRET');
  });
  assert.equal(calls, 1);
  assert.equal(selected.selection.reason, 'QUERY_ERROR');
  assert.equal(selected.catalog, null);
  assert.equal(
    JSON.stringify(selected.selection).includes('PRIVATE_SERVER_SECRET'),
    false
  );
});
test('relevant selection new: multiple error records cannot create a selector', () => {
  let calls = 0;
  const selected = collectRelevant(base + base, () => {
    calls++;
    return relevantReply(catalog);
  });
  assert.equal(calls, 0);
  assert.equal(selected.selection.reason, 'SELECTOR_UNAVAILABLE');
});
test('relevant selection new: receiver accepts typed selection and rejects false completeness', () => {
  const selected = collectRelevant(base, () => relevantReply(catalog));
  const value = receipt();
  value.failureDiagnostic.catalogSelection = JSON.parse(
    JSON.stringify(selected.selection)
  );
  assert.equal(
    control.validateNormalizationDiagnosticArtifact(
      Buffer.from(JSON.stringify(value))
    ).status,
    'PARTIAL'
  );
  value.failureDiagnostic.catalogSelection.total = 2049;
  assert.throws(
    () =>
      control.validateNormalizationDiagnosticArtifact(
        Buffer.from(JSON.stringify(value))
      ),
    /Diagnostic transport invalid/u
  );
});
