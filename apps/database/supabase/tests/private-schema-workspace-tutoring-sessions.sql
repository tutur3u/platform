begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(29);

select ok(
  to_regclass('public.workspace_tutoring_sessions') is null,
  'workspace tutoring sessions are no longer in the public schema'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions') is not null,
  'workspace tutoring sessions exist in the private schema'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use the private schema'
);

select ok(
  not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated cannot use the private schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      'private.workspace_tutoring_sessions',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private tutoring sessions'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      'private.workspace_tutoring_sessions',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private tutoring sessions'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      'private.workspace_tutoring_sessions',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private tutoring sessions'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_tutoring_sessions'::regclass
  ),
  'private tutoring sessions have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_tutoring_sessions'
      and policyname = 'Service role can manage private tutoring sessions'
  ),
  'private tutoring sessions have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_tutoring_sessions'
      and policyname in (
        'Allow workspace members to view tutoring sessions',
        'Allow workspace members to manage tutoring sessions'
      )
  ),
  'old public tutoring session policies were removed'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_tutoring_sessions'
      and (
        'authenticated' = any (roles)
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private tutoring sessions have no direct anon/authenticated/public policy'
);

select ok(
  to_regprocedure('public.enforce_workspace_tutoring_session_scope()') is not null,
  'workspace tutoring sessions keep same-workspace scope guard function'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_tutoring_sessions'::regclass
      and tgname = 'workspace_tutoring_sessions_scope_guard'
      and not tgisinternal
  ),
  'private tutoring sessions keep same-workspace scope guard trigger'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_tutoring_sessions'::regclass
      and tgname = 'workspace_tutoring_sessions_updated_at'
      and not tgisinternal
  ),
  'private tutoring sessions keep updated_at trigger'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_tutoring_sessions_ws_id_fkey'
      and conrelid = 'private.workspace_tutoring_sessions'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'private tutoring sessions still reference public workspaces'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_tutoring_sessions_group_id_fkey'
      and conrelid = 'private.workspace_tutoring_sessions'::regclass
      and confrelid = 'public.workspace_user_groups'::regclass
  ),
  'private tutoring sessions still reference public workspace user groups'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_tutoring_sessions_student_user_id_fkey'
      and conrelid = 'private.workspace_tutoring_sessions'::regclass
      and confrelid = 'public.workspace_users'::regclass
  ),
  'private tutoring sessions still reference public student workspace users'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_tutoring_sessions_teacher_user_id_fkey'
      and conrelid = 'private.workspace_tutoring_sessions'::regclass
      and confrelid = 'public.workspace_users'::regclass
  ),
  'private tutoring sessions still reference public teacher workspace users'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_tutoring_sessions_source_feedback_id_fkey'
      and conrelid = 'private.workspace_tutoring_sessions'::regclass
      and confrelid = 'public.user_feedbacks'::regclass
  ),
  'private tutoring sessions still reference public feedback rows'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_tutoring_sessions_created_by_fkey'
      and conrelid = 'private.workspace_tutoring_sessions'::regclass
      and confrelid = 'public.users'::regclass
  ),
  'private tutoring sessions still reference public users for creators'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions_pkey') is not null,
  'workspace tutoring sessions primary-key index moved with the private table'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions_ws_id_session_date_idx') is not null,
  'workspace tutoring sessions date index moved with the private table'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions_ws_id_teacher_date_idx') is not null,
  'workspace tutoring sessions teacher index moved with the private table'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions_ws_id_group_date_idx') is not null,
  'workspace tutoring sessions group index moved with the private table'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions_ws_id_student_date_idx') is not null,
  'workspace tutoring sessions student index moved with the private table'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions_ws_id_status_date_idx') is not null,
  'workspace tutoring sessions status index moved with the private table'
);

select ok(
  to_regclass('private.workspace_tutoring_sessions_source_feedback_id_idx') is not null,
  'workspace tutoring sessions source-feedback index moved with the private table'
);

select ok(
  exists (
    select 1
    from public.workspace_users
    where ws_id = '00000000-0000-0000-0000-000000000000'
  ),
  'root workspace user fixture exists for private tutoring session inserts'
);

set local role service_role;

insert into public.workspace_user_groups (
  id,
  ws_id,
  name
) values (
  '10000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000000',
  'pgTAP private tutoring group'
);

insert into private.workspace_tutoring_sessions (
  id,
  ws_id,
  group_id,
  student_user_id,
  session_date,
  start_time,
  duration_minutes,
  reason_type,
  reason_detail,
  content,
  attendance_status,
  created_by
)
select
  '10000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000401',
  workspace_users.id,
  current_date,
  '09:00'::time,
  45,
  'CUSTOM',
  'pgTAP',
  'private tutoring session insert',
  'PENDING',
  '00000000-0000-0000-0000-000000000001'
from public.workspace_users
where workspace_users.ws_id = '00000000-0000-0000-0000-000000000000'
order by workspace_users.email
limit 1;

reset role;

select ok(
  exists (
    select 1
    from private.workspace_tutoring_sessions
    where id = '10000000-0000-0000-0000-000000000402'
      and ws_id = '00000000-0000-0000-0000-000000000000'
  ),
  'service role can insert private tutoring sessions'
);

select * from finish();

rollback;
