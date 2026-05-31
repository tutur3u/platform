begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(31);

create temporary table migrated_relations(table_name text primary key)
on commit drop;

insert into migrated_relations(table_name)
values
  ('time_tracking_request_activity'),
  ('time_tracking_request_comments'),
  ('time_tracking_requests');

create temporary table private_views(view_name text primary key)
on commit drop;

insert into private_views(view_name)
values
  ('time_tracking_request_activity_with_users'),
  ('time_tracking_request_comments_with_users'),
  ('time_tracking_requests_with_details');

create temporary table trigger_helpers(function_identity text primary key)
on commit drop;

insert into trigger_helpers(function_identity)
values
  ('private.can_view_request_comments(uuid,uuid)'),
  ('private.check_time_tracking_request_update()'),
  ('private.handle_request_status_change()'),
  ('private.log_time_tracking_comment_activity()'),
  ('private.log_time_tracking_request_creation()'),
  ('private.log_time_tracking_request_update()'),
  ('private.notify_time_tracking_request_status_change()'),
  ('private.notify_time_tracking_request_submitted()');

create temporary table private_rpcs(function_identity text primary key)
on commit drop;

insert into private_rpcs(function_identity)
values
  ('private.update_time_tracking_request(uuid,text,uuid,uuid,text,text)'),
  ('private.update_time_tracking_request_content(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text[])');

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
  'migrated time-tracking request base tables are absent from public'
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
  'migrated time-tracking request base tables exist in private'
);

select ok(
  to_regclass('public.time_tracking_request_activity_with_users') is null,
  'time-tracking request activity view is absent from public'
);

select is(
  (
    select count(*)::int
    from private_views views
    join pg_class cls
      on cls.relname = views.view_name
    join pg_namespace ns
      on ns.oid = cls.relnamespace
    where ns.nspname = 'private'
      and cls.relkind = 'v'
  ),
  3,
  'private time-tracking request read views exist'
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
    where constraint_row.conname = 'time_tracking_request_comments_request_id_fkey'
      and constraint_row.conrelid = 'private.time_tracking_request_comments'::regclass
      and constraint_row.confrelid = 'private.time_tracking_requests'::regclass
  ),
  'request comments reference private time-tracking requests'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'time_tracking_request_activity_request_id_fkey'
      and constraint_row.conrelid = 'private.time_tracking_request_activity'::regclass
      and constraint_row.confrelid = 'private.time_tracking_requests'::regclass
  ),
  'request activity references private time-tracking requests'
);

select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'time_tracking_request_activity_comment_id_fkey'
      and constraint_row.conrelid = 'private.time_tracking_request_activity'::regclass
      and constraint_row.confrelid = 'private.time_tracking_request_comments'::regclass
  ),
  'request activity references private request comments'
);

select ok(
  not exists (
    select 1
    from trigger_helpers helper
    where to_regprocedure(helper.function_identity) is null
  ),
  'private time-tracking request helper functions exist'
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
        'can_view_request_comments',
        'check_time_tracking_request_update',
        'handle_request_status_change',
        'log_time_tracking_comment_activity',
        'log_time_tracking_request_creation',
        'log_time_tracking_request_update',
        'notify_time_tracking_request_status_change',
        'notify_time_tracking_request_submitted'
      )
  ),
  'time-tracking request helper functions are absent from public'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.time_tracking_requests'::regclass
      and trigger_row.tgname = 'enforce_time_tracking_request_update'
  ),
  'private',
  'request update enforcement trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.time_tracking_requests'::regclass
      and trigger_row.tgname = 'trigger_handle_request_status_change'
  ),
  'private',
  'request status sync trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.time_tracking_requests'::regclass
      and trigger_row.tgname = 'trigger_log_request_creation'
  ),
  'private',
  'request creation activity trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.time_tracking_requests'::regclass
      and trigger_row.tgname = 'trigger_log_request_update'
  ),
  'private',
  'request update activity trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.time_tracking_requests'::regclass
      and trigger_row.tgname = 'trg_notify_time_tracking_request_status_change'
  ),
  'private',
  'request status notification trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.time_tracking_requests'::regclass
      and trigger_row.tgname = 'trg_notify_time_tracking_request_submitted'
  ),
  'private',
  'request submitted notification trigger executes private helper'
);

select is(
  (
    select trigger_proc_ns.nspname
    from pg_trigger trigger_row
    join pg_proc trigger_proc
      on trigger_proc.oid = trigger_row.tgfoid
    join pg_namespace trigger_proc_ns
      on trigger_proc_ns.oid = trigger_proc.pronamespace
    where trigger_row.tgrelid = 'private.time_tracking_request_comments'::regclass
      and trigger_row.tgname = 'trigger_log_comment_activity'
  ),
  'private',
  'request comment activity trigger executes private helper'
);

select ok(
  not exists (
    select 1
    from private_rpcs rpc
    where to_regprocedure(rpc.function_identity) is null
  ),
  'private time-tracking request RPCs exist'
);

select ok(
  to_regprocedure('public.update_time_tracking_request(uuid,text,uuid,text,text)') is null
    and to_regprocedure('public.update_time_tracking_request_content(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text[])') is null,
  'time-tracking request RPCs are absent from public'
);

select ok(
  not exists (
    select 1
    from private_rpcs rpc
    join pg_proc proc_row
      on proc_row.oid = to_regprocedure(rpc.function_identity)
    where proc_row.prosrc ~
      'public\.(time_tracking_requests|time_tracking_request_comments|time_tracking_request_activity)'
  ),
  'private time-tracking request RPC definitions do not reference migrated public tables'
);

select ok(
  not exists (
    select 1
    from private_rpcs rpc
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_function_privilege(
      roles.role_name,
      to_regprocedure(rpc.function_identity),
      'execute'
    )
  ),
  'private time-tracking request RPCs are not executable by anon/authenticated'
);

select ok(
  not exists (
    select 1
    from private_rpcs rpc
    where not has_function_privilege(
      'service_role',
      to_regprocedure(rpc.function_identity),
      'execute'
    )
  ),
  'service role can execute private time-tracking request RPCs'
);

select ok(
  not exists (
    select 1
    from trigger_helpers helper
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_function_privilege(
      roles.role_name,
      to_regprocedure(helper.function_identity),
      'execute'
    )
  ),
  'private time-tracking request helpers are not executable by anon/authenticated'
);

select ok(
  not exists (
    select 1
    from trigger_helpers helper
    where not has_function_privilege(
      'service_role',
      to_regprocedure(helper.function_identity),
      'execute'
    )
  ),
  'service role can execute private time-tracking request helpers'
);

select ok(
  not exists (
    select 1
    from private_views views
    cross join (
      values
        ('anon'),
        ('authenticated')
    ) as roles(role_name)
    where has_table_privilege(
      roles.role_name,
      format('private.%I', views.view_name),
      'select'
    )
  ),
  'private time-tracking request views are not selectable by anon/authenticated'
);

select ok(
  not exists (
    select 1
    from private_views views
    where not has_table_privilege(
      'service_role',
      format('private.%I', views.view_name),
      'select'
    )
  ),
  'service role can select private time-tracking request views'
);

select ok(
  not exists (
    select 1
    from pg_policies policies
    where policies.schemaname = 'storage'
      and policies.tablename = 'objects'
      and (
        coalesce(policies.qual, '')
        || ' '
        || coalesce(policies.with_check, '')
      ) ~ 'time_tracking_requests'
  ),
  'storage object policies no longer depend on public time-tracking request tables'
);

select ok(
  to_regclass('private.time_tracking_request_activity_with_users') is not null
    and to_regclass('public.time_tracking_request_activity_with_users') is null,
  'time-tracking request activity user view only exists in private'
);

select * from finish();

rollback;
