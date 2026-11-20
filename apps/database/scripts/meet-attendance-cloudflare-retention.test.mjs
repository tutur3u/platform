// Bounded Cloudflare retention: a closed fence deletes nothing, a repeated
// purge continues from the rows that remain, and a plan is removed only when
// its session rows and room acknowledgements are already finished.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const migration =
  'supabase/migrations/20261120073913_meet_attendance_cloudflare_retention.sql';
const rollback =
  'rollbacks/20261120073913_meet_attendance_cloudflare_retention.rollback.sql';
const now = "timestamptz '2026-11-20T18:17:00Z'";
const meeting = '33333333-3333-4333-8333-333333333333';
const otherMeeting = '33333333-3333-4333-8333-333333333334';
const keptMeeting = '33333333-3333-4333-8333-333333333335';
const ws = '11111111-1111-4111-8111-111111111111';
const user = '44444444-4444-4444-8444-444444444444';
const stranger = '55555555-5555-4555-8555-555555555555';

const fixture = `
create schema if not exists private;
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
create table private.meet_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid,
  ws_id uuid,
  user_id uuid,
  guest_id uuid,
  joined_at timestamptz not null
);
create table private.meet_attendance_pending_erasures (
  kind text not null,
  subject_key text not null,
  plan jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (kind, subject_key)
);
grant select, delete on private.meet_attendance_sessions to service_role;
grant select, update, delete on private.meet_attendance_pending_erasures
  to service_role;
`;

async function apply(db, path) {
  const sql = await readFile(new URL(path, root), 'utf8');
  assert.match(sql, /^\s*begin\s*;/i);
  assert.doesNotMatch(sql, /cron\.schedule/);
  await db.exec(sql);
}

function dbWithRetention() {
  return (async () => {
    const db = new PGlite();
    await db.exec(fixture);
    await apply(db, migration);
    return db;
  })();
}

async function openFence(db) {
  await db.exec(
    'update private.meet_attendance_retention_control set stopped = false'
  );
}

test('a closed fence purges nothing and a later call drains the remainder', async () => {
  const db = await dbWithRetention();
  await db.exec(`
    insert into private.meet_attendance_sessions (meeting_id, joined_at) values
      ('${meeting}', timestamptz '2020-01-01'),
      ('${meeting}', timestamptz '2020-01-02'),
      ('${meeting}', timestamptz '2020-01-03'),
      ('${meeting}', timestamptz '2026-11-01');
    insert into private.meet_attendance_pending_erasures (kind, subject_key, plan)
    values (
      'meeting',
      '${meeting}',
      '{"phase":"confirmed","sqlDone":true,"sql":{"op":"meeting","meetingId":"${meeting}"},"rooms":[]}'::jsonb
    );
  `);
  const blocked = await db.query(
    `select private.purge_expired_meet_attendance(${now}, 2) as removed`
  );
  assert.equal(blocked.rows[0].removed, 0);
  assert.equal(
    (
      await db.query(
        'select count(*)::int as n from private.meet_attendance_sessions'
      )
    ).rows[0].n,
    4
  );

  await openFence(db);
  const first = await db.query(
    `select private.purge_expired_meet_attendance(${now}, 2) as removed`
  );
  assert.equal(first.rows[0].removed, 2);
  const second = await db.query(
    `select private.purge_expired_meet_attendance(${now}, 2) as removed`
  );
  assert.equal(second.rows[0].removed, 1);
  const third = await db.query(
    `select private.purge_expired_meet_attendance(${now}, 2) as removed`
  );
  assert.equal(third.rows[0].removed, 0);
  const left = await db.query(
    'select joined_at from private.meet_attendance_sessions'
  );
  assert.equal(left.rows.length, 1);
  const pending = await db.query(
    'select count(*)::int as n from private.meet_attendance_pending_erasures'
  );
  assert.equal(pending.rows[0].n, 1);
});

test('intent progress is idempotent and finishes only a settled plan', async () => {
  const db = await dbWithRetention();
  await openFence(db);
  await db.exec(`
    insert into private.meet_attendance_sessions
      (meeting_id, ws_id, user_id, guest_id, joined_at)
    values
      ('${meeting}', '${ws}', null, null, timestamptz '2026-11-01'),
      ('${otherMeeting}', '${ws}', null, null, timestamptz '2026-11-01'),
      ('${keptMeeting}', '${ws}', '${user}', null, timestamptz '2026-11-01'),
      ('${keptMeeting}', '${ws}', '${stranger}', null, timestamptz '2026-11-01');
    insert into private.meet_attendance_pending_erasures
      (kind, subject_key, plan)
    values
      (
        'meeting',
        '${meeting}',
        '{"phase":"confirmed","sqlDone":true,"sql":{"op":"meeting","meetingId":"${meeting}"},"rooms":[{"posted":["meeting"]}]}'::jsonb
      ),
      (
        'meeting',
        '${otherMeeting}',
        '{"phase":"confirmed","sqlDone":false,"sql":{"op":"meeting","meetingId":"${otherMeeting}"},"rooms":[{"posted":[]}]}'::jsonb
      ),
      (
        'subject',
        'user:${user}',
        '{"phase":"confirmed","sqlDone":true,"sql":{"op":"subject","userId":"${user}"},"rooms":[{"posted":["user:${user}"]}]}'::jsonb
      ),
      (
        'workspace',
        '${ws}',
        '{"phase":"planned","sql":{"op":"workspace","wsId":"${ws}"},"rooms":[]}'::jsonb
      );
  `);
  const first = await db.query(
    'select private.advance_meet_attendance_erasure_intents(32) as result'
  );
  assert.equal(first.rows[0].result.state, 'open');
  assert.equal(first.rows[0].result.finished, 1);
  const keys = await db.query(
    'select subject_key from private.meet_attendance_pending_erasures order by subject_key'
  );
  assert.deepEqual(
    keys.rows.map((row) => row.subject_key),
    [ws, otherMeeting, `user:${user}`]
  );
  const sessions = await db.query(
    'select user_id::text as user_id from private.meet_attendance_sessions order by user_id'
  );
  assert.deepEqual(
    sessions.rows.map((row) => row.user_id),
    [stranger]
  );
  const again = await db.query(
    'select private.advance_meet_attendance_erasure_intents(32) as result'
  );
  assert.equal(again.rows[0].result.finished, 0);
  assert.equal(
    (
      await db.query(
        'select count(*)::int as n from private.meet_attendance_sessions'
      )
    ).rows[0].n,
    1
  );
});

test('a closed fence leaves outstanding erasures in place', async () => {
  const db = await dbWithRetention();
  await db.exec(`
    insert into private.meet_attendance_pending_erasures (kind, subject_key, plan)
    values (
      'meeting',
      '${meeting}',
      '{"phase":"confirmed","sqlDone":true,"sql":{"op":"meeting","meetingId":"${meeting}"},"rooms":[]}'::jsonb
    );
  `);
  const result = await db.query(
    'select private.advance_meet_attendance_erasure_intents(32) as result'
  );
  assert.equal(result.rows[0].result.state, 'fenced');
  assert.equal(
    (
      await db.query(
        'select count(*)::int as n from private.meet_attendance_pending_erasures'
      )
    ).rows[0].n,
    1
  );
});

test('service_role cannot open the fence', async () => {
  const db = await dbWithRetention();
  try {
    await db.exec(`
      set role service_role;
      update private.meet_attendance_retention_control set stopped = false;
    `);
  } catch {
    // The role has no update privilege on the fence.
  }
  await db.exec('reset role');
  const fence = await db.query(
    'select stopped from private.meet_attendance_retention_control'
  );
  assert.equal(fence.rows[0].stopped, true);
});

test('rollback restores the session purge and drops the fence', async () => {
  const db = await dbWithRetention();
  await apply(db, rollback);
  const advance = await db.query(`
    select to_regprocedure(
      'private.advance_meet_attendance_erasure_intents(integer)'
    ) as name
  `);
  assert.equal(advance.rows[0].name, null);
  const fence = await db.query(
    `select to_regclass('private.meet_attendance_retention_control') as name`
  );
  assert.equal(fence.rows[0].name, null);
  await db.exec(`
    insert into private.meet_attendance_sessions (joined_at) values
      (timestamptz '2020-01-01'),
      (timestamptz '2020-01-02'),
      (timestamptz '2026-11-01');
    insert into private.meet_attendance_pending_erasures (kind, subject_key, plan)
    values ('meeting', '${meeting}', '{"phase":"confirmed"}'::jsonb);
  `);
  const removed = await db.query(
    `select private.purge_expired_meet_attendance(${now}) as removed`
  );
  assert.equal(removed.rows[0].removed, 2);
  assert.equal(
    (
      await db.query(
        'select count(*)::int as n from private.meet_attendance_pending_erasures'
      )
    ).rows[0].n,
    1
  );
});
