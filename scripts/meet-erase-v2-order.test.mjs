import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const { scanExtensions } = createRequire(import.meta.url)(
  './ci/sql-grant-guard.js'
);

const migration = '20261103120000_meet_erase_settings_and_holds';
test('V2 uses the reviewed timestamp between V4 and V10', () => {
  assert.ok(existsSync(`apps/database/supabase/migrations/${migration}.sql`));
  assert.ok(
    !existsSync(
      'apps/database/supabase/migrations/20261103110000_meet_erase_settings_and_holds.sql'
    )
  );
  assert.ok('20261103112400' < migration && migration < '20261103130000');
});
test('V2 rollback explicitly forbids running after V10', () => {
  assert.match(
    readFileSync(`apps/database/rollbacks/${migration}.rollback.sql`, 'utf8'),
    /FORBIDDEN after V10/
  );
});

test('V2 limits migration lock waits to two seconds', () => {
  const sql = readFileSync(
    `apps/database/supabase/migrations/${migration}.sql`,
    'utf8'
  );
  assert.match(sql, /set local lock_timeout = '2s';/);
});

test('V2 trigger functions have explicit private ACLs accepted by the grant guard', () => {
  const sql = readFileSync(
    `apps/database/supabase/migrations/${migration}.sql`,
    'utf8'
  );
  assert.deepEqual(
    scanExtensions(sql).filter((finding) => finding.rule === 'function-acl'),
    []
  );
  for (const role of ['public', 'anon', 'authenticated']) {
    const withoutFunctionRole = sql.replace(
      /from public, anon, authenticated, service_role;(?=\ncommit;)/,
      `from ${['public', 'anon', 'authenticated', 'service_role'].filter((candidate) => candidate !== role).join(', ')};`
    );
    assert.ok(
      scanExtensions(withoutFunctionRole).some(
        (finding) => finding.rule === 'function-acl'
      ),
      `removing ${role} function revoke must fail`
    );
  }
});

test('erase rollback runbook requires an off-peak window for each slice', () => {
  const runbook = readFileSync(
    'apps/docs/platform/features/meet-calls.mdx',
    'utf8'
  );
  for (const version of ['V4', 'V2', 'V10']) {
    assert.match(runbook, new RegExp(`${version} rollback[^\n]*off-peak`, 'i'));
  }
});
