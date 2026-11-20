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
  await apply(
    db,
    'supabase/migrations/20261120025200_meet_attendance_meeting_fence.sql'
  );
  await apply(
    db,
    'supabase/migrations/20261120033500_meet_attendance_fence_generation.sql'
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

  const meetingB = '55555555-5555-4555-8555-555555555555';
  await db.exec(`
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${meetingB}', '${wsA}', '${user}');
  `);
  await assert.rejects(
    db.exec(`
      update private.meet_attendance_sessions
      set meeting_id = '${meetingB}'
      where meeting_id = '${meeting}';
    `),
    /23514|immutable/
  );
  const meetingKept = await db.query(
    `select meeting_id::text as meeting_id from private.meet_attendance_sessions where source_key = 'device:2026-07-31T12:00:00Z'`
  );
  assert.equal(meetingKept.rows[0].meeting_id, meeting);

  const fencePrivileges = await db.query(`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name = 'meet_attendance_fences'
      and grantee in ('anon', 'authenticated', 'public')
  `);
  assert.deepEqual(fencePrivileges.rows, []);
  const orphanMeeting = '66666666-6666-4666-8666-666666666666';
  await db.exec(`
    insert into private.meet_attendance_fences (meeting_id, ws_id, generation)
      values ('${orphanMeeting}', '${wsA}', 1);
  `);
  const fence = await db.query(
    `select generation from private.meet_attendance_fences where meeting_id = $1`,
    [orphanMeeting]
  );
  assert.equal(Number(fence.rows[0].generation), 1);

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

  const pendingGrants = await db.query(`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'private'
      and table_name = 'meet_attendance_pending_erasures'
      and grantee in ('anon', 'authenticated', 'public')
  `);
  assert.deepEqual(pendingGrants.rows, []);
  const bumpDenied = await db.query(`
    select
      has_function_privilege(
        'anon',
        'private.bump_meet_attendance_fence(uuid, uuid)',
        'EXECUTE'
      ) as anon,
      has_function_privilege(
        'authenticated',
        'private.bump_meet_attendance_fence(uuid, uuid)',
        'EXECUTE'
      ) as authenticated,
      has_function_privilege(
        'service_role',
        'private.bump_meet_attendance_fence(uuid, uuid)',
        'EXECUTE'
      ) as service
  `);
  assert.deepEqual(bumpDenied.rows[0], {
    anon: false,
    authenticated: false,
    service: true,
  });
  const first = await db.query(
    `select private.bump_meet_attendance_fence($1::uuid, $2::uuid) as generation`,
    [meeting, wsA]
  );
  const second = await db.query(
    `select private.bump_meet_attendance_fence($1::uuid, $2::uuid) as generation`,
    [meeting, wsA]
  );
  assert.equal(Number(first.rows[0].generation), 1);
  assert.equal(Number(second.rows[0].generation), 2);

  const pendingMeeting = '77777777-7777-4777-8777-777777777777';
  const purgeMeeting = '88888888-8888-4888-8888-888888888888';
  await db.exec(`
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${pendingMeeting}', '${wsA}', '${user}');
    insert into private.meet_attendance_pending_erasures (kind, subject_key, plan)
      values (
        'meeting',
        '${pendingMeeting}',
        '{"phase":"confirmed","sql":{"op":"meeting","meetingId":"${pendingMeeting}"},"rooms":[]}'::jsonb
      );
  `);
  await db.exec(
    `delete from public.workspace_meetings where id = '${pendingMeeting}'`
  );
  const survived = await db.query(
    `select count(*)::int as count from private.meet_attendance_pending_erasures`
  );
  assert.equal(survived.rows[0].count, 1);
  const foreignKeys = await db.query(`
    select count(*)::int as count
    from pg_constraint
    where conrelid = 'private.meet_attendance_pending_erasures'::regclass
      and contype = 'f'
  `);
  assert.equal(foreignKeys.rows[0].count, 0);
  await db.exec(`
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${purgeMeeting}', '${wsA}', '${user}');
    insert into private.meet_attendance_sessions (
      meeting_id, ws_id, source_key, participant_kind, user_id, display_name, joined_at
    ) values (
      '${purgeMeeting}', '${wsA}', 'pending-copy', 'member', '${user}', 'Ada',
      timestamptz '2026-07-31T12:00:00Z'
    );
    insert into private.meet_attendance_pending_erasures (kind, subject_key, plan)
      values (
        'meeting',
        '${purgeMeeting}',
        '{"phase":"confirmed","sql":{"op":"meeting","meetingId":"${purgeMeeting}"},"rooms":[]}'::jsonb
      );
  `);
  const finished = await db.query(
    `select private.purge_expired_meet_attendance(timestamptz '2026-07-31T12:00:00Z') as removed`
  );
  assert.equal(Number(finished.rows[0].removed), 2);
  const afterPurge = await db.query(`
    select
      (select count(*)::int from private.meet_attendance_pending_erasures) as pending,
      (select count(*)::int from private.meet_attendance_sessions where source_key = 'pending-copy') as copies,
      (select count(*)::int from private.meet_attendance_sessions where source_key = 'device:2026-07-31T12:00:00Z') as kept
  `);
  assert.deepEqual(afterPurge.rows[0], { pending: 0, copies: 0, kept: 1 });
});

test('attendance retention rollback runs when pg_cron is not installed', async () => {
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
  await apply(
    db,
    'rollbacks/20261120015000_meet_attendance_workspace_retention.rollback.sql'
  );
  const trigger = await db.query(
    `select tgname from pg_trigger where tgname = 'meet_attendance_sessions_reject_workspace_move'`
  );
  assert.equal(trigger.rows.length, 0);
});

test('meeting fence rollback drops the meeting lock and the fence table', async () => {
  const db = new PGlite();
  await db.exec(fixture);
  await apply(
    db,
    'supabase/migrations/20261119170000_meet_class_attendance.sql'
  );
  await apply(
    db,
    'supabase/migrations/20261120025200_meet_attendance_meeting_fence.sql'
  );
  await apply(
    db,
    'rollbacks/20261120025200_meet_attendance_meeting_fence.rollback.sql'
  );
  const ws = '11111111-1111-4111-8111-111111111111';
  const meeting = '33333333-3333-4333-8333-333333333333';
  const moved = '55555555-5555-4555-8555-555555555555';
  const user = '44444444-4444-4444-8444-444444444444';
  await db.exec(`
    insert into public.workspaces (id) values ('${ws}');
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${meeting}', '${ws}', '${user}'), ('${moved}', '${ws}', '${user}');
    insert into private.meet_attendance_sessions (
      meeting_id, ws_id, source_key, participant_kind, user_id, display_name, joined_at
    ) values (
      '${meeting}', '${ws}', 'device', 'member', '${user}', 'Ada', '2026-07-31T12:00:00Z'
    );
    update private.meet_attendance_sessions set meeting_id = '${moved}';
  `);
  const row = await db.query(
    `select meeting_id::text as meeting_id from private.meet_attendance_sessions`
  );
  assert.equal(row.rows[0].meeting_id, moved);
  const fence = await db.query(
    `select to_regclass('private.meet_attendance_fences') as name`
  );
  assert.equal(fence.rows[0].name, null);
});

test('attendance generation rollback drops the pending record and keeps expiry', async () => {
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
  await apply(
    db,
    'supabase/migrations/20261120025200_meet_attendance_meeting_fence.sql'
  );
  await apply(
    db,
    'supabase/migrations/20261120033500_meet_attendance_fence_generation.sql'
  );
  await apply(
    db,
    'rollbacks/20261120033500_meet_attendance_fence_generation.rollback.sql'
  );
  const dropped = await db.query(`
    select
      to_regclass('private.meet_attendance_pending_erasures') as pending,
      to_regprocedure('private.bump_meet_attendance_fence(uuid, uuid)') as bump
  `);
  assert.equal(dropped.rows[0].pending, null);
  assert.equal(dropped.rows[0].bump, null);
  const ws = '11111111-1111-4111-8111-111111111111';
  const meeting = '33333333-3333-4333-8333-333333333333';
  const user = '44444444-4444-4444-8444-444444444444';
  await db.exec(`
    insert into public.workspaces (id) values ('${ws}');
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${meeting}', '${ws}', '${user}');
    insert into private.meet_attendance_sessions (
      meeting_id, ws_id, source_key, participant_kind, user_id, display_name, joined_at
    ) values (
      '${meeting}', '${ws}', 'old', 'member', '${user}', 'Old',
      timestamptz '2026-01-01T00:00:00Z'
    );
  `);
  const purged = await db.query(
    `select private.purge_expired_meet_attendance(timestamptz '2026-07-31T12:00:00Z') as removed`
  );
  assert.equal(Number(purged.rows[0].removed), 1);
});

async function applyAttendanceChain(db) {
  await db.exec(fixture);
  await apply(
    db,
    'supabase/migrations/20261119170000_meet_class_attendance.sql'
  );
  await apply(
    db,
    'supabase/migrations/20261120015000_meet_attendance_workspace_retention.sql'
  );
  await apply(
    db,
    'supabase/migrations/20261120025200_meet_attendance_meeting_fence.sql'
  );
  await apply(
    db,
    'supabase/migrations/20261120033500_meet_attendance_fence_generation.sql'
  );
}

test('attendance generation rollback drains confirmed plans and keeps planned sessions', async () => {
  const db = new PGlite();
  await applyAttendanceChain(db);
  const ws = '11111111-1111-4111-8111-111111111111';
  const confirmedMeeting = '33333333-3333-4333-8333-333333333333';
  const plannedMeeting = '55555555-5555-4555-8555-555555555555';
  const user = '44444444-4444-4444-8444-444444444444';
  await db.exec(`
    insert into public.workspaces (id) values ('${ws}');
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values
        ('${confirmedMeeting}', '${ws}', '${user}'),
        ('${plannedMeeting}', '${ws}', '${user}');
    insert into private.meet_attendance_sessions (
      meeting_id, ws_id, source_key, participant_kind, user_id, display_name, joined_at
    ) values
      (
        '${confirmedMeeting}', '${ws}', 'confirmed-copy', 'member', '${user}', 'Ada',
        timestamptz '2026-07-31T12:00:00Z'
      ),
      (
        '${plannedMeeting}', '${ws}', 'planned-copy', 'member', '${user}', 'Ada',
        timestamptz '2026-07-31T12:00:00Z'
      );
    insert into private.meet_attendance_pending_erasures (kind, subject_key, plan)
      values
        (
          'meeting',
          '${confirmedMeeting}',
          '{"phase":"confirmed","sql":{"op":"meeting","meetingId":"${confirmedMeeting}"},"rooms":[]}'::jsonb
        ),
        (
          'meeting',
          '${plannedMeeting}',
          '{"phase":"planned","sql":{"op":"meeting","meetingId":"${plannedMeeting}"},"rooms":[]}'::jsonb
        );
  `);
  await apply(
    db,
    'rollbacks/20261120033500_meet_attendance_fence_generation.rollback.sql'
  );
  const left = await db.query(`
    select source_key
    from private.meet_attendance_sessions
    order by source_key
  `);
  assert.deepEqual(
    left.rows.map((row) => row.source_key),
    ['planned-copy']
  );
  const pending = await db.query(
    `select to_regclass('private.meet_attendance_pending_erasures') as name`
  );
  assert.equal(pending.rows[0].name, null);
});

test('attendance erasure intent is stored with the delete and a fenced upsert does not delete', async () => {
  const db = new PGlite();
  await applyAttendanceChain(db);
  await apply(
    db,
    'supabase/migrations/20261120071510_meet_attendance_erasure_intent.sql'
  );
  const ws = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const meeting = '33333333-3333-4333-8333-333333333333';
  const user = '44444444-4444-4444-8444-444444444444';
  const row = JSON.stringify([
    {
      sourceKey: 'device:2026-07-31T12:00:00.000Z',
      kind: 'member',
      userId: user,
      displayName: 'Ada',
      joinedAt: '2026-07-31T12:00:00.000Z',
      leftAt: null,
    },
  ]);
  await db.exec(`
    insert into public.workspaces (id) values ('${ws}'), ('${other}');
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${meeting}', '${ws}', '${user}');
  `);
  await db.query(
    `select private.commit_meet_attendance_upsert($1::uuid, $2::uuid, 0, $3::jsonb)`,
    [meeting, ws, row]
  );
  await db.query(
    `select private.bump_meet_attendance_fence($1::uuid, $2::uuid)`,
    [meeting, ws]
  );
  const renamed = JSON.stringify([
    {
      sourceKey: 'device:2026-07-31T12:00:00.000Z',
      kind: 'member',
      userId: user,
      displayName: 'Changed',
      joinedAt: '2026-07-31T12:00:00.000Z',
      leftAt: null,
    },
  ]);
  await assert.rejects(
    db.query(
      `select private.commit_meet_attendance_upsert($1::uuid, $2::uuid, 0, $3::jsonb)`,
      [meeting, ws, renamed]
    ),
    /Meet attendance sync was fenced/
  );
  const kept = await db.query(
    `select display_name from private.meet_attendance_sessions where source_key = 'device:2026-07-31T12:00:00.000Z'`
  );
  assert.equal(kept.rows[0].display_name, 'Ada');
  await db.query(
    `select private.commit_meet_attendance_upsert($1::uuid, $2::uuid, 1, $3::jsonb)`,
    [meeting, ws, renamed]
  );
  const updated = await db.query(
    `select display_name, ws_id::text as ws_id from private.meet_attendance_sessions`
  );
  assert.equal(updated.rows[0].display_name, 'Changed');
  assert.equal(updated.rows[0].ws_id, ws);
  await db.query(
    `select private.commit_meet_attendance_upsert($1::uuid, $2::uuid, 1, $3::jsonb)`,
    [
      meeting,
      other,
      JSON.stringify([
        {
          sourceKey: 'device:2026-07-31T12:00:00.000Z',
          kind: 'member',
          userId: user,
          displayName: 'Moved',
          joinedAt: '2026-07-31T12:00:00.000Z',
          leftAt: null,
        },
      ]),
    ]
  );
  const unmoved = await db.query(
    `select display_name, ws_id::text as ws_id from private.meet_attendance_sessions`
  );
  assert.equal(unmoved.rows[0].display_name, 'Changed');
  assert.equal(unmoved.rows[0].ws_id, ws);

  const missed = await db.query(
    `select private.delete_meeting_with_attendance_intent($1::uuid, $2::uuid, '{"rooms":[]}'::jsonb) as result`,
    [ws, '99999999-9999-4999-8999-999999999999']
  );
  assert.equal(missed.rows[0].result, 'not_deleted');
  const none = await db.query(
    `select count(*)::int as count from private.meet_attendance_pending_erasures`
  );
  assert.equal(none.rows[0].count, 0);

  const deleted = await db.query(
    `select private.delete_meeting_with_attendance_intent($1::uuid, $2::uuid, $3::jsonb) as result`,
    [
      ws,
      meeting,
      JSON.stringify({
        rooms: [
          {
            roomId: `${other}:${meeting}`,
            wsId: other,
            meetingId: meeting,
          },
        ],
        sql: { op: 'meeting', meetingId: meeting },
      }),
    ]
  );
  assert.equal(deleted.rows[0].result, 'deleted');
  const intent = await db.query(
    `select plan from private.meet_attendance_pending_erasures where kind = 'meeting'`
  );
  assert.equal(intent.rows.length, 1);
  assert.equal(intent.rows[0].plan.phase, 'confirmed');
  assert.equal(intent.rows[0].plan.sqlDone, true);
  const roomIds = intent.rows[0].plan.rooms.map((room) => room.roomId).sort();
  assert.deepEqual(roomIds, [`${ws}:${meeting}`, `${other}:${meeting}`]);
  const again = await db.query(
    `select private.delete_meeting_with_attendance_intent($1::uuid, $2::uuid, '{"rooms":[]}'::jsonb) as result`,
    [ws, meeting]
  );
  assert.equal(again.rows[0].result, 'not_deleted');
  const still = await db.query(
    `select count(*)::int as count from private.meet_attendance_pending_erasures`
  );
  assert.equal(still.rows[0].count, 1);

  await db.exec(`
    create or replace function public.delete_owned_workspace(
      p_ws_id uuid,
      p_actor_id uuid,
      p_confirmation text
    ) returns text
    language plpgsql
    as $$
    begin
      if p_confirmation = 'no' then
        return 'subscription_active';
      end if;
      delete from private.meet_attendance_sessions where ws_id = p_ws_id;
      delete from public.workspaces where id = p_ws_id;
      return 'deleted';
    end;
    $$;
    insert into public.workspace_meetings (id, ws_id, creator_id)
      values ('${meeting}', '${other}', '${user}');
    insert into private.meet_attendance_sessions (
      meeting_id, ws_id, source_key, participant_kind, user_id, display_name, joined_at
    ) values (
      '${meeting}', '${other}', 'owned-copy', 'member', '${user}', 'Ada',
      timestamptz '2026-07-31T12:00:00Z'
    );
  `);
  const denied = await db.query(
    `select private.delete_owned_workspace_with_attendance_intent($1::uuid, $2::uuid, 'no', '{"rooms":[]}'::jsonb) as result`,
    [other, user]
  );
  assert.equal(denied.rows[0].result, 'subscription_active');
  const deniedRows = await db.query(
    `select count(*)::int as count from private.meet_attendance_pending_erasures where subject_key = '${other}'`
  );
  assert.equal(deniedRows.rows[0].count, 0);
  const owned = await db.query(
    `select private.delete_owned_workspace_with_attendance_intent($1::uuid, $2::uuid, 'yes', '{"rooms":[{"roomId":"directory:only","wsId":"${other}","meetingId":"only"}]}'::jsonb) as result`,
    [other, user]
  );
  assert.equal(owned.rows[0].result, 'deleted');
  const ownedPlan = await db.query(
    `select plan from private.meet_attendance_pending_erasures where kind = 'workspace' and subject_key = '${other}'`
  );
  assert.equal(ownedPlan.rows[0].plan.sqlDone, true);
  assert.deepEqual(
    ownedPlan.rows[0].plan.rooms.map((room) => room.roomId).sort(),
    [`${other}:${meeting}`, 'directory:only']
  );

  await apply(
    db,
    'rollbacks/20261120071510_meet_attendance_erasure_intent.rollback.sql'
  );
  const preserved = await db.query(
    `select count(*)::int as count from private.meet_attendance_pending_erasures`
  );
  assert.equal(preserved.rows[0].count, 2);
  const dropped = await db.query(`
    select to_regprocedure(
      'private.delete_meeting_with_attendance_intent(uuid, uuid, jsonb)'
    ) as fn
  `);
  assert.equal(dropped.rows[0].fn, null);
});
