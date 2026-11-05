begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select plan(54);
insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-0000000e6001', 'Ticket Owner');
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-0000000e6010', 'Ticket Workspace', '00000000-0000-4000-8000-0000000e6001', false);
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6001', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e6020', '00000000-0000-4000-8000-0000000e6010', 'Ticket Board', '00000000-0000-4000-8000-0000000e6001');
insert into public.task_projects (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e6030', '00000000-0000-4000-8000-0000000e6010', 'Platform', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6031', '00000000-0000-4000-8000-0000000e6010', 'Platform Team', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6032', '00000000-0000-4000-8000-0000000e6010', '123 !', '00000000-0000-4000-8000-0000000e6001');
select is((select ticket_key from public.task_projects where id = '00000000-0000-4000-8000-0000000e6030'), 'PLA', 'derive three ASCII characters');
select is((select ticket_key from public.task_projects where id = '00000000-0000-4000-8000-0000000e6031'), 'PLA2', 'deduplicate within workspace');
select is((select ticket_key from public.task_projects where id = '00000000-0000-4000-8000-0000000e6032'), 'PRJ', 'invalid name falls back to PRJ');
insert into public.tasks (id, name, list_id, created_at) values
  ('00000000-0000-4000-8000-0000000e6101', 'First', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1), '2026-01-02'),
  ('00000000-0000-4000-8000-0000000e6102', 'Second', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1), '2026-01-01'),
  ('00000000-0000-4000-8000-0000000e6103', 'Third', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1), '2026-01-01');
insert into public.task_project_tasks (project_id, task_id, ticket_number) values
  ('00000000-0000-4000-8000-0000000e6030', '00000000-0000-4000-8000-0000000e6101', 999),
  ('00000000-0000-4000-8000-0000000e6030', '00000000-0000-4000-8000-0000000e6102', null);
select is((select ticket_number from public.task_project_tasks where task_id = '00000000-0000-4000-8000-0000000e6101'), 1, 'allocate server-side rather than accepting caller number');
select is((select ticket_number from public.task_project_tasks where task_id = '00000000-0000-4000-8000-0000000e6102'), 2, 'increment per project');
select is((select next_ticket_number from public.task_projects where id = '00000000-0000-4000-8000-0000000e6030'), 3, 'counter stores next number');
select lives_ok($$update public.task_projects set ticket_key = 'CORE' where id = '00000000-0000-4000-8000-0000000e6030'$$, 'key is editable');
select is((select ticket_number from public.task_project_tasks where task_id = '00000000-0000-4000-8000-0000000e6101'), 1, 'editing key keeps number');
select throws_ok($$update public.task_projects set ticket_key = 'bad' where id = '00000000-0000-4000-8000-0000000e6030'$$, '23514', null, 'reject lowercase key');
select throws_ok($$update public.task_projects set ticket_key = '1BAD' where id = '00000000-0000-4000-8000-0000000e6030'$$, '23514', null, 'reject digit-leading key');
select throws_ok($$update public.task_projects set ticket_key = 'PLA2' where id = '00000000-0000-4000-8000-0000000e6030'$$, '23505', null, 'workspace key is unique');
select throws_ok($$update public.task_project_tasks set ticket_number = 2 where task_id = '00000000-0000-4000-8000-0000000e6101'$$, '23514', 'PROJECT_TICKET_IDENTITY_IMMUTABLE', 'numbers cannot change');
select throws_ok($$update public.task_projects set next_ticket_number = 1 where id = '00000000-0000-4000-8000-0000000e6030'$$, '23514', 'PROJECT_TICKET_COUNTER_CANNOT_DECREASE', 'counter cannot rewind');
delete from public.task_project_tasks where task_id = '00000000-0000-4000-8000-0000000e6102';
insert into public.task_project_tasks (project_id, task_id) values
  ('00000000-0000-4000-8000-0000000e6030', '00000000-0000-4000-8000-0000000e6103');
select is((select ticket_number from public.task_project_tasks where task_id = '00000000-0000-4000-8000-0000000e6103'), 3, 'deleted numbers are never reused');
select ok(exists(select 1 from pg_constraint where conrelid = 'public.task_project_tasks'::regclass and conname = 'task_project_tasks_ticket_number_unique' and contype = 'u'), 'project numbers have a unique constraint');
select col_is_null('public', 'task_project_tasks', 'ticket_number', 'numbers stay nullable for links in keyless projects');

-- Exercise backfill ordering with equal join dates and equal task dates.
create temporary table ticket_backfill_fixture (task_id integer, joined_at timestamptz, task_created_at timestamptz);
insert into ticket_backfill_fixture values
  (3, '2026-01-02', '2026-01-01'), (2, '2026-01-01', '2026-01-01'),
  (1, '2026-01-01', '2026-01-01'), (4, '2026-01-01', '2025-12-31');
select results_eq(
  $$select task_id from ticket_backfill_fixture order by joined_at, task_created_at, task_id$$,
  $$values (4), (1), (2), (3)$$,
  'backfill orders by join time, task creation, then task ID'
);
select lives_ok($$select public.update_task_with_relations(
  p_task_id := '00000000-0000-4000-8000-0000000e6101',
  p_task_updates := '{}'::jsonb,
  p_project_ids := array['00000000-0000-4000-8000-0000000e6030']::uuid[],
  p_replace_projects := true,
  p_actor_user_id := '00000000-0000-4000-8000-0000000e6001'
)$$, 'saving unchanged project membership succeeds');
select is((select ticket_number from public.task_project_tasks where task_id = '00000000-0000-4000-8000-0000000e6101'), 1, 'saving unchanged membership preserves its number');
select ok(not has_function_privilege('anon', 'private.assign_project_ticket_number()', 'EXECUTE'), 'allocator cannot be called anonymously');
insert into public.task_project_tasks (project_id, task_id) values
  ('00000000-0000-4000-8000-0000000e6031', '00000000-0000-4000-8000-0000000e6101');
select results_eq(
  $$select task_id from private.list_task_source_filter_ids(
    p_actor_id := '00000000-0000-4000-8000-0000000e6001', p_workspace_id := '00000000-0000-4000-8000-0000000e6010',
    p_ticket_prefix := 'CORE', p_display_number := 1)$$,
  $$values ('00000000-0000-4000-8000-0000000e6101'::uuid)$$, 'project key resolves through paginated IDs'
);
select results_eq(
  $$select task_id from private.list_task_source_filter_ids(
    p_actor_id := '00000000-0000-4000-8000-0000000e6001', p_workspace_id := '00000000-0000-4000-8000-0000000e6010',
    p_ticket_prefix := 'PLA2', p_display_number := 1)$$,
  $$values ('00000000-0000-4000-8000-0000000e6101'::uuid)$$, 'secondary project key resolves too'
);
select is((select sum(total_count)::integer from private.count_task_source_filter_lists(
    p_actor_id := '00000000-0000-4000-8000-0000000e6001', p_workspace_id := '00000000-0000-4000-8000-0000000e6010',
    p_ticket_prefix := 'CORE', p_display_number := 1)), 1, 'list counts use project identity');
select results_eq(
  $$select task_id from private.list_task_source_filter_ids(
    p_actor_id := '00000000-0000-4000-8000-0000000e6001', p_workspace_id := '00000000-0000-4000-8000-0000000e6010',
    p_ticket_prefix := (select ticket_prefix from public.workspace_boards where id = '00000000-0000-4000-8000-0000000e6020'),
    p_display_number := (select display_number from public.tasks where id = '00000000-0000-4000-8000-0000000e6102'))$$,
  $$values ('00000000-0000-4000-8000-0000000e6102'::uuid)$$, 'legacy lookup still resolves a project-less task'
);
-- Workspace 42529372-c669-4833-bb32-2cab1f4ffd83 is excluded from the
-- backfill, so its existing projects keep a NULL key.
select ok((select convalidated from pg_constraint where conrelid = 'public.task_projects'::regclass and conname = 'task_projects_ticket_key_present'), 'key presence check is validated');
select throws_ok($$update public.task_projects set ticket_key = null where id = '00000000-0000-4000-8000-0000000e6031'$$, '23514', null, 'other workspaces cannot drop a key');
insert into public.workspaces (id, name, creator_id, personal) values
  ('42529372-c669-4833-bb32-2cab1f4ffd83', 'Excluded Workspace', '00000000-0000-4000-8000-0000000e6001', false)
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type) values
  ('42529372-c669-4833-bb32-2cab1f4ffd83', '00000000-0000-4000-8000-0000000e6001', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e6021', '42529372-c669-4833-bb32-2cab1f4ffd83', 'Legacy Board', '00000000-0000-4000-8000-0000000e6001');
insert into public.task_projects (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e6033', '42529372-c669-4833-bb32-2cab1f4ffd83', 'Legacy', '00000000-0000-4000-8000-0000000e6001');
select lives_ok($$update public.task_projects set ticket_key = null where id = '00000000-0000-4000-8000-0000000e6033'$$, 'the excluded workspace keeps a NULL key');
insert into public.tasks (id, name, list_id) values
  ('00000000-0000-4000-8000-0000000e6104', 'Legacy task', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6021' and status = 'active' limit 1));
insert into public.task_project_tasks (project_id, task_id) values
  ('00000000-0000-4000-8000-0000000e6033', '00000000-0000-4000-8000-0000000e6104');
select is((select ticket_number from public.task_project_tasks where task_id = '00000000-0000-4000-8000-0000000e6104'), null::integer, 'keyless projects number nothing');
select is((select next_ticket_number from public.task_projects where id = '00000000-0000-4000-8000-0000000e6033'), 1, 'keyless projects leave their counter alone');
select is_empty(
  $$select task_id from private.list_task_source_filter_ids(
    p_actor_id := '00000000-0000-4000-8000-0000000e6001', p_workspace_id := '42529372-c669-4833-bb32-2cab1f4ffd83',
    p_ticket_prefix := 'LEG', p_display_number := 1)$$,
  'search skips NULL keys without error'
);
-- Choosing a key is project management. End-user sessions have no direct
-- insert grant; the key trigger also refuses a chosen key without permission.
insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-0000000e6003', 'Outsider');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000e6003"}';
select throws_ok($$insert into public.task_projects (ws_id, name, creator_id)
  values ('00000000-0000-4000-8000-0000000e6010', 'Direct', '00000000-0000-4000-8000-0000000e6003')$$,
  '42501', null, 'end-user sessions cannot insert projects directly');
set local role postgres;
grant insert on public.task_projects to authenticated;
set local role authenticated;
select throws_ok($$insert into public.task_projects (ws_id, name, creator_id, ticket_key)
  values ('00000000-0000-4000-8000-0000000e6010', 'Chosen', '00000000-0000-4000-8000-0000000e6003', 'CHOSEN')$$,
  '42501', 'PROJECT_TICKET_KEY_MANAGEMENT_DENIED', 'the key trigger refuses a chosen key without manage_projects');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok($$insert into public.task_projects (ws_id, name, creator_id, ticket_key)
  values ('00000000-0000-4000-8000-0000000e6010', 'Chosen', '00000000-0000-4000-8000-0000000e6001', 'CHOSEN')$$,
  'service-role creation keeps a chosen key');
-- A member without project management links through the task API, which
-- saves relations as the service role; the allocator numbers the link.
insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-0000000e6002', 'Member');
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6002', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
insert into public.tasks (id, name, list_id) values
  ('00000000-0000-4000-8000-0000000e6105', 'Member task', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1)),
  ('00000000-0000-4000-8000-0000000e6106', 'Member direct task', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-0000000e6020' and status = 'active' limit 1));
select lives_ok($$select public.update_task_with_relations(
  p_task_id := '00000000-0000-4000-8000-0000000e6105',
  p_task_updates := '{}'::jsonb,
  p_project_ids := array['00000000-0000-4000-8000-0000000e6031']::uuid[],
  p_replace_projects := true,
  p_actor_user_id := '00000000-0000-4000-8000-0000000e6002'
)$$, 'a member links a task to a keyed project through the task API');
select ok((select ticket_number from public.task_project_tasks
  where task_id = '00000000-0000-4000-8000-0000000e6105'
    and project_id = '00000000-0000-4000-8000-0000000e6031') is not null,
  'the member''s link gets a ticket number');
-- Linking straight from a member session is denied. The allocator stays
-- SECURITY INVOKER, and the server-only revokes on task_projects predate
-- ticket keys, so end-user sessions cannot read or bump the counter.
-- Legitimate linking goes through the authorized server paths above.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000e6002"}';
select throws_ok($$insert into public.task_project_tasks (project_id, task_id)
  values ('00000000-0000-4000-8000-0000000e6031', '00000000-0000-4000-8000-0000000e6106')$$,
  '42501', null,
  'a member session cannot link a task directly; the invoker allocator needs server-only task_projects access');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
-- Project keys avoid board ticket prefixes in the same workspace. A board
-- without a prefix shows TASK-N, so TASK is taken too.
insert into public.workspace_boards (id, ws_id, name, creator_id, ticket_prefix) values
  ('00000000-0000-4000-8000-0000000e6022', '00000000-0000-4000-8000-0000000e6010', 'Prefixed Board', '00000000-0000-4000-8000-0000000e6001', ' brd ');
insert into public.task_projects (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e6034', '00000000-0000-4000-8000-0000000e6010', 'Brd Launch', '00000000-0000-4000-8000-0000000e6001'),
  ('00000000-0000-4000-8000-0000000e6035', '00000000-0000-4000-8000-0000000e6010', 'Task Force', '00000000-0000-4000-8000-0000000e6001');
select is((select ticket_key from public.task_projects where id = '00000000-0000-4000-8000-0000000e6034'), 'BRD2', 'generated keys skip a board prefix');
select is((select ticket_key from public.task_projects where id = '00000000-0000-4000-8000-0000000e6035'), 'TAS', 'only an exact board prefix is taken');
select throws_ok($$insert into public.task_projects (ws_id, name, creator_id, ticket_key)
  values ('00000000-0000-4000-8000-0000000e6010', 'Chosen Board', '00000000-0000-4000-8000-0000000e6001', 'BRD')$$,
  '23505', 'PROJECT_TICKET_KEY_BOARD_PREFIX', 'a chosen key cannot equal a board prefix');
select throws_ok($$update public.task_projects set ticket_key = 'BRD' where id = '00000000-0000-4000-8000-0000000e6031'$$,
  '23505', 'PROJECT_TICKET_KEY_BOARD_PREFIX', 'an edited key cannot equal a board prefix');
select throws_ok($$update public.task_projects set ticket_key = 'TASK' where id = '00000000-0000-4000-8000-0000000e6031'$$,
  '23505', 'PROJECT_TICKET_KEY_BOARD_PREFIX', 'TASK is taken while a board has no prefix');
select lives_ok($$update public.task_projects set name = 'Platform Crew' where id = '00000000-0000-4000-8000-0000000e6031'$$,
  'edits that keep the key skip the board prefix check');
select is((select ticket_key from public.task_projects where id = '00000000-0000-4000-8000-0000000e6031'), 'PLA2', 'the existing key stays');
-- The reverse: a board's prefix cannot be set to a project key either.
select throws_ok($$update public.workspace_boards set ticket_prefix = 'CORE' where id = '00000000-0000-4000-8000-0000000e6022'$$,
  '23505', 'TASK_BOARD_TICKET_PREFIX_PROJECT_KEY', 'a board prefix cannot be edited to a project key');
select throws_ok($$update public.workspace_boards set ticket_prefix = ' pla2 ' where id = '00000000-0000-4000-8000-0000000e6022'$$,
  '23505', 'TASK_BOARD_TICKET_PREFIX_PROJECT_KEY', 'the board check trims and upper-cases the prefix');
select throws_ok($$insert into public.workspace_boards (ws_id, name, creator_id, ticket_prefix)
  values ('00000000-0000-4000-8000-0000000e6010', 'Core Board', '00000000-0000-4000-8000-0000000e6001', 'CORE')$$,
  '23505', 'TASK_BOARD_TICKET_PREFIX_PROJECT_KEY', 'a new board cannot take a project key as its prefix');
select lives_ok($$update public.workspace_boards set ticket_prefix = 'NEWP' where id = '00000000-0000-4000-8000-0000000e6022'$$,
  'a free prefix is accepted');
select lives_ok($$update public.workspace_boards set ticket_prefix = null where id = '00000000-0000-4000-8000-0000000e6022'$$,
  'clearing a prefix is not checked');
-- The excluded workspace is left alone: its boards may share a key.
insert into public.task_projects (id, ws_id, name, creator_id, ticket_key) values
  ('00000000-0000-4000-8000-0000000e6036', '42529372-c669-4833-bb32-2cab1f4ffd83', 'Legacy Keyed', '00000000-0000-4000-8000-0000000e6001', 'LEGK');
select lives_ok($$update public.workspace_boards set ticket_prefix = 'LEGK' where id = '00000000-0000-4000-8000-0000000e6021'$$,
  'the excluded workspace skips the board prefix check');
select lives_ok($$update public.workspace_boards set name = 'Legacy Board Renamed' where id = '00000000-0000-4000-8000-0000000e6021'$$,
  'edits that keep the prefix skip the check');
-- End-user board writes fail closed. task_projects is server-only: like every
-- public table with a description column, it has no end-user policies or
-- grants (20260312113000_lock_description_tables_to_server_apis.sql), so the
-- invoker check cannot read it from an end-user session. Boards have no
-- end-user policies either (20260319101300), so a temporary grant and policy
-- let an MFA-satisfied member's write reach the board and its trigger here.
set local role postgres;
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000e6004');
insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-0000000e6004', 'Board Member')
on conflict (id) do nothing;
insert into public.workspace_members (ws_id, user_id, type) values
  ('00000000-0000-4000-8000-0000000e6010', '00000000-0000-4000-8000-0000000e6004', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;
grant select, update (ticket_prefix) on public.workspace_boards to authenticated;
create policy pgtap_member_prefix_write on public.workspace_boards
  for all to authenticated using (true) with check (true);
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000e6004"}';
select throws_ok($$select count(*) from public.task_projects$$,
  '42501', 'permission denied for table task_projects', 'members cannot read task_projects');
with written as (
  update public.workspace_boards set ticket_prefix = null
  where id = '00000000-0000-4000-8000-0000000e6022' returning id
)
select is((select count(*)::integer from written), 1, 'a member prefix write reaches the board when it skips the check');
select throws_ok($$update public.workspace_boards set ticket_prefix = 'MEMBR' where id = '00000000-0000-4000-8000-0000000e6022'$$,
  '42501', 'permission denied for table task_projects', 'a free member prefix fails closed');
select throws_ok($$update public.workspace_boards set ticket_prefix = 'CORE' where id = '00000000-0000-4000-8000-0000000e6022'$$,
  '42501', 'permission denied for table task_projects', 'a colliding member prefix fails closed');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select * from finish();
rollback;
