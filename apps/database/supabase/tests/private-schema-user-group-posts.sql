begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(32);

create temporary table migrated_relations(table_name text primary key)
on commit drop;

insert into migrated_relations(table_name)
values
  ('user_group_post_checks'),
  ('user_group_post_logs'),
  ('user_group_posts');

create temporary table migrated_rpcs(function_name text primary key)
on commit drop;

insert into migrated_rpcs(function_name)
values
  ('get_user_group_post_recipient_rows'),
  ('get_user_group_post_status_summary'),
  ('get_workspace_post_email_rows'),
  ('get_workspace_post_email_status_summary'),
  ('get_workspace_post_review_base_rows'),
  ('get_workspace_post_review_filter_options'),
  ('get_workspace_post_review_rows'),
  ('get_workspace_post_review_summary'),
  ('reconcile_orphaned_approved_post_email_queue');

create temporary table computed_relationships(function_identity text primary key)
on commit drop;

insert into computed_relationships(function_identity)
values
  ('private.workspace_user_groups(private.user_group_posts)'),
  ('private.workspace_users(private.user_group_post_checks)'),
  ('private.workspace_users(private.user_group_posts)');

select ok(
  not exists (
    select 1
    from migrated_relations migrated
    join pg_class cls
      on cls.relname = migrated.table_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relkind in ('r', 'p')
  ),
  'migrated user-group post base tables are absent from public'
);

select is(
  (
    select count(*)::int
    from migrated_relations migrated
    join pg_class cls
      on cls.relname = migrated.table_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'private'
      and cls.relkind in ('r', 'p')
  ),
  3,
  'migrated user-group post base tables exist in private'
);

select ok(
  to_regclass('public.posts_dashboard_view') is null,
  'posts dashboard materialized view is absent from public'
);

select ok(
  to_regclass('private.posts_dashboard_view') is not null,
  'posts dashboard materialized view exists in private'
);

select is(
  (
    select count(*)::int
    from migrated_relations migrated
    join pg_class cls
      on cls.relname = migrated.table_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'private'
      and cls.relrowsecurity
  ),
  3,
  'migrated private tables keep RLS enabled'
);

select is(
  (
    select count(*)::int
    from pg_policies policies
    join migrated_relations migrated
      on migrated.table_name = policies.tablename
    where policies.schemaname = 'private'
      and policies.roles = array['service_role'::name]
      and policies.cmd = 'ALL'
  ),
  3,
  'migrated private tables only expose service-role RLS policies'
);

select ok(
  not exists (
    select 1
    from migrated_relations migrated
    join pg_class cls
      on cls.relname = migrated.table_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where ns.nspname = 'private'
      and has_table_privilege(
        roles.role_name,
        format('private.%I', migrated.table_name),
        privileges.privilege_name
      )
  ),
  'anon and authenticated have no direct CRUD privileges on migrated private tables'
);

select ok(
  not exists (
    select 1
    from migrated_relations migrated
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', migrated.table_name),
      privileges.privilege_name
    )
  ),
  'service role keeps CRUD privileges on migrated private tables'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'user_group_post_checks_post_id_fkey'
      and constraint_row.conrelid = 'private.user_group_post_checks'::regclass
      and constraint_row.confrelid = 'private.user_group_posts'::regclass
  ),
  'post checks reference private user group posts'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'user_group_post_logs_post_id_fkey'
      and constraint_row.conrelid = 'private.user_group_post_logs'::regclass
      and constraint_row.confrelid = 'private.user_group_posts'::regclass
  ),
  'post logs reference private user group posts'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'post_email_queue_post_id_fkey'
      and constraint_row.conrelid = 'public.post_email_queue'::regclass
      and constraint_row.confrelid = 'private.user_group_posts'::regclass
  ),
  'post email queue references private user group posts'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'sent_emails_post_id_fkey'
      and constraint_row.conrelid = 'public.sent_emails'::regclass
      and constraint_row.confrelid = 'private.user_group_posts'::regclass
  ),
  'sent emails reference private user group posts'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.user_group_posts'::regclass
      and trigger_row.tgname = 'trg_post_approval'
  ),
  'private',
  'post approval trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.user_group_posts'::regclass
      and trigger_row.tgname = 'trg_post_change_log'
  ),
  'private',
  'post change log trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.user_group_posts'::regclass
      and trigger_row.tgname = 'trg_notify_post_approval'
  ),
  'private',
  'post approval notification trigger executes private helper'
);

select is(
  (
    select count(*)::int
    from pg_proc proc_row
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    where proc_ns.nspname = 'private'
      and proc_row.prokind = 'f'
      and proc_row.proname in (
        'get_post_workspace_id',
        'handle_post_approval',
        'log_post_change',
        'notify_post_approval_change'
      )
  ),
  4,
  'trigger helper functions exist in private'
);

select ok(
  not exists (
    select 1
    from pg_proc proc_row
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    where proc_ns.nspname = 'public'
      and proc_row.prokind = 'f'
      and proc_row.proname in (
        'get_post_workspace_id',
        'handle_post_approval',
        'log_post_change',
        'notify_post_approval_change'
      )
  ),
  'trigger helper functions are absent from public'
);

select is(
  (
    select count(distinct proc_row.proname)::int
    from migrated_rpcs migrated
    join pg_proc proc_row
      on proc_row.proname = migrated.function_name
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    where proc_ns.nspname = 'private'
      and proc_row.prokind = 'f'
  ),
  9,
  'post review and email queue RPCs exist in private'
);

select ok(
  not exists (
    select 1
    from migrated_rpcs migrated
    join pg_proc proc_row
      on proc_row.proname = migrated.function_name
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    where proc_ns.nspname = 'public'
      and proc_row.prokind = 'f'
  ),
  'post review and email queue RPCs are absent from public'
);

select ok(
  not exists (
    select 1
    from migrated_rpcs migrated
    join pg_proc proc_row
      on proc_row.proname = migrated.function_name
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    where proc_ns.nspname = 'private'
      and proc_row.prokind = 'f'
      and proc_row.prosrc ~
        'public\.(user_group_posts|user_group_post_checks|user_group_post_logs)'
  ),
  'private post RPC definitions do not directly reference migrated public tables'
);

select ok(
  (
    select proc_row.prosrc like '%join private.user_group_posts post_record%'
    from pg_proc proc_row
    where proc_row.oid =
      'private.user_group_activity_feed(uuid,timestamptz,timestamptz)'::regprocedure
  ),
  'user-group activity feed resolves post records from private schema'
);

select ok(
  (
    select proc_row.prosrc like '%''user_group_posts''%'
      and proc_row.prosrc like '%''user_group_post_logs''%'
      and proc_row.prosrc like '%''user_group_post_checks''%'
    from pg_proc proc_row
    where proc_row.oid =
      'private.user_group_activity_feed(uuid,timestamptz,timestamptz)'::regprocedure
  ),
  'user-group activity feed includes migrated private audit tables'
);

select ok(
  not exists (
    select 1
    from pg_proc proc_row
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    where proc_ns.nspname = 'public'
      and proc_row.prokind = 'f'
      and proc_row.proname in (
        'merge_workspace_users',
        'merge_workspace_users_phase1',
        'merge_workspace_users_phase1d',
        'merge_workspace_users_phase1d_batch',
        'merge_workspace_users_phase2',
        'update_workspace_configs_with_approval_transitions'
      )
      and coalesce(array_to_string(proc_row.proconfig, ','), '') not like '%private%'
  ),
  'public merge and approval-config helpers include private in search_path'
);

select ok(
  to_regprocedure('private.refresh_posts_dashboard_view()') is not null,
  'private refresh_posts_dashboard_view helper exists'
);

select ok(
  to_regprocedure('public.refresh_posts_dashboard_view()') is null,
  'public refresh_posts_dashboard_view helper is absent'
);

select ok(
  not exists (
    select 1
    from computed_relationships relationship
    where to_regprocedure(relationship.function_identity) is null
  ),
  'private computed relationships bridge user-group posts to public parents'
);

select ok(
  not exists (
    select 1
    from computed_relationships relationship
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_function_privilege(
      roles.role_name,
      to_regprocedure(relationship.function_identity),
      'execute'
    )
  ),
  'private computed relationships are not executable by anon/authenticated'
);

select ok(
  not exists (
    select 1
    from computed_relationships relationship
    where not has_function_privilege(
      'service_role',
      to_regprocedure(relationship.function_identity),
      'execute'
    )
  ),
  'service role can execute private computed relationships'
);

select ok(
  not has_table_privilege('anon', 'private.posts_dashboard_view', 'select')
  and not has_table_privilege(
    'authenticated',
    'private.posts_dashboard_view',
    'select'
  ),
  'private posts dashboard materialized view is not selectable by anon/authenticated'
);

select ok(
  has_table_privilege('service_role', 'private.posts_dashboard_view', 'select'),
  'service role can select private posts dashboard materialized view'
);

select ok(
  not exists (
    select 1
    from migrated_rpcs migrated
    join pg_proc proc_row
      on proc_row.proname = migrated.function_name
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where proc_ns.nspname = 'private'
      and proc_row.prokind = 'f'
      and has_function_privilege(
        roles.role_name,
        proc_row.oid,
        'execute'
      )
  ),
  'private post RPCs are not executable by anon/authenticated'
);

select ok(
  not exists (
    select 1
    from migrated_rpcs migrated
    join pg_proc proc_row
      on proc_row.proname = migrated.function_name
    join pg_namespace proc_ns
      on proc_ns.oid = proc_row.pronamespace
    where proc_ns.nspname = 'private'
      and proc_row.prokind = 'f'
      and not has_function_privilege('service_role', proc_row.oid, 'execute')
  ),
  'service role can execute private post RPCs'
);

select * from finish();

rollback;
