import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseProvenance } from './employee-failure-provenance.mjs';

function row(ordinal, changes = {}) {
  return {
    ordinal,
    sqlstate: '23514',
    noException: false,
    structuredOriginCategory: 'empty_structured_provenance',
    constraintCategory: 'other_redacted',
    catalogBound: false,
    guardCategory: 'unclassified',
    ...changes,
  };
}
const text = (...rows) => rows.map((item) => JSON.stringify(item)).join('\n');

test('empty structured provenance remains redacted', () => {
  assert.deepEqual(parseProvenance(text(row(22), row(23))), [row(22), row(23)]);
});
test('known CHECK categories require matching actual catalog provenance', () => {
  const known = row(22, {
    structuredOriginCategory: 'catalog_check',
    constraintCategory: 'employee_lifecycle_check',
    catalogBound: true,
  });
  assert.deepEqual(parseProvenance(text(known, row(23)))[0], known);
});
test('unknown catalog CHECK is never guessed into a known category', () => {
  const unknown = row(22, {
    structuredOriginCategory: 'catalog_check',
    catalogBound: true,
  });
  assert.equal(
    parseProvenance(text(unknown, row(23)))[0].constraintCategory,
    'other_redacted'
  );
});
test('no exception is diagnostic evidence only', () => {
  const none = row(22, {
    noException: true,
    sqlstate: null,
    structuredOriginCategory: 'no_exception',
  });
  assert.equal(parseProvenance(text(none, row(23)))[0].noException, true);
});
test('fixed guard categories remain diagnostic signatures, not catalog evidence', () => {
  for (const guardCategory of [
    'intent_identity_mismatch',
    'creation_intent_missing',
    'onboarding_registry_missing',
    'creation_final_row_invalid',
    'personal_workspace_second_member',
  ]) {
    const guard = row(22, { guardCategory });
    assert.deepEqual(parseProvenance(text(guard, row(23)))[0], guard);
  }
});
test('guard categories reject contradictory catalog, no-exception and SQLSTATE evidence', () => {
  const guardCategory = 'personal_workspace_second_member';
  for (const invalid of [
    row(22, { guardCategory: 'PRIVATE' }),
    row(22, { guardCategory, sqlstate: '42501' }),
    row(22, { guardCategory, noException: true, sqlstate: null }),
    row(22, {
      guardCategory,
      structuredOriginCategory: 'unknown_structured_provenance',
    }),
    row(22, {
      guardCategory,
      structuredOriginCategory: 'catalog_check',
      constraintCategory: 'employee_lifecycle_check',
      catalogBound: true,
    }),
    row(22, { guardCategory, context: 'PRIVATE' }),
    row(22, { guardCategory, functionName: 'PRIVATE' }),
    row(22, { guardCategory, exceptionHash: 'PRIVATE' }),
    row(22, { guardCategory, sourceLine: 1 }),
  ]) {
    assert.throws(() => parseProvenance(text(invalid, row(23))));
  }
});
test('private fields, invalid enum values and contradictory provenance fail closed', () => {
  for (const invalid of [
    row(22, { message: 'PRIVATE' }),
    row(22, { constraintCategory: 'PRIVATE' }),
    row(22, { catalogBound: true }),
    row(22, { noException: true }),
    row(22, { ordinal: true }),
    row(22, { sqlstate: 'PRIVATE' }),
    row(22, {
      sqlstate: '42501',
      structuredOriginCategory: 'catalog_check',
      constraintCategory: 'employee_lifecycle_check',
      catalogBound: true,
    }),
  ])
    assert.throws(() => parseProvenance(text(invalid, row(23))));
});
test('duplicate keys, extra rows, excessive output and wrong ordinals fail closed', () => {
  const valid = text(row(22), row(23));
  for (const invalid of [
    valid.replace('"ordinal":22', '"ordinal":22,"ordinal":22'),
    text(row(22), row(22)),
    text(row(22), row(23), row(24)),
    'x'.repeat(8193),
  ])
    assert.throws(() => parseProvenance(invalid));
});
test('manual diagnostic mode defaults off and retains the original qualification path', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/employee-schema-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(
    workflow,
    /structured_provenance:\s*\n\s*description:[^\n]*\n\s*required: false\s*\n\s*default: false/u
  );
  assert.match(workflow, /if: inputs\.structured_provenance != true/u);
  assert.match(
    workflow,
    /run: node \.\.\/apps\/database\/scripts\/verify-employee-schema-contract\.mjs/u
  );
  assert.match(workflow, /if: inputs\.structured_provenance == true/u);
  assert.match(workflow, /name: employee-provenance-/u);
  assert.match(
    workflow,
    /run: node \.\.\/apps\/database\/scripts\/verify-employee-schema-contract\.mjs --cleanup/u
  );
});
