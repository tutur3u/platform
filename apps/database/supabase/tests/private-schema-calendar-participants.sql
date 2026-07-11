begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(17);

select ok(
  not exists (
    select 1
    from (
      values
        ('calendar_event_participant_groups'),
        ('calendar_event_platform_participants'),
        ('calendar_event_virtual_participants'),
        ('calendar_event_participants')
    ) as relations(relation_name)
    where to_regclass(format('public.%I', relation_name)) is not null
  ),
  'legacy calendar participant relations are no longer in the public schema'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('calendar_event_participant_groups'),
        ('calendar_event_platform_participants'),
        ('calendar_event_virtual_participants'),
        ('calendar_event_participants')
    ) as relations(relation_name)
    where to_regclass(format('private.%I', relation_name)) is null
  ),
  'legacy calendar participant relations exist in the private schema'
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
        ('calendar_event_participant_groups'),
        ('calendar_event_platform_participants'),
        ('calendar_event_virtual_participants'),
        ('calendar_event_participants')
    ) as relations(relation_name)
    where has_table_privilege(
      'anon',
      format('private.%I', relation_name),
      'select'
    )
  ),
  'anon cannot select private calendar participant relations'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('calendar_event_participant_groups'),
        ('calendar_event_platform_participants'),
        ('calendar_event_virtual_participants'),
        ('calendar_event_participants')
    ) as relations(relation_name)
    cross join (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', relation_name),
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private calendar participant relations'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('calendar_event_participant_groups'),
        ('calendar_event_platform_participants'),
        ('calendar_event_virtual_participants')
    ) as tables(table_name)
    cross join (
      values ('select'), ('insert'), ('update'), ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', table_name),
      privilege_name
    )
  ),
  'service role can select and mutate private calendar participant tables'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.calendar_event_participants',
    'select'
  ),
  'service role can select the private calendar participant projection'
);

select ok(
  not exists (
    select 1
    from pg_class
    where oid in (
      'private.calendar_event_participant_groups'::regclass,
      'private.calendar_event_platform_participants'::regclass,
      'private.calendar_event_virtual_participants'::regclass
    )
      and not relrowsecurity
  ),
  'private calendar participant tables have RLS enabled'
);

select ok(
  (
    select count(*)
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'calendar_event_participant_groups',
        'calendar_event_platform_participants',
        'calendar_event_virtual_participants'
      )
      and roles = array['service_role']::name[]
      and cmd = 'ALL'
  ) = 3,
  'private calendar participant tables have service-role RLS policies'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'calendar_event_participant_groups',
        'calendar_event_platform_participants',
        'calendar_event_virtual_participants'
      )
      and roles && array['anon', 'authenticated']::name[]
  ),
  'private calendar participant tables have no client-role RLS policies'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'calendar_event_participant_groups_event_id_fkey'
      and conrelid = 'private.calendar_event_participant_groups'::regclass
      and confrelid = 'public.workspace_calendar_events'::regclass
  ),
  'private calendar participant groups still reference calendar events'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'calendar_event_platform_participants_user_id_fkey'
      and conrelid = 'private.calendar_event_platform_participants'::regclass
      and confrelid = 'public.users'::regclass
  ),
  'private platform calendar participants still reference platform users'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'calendar_event_virtual_participants_user_id_fkey'
      and conrelid = 'private.calendar_event_virtual_participants'::regclass
      and confrelid = 'public.workspace_users'::regclass
  ),
  'private virtual calendar participants still reference workspace users'
);

select ok(
  position(
    'private.calendar_event_platform_participants' in pg_get_viewdef(
      'private.calendar_event_participants'::regclass,
      true
    )
  ) > 0,
  'private calendar participant projection reads from private tables'
);

select ok(
  (
    select bool_and(position('private' in setting) > 0)
    from (
      select unnest(proconfig) as setting
      from pg_proc
      where oid in (
        'public.merge_workspace_users(uuid,uuid,uuid)'::regprocedure,
        'public.merge_workspace_users_phase2(uuid,uuid,uuid)'::regprocedure
      )
    ) as function_settings
    where setting like 'search_path=%'
  ),
  'workspace-user merge functions can resolve private virtual participants'
);

select ok(
  not exists (
    select 1
    from pg_publication_rel
    where prrelid in (
      'private.calendar_event_participant_groups'::regclass,
      'private.calendar_event_platform_participants'::regclass,
      'private.calendar_event_virtual_participants'::regclass
    )
  ),
  'private calendar participant tables are not published to Realtime'
);

select * from finish();

rollback;
