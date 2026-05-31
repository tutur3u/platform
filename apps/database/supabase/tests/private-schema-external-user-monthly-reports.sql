begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(46);

select ok(
  to_regclass('public.external_user_monthly_reports') is null,
  'external user monthly reports are no longer in the public schema'
);

select ok(
  to_regclass('public.external_user_monthly_report_logs') is null,
  'external user monthly report logs are no longer in the public schema'
);

select ok(
  to_regclass('private.external_user_monthly_reports') is not null,
  'external user monthly reports exist in the private schema'
);

select ok(
  to_regclass('private.external_user_monthly_report_logs') is not null,
  'external user monthly report logs exist in the private schema'
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
  has_schema_privilege('service_role', 'private', 'usage'),
  'service role can use the private schema'
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
    cross join (
      values
        ('external_user_monthly_reports'),
        ('external_user_monthly_report_logs')
    ) as tables(table_name)
    where has_table_privilege(
      'anon',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private external user monthly report tables'
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
    cross join (
      values
        ('external_user_monthly_reports'),
        ('external_user_monthly_report_logs')
    ) as tables(table_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private external user monthly report tables'
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
    cross join (
      values
        ('external_user_monthly_reports'),
        ('external_user_monthly_report_logs')
    ) as tables(table_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private external user monthly report tables'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.external_user_monthly_reports'::regclass
  ),
  'private external user monthly reports have RLS enabled'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.external_user_monthly_report_logs'::regclass
  ),
  'private external user monthly report logs have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'external_user_monthly_reports'
      and policyname = 'Service role can manage private external user monthly reports'
  ),
  'private external user monthly reports have a service-role policy'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'external_user_monthly_report_logs'
      and policyname = 'Service role can manage private report logs'
  ),
  'private external user monthly report logs have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'external_user_monthly_reports',
        'external_user_monthly_report_logs'
      )
      and (
        'anon' = any (roles)
        or 'authenticated' = any (roles)
        or 'public' = any (roles)
      )
  ),
  'private external user monthly report policies do not grant anon/authenticated/public access'
);

select ok(
  to_regclass('private.external_user_monthly_reports_pkey') is not null,
  'external user monthly report primary-key index moved with the private table'
);

select ok(
  to_regclass('private.external_user_monthly_report_logs_pkey') is not null,
  'external user monthly report log primary-key index moved with the private table'
);

select ok(
  to_regclass('private.external_user_monthly_reports_workspace_view') is not null,
  'private report workspace view exists for service-owned joined reads'
);

select ok(
  to_regclass('private.external_user_monthly_report_logs_workspace_view') is not null,
  'private report log workspace view exists for service-owned joined reads'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.external_user_monthly_reports_workspace_view',
    'select'
  )
    and has_table_privilege(
      'service_role',
      'private.external_user_monthly_report_logs_workspace_view',
      'select'
    ),
  'service role can select private report workspace views'
);

select ok(
  not has_table_privilege(
    'anon',
    'private.external_user_monthly_reports_workspace_view',
    'select'
  )
    and not has_table_privilege(
      'anon',
      'private.external_user_monthly_report_logs_workspace_view',
      'select'
    )
    and not has_table_privilege(
      'authenticated',
      'private.external_user_monthly_reports_workspace_view',
      'select'
    )
    and not has_table_privilege(
      'authenticated',
      'private.external_user_monthly_report_logs_workspace_view',
      'select'
    ),
  'anon and authenticated cannot select private report workspace views'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'external_user_monthly_report_logs_report_id_fkey'
      and conrelid = 'private.external_user_monthly_report_logs'::regclass
      and confrelid = 'private.external_user_monthly_reports'::regclass
  ),
  'private report logs reference private reports'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'private.external_user_monthly_reports'::regclass
      and confrelid = 'public.workspace_user_groups'::regclass
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'private.external_user_monthly_reports'::regclass
            and attname = 'group_id'
        )
      ]::smallint[]
  ),
  'private reports still reference public workspace user groups'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'private.external_user_monthly_reports'::regclass
      and confrelid = 'public.workspace_users'::regclass
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'private.external_user_monthly_reports'::regclass
            and attname = 'user_id'
        )
      ]::smallint[]
  ),
  'private reports still reference public workspace users'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'private.external_user_monthly_report_logs'::regclass
      and confrelid = 'public.workspace_user_groups'::regclass
      and conkey = array[
        (
          select attnum
          from pg_attribute
          where attrelid = 'private.external_user_monthly_report_logs'::regclass
            and attname = 'group_id'
        )
      ]::smallint[]
  ),
  'private report logs still reference public workspace user groups'
);

select ok(
  to_regprocedure('public.get_report_workspace_id(uuid)') is null,
  'report workspace helper is not exposed in public schema'
);

select ok(
  to_regprocedure('public.handle_report_approval()') is null,
  'report approval trigger helper is not exposed in public schema'
);

select ok(
  to_regprocedure('public.log_report_change()') is null,
  'report change-log trigger helper is not exposed in public schema'
);

select ok(
  to_regprocedure('public.notify_report_approval_change()') is null,
  'report approval notification helper is not exposed in public schema'
);

select ok(
  to_regprocedure('private.get_report_workspace_id(uuid)') is not null
    and to_regprocedure('private.handle_report_approval()') is not null
    and to_regprocedure('private.log_report_change()') is not null
    and to_regprocedure('private.notify_report_approval_change()') is not null,
  'report trigger helpers live in the private schema'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.get_report_workspace_id(uuid)',
    'execute'
  )
    and has_function_privilege(
      'service_role',
      'private.handle_report_approval()',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'private.log_report_change()',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'private.notify_report_approval_change()',
      'execute'
    ),
  'service role can execute private report trigger helpers'
);

select ok(
  not has_function_privilege(
    'anon',
    'private.get_report_workspace_id(uuid)',
    'execute'
  )
    and not has_function_privilege(
      'anon',
      'private.handle_report_approval()',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'private.log_report_change()',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'private.notify_report_approval_change()',
      'execute'
    ),
  'anon cannot execute private report trigger helpers'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_proc proc_row
      on proc_row.oid = trigger_row.tgfoid
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where trigger_row.tgrelid = 'private.external_user_monthly_reports'::regclass
      and trigger_row.tgname = 'trg_report_approval'
      and proc_schema.nspname = 'private'
      and proc_row.proname = 'handle_report_approval'
  ),
  'private reports validate approval state with the private trigger helper'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_proc proc_row
      on proc_row.oid = trigger_row.tgfoid
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where trigger_row.tgrelid = 'private.external_user_monthly_reports'::regclass
      and trigger_row.tgname = 'trg_report_change_log'
      and proc_schema.nspname = 'private'
      and proc_row.proname = 'log_report_change'
  ),
  'private reports create history logs with the private trigger helper'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_proc proc_row
      on proc_row.oid = trigger_row.tgfoid
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where trigger_row.tgrelid = 'private.external_user_monthly_reports'::regclass
      and trigger_row.tgname = 'trg_notify_report_approval'
      and proc_schema.nspname = 'private'
      and proc_row.proname = 'notify_report_approval_change'
  ),
  'private reports send approval notifications with the private trigger helper'
);

select ok(
  to_regprocedure('public.get_group_report_status_summary(uuid)') is not null,
  'group report status summary RPC remains available'
);

select ok(
  to_regprocedure('public.get_user_report_status_summary(uuid,uuid)') is not null,
  'user report status summary RPC remains available'
);

select ok(
  not exists (
    select 1
    from pg_proc proc_row
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where proc_schema.nspname = 'public'
      and proc_row.proname in (
        'get_group_report_status_summary',
        'get_user_report_status_summary'
      )
      and pg_get_functiondef(proc_row.oid) like '%public.external_user_monthly_report%'
  ),
  'report status summary RPCs do not reference public report tables'
);

select ok(
  exists (
    select 1
    from pg_proc proc_row
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where proc_schema.nspname = 'public'
      and proc_row.proname = 'update_workspace_configs_with_approval_transitions'
      and coalesce(proc_row.proconfig, '{}') @> array['search_path=public, private, pg_temp']
  ),
  'workspace approval transition RPC resolves reports through private schema'
);

select ok(
  not exists (
    select 1
    from pg_proc proc_row
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where proc_schema.nspname = 'public'
      and proc_row.proname in (
        'merge_workspace_users',
        'merge_workspace_users_phase1',
        'merge_workspace_users_phase1b',
        'merge_workspace_users_phase1b_batch',
        'merge_workspace_users_batch_update'
      )
      and not coalesce(proc_row.proconfig, '{}') @> array[
        'search_path=public, private, pg_temp'
      ]
  ),
  'workspace user merge RPCs resolve report tables through private schema'
);

select ok(
  pg_get_functiondef('private.user_group_activity_feed(uuid,timestamptz,timestamptz)'::regprocedure)
    like '%audit_log.table_schema = ''private''%'
    and pg_get_functiondef('private.user_group_activity_feed(uuid,timestamptz,timestamptz)'::regprocedure)
      like '%private.external_user_monthly_reports report_record%',
  'user group activity feed reads private report audit rows and report metadata'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.external_user_monthly_reports'::regclass
      and tgname = 'audit_i_u_d'
      and not tgisinternal
  ),
  'private reports keep audit tracking'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.external_user_monthly_report_logs'::regclass
      and tgname = 'audit_i_u_d'
      and not tgisinternal
  ),
  'private report logs keep audit tracking'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.external_user_monthly_reports'::regclass
      and tgname = 'enforce_strict_text_field_limits'
      and not tgisinternal
  ),
  'private reports keep strict text validation'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.external_user_monthly_report_logs'::regclass
      and tgname = 'enforce_strict_text_field_limits'
      and not tgisinternal
  ),
  'private report logs keep strict text validation'
);

select ok(
  not exists (
    select 1
    from pg_proc proc_row
    join pg_namespace proc_schema
      on proc_schema.oid = proc_row.pronamespace
    where proc_schema.nspname in ('public', 'private')
      and case
        when proc_row.prokind in ('f', 'p', 'w') then
          pg_get_functiondef(proc_row.oid) like '%public.external_user_monthly_reports%'
          or pg_get_functiondef(proc_row.oid) like '%public.external_user_monthly_report_logs%'
        else false
      end
  ),
  'database functions no longer explicitly reference public report tables'
);

select * from finish();

rollback;
