import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20261017010000_employee_address_migrations.sql',
    import.meta.url
  ),
  'utf8'
);
const rpc = migration.slice(
  migration.indexOf('create function private.employee_address_migration('),
  migration.indexOf(
    'create function private.guard_employee_address_reservation('
  )
);

test('migration admission fails 55P03 rather than queueing exclusive ownership', () => {
  const admission = rpc.match(
    /if not pg_try_advisory_xact_lock\(hashtextextended\('employee-address-reservations',0\)\) then\s+raise exception using errcode='55P03',message='Address migration admission busy';\s+end if;/u
  );
  assert.ok(
    admission,
    'Busy admission must raise before a capability or row lock'
  );
  assert.doesNotMatch(rpc, /\bpg_advisory_xact_lock\(/u);
  assert.ok(rpc.indexOf(admission[0]) < rpc.indexOf('for update nowait'));
  assert.ok(
    rpc.indexOf(admission[0]) <
      rpc.indexOf('private.assert_employee_administrator(actor)')
  );
});

test('row and permission locks remain NOWAIT after exclusive admission', () => {
  assert.equal(rpc.match(/for update nowait/gu)?.length, 10);
  assert.match(
    rpc,
    /from auth\.users where id in\(actor,target\) order by id for update nowait/u
  );
  assert.match(
    rpc,
    /public\.workspace_default_permissions in share mode nowait/u
  );
  assert.match(
    rpc,
    /private\.employee_address_migrations where operation_id=operation for update nowait/u
  );
});

test('ordinary writers retain shared admission on the same key before their row guards', () => {
  const shared = migration.slice(
    migration.indexOf('create function private.lock_employee_address_writers()')
  );
  assert.match(
    shared,
    /pg_advisory_xact_lock_shared\(hashtextextended\('employee-address-reservations',0\)\)/u
  );
  assert.equal(shared.match(/before insert or update on/gu)?.length, 6);
  assert.match(shared, /Address writer requires read committed/u);
});
