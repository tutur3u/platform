begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(28);

select ok(not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'task_cycles' and column_name = 'board_id'), 'retained cycles have no board scope');
select ok(not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'workspace_boards' and column_name = 'sprint_length_weeks'), 'retained boards have no sprint length');
select ok(to_regclass('public.task_sprint_reports') is null, 'retained schema has no sprint reports');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('set_board_sprint_length', 'start_board_sprint', 'end_board_sprint', 'move_tasks_to_board_sprint', 'add_board_sprint', 'remove_board_sprint', 'list_board_unplanned_task_ids')), 'held sprint RPCs are absent');
select ok(to_regprocedure('public.assign_task_cycle(uuid,uuid)') is not null, 'workspace-cycle assignment RPC exists');
select ok((select not prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp', 'lock_timeout=5s'] from pg_proc where oid = 'public.assign_task_cycle(uuid,uuid)'::regprocedure), 'assignment is invoker with pinned path and bounded lock wait');
select ok(not has_function_privilege('anon', 'public.assign_task_cycle(uuid,uuid)', 'execute'), 'anonymous cannot assign cycles');
select ok(not has_function_privilege('authenticated', 'public.assign_task_cycle(uuid,uuid)', 'execute'), 'authenticated cannot assign cycles directly');
select ok(has_function_privilege('service_role', 'public.assign_task_cycle(uuid,uuid)', 'execute'), 'authorized API role can assign cycles');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
insert into public.users (id, display_name) values ('00000000-0000-4000-8000-0000000e7001', 'Retained Cycle Owner');
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-0000000e7010', 'Retained Workspace', '00000000-0000-4000-8000-0000000e7001', false),
  ('00000000-0000-4000-8000-0000000e7011', 'Foreign Workspace', '00000000-0000-4000-8000-0000000e7001', false);
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e7020', '00000000-0000-4000-8000-0000000e7010', 'Retained Board', '00000000-0000-4000-8000-0000000e7001');
insert into public.task_lists (id, board_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e7030', '00000000-0000-4000-8000-0000000e7020', 'Retained List', '00000000-0000-4000-8000-0000000e7001');
insert into public.tasks (id, list_id, name, creator_id) values
  ('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7030', 'Assignment', '00000000-0000-4000-8000-0000000e7001'),
  ('00000000-0000-4000-8000-0000000e7041', '00000000-0000-4000-8000-0000000e7030', 'Duplicate Assignment', '00000000-0000-4000-8000-0000000e7001'),
  ('00000000-0000-4000-8000-0000000e7042', null, 'Listless', '00000000-0000-4000-8000-0000000e7001');
insert into public.task_cycles (id, ws_id, name, creator_id, deleted) values
  ('00000000-0000-4000-8000-0000000e7050', '00000000-0000-4000-8000-0000000e7010', 'First Cycle', '00000000-0000-4000-8000-0000000e7001', false),
  ('00000000-0000-4000-8000-0000000e7051', '00000000-0000-4000-8000-0000000e7010', 'Second Cycle', '00000000-0000-4000-8000-0000000e7001', false),
  ('00000000-0000-4000-8000-0000000e7052', '00000000-0000-4000-8000-0000000e7010', 'Deleted Cycle', '00000000-0000-4000-8000-0000000e7001', true),
  ('00000000-0000-4000-8000-0000000e7053', '00000000-0000-4000-8000-0000000e7011', 'Foreign Cycle', '00000000-0000-4000-8000-0000000e7001', false);

select throws_ok($$select public.assign_task_cycle(null, '00000000-0000-4000-8000-0000000e7050')$$, '22004', 'Task and cycle are required', 'null task refused');
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', null)$$, '22004', 'Task and cycle are required', 'null cycle refused');
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e74ff', '00000000-0000-4000-8000-0000000e7050')$$, 'P0002', 'Task not found', 'missing task refused');
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e75ff')$$, 'P0002', 'Cycle not found', 'missing cycle refused');
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7052')$$, 'P0002', 'Cycle not found', 'deleted cycle refused');
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7053')$$, '42501', 'Task and cycle must belong to the same workspace', 'foreign cycle refused');
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7042', '00000000-0000-4000-8000-0000000e7050')$$, '42501', 'Task and cycle must belong to the same workspace', 'listless task refused');
select lives_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7050')$$, 'same-workspace assignment succeeds');
select is((select count(*)::int from public.task_cycle_tasks where task_id = '00000000-0000-4000-8000-0000000e7040'), 1, 'assignment creates exactly one link');
select lives_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7050')$$, 'repeated assignment succeeds');
select is((select count(*)::int from public.task_cycle_tasks where task_id = '00000000-0000-4000-8000-0000000e7040'), 1, 'repeated assignment retains exactly one link');
select lives_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7051')$$, 'moving to another local cycle succeeds');
select results_eq($$select cycle_id from public.task_cycle_tasks where task_id = '00000000-0000-4000-8000-0000000e7040'$$, $$values ('00000000-0000-4000-8000-0000000e7051'::uuid)$$, 'move replaces the old cycle exactly');
select lives_ok($$insert into public.task_cycle_tasks (task_id, cycle_id) values
  ('00000000-0000-4000-8000-0000000e7041', '00000000-0000-4000-8000-0000000e7050'),
  ('00000000-0000-4000-8000-0000000e7041', '00000000-0000-4000-8000-0000000e7051'),
  ('00000000-0000-4000-8000-0000000e7041', '00000000-0000-4000-8000-0000000e7052')$$, 'historical duplicate and deleted-cycle links are tolerated');
select lives_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7041', '00000000-0000-4000-8000-0000000e7050')$$, 'assignment handles historical duplicates');
select results_eq($$select cycle_id from public.task_cycle_tasks where task_id = '00000000-0000-4000-8000-0000000e7041'$$, $$values ('00000000-0000-4000-8000-0000000e7050'::uuid)$$, 'assignment replaces every duplicate including deleted-cycle link');
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7053')$$, '42501', 'Task and cycle must belong to the same workspace', 'foreign reassign remains refused');
select results_eq($$select cycle_id from public.task_cycle_tasks where task_id = '00000000-0000-4000-8000-0000000e7040'$$, $$values ('00000000-0000-4000-8000-0000000e7051'::uuid)$$, 'refused assignment preserves the existing link');
set local role authenticated;
select throws_ok($$select public.assign_task_cycle('00000000-0000-4000-8000-0000000e7040', '00000000-0000-4000-8000-0000000e7050')$$, '42501', null, 'end-user execution is denied');
reset role;
select * from finish();
rollback;
