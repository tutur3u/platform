import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const include = readFileSync(
  new URL('../supabase/tests/helpers/local-dblink.inc', import.meta.url),
  'utf8'
);
const fixtureNames = [
  'calendar-provider-saga.sql',
  'calendar-google-mutation-replay.sql',
  'employee-google-destination-migration.sql',
  'employee-retained-mailbox-adoption.sql',
  'employee-managed-profile-concurrency.sql',
];

test('unavailable dblink skips locally and fails when required by contract runners', () => {
  assert.match(include, /\\if :\{\?require_dblink\}/u);
  assert.match(include, /select fail\('dblink setup unavailable in CI'\)/u);
  for (const fixtureName of fixtureNames) {
    const fixture = readFileSync(
      new URL(`../supabase/tests/${fixtureName}`, import.meta.url),
      'utf8'
    );
    assert.match(fixture, /1\.\.0 # SKIP/u, fixtureName);
    assert.match(fixture, /\\ir helpers\/local-dblink\.inc/u, fixtureName);
  }

  const calendarRunner = readFileSync(
    new URL('./verify-calendar-generation-contract.mjs', import.meta.url),
    'utf8'
  );
  const employeeRunner = readFileSync(
    new URL('./verify-employee-schema-contract.mjs', import.meta.url),
    'utf8'
  );
  assert.match(calendarRunner, /'require_dblink=1'/u);
  assert.match(employeeRunner, /'require_dblink=1'/u);
});
