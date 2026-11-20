// Erasure functions under the deployed service_role grants, attempt-scoped
// cancellation, intents with an unknown outcome, the monotonic plan writer,
// and bounded session deletes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const before = [
  'supabase/migrations/20261120071510_meet_attendance_erasure_intent.sql',
  'supabase/migrations/20261120073913_meet_attendance_cloudflare_retention.sql',
  'supabase/migrations/20261120092500_meet_attendance_erasure_rooms.sql',
  'supabase/migrations/20261120095300_meet_attendance_drop_account_trigger.sql',
];
const hardening =
  'supabase/migrations/20261120095800_meet_attendance_erasure_hardening.sql';
const readiness =
  'supabase/migrations/20261120101500_meet_attendance_erasure_readiness.sql';
const acl =
  'supabase/migrations/20261120102500_meet_attendance_erasure_acl.sql';

const ws = '11111111-1111-4111-8111-111111111111';
const meeting = '33333333-3333-4333-8333-333333333333';
const user = '44444444-4444-4444-8444-444444444444';

// Grants match the production migrations: service_role uses the private
// schema and has DML on sessions, fences and plans, but no grant on
// auth.users and only SELECT on the room table.
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
grant usage on schema private to service_role;
grant select, insert, update, delete on private.meet_attendance_sessions to service_role;
grant select, insert, update, delete on private.meet_attendance_fences to service_role;
grant select, insert, update, delete on private.meet_attendance_pending_erasures to service_role;
`;

async function apply(db, path) {
  await db.exec(await readFile(new URL(path, root), 'utf8'));
}

async function freshDb(paths = [...before, hardening, readiness, acl]) {
  const db = new PGlite();
  await db.exec(fixture);
  for (const path of paths) await apply(db, path);
  await db.exec(
    'update private.meet_attendance_retention_control set stopped = false'
  );
  return db;
}

async function asService(db, sql, params = []) {
  await db.exec('set role service_role');
  try {
    return (await db.query(sql, params)).rows[0]?.value;
  } finally {
    await db.exec('reset role');
  }
}

const store = (db, kind, key, plan) =>
  asService(db, 'select private.store_meet_attendance_intent($1, $2, $3)', [
    kind,
    key,
    JSON.stringify(plan),
  ]);
const phase = async (db, key) =>
  (
    await db.query(
      "select plan->>'phase' as value from private.meet_attendance_pending_erasures where subject_key = $1",
      [key]
    )
  ).rows[0]?.value;

test('every erasure function runs under the deployed service_role grants', async () => {
  const db = await freshDb();
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [{ roomId: `${ws}:${meeting}`, wsId: ws, meetingId: meeting }],
  });
  const page = await asService(
    db,
    'select private.claim_meet_attendance_erasure_rooms(8, 60) as value'
  );
  assert.equal(page.rooms.length, 1);
  const [room] = page.rooms;
  assert.equal(
    await asService(
      db,
      'select private.ack_meet_attendance_erasure_room($1, $2, $3, $4, $5) as value',
      [room.kind, room.subjectKey, room.roomId, room.generation, room.keys]
    ),
    'acked'
  );
  const advanced = await asService(
    db,
    'select private.advance_meet_attendance_erasure_intents(32) as value'
  );
  assert.equal(advanced.finished, 1);
  assert.equal(
    await asService(
      db,
      "select private.finish_meet_attendance_intent('meeting', $1) as value",
      [meeting]
    ),
    'kept'
  );
  assert.equal(
    await asService(
      db,
      "select private.cancel_meet_attendance_intent('meeting', $1, 'x') as value",
      [meeting]
    ),
    'kept'
  );
});

test('without the hardening the service_role claim is refused', async () => {
  const db = await freshDb(before);
  await db.query('select private.store_meet_attendance_intent($1, $2, $3)', [
    'meeting',
    meeting,
    JSON.stringify({
      phase: 'confirmed',
      sql: { op: 'meeting', meetingId: meeting },
      rooms: [{ roomId: `${ws}:${meeting}`, wsId: ws, meetingId: meeting }],
    }),
  ]);
  await assert.rejects(
    asService(
      db,
      'select private.claim_meet_attendance_erasure_rooms(8, 60) as value'
    ),
    /permission denied/
  );
});

test('an intent whose account still exists stays pending however old it is', async () => {
  const db = await freshDb();
  await db.exec(`insert into auth.users values ('${user}')`);
  await store(db, 'subject', `user:${user}`, {
    phase: 'planned',
    attempt: 'attempt-a',
    sql: { op: 'subject', userId: user },
    rooms: [],
  });
  await db.exec(
    "update private.meet_attendance_pending_erasures set created_at = clock_timestamp() - interval '30 days'"
  );
  const result = await asService(
    db,
    'select private.advance_meet_attendance_erasure_intents(32) as value'
  );
  assert.deepEqual(
    [result.confirmed, result.cancelled, result.waiting],
    [0, 0, 1]
  );
  assert.equal(await phase(db, `user:${user}`), 'planned');
});

test('only the refused attempt cancels, and never after confirmation', async () => {
  const db = await freshDb();
  await db.exec(`insert into auth.users values ('${user}')`);
  const key = `user:${user}`;
  const plan = (attempt) => ({
    phase: 'planned',
    attempt,
    sql: { op: 'subject', userId: user },
    rooms: [{ roomId: `${ws}:${meeting}`, wsId: ws, meetingId: meeting }],
  });
  const cancel = (attempt) =>
    asService(
      db,
      "select private.cancel_meet_attendance_intent('subject', $1, $2) as value",
      [key, attempt]
    );

  await store(db, 'subject', key, plan('attempt-a'));
  await store(db, 'subject', key, plan('attempt-b'));
  assert.equal(await cancel('attempt-a'), 'kept');
  assert.equal(await cancel(''), 'kept');
  assert.equal(await phase(db, key), 'planned');

  // Auth confirms the delete before the refusal path runs: the schedule sees
  // the account gone and confirms, and the late cancellation keeps it.
  await db.exec(`delete from auth.users where id = '${user}'`);
  await asService(
    db,
    'select private.advance_meet_attendance_erasure_intents(32) as value'
  );
  assert.equal(await phase(db, key), 'confirmed');
  assert.equal(await cancel('attempt-b'), 'kept');
  assert.equal(await phase(db, key), 'confirmed');

  // A live refusal cancels its own attempt.
  const other = '44444444-4444-4444-8444-444444444445';
  await db.exec(`insert into auth.users values ('${other}')`);
  await store(db, 'subject', `user:${other}`, {
    ...plan('attempt-c'),
    sql: { op: 'subject', userId: other },
  });
  assert.equal(
    await asService(
      db,
      "select private.cancel_meet_attendance_intent('subject', $1, 'attempt-c') as value",
      [`user:${other}`]
    ),
    'cancelled'
  );
});

test('finishing is refused while SQL rows or room acknowledgements remain', async () => {
  const db = await freshDb();
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [{ roomId: `${ws}:${meeting}`, wsId: ws, meetingId: meeting }],
  });
  const finish = () =>
    asService(
      db,
      "select private.finish_meet_attendance_intent('meeting', $1) as value",
      [meeting]
    );
  assert.equal(await finish(), 'kept');
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sqlDone: true,
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [],
  });
  assert.equal(await finish(), 'kept');
  const [room] = (
    await asService(
      db,
      'select private.claim_meet_attendance_erasure_rooms(8, 60) as value'
    )
  ).rooms;
  await asService(
    db,
    'select private.ack_meet_attendance_erasure_room($1, $2, $3, $4, $5) as value',
    [room.kind, room.subjectKey, room.roomId, room.generation, room.keys]
  );
  assert.equal(await finish(), 'finished');
});

test('a confirmed intent is never replaced by a planned write', async () => {
  const db = await freshDb();
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [],
  });
  await store(db, 'meeting', meeting, {
    phase: 'planned',
    attempt: 'late',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [],
  });
  assert.equal(await phase(db, meeting), 'confirmed');
  const sql = await readFile(new URL(hardening, root), 'utf8');
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(
    sql,
    /when pending\.plan->>'phase' = 'confirmed'\s+and excluded\.plan->>'phase' is distinct from 'confirmed'\s+then pending\.plan/
  );
});

test('session rows are deleted in bounded batches with durable progress', async () => {
  const db = await freshDb();
  await db.exec(`
    insert into private.meet_attendance_sessions (meeting_id, ws_id, source_key)
    select '${meeting}', '${ws}', 'row-' || n from generate_series(1, 2500) as n;
  `);
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [],
  });
  const remaining = async () =>
    (
      await db.query(
        'select count(*)::int as n from private.meet_attendance_sessions'
      )
    ).rows[0].n;
  const advance = () =>
    asService(
      db,
      'select private.advance_meet_attendance_erasure_intents(32) as value'
    );
  assert.equal((await advance()).finished, 0);
  assert.equal(await remaining(), 1500);
  assert.equal((await advance()).finished, 0);
  assert.equal(await remaining(), 500);
  assert.equal((await advance()).finished, 1);
  assert.equal(await remaining(), 0);
});

test('the rooms rollback fences writers before it copies progress', async () => {
  const sql = await readFile(
    new URL(
      'rollbacks/20261120092500_meet_attendance_erasure_rooms.rollback.sql',
      root
    ),
    'utf8'
  );
  const lock = sql.search(/lock table[\s\S]*?in access exclusive mode/);
  const copy = sql.search(/update private\.meet_attendance_pending_erasures/);
  assert.ok(lock > 0 && lock < copy);
});

test('attendance rows are stored only after the erasure job proves readiness', async () => {
  const db = await freshDb();
  const rows = JSON.stringify([
    {
      sourceKey: 'device:1',
      kind: 'member',
      userId: user,
      displayName: 'Ada',
      joinedAt: '2026-11-20T00:00:00.000Z',
      leftAt: null,
    },
  ]);
  const commit = () =>
    asService(
      db,
      'select private.commit_meet_attendance_upsert($1, $2, 0, $3)',
      [meeting, ws, rows]
    );
  const record = (erased) =>
    asService(
      db,
      'select private.record_meet_attendance_erasure_ready($1) as value',
      [erased]
    );
  const sessions = async () =>
    (
      await db.query(
        'select count(*)::int as n from private.meet_attendance_sessions'
      )
    ).rows[0].n;

  await assert.rejects(commit(), /not verified/);
  assert.equal(await record(false), 'binding');
  await assert.rejects(commit(), /not verified/);

  await db.exec(
    'update private.meet_attendance_retention_control set stopped = true'
  );
  assert.equal(await record(true), 'fenced');
  await db.exec(
    'update private.meet_attendance_retention_control set stopped = false'
  );

  assert.equal(await record(true), 'ready');
  await commit();
  assert.equal(await sessions(), 1);

  // Closing the stop fence, a stale proof, or a missing privilege each
  // withdraw readiness.
  await db.exec(
    'update private.meet_attendance_retention_control set stopped = true'
  );
  await assert.rejects(commit(), /not verified/);
  await db.exec(
    'update private.meet_attendance_retention_control set stopped = false'
  );
  await db.exec(
    "update private.meet_attendance_erasure_readiness set verified_at = clock_timestamp() - interval '3 days'"
  );
  await assert.rejects(commit(), /not verified/);
  assert.equal(await record(true), 'ready');
  await db.exec(
    'revoke execute on function private.finish_meet_attendance_intent(text, text) from service_role'
  );
  await assert.rejects(commit(), /not verified/);
  assert.equal(await record(true), 'grants');
});

test('client roles cannot record readiness or read it', async () => {
  const db = await freshDb();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      db.query('select private.record_meet_attendance_erasure_ready(true)')
    );
    await assert.rejects(
      db.query('select * from private.meet_attendance_erasure_readiness')
    );
    await db.exec('reset role');
  }
});
