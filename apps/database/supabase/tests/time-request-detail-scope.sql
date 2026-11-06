begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);
set local session_replication_role = replica;
insert into public.users (id, display_name) values ('00000000-0000-4000-8000-00000000a3b0', 'Request scope fixture');
insert into public.workspaces (id, name, creator_id, personal) values
 ('00000000-0000-4000-8000-00000000b3b1', 'Request workspace', '00000000-0000-4000-8000-00000000a3b0', false),
 ('00000000-0000-4000-8000-00000000b3b2', 'Other workspace', '00000000-0000-4000-8000-00000000a3b0', false);
insert into public.workspace_boards (id, ws_id, name) values
 ('00000000-0000-4000-8000-00000000c3b1', '00000000-0000-4000-8000-00000000b3b1', 'Request board'),
 ('00000000-0000-4000-8000-00000000c3b2', '00000000-0000-4000-8000-00000000b3b2', 'Other board');
insert into public.task_lists (id, board_id, name) values
 ('00000000-0000-4000-8000-00000000d3b1', '00000000-0000-4000-8000-00000000c3b1', 'Request list'),
 ('00000000-0000-4000-8000-00000000d3b2', '00000000-0000-4000-8000-00000000c3b2', 'Other list');
insert into public.tasks (id, list_id, board_id, name) values
 ('00000000-0000-4000-8000-00000000e3b1', '00000000-0000-4000-8000-00000000d3b1', null, 'Own task'),
 ('00000000-0000-4000-8000-00000000e3b2', '00000000-0000-4000-8000-00000000d3b2', null, 'Other task'),
 ('00000000-0000-4000-8000-00000000e3b3', null, '00000000-0000-4000-8000-00000000c3b1', 'Own board-only task'),
 ('00000000-0000-4000-8000-00000000e3b4', null, '00000000-0000-4000-8000-00000000c3b2', 'Other board-only task'),
 ('00000000-0000-4000-8000-00000000e3b5', '00000000-0000-4000-8000-00000000d3b1', '00000000-0000-4000-8000-00000000c3b2', 'Mixed parents');
insert into public.time_tracking_categories (id, ws_id, name) values
 ('00000000-0000-4000-8000-00000000f3b1', '00000000-0000-4000-8000-00000000b3b1', 'Own category'),
 ('00000000-0000-4000-8000-00000000f3b2', '00000000-0000-4000-8000-00000000b3b2', 'Other category');
insert into private.time_tracking_requests (id, workspace_id, user_id, task_id, category_id, title, start_time, end_time)
select ('00000000-0000-4000-8000-0000000013b' || n)::uuid,
 '00000000-0000-4000-8000-00000000b3b1', '00000000-0000-4000-8000-00000000a3b0',
 ('00000000-0000-4000-8000-00000000e3b' || n)::uuid,
 case when n = 2 then '00000000-0000-4000-8000-00000000f3b2'::uuid else '00000000-0000-4000-8000-00000000f3b1'::uuid end,
 'Scoped request', '2026-01-01 08:00Z', '2026-01-01 09:00Z'
from generate_series(1,5) n;
set local session_replication_role = origin;
set local role service_role;
select is((select task->>'name' from private.time_tracking_requests_with_details where id='00000000-0000-4000-8000-0000000013b1'), 'Own task', 'same-workspace list task stays readable');
select is((select task from private.time_tracking_requests_with_details where id='00000000-0000-4000-8000-0000000013b2'), null::jsonb, 'foreign list task is not projected');
select is((select category from private.time_tracking_requests_with_details where id='00000000-0000-4000-8000-0000000013b2'), null::jsonb, 'foreign category is not projected');
select is((select category->>'name' from private.time_tracking_requests_with_details where id='00000000-0000-4000-8000-0000000013b1'), 'Own category', 'same-workspace category stays readable');
select is((select task->>'name' from private.time_tracking_requests_with_details where id='00000000-0000-4000-8000-0000000013b3'), 'Own board-only task', 'same-workspace board-only task stays readable');
select is((select task from private.time_tracking_requests_with_details where id='00000000-0000-4000-8000-0000000013b4'), null::jsonb, 'foreign board-only task is not projected');
select is((select task from private.time_tracking_requests_with_details where id='00000000-0000-4000-8000-0000000013b5'), null::jsonb, 'direct board ownership takes precedence over a list');
reset role;
select ok(not has_table_privilege('anon', 'private.time_tracking_requests_with_details', 'select'), 'anon cannot read request details');
select ok(not has_table_privilege('authenticated', 'private.time_tracking_requests_with_details', 'select'), 'authenticated cannot bypass request routes');
select * from finish();
rollback;
