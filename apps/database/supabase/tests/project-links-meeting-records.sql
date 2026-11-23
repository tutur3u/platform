-- Contract for 20261124013000_project_links_and_meeting_records.sql.
-- The tables are private and reached only by service_role; product servers
-- enforce membership and edit rights. W1 holds meetings M1 and M3, event E1,
-- project P1, board B1 and task T1/T3. W2 holds M9, E9, P9 and T9 for
-- cross-workspace probes.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(47);

insert into auth.users (id) values
  ('5e510000-0000-4000-8000-000000000000'),
  ('5e510000-0000-4000-8000-000000000001')
on conflict do nothing;
insert into public.users (id) values
  ('5e510000-0000-4000-8000-000000000000'),
  ('5e510000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.workspaces (id, name, personal, creator_id) values
  ('5e510000-0000-4000-8000-000000000101', 'Projects W1', false,
    '5e510000-0000-4000-8000-000000000000'),
  ('5e510000-0000-4000-8000-000000000102', 'Projects W2', false,
    '5e510000-0000-4000-8000-000000000000');
insert into public.workspace_meetings (id, ws_id, name, creator_id) values
  ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000101', 'M1',
    '5e510000-0000-4000-8000-000000000001'),
  ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000101', 'M3',
    '5e510000-0000-4000-8000-000000000001'),
  ('5e510000-0000-4000-8000-000000000309', '5e510000-0000-4000-8000-000000000102', 'M9',
    '5e510000-0000-4000-8000-000000000001');
insert into public.workspace_calendar_events (id, ws_id, title, description, start_at, end_at) values
  ('5e510000-0000-4000-8000-000000000401', '5e510000-0000-4000-8000-000000000101',
    'E1', '', '2026-12-01 09:00:00+00', '2026-12-01 10:00:00+00'),
  ('5e510000-0000-4000-8000-000000000409', '5e510000-0000-4000-8000-000000000102',
    'E9', '', '2026-12-01 09:00:00+00', '2026-12-01 10:00:00+00');
insert into public.task_projects (id, ws_id, name, creator_id) values
  ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'P1',
    '5e510000-0000-4000-8000-000000000000'),
  ('5e510000-0000-4000-8000-000000000502', '5e510000-0000-4000-8000-000000000101', 'P2',
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
    '5e510000-0000-4000-8000-000000000001'),
  ('5e510000-0000-4000-8000-000000000809', '5e510000-0000-4000-8000-000000000709', 'T9',
    '5e510000-0000-4000-8000-000000000001');
insert into public.task_project_tasks (project_id, task_id)
values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000801');

-- Shape and privileges ------------------------------------------------------
select has_table('private', 'task_project_links', 'task_project_links is private');
select has_table('private', 'meeting_task_links', 'meeting_task_links is private');
select has_table('private', 'meeting_record_items', 'meeting_record_items is private');
select has_view('private', 'task_project_entity_links', 'the unified link view is private');
select hasnt_table('public', 'task_project_links', 'no public project link table');
select ok((select bool_and(relrowsecurity) from pg_class
  where oid in ('private.task_project_links'::regclass, 'private.meeting_task_links'::regclass,
    'private.meeting_record_items'::regclass)), 'RLS is enabled on every new table');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'public']) r(role)
  cross join unnest(array['private.task_project_links', 'private.meeting_task_links',
    'private.meeting_record_items', 'private.task_project_entity_links']) t(rel)
  cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
    'REFERENCES', 'TRIGGER']) p(priv)
  where has_table_privilege(r.role, t.rel, p.priv)),
  'client roles hold no privilege on the new relations');
select ok(not exists (
  select 1
  from unnest(array['anon', 'authenticated', 'public']) r(role)
  cross join unnest(array['private.validate_task_project_link()',
    'private.validate_meeting_task_link()', 'private.validate_meeting_record_item()',
    'private.delete_project_links_for_entity()']) f(fn)
  where has_function_privilege(r.role, f.fn, 'EXECUTE')),
  'client roles cannot execute the private trigger functions');
select ok(not has_schema_privilege('anon', 'private', 'USAGE')
  and not has_schema_privilege('authenticated', 'private', 'USAGE'),
  'client roles cannot use the private schema');
select ok((select bool_and(has_table_privilege('service_role', g.rel, g.priv)) from (values
    ('private.task_project_links', 'SELECT'), ('private.task_project_links', 'INSERT'),
    ('private.task_project_links', 'DELETE'), ('private.meeting_task_links', 'SELECT'),
    ('private.meeting_task_links', 'INSERT'), ('private.meeting_task_links', 'DELETE'),
    ('private.meeting_record_items', 'SELECT'), ('private.meeting_record_items', 'INSERT'),
    ('private.meeting_record_items', 'UPDATE'), ('private.meeting_record_items', 'DELETE'),
    ('private.task_project_entity_links', 'SELECT')) g(rel, priv)),
  'service_role reads and writes the new relations');
select ok(not exists (
  select 1
  from unnest(array['private.task_project_links', 'private.meeting_task_links']) t(rel)
  cross join unnest(array['UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
  where has_table_privilege('service_role', t.rel, p.priv))
  and not exists (
    select 1 from unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where has_table_privilege('service_role', 'private.meeting_record_items', p.priv))
  and not exists (
    select 1 from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES',
      'TRIGGER']) p(priv)
    where has_table_privilege('service_role', 'private.task_project_entity_links', p.priv)),
  'service_role holds only the scoped privileges');
select ok((select bool_and(confdeltype = 'c') from pg_constraint
  where conrelid in ('private.task_project_links'::regclass, 'private.meeting_task_links'::regclass,
      'private.meeting_record_items'::regclass)
    and confrelid = 'public.workspaces'::regclass), 'deleting a workspace cascades to every new table');

-- Project links as service_role --------------------------------------------
set local role service_role;
select lives_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id, created_by)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000001')$$,
  'a meeting joins a project in its workspace');
select lives_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'calendar_event',
    '5e510000-0000-4000-8000-000000000401')$$,
  'an event joins a project in its workspace');
select lives_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000502', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000303')$$,
  'another meeting joins a second project');
select throws_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000301')$$,
  '23505', null, 'a repeated link is a unique violation');
select throws_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'meeting',
    '5e510000-0000-4000-8000-000000000309')$$,
  '23503', null, 'a meeting from another workspace cannot join the project');
select throws_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'calendar_event',
    '5e510000-0000-4000-8000-000000000409')$$,
  '23503', null, 'an event from another workspace cannot join the project');
select throws_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000102', 'meeting',
    '5e510000-0000-4000-8000-000000000309')$$,
  '23503', null, 'the project and link workspace must match');
select throws_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'task',
    '5e510000-0000-4000-8000-000000000803')$$,
  '23514', null, 'task links stay in task_project_tasks');
select throws_ok($$insert into private.task_project_links (project_id, ws_id, entity_kind, entity_id)
  values ('5e510000-0000-4000-8000-000000000501', '5e510000-0000-4000-8000-000000000101', 'drive_file',
    '5e510000-0000-4000-8000-000000000803')$$,
  '23514', null, 'reserved kinds are not admitted yet');
select throws_ok($$update private.task_project_links set created_by = null$$,
  '42501', null, 'service_role cannot update project links');
select is((select count(*)::int from private.task_project_entity_links
  where project_id = '5e510000-0000-4000-8000-000000000501'), 3,
  'the unified view lists the meeting, event and task links');
select is((select entity_kind from private.task_project_entity_links
  where entity_id = '5e510000-0000-4000-8000-000000000801'), 'task',
  'task membership surfaces as kind task');

-- Meeting task links --------------------------------------------------------
select lives_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id, created_by)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000801',
    '5e510000-0000-4000-8000-000000000101', '5e510000-0000-4000-8000-000000000001')$$,
  'a meeting records a same-workspace task as its source');
select throws_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000801',
    '5e510000-0000-4000-8000-000000000101')$$,
  '23505', null, 'a repeated task link is a unique violation');
select throws_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000809',
    '5e510000-0000-4000-8000-000000000101')$$,
  '23503', null, 'a task from another workspace cannot be linked to the meeting');
select throws_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id)
  values ('5e510000-0000-4000-8000-000000000309', '5e510000-0000-4000-8000-000000000801',
    '5e510000-0000-4000-8000-000000000101')$$,
  '23503', null, 'a meeting from another workspace cannot list the task');
select lives_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id, link_kind, carried_from_meeting_id)
  values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000801',
    '5e510000-0000-4000-8000-000000000101', 'carried_over', '5e510000-0000-4000-8000-000000000301')$$,
  'an open item carries over to the next meeting');
select throws_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id, link_kind)
  values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000803',
    '5e510000-0000-4000-8000-000000000101', 'carried_over')$$,
  '23514', null, 'a carried-over link names its earlier meeting');
select throws_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id, link_kind, carried_from_meeting_id)
  values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000803',
    '5e510000-0000-4000-8000-000000000101', 'carried_over', '5e510000-0000-4000-8000-000000000309')$$,
  '23503', null, 'the earlier meeting must share the workspace');
select throws_ok($$insert into private.meeting_task_links (meeting_id, task_id, ws_id, link_kind, carried_from_meeting_id)
  values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000803',
    '5e510000-0000-4000-8000-000000000101', 'carried_over', '5e510000-0000-4000-8000-000000000303')$$,
  '23514', null, 'an item cannot carry over from its own meeting');

-- Meeting record items ------------------------------------------------------
select lives_ok($$insert into private.meeting_record_items (id, meeting_id, ws_id, kind, content)
  values ('5e510000-0000-4000-8000-000000000901', '5e510000-0000-4000-8000-000000000301',
    '5e510000-0000-4000-8000-000000000101', 'agenda', 'Review the run of show')$$,
  'a meeting records an agenda item');
select throws_ok($$insert into private.meeting_record_items (meeting_id, ws_id, kind, content)
  values ('5e510000-0000-4000-8000-000000000301', '5e510000-0000-4000-8000-000000000101',
    'decision', '   ')$$,
  '23514', null, 'blank record items are rejected');
select throws_ok($$insert into private.meeting_record_items (meeting_id, ws_id, kind, content)
  values ('5e510000-0000-4000-8000-000000000309', '5e510000-0000-4000-8000-000000000101',
    'decision', 'Ship it')$$,
  '23503', null, 'a record item stays in its meeting workspace');
select lives_ok($$update private.meeting_record_items set content = 'Review the final run of show'
  where id = '5e510000-0000-4000-8000-000000000901'$$, 'a record item is editable');
select throws_ok($$update private.meeting_record_items set kind = 'decision'
  where id = '5e510000-0000-4000-8000-000000000901'$$,
  '55000', null, 'record item kind and ownership are immutable');
reset role;

-- Integrity holds for the owner too ----------------------------------------
select throws_ok($$update private.task_project_links set created_by = null$$,
  '55000', null, 'project links stay immutable for the table owner');
select throws_ok($$update private.meeting_task_links set link_kind = 'carried_over'$$,
  '55000', null, 'meeting task links stay immutable for the table owner');
select throws_ok($$update private.meeting_task_links set carried_from_meeting_id = null
  where carried_from_meeting_id is not null$$,
  '55000', null, 'a carry-over origin clears only when that meeting is deleted');

-- Cleanup when an entity or project is deleted ------------------------------
delete from public.workspace_calendar_events where id = '5e510000-0000-4000-8000-000000000401';
select is((select count(*)::int from private.task_project_links where entity_kind = 'calendar_event'), 0,
  'deleting an event removes its project links');
delete from public.workspace_meetings where id = '5e510000-0000-4000-8000-000000000301';
select is((select count(*)::int from private.task_project_links
  where entity_id = '5e510000-0000-4000-8000-000000000301'), 0,
  'deleting a meeting removes its project links');
select is((select count(*)::int from private.meeting_task_links
  where meeting_id = '5e510000-0000-4000-8000-000000000301'
     or carried_from_meeting_id = '5e510000-0000-4000-8000-000000000301'), 0,
  'deleting a meeting removes source links and clears carry-over origins');
select is((select count(*)::int from private.meeting_task_links
  where meeting_id = '5e510000-0000-4000-8000-000000000303' and link_kind = 'carried_over'), 1,
  'the carried-over item stays on the later meeting');
select is((select count(*)::int from private.meeting_record_items), 0,
  'deleting a meeting removes its record');
delete from public.task_projects where id = '5e510000-0000-4000-8000-000000000502';
select is((select count(*)::int from private.task_project_links
  where project_id = '5e510000-0000-4000-8000-000000000502'), 0,
  'deleting a project removes its links');
insert into private.meeting_task_links (meeting_id, task_id, ws_id)
values ('5e510000-0000-4000-8000-000000000303', '5e510000-0000-4000-8000-000000000803',
  '5e510000-0000-4000-8000-000000000101');
delete from public.tasks where id = '5e510000-0000-4000-8000-000000000803';
select is((select count(*)::int from private.meeting_task_links
  where task_id = '5e510000-0000-4000-8000-000000000803'), 0,
  'deleting a task removes its meeting links');

select * from finish();
rollback;
