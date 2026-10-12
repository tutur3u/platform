import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseIdentityDiagnostic } from './employee-identity-diagnostic.mjs';

const categories = ['negative', 'positive', 'ordinary'];
function row(ordinal, changes = {}) {
  return {
    ordinal,
    caseCategory: categories[ordinal - 1],
    phase: 1,
    sqlstate: '42501',
    noException: false,
    caseRolledBack: true,
    routineCategory: 'audit_identity_contract',
    intentBeforeimageRetained: true,
    reservationBeforeimageRetained: true,
    catalogPresent: true,
    catalogHash: 'a'.repeat(32),
    sessionIsSupabaseAdmin: true,
    auditOwnerIsSessionUser: true,
    profileOwnerIsSessionUser: false,
    profileOwnerCanUseTempSchema: false,
    profileOwnerCanInsertAudit: false,
    deferredOwnerCanUseTempSchema: false,
    deferredOwnerCanInsertAudit: false,
    ...changes,
  };
}
const text = (...rows) => rows.map((value) => JSON.stringify(value)).join('\n');
const valid = () => text(row(1), row(2), row(3));

test('fixed SQLSTATE/routine/role observations remain diagnostic only', () => {
  const rows = [row(1), row(2), row(3)];
  assert.deepEqual(parseIdentityDiagnostic(text(...rows)), rows);
});
test('completed positive and ordinary controls must finish after rollback sentinel', () => {
  const done = {
    phase: 4,
    sqlstate: null,
    noException: true,
    routineCategory: 'none',
  };
  assert.equal(
    parseIdentityDiagnostic(text(row(1), row(2, done), row(3, done)))[1]
      .noException,
    true
  );
  for (const change of [
    { phase: 3 },
    { sqlstate: '23514' },
    { routineCategory: 'create_user_profile' },
  ])
    assert.throws(() =>
      parseIdentityDiagnostic(
        text(row(1), row(2, { ...done, ...change }), row(3))
      )
    );
});
test('missing catalog or failed rollback observations are retained for a failing runner receipt', () => {
  const incomplete = row(1, {
    catalogPresent: false,
    caseRolledBack: false,
    intentBeforeimageRetained: false,
  });
  assert.deepEqual(
    parseIdentityDiagnostic(text(incomplete, row(2), row(3)))[0],
    incomplete
  );
  const runner = readFileSync(
    new URL('./verify-employee-identity-diagnostic.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    runner,
    /records\.some\(\s*\(row\)\s*=>\s*!row\.caseRolledBack\s*\|\|\s*!row\.intentBeforeimageRetained\s*\|\|\s*!row\.reservationBeforeimageRetained/u
  );
});
test('raw exception fields, nested values, extra rows and duplicate keys are rejected', () => {
  for (const change of [
    { message: 'PRIVATE' },
    { detail: 'PRIVATE' },
    { context: 'PRIVATE' },
    { query: 'PRIVATE' },
    { exceptionHash: 'a'.repeat(32) },
    { routineCategory: 'PRIVATE' },
    { sqlstate: 'PRIVATE' },
    { phase: 0 },
    { phase: 4 },
    { ordinal: true },
    { caseCategory: 'PRIVATE' },
    { profileOwnerCanInsertAudit: { secret: true } },
    { sessionIsSupabaseAdmin: false },
  ])
    assert.throws(() =>
      parseIdentityDiagnostic(text(row(1, change), row(2), row(3)))
    );
  for (const value of [
    valid().replace('"ordinal":1', '"ordinal":1,"ordinal":1'),
    text(row(1), row(2)),
    text(row(1), row(2), row(3), row(3)),
    text(row(1), row(2), row(3, { catalogHash: 'b'.repeat(32) })),
    `${valid()}\nRAW_PRIVATE_TEXT`,
    'x'.repeat(8193),
  ])
    assert.throws(() => parseIdentityDiagnostic(value));
});
test('SQL rolls back successful cases, retains original audit ACL semantics and serializes no raw exception', () => {
  const sql = readFileSync(
    new URL('./employee-identity-diagnostic.sql', import.meta.url),
    'utf8'
  );
  assert.match(sql, /^begin;/u);
  assert.match(sql, /rollback;\s*$/u);
  assert.match(sql, /raise exception using errcode='PTD01'/u);
  assert.doesNotMatch(
    sql,
    /\bcommit\s*;|disable trigger|grant .*identity_audit|security definer/iu
  );
  const output = sql.slice(
    sql.indexOf('insert into pg_temp.identity_diagnostic_records')
  );
  assert.doesNotMatch(output, /'message'|'context'|'detail'|'query'|caught_/u);
});
test('new mode uses the existing dispatchable workflow on an exact isolated branch, leaving legacy mode guards intact', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/employee-schema-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.match(
    workflow,
    /identity_diagnostic:\s*\n\s*description:[^\n]*\n\s*required: false\n\s*default: false/u
  );
  assert.match(
    workflow,
    /refs\/heads\/fix\/employee-identity-diagnostic-control-20261012/u
  );
  assert.match(
    workflow,
    /inputs\.structured_provenance != true && inputs\.identity_diagnostic != true/u
  );
  assert.match(
    workflow,
    /EMPLOYEE_SCHEMA_SOURCE_SHA !== "5c7c08e23a3d410bdbdc066f5c4dd2776fbeabd7"/u
  );
  assert.match(workflow, /inputs\.structured_provenance == true/u);
  assert.match(workflow, /GITHUB_REF !== "refs\/heads\/main"/u);
  assert.match(workflow, /persist-credentials: false/u);
});
test('identity mode excludes the normal qualification artifact and retains its own diagnostic receipt', () => {
  const workflow = readFileSync(
    new URL(
      '../../../.github/workflows/employee-schema-contract.yaml',
      import.meta.url
    ),
    'utf8'
  );
  const uploads = workflow
    .split(/(?=^ {6}- uses: actions\/upload-artifact@v7)/mu)
    .filter((step) =>
      step.startsWith('      - uses: actions/upload-artifact@v7')
    );
  const qualification = uploads.find((step) =>
    step.includes('/qualification.json')
  );
  const diagnostic = uploads.find((step) =>
    step.includes('/identity-diagnostic.json')
  );
  assert.ok(qualification && diagnostic);
  assert.match(
    qualification,
    /if: always\(\) && inputs\.structured_provenance != true && inputs\.identity_diagnostic != true/u
  );
  assert.match(
    diagnostic,
    /if: always\(\) && inputs\.identity_diagnostic == true/u
  );
  assert.doesNotMatch(diagnostic, /qualification\.json/u);
});

test('negative and positive cases keep the original empty helper search path; ordinary keeps caller context', () => {
  const sql = readFileSync(
    new URL('./employee-identity-diagnostic.sql', import.meta.url),
    'utf8'
  );
  const scoped = sql.indexOf(
    "if item.kind <> 'ordinary' then perform set_config('search_path','',true); end if;"
  );
  const insert = sql.indexOf(
    'insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)'
  );
  assert.ok(scoped >= 0 && scoped < insert);
  assert.equal([...sql.matchAll(/set_config\('search_path'/gu)].length, 1);
  assert.match(sql, /^set local search_path = public, extensions;/mu);
  assert.doesNotMatch(
    sql,
    /grant .*identity_audit|security definer|disable trigger/iu
  );
});

test('controller pins both clean checkouts and original fixture hashes; diagnostic cannot qualify schema', () => {
  const runner = readFileSync(
    new URL('./verify-employee-identity-diagnostic.mjs', import.meta.url),
    'utf8'
  );
  assert.match(
    runner,
    /sourceSha !== '5e05c380f60116e9eba41ba42062738229f877a9'/u
  );
  assert.match(runner, /controlSha !== process\.env\.GITHUB_SHA/u);
  assert.match(
    runner,
    /JSON\.stringify\(changedControlPaths\) !== JSON\.stringify\(controlPaths\)/u
  );
  assert.match(runner, /schemaQualified: false/u);
  assert.match(runner, /assertionsQualified: false/u);
  assert.match(runner, /records\.length === 3/u);
  assert.match(
    runner,
    /8efafcdd553417fe92ea32e94210b8c6a75418ed5d9212dc7733f1d3548ec8ef/u
  );
});
