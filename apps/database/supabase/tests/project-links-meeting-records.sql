-- Contract for 20261124013000_project_links_and_meeting_records.sql.
-- Actors in workspace W1 (seeded by 00, who does not act):
--   01 manage_projects + manage_calendar, hosts meetings M1 and M3
--   02 plain member, hosts meeting M2, created task T3
--   03 manage_projects only
--   04 not a member
--   05 GUEST
-- W2 holds meeting M9 and task T9 for cross-workspace probes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(43);

insert into auth.users (id)
select ('5e510000-0000-4000-8000-0000000000' || n)::uuid
from unnest(array['00', '01', '02', '03', '04', '05']) n
on conflict do nothing;
insert into public.users (id)
select id from auth.users where id::text like '5e510000-0000-4000-8000-0000000000__'
on conflict do nothing;

insert into public.workspaces (id, name, personal, creator_id) values
  ('5e510000-0000-4000-8000-000000000101', 'Projects W1', false,
    '5e510000-0000-4000-8000-000000000000'),
  ('5e510000-0000-4000-8000-000000000102', 'Projects W2', false,
    '5e510000-0000-4000-8000-000000000000');
insert into public.workspace_members (ws_id, user_id, type) values
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000000', 'MEMBER'),
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000001', 'MEMBER'),
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000002', 'MEMBER'),
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000003', 'MEMBER'),
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000005', 'GUEST'),
  ('5e510000-0000-4000-8000-000000000102', '5e510000-0000-4000-8000-000000000001', 'MEMBER')
on conflict do nothing;
-- Member defaults could grant every permission; use explicit roles only.
delete from public.workspace_default_permissions
where ws_id in ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000102');
insert into public.workspace_roles (id, name, ws_id) values
  ('5e510000-0000-4000-8000-000000000201', 'Project manager', '5e510000-0000-4000-8000-000000000101'),
  ('5e510000-0000-4000-8000-000000000202', 'Projects only', '5e510000-0000-4000-8000-000000000101'),
  ('5e510000-0000-4000-8000-000000000203', 'W2 projects', '5e510000-0000-4000-8000-000000000102');
insert into public.workspace_role_permissions (ws_id, role_id, permission, enabled) values
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000201', 'manage_projects', true),
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000201', 'manage_calendar', true),
  ('5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000202', 'manage_projects', true),
  ('5e510000-0000-4000-8000-000000000102', '5e510000-0000-4000-8000-000000000203', 'manage_projects', true);
insert into public.workspace_role_members (role_id, user_id) values
  ('5e510000-0000-4000-8000-000000000201', '5e510000-0000-4000-8000-000000000001'),
  ('5e510000-0000-4000-8000-000000000202', '5e510000-0000-4000-8000-000000000003'),
  ('5e510000-0000-4000-8000-000000000203', '5e510000-0000-4000-8000-000000000001');

insert into public.workspace_meetings (id, ws_id, name, creator_id) values
  ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000101', 'M1',
    '5e510000-0000-4000-8000-000000000001'),
  ('5e510000-0000-4000-8000-000000000302', '5e510000-0000-4000-8000-000000000101', 'M2',
    '5e510000-0000-4000-8000-000000000002'),
  ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000101', 'M3',
    '5e510000-0000-4000-8000-000000000001'),
  ('5e510000-0000-4000-8000-000000000309', '5e510000-0000-4000-8000-000000000102', 'M9',
    '5e510000-0000-4000-8000-000000000001');
insert into public.workspace_calendar_events (id, ws_id, title, description, start_at, end_at)
values ('5e510000-0000-4000-8000-000000000401', '5e510000-0000-4000-8000-000000000101',
  'E1', '', '2026-12-01 09:00:00+00', '2026-12-01 10:00:00+00');
insert into public.task_projects (id, ws_id, name, creator_id) values
  ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'P1',
    '5e510000-0000-4000-8000-000000000000'),
  ('5e510000-0000-4000-8000-000000000509', '5e510000-0000-4000-8000-000000000102', 'P9',
    '5e510000-0000-4000-8000-000000000000');
insert into public.workspace_boards (id, ws_id, name) values
  ('5e510000-0000-4000-8000-000000000601', '5e510000-0000-4000-8000-000000000101', 'B1'),
  ('5e510000-0000-4000-8000-000000000609', '5e510000-0000-4000-8000-000000000102', 'B9');
insert into public.task_lists (id, board_id, name) values
  ('5e510000-0000-4000-8000-000000000701', '5e510000-0000-4000-8000-000000000601', 'L1'),
  ('5e510000-0000-4000-8000-000000000709', '5e510000-0000-4000-8000-000000000609', 'L9');
insert into public.tasks (id, list_id, name, creator_id) values
  ('5e510000-0000-4000-8000-000000000801', '5e510000-0000-4000-8000-000000000701', 'T1',
    '5e510000-0000-4000-8000-000000000000'),
  ('5e510000-0000-4000-8000-000000000803', '5e510000-0000-4000-8000-000000000701', 'T3',
    '5e510000-0000-4000-8000-000000000002'),
  ('5e510000-0000-4000-8000-000000000809', '5e510000-0000-4000-8000-000000000709', 'T9',
    '5e510000-0000-4000-8000-000000000001');
insert into public.task_project_tasks (project_id, task_id)
values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000801');

-- Shape and privileges ------------------------------------------------------
select has_table('public', 'task_project_links', 'task_project_links exists');
select has_table('public', 'meeting_task_links', 'meeting_task_links exists');
select has_table('public', 'meeting_record_items', 'meeting_record_items exists');
select has_view('public', 'task_project_entity_links', 'unified project link view exists');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.task_project_links'::regclass, 'public.meeting_task_links'::regclass,
    'public.meeting_record_items'::regclass)), 'RLS is enabled on every new table');
select ok(not exists (
  select 1 from unnest(array['public.task_project_links', 'public.meeting_task_links',
    'public.meeting_record_items', 'public.task_project_entity_links']) t(rel)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(priv)
  where has_table_privilege('anon', t.rel, p.priv)), 'anon has no privilege on the new relations');
select ok(not has_table_privilege('authenticated', 'public.task_project_links', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.meeting_task_links', 'UPDATE'),
  'links are immutable for clients');

-- 01: manage_projects + manage_calendar, hosts M1 ---------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e510000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000001')$$,
  'a project manager links a meeting they host');
select lives_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'calendar_event',
    '5e510000-0000-4000-8000-000000000401', '5e510000-0000-4000-8000-000000000001')$$,
  'a project manager with manage_calendar links an event');
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000002')$$,
  '42501', null, 'created_by must be the caller');
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000309', '5e510000-0000-4000-8000-000000000001')$$,
  '23503', null, 'a meeting from another workspace cannot join the project');
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000102', 'meeting',
    '5e510000-0000-4000-8000-000000000309', '5e510000-0000-4000-8000-000000000001')$$,
  '23503', null, 'the project and link workspace must match');
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'task',
    '5e510000-0000-4000-8000-000000000803', '5e510000-0000-4000-8000-000000000001')$$,
  '42501', null, 'clients cannot link tasks here; they stay in task_project_tasks');
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'drive_file',
    '5e510000-0000-4000-8000-000000000803', '5e510000-0000-4000-8000-000000000001')$$,
  '42501', null, 'clients cannot use reserved kinds');
select is((select count(*)::int from public.task_project_entity_links
  where project_id = '5e510000-0000-4000-8000-000000000501'), 3,
  'the unified view lists the meeting, event and task links');
select is((select entity_kind from public.task_project_entity_links
  where entity_id = '5e510000-0000-4000-8000-000000000801'), 'task',
  'task membership surfaces as kind task');

select lives_ok($$insert into public.meeting_task_links (meeting_id, task_id, ws_id, created_by)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000801',
    '5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000001')$$,
  'the host records a source meeting on a same-workspace task');
select throws_ok($$insert into public.meeting_task_links (meeting_id, task_id, ws_id, created_by)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000809',
    '5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000001')$$,
  '23503', null, 'a task from another workspace cannot be linked to the meeting');
select lives_ok($$insert into public.meeting_task_links (meeting_id, task_id, ws_id, link_kind, carried_from_meeting_id, created_by)
  values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000801',
    '5e510000-0000-4000-8000-000000000101', 'carried_over', '5e510000-0000-4000-8000-000000000301',
    '5e510000-0000-4000-8000-000000000001')$$,
  'the host carries an open item over to the next meeting');
select throws_ok($$insert into public.meeting_task_links (meeting_id, task_id, ws_id, link_kind, created_by)
  values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000803',
    '5e510000-0000-4000-8000-000000000101', 'carried_over', '5e510000-0000-4000-8000-000000000001')$$,
  '23514', null, 'a carried-over link names its earlier meeting');

select lives_ok($$insert into public.meeting_record_items (id, meeting_id, ws_id, kind, content, created_by)
  values ('5e510000-0000-4000-8000-000000000901', '5e510000-0000-4000-8000-000000000301',
    '5e510000-0000-4000-8000-000000000101', 'agenda', 'Review the run of show',
    '5e510000-0000-4000-8000-000000000001')$$,
  'the host adds an agenda item');
select throws_ok($$insert into public.meeting_record_items (meeting_id, ws_id, kind, content, created_by)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000101',
    'decision', '   ', '5e510000-0000-4000-8000-000000000001')$$,
  '23514', null, 'blank record items are rejected');
select lives_ok($$update public.meeting_record_items set content = 'Review the final run of show'
  where id = '5e510000-0000-4000-8000-000000000901'$$, 'the host edits an agenda item');
select throws_ok($$update public.meeting_record_items set kind = 'decision'
  where id = '5e510000-0000-4000-8000-000000000901'$$,
  '55000', null, 'record item kind and ownership are immutable');
reset role;

-- 03: manage_projects only -------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e510000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000003')$$,
  '42501', null, 'manage_projects alone cannot link a meeting the caller does not host');
select is((select count(*)::int from public.task_project_links), 1,
  'without manage_calendar only the meeting link is visible');
select is((with d as (delete from public.task_project_links returning 1) select count(*)::int from d), 0,
  'manage_projects alone cannot unlink another host''s meeting or an event');
reset role;

-- 02: plain member, hosts M2, created T3 -----------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e510000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000302', '5e510000-0000-4000-8000-000000000002')$$,
  '42501', null, 'hosting a meeting without manage_projects cannot link it');
select lives_ok($$insert into public.meeting_task_links (meeting_id, task_id, ws_id, created_by)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000803',
    '5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000002')$$,
  'a member records the source meeting on a task they created');
select throws_ok($$insert into public.meeting_task_links (meeting_id, task_id, ws_id, link_kind, carried_from_meeting_id, created_by)
  values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000803',
    '5e510000-0000-4000-8000-000000000101', 'carried_over', '5e510000-0000-4000-8000-000000000301',
    '5e510000-0000-4000-8000-000000000002')$$,
  '42501', null, 'carry-over is a host action');
select is((with d as (delete from public.meeting_task_links
  where created_by = '5e510000-0000-4000-8000-000000000001' returning 1) select count(*)::int from d), 0,
  'a member cannot remove links the host made');
select is((select count(*)::int from public.meeting_record_items), 1, 'members read the meeting record');
select throws_ok($$insert into public.meeting_record_items (meeting_id, ws_id, kind, content, created_by)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000101',
    'decision', 'Ship it', '5e510000-0000-4000-8000-000000000002')$$,
  '42501', null, 'only the host writes the meeting record');
select is((with u as (update public.meeting_record_items set content = 'x' returning 1)
  select count(*)::int from u), 0, 'members cannot edit the meeting record');
reset role;

-- 04 non-member and 05 guest see nothing -----------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5e510000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((select count(*)::int from public.task_project_links)
  + (select count(*)::int from public.meeting_task_links)
  + (select count(*)::int from public.meeting_record_items), 0, 'non-members see no rows');
select set_config('request.jwt.claims',
  '{"sub":"5e510000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*)::int from public.task_project_links)
  + (select count(*)::int from public.meeting_task_links)
  + (select count(*)::int from public.meeting_record_items), 0, 'guests see no rows');
reset role;

-- Integrity for service_role writes and entity deletion ---------------------
select throws_ok($$update public.task_project_links set created_by = null$$,
  '55000', null, 'project links stay immutable for privileged writers');
select throws_ok($$insert into public.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'drive_file',
    '5e510000-0000-4000-8000-000000000803')$$,
  '23514', null, 'reserved kinds are not admitted for privileged writers either');
delete from public.workspace_calendar_events where id = '5e510000-0000-4000-8000-000000000401';
select is((select count(*)::int from public.task_project_links where entity_kind = 'calendar_event'), 0,
  'deleting an event removes its project links');
delete from public.workspace_meetings where id = '5e510000-0000-4000-8000-000000000301';
select is((select count(*)::int from public.task_project_links where entity_kind = 'meeting'), 0,
  'deleting a meeting removes its project links');
select is((select count(*)::int from public.meeting_task_links
  where meeting_id = '5e510000-0000-4000-8000-000000000301'
     or carried_from_meeting_id = '5e510000-0000-4000-8000-000000000301'), 0,
  'deleting a meeting removes source links and clears carry-over origins');
select is((select count(*)::int from public.meeting_task_links
  where meeting_id = '5e510000-0000-4000-8000-000000000303' and link_kind = 'carried_over'), 1,
  'the carried-over item stays on the later meeting');
select is((select count(*)::int from public.meeting_record_items), 0,
  'deleting a meeting removes its record');

select * from finish();
rollback;
