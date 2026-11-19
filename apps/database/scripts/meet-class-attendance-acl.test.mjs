// Applies the shipped attendance migrations on PGlite and checks the catalog.
// Client roles must not receive table or function privileges.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const fixture = `
create schema if not exists private;
create schema if not exists auth;
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;
create table if not exists public.workspaces (
  id uuid primary key
);
create table if not exists public.workspace_meetings (
  id uuid primary key,
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  creator_id uuid
);
`;

async function apply(db, path) {
  const sql = await read(path);
  if (/^\s*begin\s*;/i.test(sql)) await db.exec(sql);
  else await db.exec(`begin;\n${sql}\ncommit;`);
}

test('client roles cannot use class attendance after the migration chain', async () => {
  const db = new PGlite();
  await db.exec(fixture);
  await apply(
    db,
    'supabase/migrations/20261119170000_meet_class_attendance.sql'
  );
  await apply(
    db,
    'supabase/migrations/20261120015000_meet_attendance_workspace_retention.sql'
  );

  const privileges = await db.query(`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name = 'meet_attendance_sessions'
      and grantee in ('anon', 'authenticated', 'public')
  `);
  assert.deepEqual(privileges.rows, []);

  const service = await db.query(`
    select privilege_type
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name = 'meet_attendance_sessions'
      and grantee = 'service_role'
    order by privilege_type
  `);
  assert.deepEqual(
    service.rows.map((row) => row.privilege_type),
    ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
  );

  const denied = await db.query(`
    select
      has_table_privilege('authenticated', 'private.meet_attendance_sessions', 'SELECT') as select,
      has_table_privilege('authenticated', 'private.meet_attendance_sessions', 'INSERT') as insert,
      has_table_privilege('anon', 'private.meet_attendance_sessions', 'SELECT') as anon_select,
      has_function_privilege(
        'authenticated',
        'private.purge_expired_meet_attendance(timestamptz)',
        'EXECUTE'
      ) as purge
  `);
  assert.deepEqual(denied.rows[0], {
    select: false,
    insert: false,
    anon_select: false,
    purge: false,
  });

  await assert.rejects(
    db.exec(
      'set role authenticated; select * from private.meet_attendance_sessions;'
    ),
    /permission denied/
  );
  await db.exec('reset role');

  const wsA = '11111111-1111-4111-8111-111111111111';
  const wsB = '22222222-2222-4222-8222-222222222222';
  const meeting = '33333333-3333-4333-8333-333333333333';
  const user = '44444444-4444-4444-8444-444444444444';
  await db.exec(`
    insert into public.workspaces (id) values ('${wsA}'), ('${wsB}');
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${meeting}', '${wsA}', '${user}');
    insert into private.meet_attendance_sessions (
      meeting_id, ws_id, source_key, participant_kind, user_id, display_name, joined_at
    ) values (
      '${meeting}', '${wsA}', 'device:2026-07-31T12:00:00Z', 'member', '${user}', 'Ada',
      '2026-07-31T12:00:00Z'
    );
  `);
  await assert.rejects(
    db.exec(`
      update private.meet_attendance_sessions
      set ws_id = '${wsB}'
      where meeting_id = '${meeting}';
    `),
    /immutable/
  );
  const kept = await db.query(
    `select ws_id::text as ws_id from private.meet_attendance_sessions where meeting_id = $1`,
    [meeting]
  );
  assert.equal(kept.rows[0].ws_id, wsA);

  await db.exec(`
    insert into private.meet_attendance_sessions (
      meeting_id, ws_id, source_key, participant_kind, user_id, display_name, joined_at
    ) values (
      '${meeting}', '${wsA}', 'old', 'member', '${user}', 'Old',
      timestamptz '2026-01-01T00:00:00Z'
    );
  `);
  const purged = await db.query(
    `select private.purge_expired_meet_attendance(timestamptz '2026-07-31T12:00:00Z') as removed`
  );
  assert.equal(Number(purged.rows[0].removed), 1);
  const remaining = await db.query(
    `select source_key from private.meet_attendance_sessions order by source_key`
  );
  assert.deepEqual(
    remaining.rows.map((row) => row.source_key),
    ['device:2026-07-31T12:00:00Z']
  );
});
