begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select plan(25);
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
select col_not_null('public', 'task_project_tasks', 'ticket_number', 'numbers are required after backfill');
select col_not_null('public', 'task_project_tasks', 'created_at', 'links always have join timestamps');

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
select * from finish();
rollback;
