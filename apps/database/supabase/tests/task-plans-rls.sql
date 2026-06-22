begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select has_table('public', 'task_plans', 'task plans table exists');
select has_table('public', 'task_plan_workspaces', 'task plan workspaces table exists');
select has_table('public', 'task_plan_items', 'task plan items table exists');
select has_table('public', 'task_plan_shares', 'task plan shares table exists');
select has_function('public', 'can_access_task_plan', array['uuid', 'text', 'uuid'], 'access helper exists');
select has_function('public', 'is_task_plan_intended_workspace', array['uuid', 'uuid'], 'intended workspace helper exists');

select ok(
  has_table_privilege('authenticated', 'public.task_plans', 'select')
  and has_table_privilege('authenticated', 'public.task_plan_items', 'insert')
  and has_table_privilege('authenticated', 'public.task_plan_shares', 'delete'),
  'authenticated role can reach task plan tables through RLS'
);

insert into public.user_private_details (user_id, email)
values
  ('00000000-0000-0000-0000-000000000004', 'plan-email@example.com'),
  ('00000000-0000-0000-0000-000000000005', 'plan-stranger@example.com')
on conflict (user_id) do update set email = excluded.email;

insert into public.workspaces (id, name, creator_id, personal)
values
  ('00000000-0000-4000-8000-00000000b101', 'Owner Plan Workspace', '00000000-0000-0000-0000-000000000001', false),
  ('00000000-0000-4000-8000-00000000b102', 'Team Plan Workspace', '00000000-0000-0000-0000-000000000001', false),
  ('00000000-0000-4000-8000-00000000b103', 'Non Intended Workspace', '00000000-0000-0000-0000-000000000001', false)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-4000-8000-00000000b101', '00000000-0000-0000-0000-000000000001', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000b102', '00000000-0000-0000-0000-000000000001', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000b102', '00000000-0000-0000-0000-000000000002', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000b103', '00000000-0000-0000-0000-000000000001', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.task_plans (
  id,
  owner_id,
  personal_ws_id,
  title,
  period_type,
  period_start,
  period_end
)
values (
  '00000000-0000-4000-8000-00000000c101',
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-4000-8000-00000000b101',
  'RLS plan',
  'week',
  '2026-06-22',
  '2026-06-28'
);

insert into public.task_plan_workspaces (plan_id, ws_id, added_by_user_id)
values
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000b101', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000b102', '00000000-0000-0000-0000-000000000001');

insert into public.task_plan_shares (
  id,
  plan_id,
  shared_with_ws_id,
  shared_with_user_id,
  shared_with_email,
  permission,
  shared_by_user_id
)
values
  ('00000000-0000-4000-8000-00000000d101', '00000000-0000-4000-8000-00000000c101', '00000000-0000-4000-8000-00000000b102', null, null, 'view', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-4000-8000-00000000d102', '00000000-0000-4000-8000-00000000c101', null, '00000000-0000-0000-0000-000000000003', null, 'edit', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-4000-8000-00000000d103', '00000000-0000-4000-8000-00000000c101', null, null, 'plan-email@example.com', 'view', '00000000-0000-0000-0000-000000000001');

select ok(
  public.can_access_task_plan('00000000-0000-4000-8000-00000000c101', 'edit', '00000000-0000-0000-0000-000000000001'),
  'owner can edit plan'
);

select ok(
  public.can_access_task_plan('00000000-0000-4000-8000-00000000c101', 'view', '00000000-0000-0000-0000-000000000002'),
  'intended workspace member can view workspace-shared plan'
);

select ok(
  public.can_access_task_plan('00000000-0000-4000-8000-00000000c101', 'edit', '00000000-0000-0000-0000-000000000003'),
  'direct user share can edit when granted edit'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select throws_ok(
  $$update public.task_plans
      set owner_id = '00000000-0000-0000-0000-000000000003'
    where id = '00000000-0000-4000-8000-00000000c101'$$,
  '42501',
  'task plan owner cannot be changed',
  'editor cannot take ownership of a shared task plan through direct RLS update'
);

reset role;

select ok(
  public.can_access_task_plan('00000000-0000-4000-8000-00000000c101', 'view', '00000000-0000-0000-0000-000000000004'),
  'email share can view matching user email'
);

select ok(
  not public.can_access_task_plan('00000000-0000-4000-8000-00000000c101', 'view', '00000000-0000-0000-0000-000000000005'),
  'unshared user cannot view plan'
);

delete from public.task_plan_shares
where id = '00000000-0000-4000-8000-00000000d102';

select ok(
  not public.can_access_task_plan('00000000-0000-4000-8000-00000000c101', 'view', '00000000-0000-0000-0000-000000000003'),
  'revoked direct share loses access'
);

delete from public.workspace_members
where ws_id = '00000000-0000-4000-8000-00000000b102'
  and user_id = '00000000-0000-0000-0000-000000000002';

select ok(
  not public.can_access_task_plan('00000000-0000-4000-8000-00000000c101', 'view', '00000000-0000-0000-0000-000000000002'),
  'workspace share access is lost when membership is removed'
);

select ok(
  not public.is_task_plan_intended_workspace(
    '00000000-0000-4000-8000-00000000c101',
    '00000000-0000-4000-8000-00000000b103'
  ),
  'non-intended workspace is not treated as intended'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select lives_ok(
  format($$insert into public.task_plans (
      id,
      owner_id,
      personal_ws_id,
      title,
      period_type,
      period_start,
      period_end
    )
    values (
      '00000000-0000-4000-8000-00000000c102',
      '00000000-0000-0000-0000-000000000001',
      %L,
      'RLS insert returning plan',
      'week',
      '2026-06-22',
      '2026-06-28'
    )
    returning id$$, (
      select w.id
      from public.workspaces w
      join public.workspace_members wm on wm.ws_id = w.id
      where w.personal = true
        and wm.user_id = '00000000-0000-0000-0000-000000000001'
      limit 1
    )),
  'owner can insert and return a personal task plan through RLS'
);

select throws_ok(
  $$insert into public.task_plan_shares (
      plan_id,
      shared_with_ws_id,
      permission,
      shared_by_user_id
    )
    values (
      '00000000-0000-4000-8000-00000000c101',
      '00000000-0000-4000-8000-00000000b103',
      'view',
      '00000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  'new row violates row-level security policy for table "task_plan_shares"',
  'owner cannot share a plan with a non-intended workspace'
);

reset role;

select * from finish();

rollback;
