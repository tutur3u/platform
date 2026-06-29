begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(22);

select has_table('public', 'task_templates', 'task templates table exists');
select has_type('public', 'task_template_visibility', 'task template visibility enum exists');
select has_column('public', 'task_templates', 'slug', 'task templates store a lookup slug');
select has_column('public', 'task_templates', 'visibility', 'task templates store visibility');
select has_column('public', 'task_templates', 'label_ids', 'task templates store label defaults');
select has_column('public', 'task_templates', 'assignee_ids', 'task templates store assignee defaults');
select has_column('public', 'task_templates', 'project_ids', 'task templates store project defaults');

select ok(
  has_table_privilege('authenticated', 'public.task_templates', 'select')
  and has_table_privilege('authenticated', 'public.task_templates', 'insert')
  and has_table_privilege('authenticated', 'public.task_templates', 'update')
  and has_table_privilege('authenticated', 'public.task_templates', 'delete'),
  'authenticated role can reach task templates through RLS'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_templates'
      and policyname = 'task_templates_select_accessible'
  ),
  'task templates expose an accessible select policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'task_templates'
      and policyname = 'task_templates_update_owner'
  ),
  'task templates restrict updates to owners'
);

insert into public.workspaces (id, name, creator_id, personal)
values
  ('00000000-0000-4000-8000-00000000f101', 'Task Template Workspace', '00000000-0000-0000-0000-000000000001', false),
  ('00000000-0000-4000-8000-00000000f102', 'Task Template Other Workspace', '00000000-0000-0000-0000-000000000001', false)
on conflict (id) do nothing;

insert into public.workspace_members (ws_id, user_id, type)
values
  ('00000000-0000-4000-8000-00000000f101', '00000000-0000-0000-0000-000000000001', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000f101', '00000000-0000-0000-0000-000000000002', 'MEMBER'),
  ('00000000-0000-4000-8000-00000000f102', '00000000-0000-0000-0000-000000000001', 'MEMBER')
on conflict (ws_id, user_id) do update set type = excluded.type;

insert into public.workspace_boards (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000f201', '00000000-0000-4000-8000-00000000f101', 'Template Board', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-4000-8000-00000000f202', '00000000-0000-4000-8000-00000000f102', 'Other Template Board', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.task_lists (id, name, board_id, creator_id)
values
  ('00000000-0000-4000-8000-00000000f301', 'Todo', '00000000-0000-4000-8000-00000000f201', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-4000-8000-00000000f302', 'Other', '00000000-0000-4000-8000-00000000f202', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.workspace_task_labels (id, ws_id, name, color, creator_id)
values
  ('00000000-0000-4000-8000-00000000f401', '00000000-0000-4000-8000-00000000f101', 'Bug', '#dc2626', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.task_projects (id, ws_id, name, creator_id)
values
  ('00000000-0000-4000-8000-00000000f501', '00000000-0000-4000-8000-00000000f101', 'Release', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$insert into public.task_templates (
      id,
      ws_id,
      created_by,
      default_board_id,
      default_list_id,
      slug,
      name,
      task_name,
      description,
      visibility,
      priority,
      estimation_points,
      label_ids,
      assignee_ids,
      project_ids
    )
    values (
      '00000000-0000-4000-8000-00000000f601',
      '00000000-0000-4000-8000-00000000f101',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-4000-8000-00000000f201',
      '00000000-0000-4000-8000-00000000f301',
      ' Bug Report ',
      ' Bug Report ',
      ' Investigate Bug ',
      'Reproduce and document the issue.',
      'private',
      'high',
      3,
      array['00000000-0000-4000-8000-00000000f401']::uuid[],
      array['00000000-0000-0000-0000-000000000002']::uuid[],
      array['00000000-0000-4000-8000-00000000f501']::uuid[]
    )$$,
  'workspace member can insert a private template with task metadata'
);

select is(
  (
    select slug || ':' || name || ':' || task_name
    from public.task_templates
    where id = '00000000-0000-4000-8000-00000000f601'
  ),
  'bug report:Bug Report:Investigate Bug',
  'task template trigger trims names and normalizes slug casing'
);

select throws_ok(
  $$insert into public.task_templates (
      ws_id,
      created_by,
      slug,
      name,
      task_name,
      visibility
    )
    values (
      '00000000-0000-4000-8000-00000000f101',
      '00000000-0000-0000-0000-000000000001',
      'BUG REPORT',
      'Duplicate',
      'Duplicate',
      'private'
    )$$,
  '23505',
  null,
  'active private template keys are unique per owner and workspace'
);

update public.task_templates
set archived_at = now()
where id = '00000000-0000-4000-8000-00000000f601';

select lives_ok(
  $$insert into public.task_templates (
      id,
      ws_id,
      created_by,
      slug,
      name,
      task_name,
      visibility
    )
    values (
      '00000000-0000-4000-8000-00000000f602',
      '00000000-0000-4000-8000-00000000f101',
      '00000000-0000-0000-0000-000000000001',
      'bug report',
      'Bug Report Recreated',
      'Investigate Bug Again',
      'private'
    )$$,
  'archived templates do not block slug reuse'
);

select throws_ok(
  $$insert into public.task_templates (
      ws_id,
      created_by,
      slug,
      name,
      task_name,
      visibility,
      estimation_points
    )
    values (
      '00000000-0000-4000-8000-00000000f101',
      '00000000-0000-0000-0000-000000000001',
      'bad-estimate',
      'Bad Estimate',
      'Bad Estimate',
      'private',
      9
    )$$,
  '23514',
  null,
  'task template estimates must stay within supported task bounds'
);

select throws_ok(
  $$insert into public.task_templates (
      ws_id,
      created_by,
      default_list_id,
      slug,
      name,
      task_name,
      visibility
    )
    values (
      '00000000-0000-4000-8000-00000000f101',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-4000-8000-00000000f302',
      'wrong-list',
      'Wrong List',
      'Wrong List',
      'private'
    )$$,
  null,
  'task_templates.default_list_id must belong to the template workspace',
  'default lists must belong to the template workspace'
);

select throws_ok(
  $$insert into public.task_templates (
      ws_id,
      created_by,
      slug,
      name,
      task_name,
      visibility,
      assignee_ids
    )
    values (
      '00000000-0000-4000-8000-00000000f102',
      '00000000-0000-0000-0000-000000000001',
      'wrong-assignee',
      'Wrong Assignee',
      'Wrong Assignee',
      'private',
      array['00000000-0000-0000-0000-000000000002']::uuid[]
    )$$,
  null,
  'task_templates.assignee_ids contains 1 invalid member id(s)',
  'assignees must be workspace members'
);

insert into public.task_templates (
  id,
  ws_id,
  created_by,
  slug,
  name,
  task_name,
  visibility
)
values (
  '00000000-0000-4000-8000-00000000f603',
  '00000000-0000-4000-8000-00000000f101',
  '00000000-0000-0000-0000-000000000001',
  'workspace-visible',
  'Workspace Visible',
  'Workspace Visible Task',
  'workspace'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);

select is(
  (
    select count(*)::int
    from public.task_templates
    where id = '00000000-0000-4000-8000-00000000f603'
  ),
  1,
  'workspace members can read workspace-visible templates'
);

select is(
  (
    select count(*)::int
    from public.task_templates
    where id = '00000000-0000-4000-8000-00000000f602'
  ),
  0,
  'workspace members cannot read another owner private template'
);

update public.task_templates
set name = 'Taken'
where id = '00000000-0000-4000-8000-00000000f603';

select is(
  (
    select name
    from public.task_templates
    where id = '00000000-0000-4000-8000-00000000f603'
  ),
  'Workspace Visible',
  'non-owner members cannot update workspace-visible templates through RLS'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);

select is(
  (
    select count(*)::int
    from public.task_templates
    where id = '00000000-0000-4000-8000-00000000f603'
  ),
  0,
  'non-members cannot read workspace templates'
);

select throws_ok(
  $$insert into public.task_templates (
      ws_id,
      created_by,
      slug,
      name,
      task_name,
      visibility
    )
    values (
      '00000000-0000-4000-8000-00000000f101',
      '00000000-0000-0000-0000-000000000003',
      'non-member',
      'Non Member',
      'Non Member',
      'private'
    )$$,
  '42501',
  'new row violates row-level security policy for table "task_templates"',
  'non-members cannot create workspace task templates'
);

reset role;

select * from finish();

rollback;
