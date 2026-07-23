begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'cadence'
  ),
  'periodic reports expose cadence'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'period_start'
  ),
  'periodic reports expose period_start'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'period_end'
  ),
  'periodic reports expose period_end'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'generation_mode'
  ),
  'periodic reports expose generation_mode'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'generation_status'
  ),
  'periodic reports expose generation_status'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'source_context'
  ),
  'periodic reports expose source_context'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'manager_instruction'
  ),
  'periodic reports expose manager_instruction'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private'
      and table_name = 'external_user_monthly_reports'
      and column_name = 'delivery_status'
  ),
  'periodic reports expose delivery_status'
);

select col_default_is(
  'private',
  'external_user_monthly_reports',
  'cadence',
  'monthly',
  'legacy reports default to monthly cadence'
);

select col_default_is(
  'private',
  'external_user_monthly_reports',
  'generation_mode',
  'manual',
  'legacy reports default to manual generation'
);

select ok(to_regclass('private.user_report_schedules') is not null, 'schedule table exists');
select ok(to_regclass('private.user_report_automation_runs') is not null, 'automation run table exists');
select ok(to_regclass('private.user_report_email_queue') is not null, 'email queue table exists');
select ok(to_regclass('private.user_report_email_attempts') is not null, 'email attempt table exists');

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'private.user_report_schedules'::regclass,
      'private.user_report_automation_runs'::regclass,
      'private.user_report_email_queue'::regclass,
      'private.user_report_email_attempts'::regclass
    )
  ),
  'all report automation tables have RLS enabled'
);

select ok(
  not has_table_privilege('authenticated', 'private.user_report_schedules', 'select')
    and not has_table_privilege('authenticated', 'private.user_report_email_queue', 'select'),
  'authenticated clients cannot access report automation tables'
);

select ok(
  has_table_privilege('service_role', 'private.user_report_schedules', 'select')
    and has_table_privilege('service_role', 'private.user_report_email_queue', 'update'),
  'service role can operate report automation'
);

select has_function(
  'private',
  'claim_periodic_report_runs',
  array['text', 'integer', 'timestamp with time zone']
);

select has_function(
  'private',
  'claim_periodic_report_emails',
  array['text', 'integer', 'timestamp with time zone']
);

select has_function(
  'private',
  'get_user_group_posts_status_summaries',
  array['uuid', 'uuid', 'uuid[]']
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.claim_periodic_report_runs(text,integer,timestamp with time zone)',
    'execute'
  ),
  'authenticated clients cannot claim automation runs'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.claim_periodic_report_runs(text,integer,timestamp with time zone)',
    'execute'
  ),
  'service role can claim automation runs'
);

select ok(
  'manage_user_report_automation' = any(enum_range(null::workspace_role_permission)::text[]),
  'report automation permission exists'
);

select ok(
  'send_user_group_report_emails' = any(enum_range(null::workspace_role_permission)::text[]),
  'periodic report email permission exists'
);

select * from finish();
rollback;
