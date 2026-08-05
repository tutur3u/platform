begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
set local role service_role;
select plan(8);

insert into public.users (id, display_name) values
  ('00000000-0000-4000-8000-00000000c001', 'Capacity Tester')
on conflict (id) do nothing;
insert into public.workspaces (id, name, creator_id, personal) values
  ('00000000-0000-4000-8000-00000000c002', 'Capacity Workspace', '00000000-0000-4000-8000-00000000c001', false)
on conflict (id) do nothing;
insert into public.workspace_boards (id, ws_id, name, creator_id) values
  ('00000000-0000-4000-8000-00000000c003', '00000000-0000-4000-8000-00000000c002', 'Capacity Board', '00000000-0000-4000-8000-00000000c001')
on conflict (id) do nothing;
insert into public.workspace_task_labels (id, ws_id, name, color, creator_id) values
  ('00000000-0000-4000-8000-00000000c006', '00000000-0000-4000-8000-00000000c002', 'Funded', 'GREEN', '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000c007', '00000000-0000-4000-8000-00000000c002', 'Illustration', 'BLUE', '00000000-0000-4000-8000-00000000c001')
on conflict (id) do nothing;
insert into public.tasks (id, name, list_id, board_id, estimation_points, creator_id) values
  ('00000000-0000-4000-8000-00000000c011', 'Funded one', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-00000000c003' and status = 'active' limit 1), '00000000-0000-4000-8000-00000000c003', 3, '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000c012', 'Funded two', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-00000000c003' and status = 'active' limit 1), '00000000-0000-4000-8000-00000000c003', null, '00000000-0000-4000-8000-00000000c001'),
  ('00000000-0000-4000-8000-00000000c013', 'Completed', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-00000000c003' and status = 'done' limit 1), '00000000-0000-4000-8000-00000000c003', 8, '00000000-0000-4000-8000-00000000c001');
insert into public.task_labels (task_id, label_id) values
  ('00000000-0000-4000-8000-00000000c011', '00000000-0000-4000-8000-00000000c006'),
  ('00000000-0000-4000-8000-00000000c011', '00000000-0000-4000-8000-00000000c007'),
  ('00000000-0000-4000-8000-00000000c012', '00000000-0000-4000-8000-00000000c006'),
  ('00000000-0000-4000-8000-00000000c013', '00000000-0000-4000-8000-00000000c006');

insert into public.task_capacity_rules (id, board_id, name, limit_value, metric, enforcement) values
  ('00000000-0000-4000-8000-00000000c021', '00000000-0000-4000-8000-00000000c003', 'Funded cards', 2, 'task_count', 'soft'),
  ('00000000-0000-4000-8000-00000000c022', '00000000-0000-4000-8000-00000000c003', 'Funded points', 3, 'estimation_points', 'soft');
insert into public.task_capacity_rule_lists (rule_id, list_id)
select rule_id, (select id from public.task_lists where board_id = '00000000-0000-4000-8000-00000000c003' and status = 'active' limit 1)
from (values ('00000000-0000-4000-8000-00000000c021'::uuid), ('00000000-0000-4000-8000-00000000c022'::uuid)) rules(rule_id);
insert into public.task_capacity_rule_labels values
  ('00000000-0000-4000-8000-00000000c021', '00000000-0000-4000-8000-00000000c006'),
  ('00000000-0000-4000-8000-00000000c022', '00000000-0000-4000-8000-00000000c006');

select is(private.task_capacity_rule_usage('00000000-0000-4000-8000-00000000c021'), 2, 'distinct matching tasks are counted once');
select is(private.task_capacity_rule_usage('00000000-0000-4000-8000-00000000c022'), 3, 'points sum and missing points contribute zero');
select ok(private.task_matches_capacity_rule('00000000-0000-4000-8000-00000000c021', '00000000-0000-4000-8000-00000000c011'), 'list and label dimensions combine with AND');
select isnt(private.task_capacity_rule_usage('00000000-0000-4000-8000-00000000c021'), 3, 'active mode excludes tasks in done lists');

update public.task_capacity_rules set counting_mode = 'all_non_deleted' where id = '00000000-0000-4000-8000-00000000c021';
select is(private.task_capacity_rule_usage('00000000-0000-4000-8000-00000000c021'), 2, 'list selector still excludes done tasks in all mode');

update public.task_capacity_rules set enforcement = 'hard', enabled = true, limit_value = 2, counting_mode = 'active' where id = '00000000-0000-4000-8000-00000000c021';
insert into public.tasks (id, name, list_id, board_id) values ('00000000-0000-4000-8000-00000000c014', 'Overflow', (select id from public.task_lists where board_id = '00000000-0000-4000-8000-00000000c003' and status = 'active' limit 1), '00000000-0000-4000-8000-00000000c003');
select throws_ok($$insert into public.task_labels (task_id, label_id) values ('00000000-0000-4000-8000-00000000c014', '00000000-0000-4000-8000-00000000c006')$$, 'P0001', 'TASK_CAPACITY_EXCEEDED', 'hard rule rejects a capacity-increasing label change');
select lives_ok($$update public.tasks set completed_at = now(), completed = true where id = '00000000-0000-4000-8000-00000000c011'$$, 'capacity-reducing changes remain allowed');
delete from public.task_capacity_rule_labels where rule_id = '00000000-0000-4000-8000-00000000c021';
select is((select enabled from public.task_capacity_rules where id = '00000000-0000-4000-8000-00000000c021'), false, 'removing a selector disables its rule');

select * from finish();
rollback;
