-- Contract for 20261128020000_least_privilege_whiteboards_and_time_categories_rls.sql:
-- Verifies database-level RLS and column-scoped UPDATE enforcement on
-- public.workspace_whiteboards and public.time_tracking_categories across:
--   non-member, guest, ordinary member, board creator, settings manager,
--   and time-tracking manager.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(27);

-- 0. Verify proxy-only table hardening: anon and authenticated have no direct
--    table privileges on either table in production.
select is(
  has_table_privilege('anon', 'public.workspace_whiteboards', 'select'),
  false,
  'anon has no direct select privilege on workspace_whiteboards'
);
select is(
  has_table_privilege('authenticated', 'public.workspace_whiteboards', 'update'),
  false,
  'authenticated has no direct update privilege on workspace_whiteboards'
);
select is(
  has_table_privilege('anon', 'public.time_tracking_categories', 'select'),
  false,
  'anon has no direct select privilege on time_tracking_categories'
);
select is(
  has_table_privilege('authenticated', 'public.time_tracking_categories', 'update'),
  false,
  'authenticated has no direct update privilege on time_tracking_categories'
);

-- Temporarily grant authenticated DML within this rolled-back test transaction
-- so the defense-in-depth RLS policies and BEFORE UPDATE trigger are exercised.
grant select, insert, update, delete
  on public.workspace_whiteboards, public.time_tracking_categories
  to authenticated;

-- Actors:
-- 9801: workspace owner / board creator
-- 9802: ordinary member (no extra permissions)
-- 9803: settings manager (manage_workspace_settings)
-- 9804: time-tracking manager (manage_time_tracking_requests)
-- 9805: guest (type = 'GUEST')
-- 9806: non-member
insert into auth.users (id) values
  ('5707a6e0-0000-4000-8000-000000009801'),
  ('5707a6e0-0000-4000-8000-000000009802'),
  ('5707a6e0-0000-4000-8000-000000009803'),
  ('5707a6e0-0000-4000-8000-000000009804'),
  ('5707a6e0-0000-4000-8000-000000009805'),
  ('5707a6e0-0000-4000-8000-000000009806');

insert into public.users (id)
select id from auth.users where id::text like '5707a6e0-0000-4000-8000-0000000098__'
on conflict do nothing;

insert into public.workspaces (id, name, personal, creator_id) values
  ('5707a6e0-0000-4000-8000-000000009811', 'RLS Whiteboard/Category WS', false,
    '5707a6e0-0000-4000-8000-000000009801');

insert into public.workspace_members (ws_id, user_id, type) values
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009801', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009802', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009803', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009804', 'MEMBER'),
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009805', 'GUEST')
on conflict do nothing;

delete from public.workspace_default_permissions
where ws_id = '5707a6e0-0000-4000-8000-000000009811';

insert into public.workspace_roles (id, name, ws_id) values
  ('5707a6e0-0000-4000-8000-000000009831', 'Settings Manager', '5707a6e0-0000-4000-8000-000000009811'),
  ('5707a6e0-0000-4000-8000-000000009832', 'Time Manager', '5707a6e0-0000-4000-8000-000000009811');

insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009831', 'manage_workspace_settings', true),
  ('5707a6e0-0000-4000-8000-000000009811', '5707a6e0-0000-4000-8000-000000009832', 'manage_time_tracking_requests', true);

insert into public.workspace_role_members (role_id, user_id) values
  ('5707a6e0-0000-4000-8000-000000009831', '5707a6e0-0000-4000-8000-000000009803'),
  ('5707a6e0-0000-4000-8000-000000009832', '5707a6e0-0000-4000-8000-000000009804');

-- Seed two whiteboards (one created by owner 9801, one created by plain member 9802) and one category.
insert into public.workspace_whiteboards (id, ws_id, creator_id, title, snapshot) values
  ('5707a6e0-0000-4000-8000-000000009841',
   '5707a6e0-0000-4000-8000-000000009811',
   '5707a6e0-0000-4000-8000-000000009801',
   'Original Board',
   '{"elements":[]}'::jsonb),
  ('5707a6e0-0000-4000-8000-000000009842',
   '5707a6e0-0000-4000-8000-000000009811',
   '5707a6e0-0000-4000-8000-000000009802',
   'Member Owned Board',
   '{"elements":[]}'::jsonb);

insert into public.time_tracking_categories (id, ws_id, name, color) values
  ('5707a6e0-0000-4000-8000-000000009851',
   '5707a6e0-0000-4000-8000-000000009811',
   'Core Work',
   'BLUE');

-- Helper to switch to an authenticated actor.
create or replace function pg_temp.as_user(p_user_id uuid) returns void
language plpgsql as $$
begin
  execute format(
    'set local request.jwt.claims = %L',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text
  );
  execute 'set local request.jwt.claim.role = ''authenticated''';
  execute 'set local role authenticated';
end;
$$;

-- ============================================================================
-- Whiteboard RLS tests
-- ============================================================================

-- 1. Guest cannot read whiteboards
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009805');
select is(
  (select count(*)::int from public.workspace_whiteboards where id = '5707a6e0-0000-4000-8000-000000009841'),
  0,
  'guest cannot select workspace whiteboards'
);
reset role;

-- 2. Non-member cannot read whiteboards
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009806');
select is(
  (select count(*)::int from public.workspace_whiteboards where id = '5707a6e0-0000-4000-8000-000000009841'),
  0,
  'non-member cannot select workspace whiteboards'
);
reset role;

-- 3. Ordinary member CAN update snapshot
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
select lives_ok(
  $$update public.workspace_whiteboards
    set snapshot = '{"elements":[{"id":"1"}]}'::jsonb
    where id = '5707a6e0-0000-4000-8000-000000009841'$$,
  'ordinary member can save whiteboard snapshot'
);
reset role;

-- 4. Ordinary member CANNOT rename board title
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
select throws_ok(
  $$update public.workspace_whiteboards
    set title = 'Hijacked Title'
    where id = '5707a6e0-0000-4000-8000-000000009841'$$,
  '42501',
  null,
  'ordinary member cannot rename another user whiteboard'
);
reset role;

-- 5. Ordinary member CANNOT archive board
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
select throws_ok(
  $$update public.workspace_whiteboards
    set archived_at = now()
    where id = '5707a6e0-0000-4000-8000-000000009841'$$,
  '42501',
  null,
  'ordinary member cannot archive another user whiteboard'
);
reset role;

-- 6. Ordinary member CANNOT mutate immutable creator_id
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
select throws_ok(
  $$update public.workspace_whiteboards
    set creator_id = '5707a6e0-0000-4000-8000-000000009802'
    where id = '5707a6e0-0000-4000-8000-000000009841'$$,
  '42501',
  null,
  'ordinary member cannot reassign whiteboard creator_id'
);
reset role;

-- 7. Ordinary member CANNOT delete another user's board (0 rows affected)
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
with deleted as (
  delete from public.workspace_whiteboards
  where id = '5707a6e0-0000-4000-8000-000000009841'
  returning id
)
select is((select count(*)::int from deleted), 0, 'ordinary member cannot delete another user whiteboard');
reset role;

-- 8. Settings manager CAN rename board
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009803');
select lives_ok(
  $$update public.workspace_whiteboards
    set title = 'Manager Renamed'
    where id = '5707a6e0-0000-4000-8000-000000009841'$$,
  'settings manager can rename another user whiteboard'
);
reset role;

-- 9. Plain member (non-workspace-owner, non-manager) CAN rename, archive, and delete own board
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
select lives_ok(
  $$update public.workspace_whiteboards
    set title = 'Member Creator Renamed', archived_at = now()
    where id = '5707a6e0-0000-4000-8000-000000009842'$$,
  'plain member board creator can rename and archive own whiteboard'
);
with deleted as (
  delete from public.workspace_whiteboards
  where id = '5707a6e0-0000-4000-8000-000000009842'
  returning id
)
select is((select count(*)::int from deleted), 1, 'plain member board creator can delete own whiteboard');
reset role;

-- 10. Board creator (owner) CAN rename and archive own board
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009801');
select lives_ok(
  $$update public.workspace_whiteboards
    set title = 'Creator Renamed', archived_at = now()
    where id = '5707a6e0-0000-4000-8000-000000009841'$$,
  'board creator can rename and archive own whiteboard'
);
reset role;

-- 11. Settings manager CAN delete another user's board
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009803');
with deleted as (
  delete from public.workspace_whiteboards
  where id = '5707a6e0-0000-4000-8000-000000009841'
  returning id
)
select is((select count(*)::int from deleted), 1, 'settings manager can delete another user whiteboard');
reset role;

-- 12. service_role can update whiteboard metadata
set local request.jwt.claim.role = 'service_role';
set local role service_role;
insert into public.workspace_whiteboards (id, ws_id, creator_id, title, snapshot) values
  ('5707a6e0-0000-4000-8000-000000009843',
   '5707a6e0-0000-4000-8000-000000009811',
   '5707a6e0-0000-4000-8000-000000009801',
   'Service Role Board',
   '{"elements":[]}'::jsonb);
select lives_ok(
  $$update public.workspace_whiteboards
    set title = 'Service Role Renamed'
    where id = '5707a6e0-0000-4000-8000-000000009843'$$,
  'service_role can update whiteboard metadata'
);
reset role;

-- ============================================================================
-- Time-tracking categories RLS tests
-- ============================================================================

-- 11. Guest cannot read categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009805');
select is(
  (select count(*)::int from public.time_tracking_categories where id = '5707a6e0-0000-4000-8000-000000009851'),
  0,
  'guest cannot select time tracking categories'
);
reset role;

-- 12. Guest cannot insert categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009805');
select throws_ok(
  $$insert into public.time_tracking_categories (ws_id, name, color)
    values ('5707a6e0-0000-4000-8000-000000009811', 'Guest Cat', 'BLUE')$$,
  '42501',
  null,
  'guest cannot insert time tracking categories'
);
reset role;

-- 13. Non-member cannot insert categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009806');
select throws_ok(
  $$insert into public.time_tracking_categories (ws_id, name, color)
    values ('5707a6e0-0000-4000-8000-000000009811', 'Outsider Cat', 'BLUE')$$,
  '42501',
  null,
  'non-member cannot insert time tracking categories'
);
reset role;

-- 14. Ordinary member CAN select categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
select is(
  (select count(*)::int from public.time_tracking_categories where id = '5707a6e0-0000-4000-8000-000000009851'),
  1,
  'ordinary member can select time tracking categories'
);
reset role;

-- 15. Ordinary member CAN insert categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
select lives_ok(
  $$insert into public.time_tracking_categories (ws_id, name, color)
    values ('5707a6e0-0000-4000-8000-000000009811', 'Member Created', 'GREEN')$$,
  'ordinary member can insert time tracking categories'
);
reset role;

-- 16. Ordinary member CANNOT update categories (0 rows affected)
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
with updated as (
  update public.time_tracking_categories
  set name = 'Hijacked'
  where id = '5707a6e0-0000-4000-8000-000000009851'
  returning id
)
select is((select count(*)::int from updated), 0, 'ordinary member cannot update time tracking categories');
reset role;

-- 17. Ordinary member CANNOT delete categories (0 rows affected)
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009802');
with deleted as (
  delete from public.time_tracking_categories
  where id = '5707a6e0-0000-4000-8000-000000009851'
  returning id
)
select is((select count(*)::int from deleted), 0, 'ordinary member cannot delete time tracking categories');
reset role;

-- 18. Settings manager CAN update categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009803');
with updated as (
  update public.time_tracking_categories
  set name = 'Settings Manager Updated'
  where id = '5707a6e0-0000-4000-8000-000000009851'
  returning id
)
select is((select count(*)::int from updated), 1, 'settings manager can update time tracking categories');
reset role;

-- 19. Time-tracking manager CAN update categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009804');
with updated as (
  update public.time_tracking_categories
  set name = 'Time Manager Updated'
  where id = '5707a6e0-0000-4000-8000-000000009851'
  returning id
)
select is((select count(*)::int from updated), 1, 'time-tracking manager can update time tracking categories');
reset role;

-- 20. Time-tracking manager CAN delete categories
select pg_temp.as_user('5707a6e0-0000-4000-8000-000000009804');
with deleted as (
  delete from public.time_tracking_categories
  where id = '5707a6e0-0000-4000-8000-000000009851'
  returning id
)
select is((select count(*)::int from deleted), 1, 'time-tracking manager can delete time tracking categories');
reset role;

select * from finish();
rollback;
