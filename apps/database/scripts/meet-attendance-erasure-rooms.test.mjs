// Per-room erasure progress: the delete stores the intent, Cron Control
// claims bounded room pages, acknowledgements count only for the claimed
// generation, and an intent finishes only after its SQL rows and every room.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const migrations = [
  'supabase/migrations/20261120071510_meet_attendance_erasure_intent.sql',
  'supabase/migrations/20261120073913_meet_attendance_cloudflare_retention.sql',
  'supabase/migrations/20261120092500_meet_attendance_erasure_rooms.sql',
  'supabase/migrations/20261120095300_meet_attendance_drop_account_trigger.sql',
];
const rollback =
  'rollbacks/20261120092500_meet_attendance_erasure_rooms.rollback.sql';

const ws = '11111111-1111-4111-8111-111111111111';
const otherWs = '11111111-1111-4111-8111-111111111112';
const meeting = '33333333-3333-4333-8333-333333333333';
const user = '44444444-4444-4444-8444-444444444444';
const liveUser = '44444444-4444-4444-8444-444444444445';
const goneUser = '44444444-4444-4444-8444-444444444446';
const stranger = '55555555-5555-4555-8555-555555555555';

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
create table public.workspace_meetings (
  id uuid primary key,
  ws_id uuid not null references public.workspaces (id) on delete cascade
);
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

const room = (wsId, meetingId, extra = {}) => ({
  roomId: `${wsId}:${meetingId}`,
  wsId,
  meetingId,
  ...extra,
});

function meetingId(index) {
  return `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`;
}

async function apply(db, path) {
  const sql = await readFile(new URL(path, root), 'utf8');
  assert.match(sql, /^\s*begin\s*;/i);
  assert.doesNotMatch(sql, /cron\.schedule/);
  await db.exec(sql);
}

async function freshDb({ open = true } = {}) {
  const db = new PGlite();
  await db.exec(fixture);
  for (const path of migrations) await apply(db, path);
  if (open)
    await db.exec(
      'update private.meet_attendance_retention_control set stopped = false'
    );
  return db;
}

async function value(db, sql, params = []) {
  return (await db.query(sql, params)).rows[0]?.value;
}

const claim = (db, limit = 128) =>
  value(
    db,
    'select private.claim_meet_attendance_erasure_rooms($1, 60) as value',
    [limit]
  );
const advance = (db) =>
  value(
    db,
    'select private.advance_meet_attendance_erasure_intents(32) as value'
  );
const ack = (db, claimed) =>
  value(
    db,
    'select private.ack_meet_attendance_erasure_room($1, $2, $3, $4, $5) as value',
    [
      claimed.kind,
      claimed.subjectKey,
      claimed.roomId,
      claimed.generation,
      claimed.keys,
    ]
  );
const store = (db, kind, key, plan) =>
  db.query('select private.store_meet_attendance_intent($1, $2, $3)', [
    kind,
    key,
    JSON.stringify(plan),
  ]);
const count = (db, table) =>
  value(db, `select count(*)::int as value from ${table}`);
const lapseLeases = (db) =>
  db.exec(
    "update private.meet_attendance_erasure_rooms set lease_until = clock_timestamp() - interval '1 second'"
  );

test('a crash after the meeting delete still finishes on the schedule', async () => {
  const db = await freshDb();
  await db.exec(`
    insert into public.workspaces values ('${ws}');
    insert into public.workspace_meetings values ('${meeting}', '${ws}');
    insert into private.meet_attendance_sessions (meeting_id, ws_id, source_key, user_id)
    values ('${meeting}', '${ws}', 'a', '${user}'),
      ('${meeting}', '${otherWs}', 'b', '${stranger}');
  `);
  const deleted = await value(
    db,
    'select private.delete_meeting_with_attendance_intent($1, $2, $3) as value',
    [
      ws,
      meeting,
      JSON.stringify({
        phase: 'planned',
        sql: { op: 'meeting', meetingId: meeting },
        rooms: [room(ws, meeting)],
      }),
    ]
  );
  assert.equal(deleted, 'deleted');
  // The app stops here. Nothing else ran after the commit.
  assert.equal(await count(db, 'private.meet_attendance_erasure_rooms'), 2);

  const first = await advance(db);
  assert.equal(first.finished, 0);
  assert.equal(await count(db, 'private.meet_attendance_sessions'), 0);

  const page = await claim(db);
  assert.equal(page.rooms.length, 2);
  for (const claimed of page.rooms) {
    assert.deepEqual(claimed.keys, ['meeting']);
    assert.ok(claimed.generation >= 1);
  }
  const fences = await value(
    db,
    'select count(*)::int as value from private.meet_attendance_fences where generation >= 1'
  );
  assert.equal(fences, 2);

  // A crash after the claim: no acknowledgement arrives. The lease hides the
  // rooms from an overlapping run, then they are claimed again.
  assert.equal((await claim(db)).rooms.length, 0);
  await lapseLeases(db);
  const retry = await claim(db);
  assert.deepEqual(
    retry.rooms.map((item) => item.generation).sort(),
    page.rooms.map((item) => item.generation).sort()
  );
  for (const claimed of retry.rooms)
    assert.equal(await ack(db, claimed), 'acked');

  const done = await advance(db);
  assert.equal(done.finished, 1);
  assert.equal(await count(db, 'private.meet_attendance_pending_erasures'), 0);
  assert.equal(await count(db, 'private.meet_attendance_erasure_rooms'), 0);
});

test('a workspace with more than 128 rooms is worked in pages', async () => {
  const db = await freshDb();
  const rooms = Array.from({ length: 300 }, (_, index) =>
    room(ws, meetingId(index))
  );
  await store(db, 'workspace', ws, {
    phase: 'confirmed',
    sql: { op: 'workspace', wsId: ws },
    rooms,
  });
  assert.equal(await count(db, 'private.meet_attendance_erasure_rooms'), 300);

  const pages = [];
  for (;;) {
    const page = await claim(db, 128);
    if (!page.rooms.length) break;
    pages.push(page.rooms);
  }
  assert.deepEqual(
    pages.map((page) => page.length),
    [128, 128, 44]
  );
  const claimed = pages.flat();
  assert.equal(new Set(claimed.map((item) => item.roomId)).size, 300);

  for (const item of claimed.slice(0, 299)) await ack(db, item);
  assert.equal((await advance(db)).finished, 0);
  const pending = await value(
    db,
    "select plan->>'sqlDone' as value from private.meet_attendance_pending_erasures"
  );
  assert.equal(pending, 'true');
  await ack(db, claimed[299]);
  assert.equal((await advance(db)).finished, 1);
});

test('a newer generation from another writer needs a fresh acknowledgement', async () => {
  const db = await freshDb();
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [room(ws, meeting)],
  });
  const [claimed] = (await claim(db)).rooms;

  // The app drives the same room and bumps the fence before the cron acks.
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [room(ws, meeting, { generation: claimed.generation + 1 })],
  });
  assert.equal(await ack(db, claimed), 'stale');
  assert.equal((await advance(db)).finished, 0);

  const [fresh] = (await claim(db)).rooms;
  assert.equal(fresh.generation, claimed.generation + 1);
  assert.equal(await ack(db, fresh), 'acked');

  // A late copy with fewer acknowledgements does not undo them.
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [room(ws, meeting, { generation: fresh.generation, posted: [] })],
  });
  assert.equal((await advance(db)).finished, 1);
});

test('a stale planned copy cannot reopen a confirmed intent', async () => {
  const db = await freshDb();
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [room(ws, meeting, { generation: 3, posted: ['meeting'] })],
    attempts: 2,
  });
  await store(db, 'meeting', meeting, {
    phase: 'planned',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [],
  });
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [room(ws, meetingId(1))],
    attempts: 1,
  });
  const plan = await value(
    db,
    'select plan as value from private.meet_attendance_pending_erasures'
  );
  assert.equal(plan.phase, 'confirmed');
  assert.equal(plan.attempts, 2);
  assert.equal(plan.rooms.length, 2);
  assert.deepEqual(plan.rooms[0].posted, ['meeting']);
});

test('the schedule confirms intents for deleted accounts and reconciles the rest', async () => {
  const db = await freshDb();
  await db.exec(`
    insert into auth.users values ('${user}'), ('${liveUser}');
    insert into private.meet_attendance_sessions (meeting_id, ws_id, source_key, user_id, guest_id)
    values ('${meeting}', '${ws}', 'member', '${user}', null),
      ('${meeting}', '${otherWs}', 'guest', null, '${user}'),
      ('${meeting}', '${ws}', 'other', '${stranger}', null);
  `);
  const subject = (id) => ({
    phase: 'planned',
    sql: { op: 'subject', userId: id },
    rooms: [room(ws, meeting), room(otherWs, meeting)],
  });
  await store(db, 'subject', `user:${user}`, subject(user));
  await store(db, 'subject', `user:${liveUser}`, subject(liveUser));
  await store(db, 'subject', `user:${goneUser}`, subject(goneUser));
  await db.exec(`
    update private.meet_attendance_pending_erasures
    set created_at = clock_timestamp() - interval '2 days'
    where subject_key = 'user:${liveUser}';
    delete from auth.users where id = '${user}';
  `);
  const phase = (id) =>
    value(
      db,
      "select plan->>'phase' as value from private.meet_attendance_pending_erasures where subject_key = $1",
      [`user:${id}`]
    );
  assert.equal(await phase(user), 'planned');

  const reconciled = await advance(db);
  assert.equal(reconciled.confirmed, 2);
  assert.equal(await phase(user), 'confirmed');
  assert.equal(reconciled.cancelled, 1);
  assert.equal(await phase(goneUser), 'confirmed');
  assert.equal(await phase(liveUser), undefined);

  const left = await db.query(
    'select user_id::text as id from private.meet_attendance_sessions'
  );
  assert.deepEqual(
    left.rows.map((row) => row.id),
    [stranger]
  );
  const page = await claim(db);
  const keys = page.rooms
    .filter((item) => item.subjectKey === `user:${user}`)
    .map((item) => item.keys);
  assert.deepEqual(keys, [
    [`guest:${user}`, `user:${user}`],
    [`guest:${user}`, `user:${user}`],
  ]);
});

test('a closed fence claims no rooms and reconciles nothing', async () => {
  const db = await freshDb({ open: false });
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [room(ws, meeting)],
  });
  const page = await claim(db);
  assert.equal(page.state, 'fenced');
  assert.equal(page.rooms.length, 0);
  assert.equal((await advance(db)).state, 'fenced');
  assert.equal(
    await value(
      db,
      'select count(*)::int as value from private.meet_attendance_fences'
    ),
    0
  );
});

test('client roles cannot read or claim room progress', async () => {
  const db = await freshDb();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      db.query('select * from private.meet_attendance_erasure_rooms')
    );
    await assert.rejects(
      db.query('select private.claim_meet_attendance_erasure_rooms(1, 60)')
    );
    await db.exec('reset role');
  }
});

test('rollback keeps every acknowledgement on the plan', async () => {
  const db = await freshDb();
  await store(db, 'meeting', meeting, {
    phase: 'confirmed',
    sql: { op: 'meeting', meetingId: meeting },
    rooms: [room(ws, meeting), room(otherWs, meeting)],
  });
  const page = await claim(db);
  await ack(db, page.rooms[0]);
  await advance(db);
  await apply(db, rollback);
  assert.equal(
    await value(
      db,
      "select to_regclass('private.meet_attendance_erasure_rooms') as value"
    ),
    null
  );
  const plan = await value(
    db,
    'select plan as value from private.meet_attendance_pending_erasures'
  );
  assert.equal(plan.sqlDone, true);
  const acked = plan.rooms.find((item) => item.roomId === page.rooms[0].roomId);
  assert.deepEqual(acked.posted, ['meeting']);
  assert.equal(acked.generation, page.rooms[0].generation);
  const other = plan.rooms.find((item) => item.roomId === page.rooms[1].roomId);
  assert.deepEqual(other.posted, []);
  assert.equal((await advance(db)).finished, 0);
});
