begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(30);

select ok(
  to_regclass('public.workspace_calendars') is null,
  'workspace calendars are no longer in the public schema'
);

select ok(
  to_regclass('private.workspace_calendars') is not null,
  'workspace calendars exist in the private schema'
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
      'private.workspace_calendars',
      privileges.privilege_name
    )
  ),
  'anon cannot select or mutate private workspace calendars'
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
      'private.workspace_calendars',
      privileges.privilege_name
    )
  ),
  'authenticated cannot select or mutate private workspace calendars'
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
      'private.workspace_calendars',
      privileges.privilege_name
    )
  ),
  'service role can select and mutate private workspace calendars'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.workspace_calendars'::regclass
  ),
  'private workspace calendars have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_calendars'
      and policyname = 'Service role can manage private workspace calendars'
  ),
  'private workspace calendars have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'workspace_calendars'
      and policyname in (
        'workspace_calendars_select',
        'workspace_calendars_insert',
        'workspace_calendars_update',
        'workspace_calendars_delete'
      )
  ),
  'old public workspace calendar policies were removed'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_calendars_ws_id_fkey'
      and conrelid = 'private.workspace_calendars'::regclass
      and confrelid = 'public.workspaces'::regclass
  ),
  'private workspace calendars still reference public workspaces'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_calendars_color_fkey'
      and conrelid = 'private.workspace_calendars'::regclass
      and confrelid = 'public.calendar_event_colors'::regclass
  ),
  'private workspace calendars still reference public calendar colors'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'calendar_connections_workspace_calendar_id_fkey'
      and conrelid = 'public.calendar_connections'::regclass
      and confrelid = 'private.workspace_calendars'::regclass
  ),
  'calendar connections reference private workspace calendars'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'workspace_calendar_events_source_calendar_id_fkey'
      and conrelid = 'public.workspace_calendar_events'::regclass
      and confrelid = 'private.workspace_calendars'::regclass
  ),
  'workspace calendar events reference private workspace calendars'
);

select ok(
  to_regclass('private.workspace_calendars_pkey') is not null,
  'workspace calendars primary-key index moved with the private table'
);

select ok(
  to_regclass('private.workspace_calendars_ws_id_idx') is not null,
  'workspace calendars workspace index moved with the private table'
);

select ok(
  to_regclass('private.workspace_calendars_enabled_idx') is not null,
  'workspace calendars enabled index moved with the private table'
);

select ok(
  to_regclass('private.workspace_calendars_system_type_unique') is not null,
  'workspace calendars system-type unique index moved with the private table'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.workspace_calendars'::regclass
      and tgname = 'enforce_strict_text_field_limits'
      and not tgisinternal
  ),
  'private workspace calendars keep the strict text trigger'
);

set local role service_role;

insert into private.workspace_calendars (
  id,
  ws_id,
  name,
  description,
  calendar_type,
  is_system,
  is_enabled,
  position
) values (
  '10000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000000',
  'pgTAP private calendar',
  'private workspace calendar test',
  'custom',
  false,
  true,
  999
);

insert into public.handles (value)
values ('pgtap-private-calendar-trigger')
on conflict do nothing;

insert into public.workspaces (
  id,
  name,
  handle,
  creator_id
) values (
  '10000000-0000-0000-0000-000000000302',
  'pgTAP private calendar trigger workspace',
  'pgtap-private-calendar-trigger',
  '00000000-0000-0000-0000-000000000001'
);

reset role;

select pass(
  'service role can insert private workspace calendars'
);

select ok(
  exists (
    select 1
    from private.workspace_calendars
    where id = '10000000-0000-0000-0000-000000000301'
      and ws_id = '00000000-0000-0000-0000-000000000000'
  ),
  'private workspace calendar rows are readable for server-owned verification'
);

select is(
  (
    select count(*)::integer
    from private.workspace_calendars
    where ws_id = '10000000-0000-0000-0000-000000000302'
      and is_system
      and calendar_type in ('primary', 'tasks', 'habits')
  ),
  3,
  'workspace insert trigger creates system calendars in the private schema'
);

select is(
  public.get_default_calendar_for_event(
    '10000000-0000-0000-0000-000000000302',
    'manual'
  ),
  (
    select id
    from private.workspace_calendars
    where ws_id = '10000000-0000-0000-0000-000000000302'
      and calendar_type = 'primary'
    limit 1
  ),
  'default calendar helper reads private workspace calendars'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_default_calendar_for_event(uuid,public.calendar_scheduling_source)',
    'execute'
  ),
  'anon cannot execute the default calendar helper'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_default_calendar_for_event(uuid,public.calendar_scheduling_source)',
    'execute'
  ),
  'authenticated cannot execute the default calendar helper directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_default_calendar_for_event(uuid,public.calendar_scheduling_source)',
    'execute'
  ),
  'service role can execute the default calendar helper'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_or_create_external_calendar(uuid,text,text,text,public.calendar_provider)',
    'execute'
  ),
  'authenticated can execute the validated external calendar helper'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_or_create_external_calendar(uuid,text,text,text,public.calendar_provider)',
    'execute'
  ),
  'service role can execute the external calendar helper'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_or_create_external_calendar(uuid,text,text,text,public.calendar_provider)',
    'execute'
  ),
  'anon cannot execute the external calendar helper'
);

select ok(
  pg_get_functiondef(
    'public.create_workspace_system_calendars()'::regprocedure
  ) like '%private.workspace_calendars%'
    and pg_get_functiondef(
      'public.get_or_create_external_calendar(uuid,text,text,text,public.calendar_provider)'::regprocedure
    ) like '%private.workspace_calendars%'
    and pg_get_functiondef(
      'public.get_default_calendar_for_event(uuid,public.calendar_scheduling_source)'::regprocedure
    ) like '%private.workspace_calendars%',
  'workspace calendar helper functions reference private workspace calendars'
);

select * from finish();

rollback;
