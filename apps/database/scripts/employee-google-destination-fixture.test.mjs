import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertRollbackSource,
  selectSchemaPackets,
} from './employee-schema-tap.mjs';

const file = 'employee-google-destination-migration.sql';
const sql = readFileSync(
  new URL(`../supabase/tests/${file}`, import.meta.url),
  'utf8'
);

test('the selected Google packet has its exact authored assertion count and rollback closure', () => {
  assertRollbackSource(sql);
  const selected = selectSchemaPackets(false, false, true).find(
    ([name]) => name === file
  );
  assert.ok(selected);
  assert.equal(selected[1], 30);
  assert.match(sql, /select plan\(30\);/u);
  assert.equal(
    [...sql.matchAll(/^select (?:is|isnt|ok|throws_ok)\(/gmu)].length,
    selected[1]
  );
  assert.throws(() =>
    assertRollbackSource(sql.replace(/rollback;\s*$/u, 'commit;'))
  );
});
