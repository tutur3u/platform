// Account deletion never depends on Meet attendance storage. No attendance
// trigger stays on auth.users, so an auth delete succeeds while attendance is
// off and while its private tables are locked or gone.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const through = [
  'supabase/migrations/20261120071510_meet_attendance_erasure_intent.sql',
  'supabase/migrations/20261120073913_meet_attendance_cloudflare_retention.sql',
  'supabase/migrations/20261120092500_meet_attendance_erasure_rooms.sql',
];
const fix =
  'supabase/migrations/20261120095300_meet_attendance_drop_account_trigger.sql';
const user = '44444444-4444-4444-8444-444444444444';

const fixture = `
create schema if not exists private;
create schema if not exists auth;
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
create table auth.users (id uuid primary key);
create table public.workspaces (id uuid primary key);
create table public.workspace_meetings (id uuid primary key, ws_id uuid);
create table private.meet_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid,
  ws_id uuid,
  source_key text,
  participant_kind text,
  user_id uuid,
  guest_id uuid,
  display_name text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (meeting_id, source_key)
);
create table private.meet_attendance_fences (
  meeting_id uuid not null,
  ws_id uuid not null,
  generation bigint not null default 0,
  primary key (meeting_id, ws_id)
);
create table private.meet_attendance_pending_erasures (
  kind text not null,
  subject_key text not null,
  plan jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (kind, subject_key)
);
`;

async function apply(db, path) {
  await db.exec(await readFile(new URL(path, root), 'utf8'));
}

async function database(paths) {
  const db = new PGlite();
  await db.exec(fixture);
  for (const path of paths) await apply(db, path);
  await db.exec(`insert into auth.users values ('${user}')`);
  return db;
}

async function makeStorageUnavailable(db) {
  await db.exec(`
    drop table private.meet_attendance_erasure_rooms;
    drop table private.meet_attendance_pending_erasures cascade;
  `);
}

test('no Meet attendance trigger remains on auth.users', async () => {
  const db = await database([...through, fix]);
  const triggers = await db.query(`
    select tgname
    from pg_trigger
    where tgrelid = 'auth.users'::regclass and not tgisinternal
  `);
  assert.deepEqual(triggers.rows, []);
  const fn = await db.query(
    "select to_regprocedure('private.confirm_meet_attendance_account_erasure()') as name"
  );
  assert.equal(fn.rows[0].name, null);
});

test('an account delete succeeds while attendance storage is unavailable', async () => {
  const db = await database([...through, fix]);
  await makeStorageUnavailable(db);
  await db.exec(`delete from auth.users where id = '${user}'`);
  const left = await db.query('select count(*)::int as n from auth.users');
  assert.equal(left.rows[0].n, 0);
});

test('without the fix the same delete fails, so the check is meaningful', async () => {
  const db = await database(through);
  await makeStorageUnavailable(db);
  await assert.rejects(db.exec(`delete from auth.users where id = '${user}'`));
});

test('a recorded account intent is confirmed by the schedule after the delete', async () => {
  const db = await database([...through, fix]);
  await db.exec(`
    update private.meet_attendance_retention_control set stopped = false;
    select private.store_meet_attendance_intent(
      'subject',
      'user:${user}',
      '{"phase":"planned","sql":{"op":"subject","userId":"${user}"},"rooms":[]}'::jsonb
    );
    delete from auth.users where id = '${user}';
  `);
  const before = await db.query(
    "select plan->>'phase' as phase from private.meet_attendance_pending_erasures"
  );
  assert.equal(before.rows[0].phase, 'planned');
  const result = await db.query(
    'select private.advance_meet_attendance_erasure_intents(32) as value'
  );
  assert.equal(result.rows[0].value.confirmed, 1);
});

test('the rollback leaves auth.users without the trigger', async () => {
  const sql = await readFile(
    new URL(
      'rollbacks/20261120095300_meet_attendance_drop_account_trigger.rollback.sql',
      root
    ),
    'utf8'
  );
  const statements = sql.replace(/--.*$/gmu, '');
  assert.doesNotMatch(statements, /create\s+trigger/i);
  assert.doesNotMatch(statements, /auth\.users/i);
});
