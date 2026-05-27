begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(14);

select ok(
  to_regclass('private.meet_stream_live_inputs') is not null,
  'Meet stream live inputs live in the private schema'
);

select ok(
  to_regclass('private.meet_stream_events') is not null,
  'Meet stream events live in the private schema'
);

select ok(
  to_regclass('public.meet_stream_live_inputs') is null,
  'Meet stream live inputs are not exposed as a public table'
);

select ok(
  to_regclass('public.meet_stream_events') is null,
  'Meet stream events are not exposed as a public table'
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
        ('meet_stream_live_inputs'),
        ('meet_stream_events')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'anon',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'anon has no Meet stream table privileges'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('meet_stream_live_inputs'),
        ('meet_stream_events')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where has_table_privilege(
      'authenticated',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'authenticated has no Meet stream table privileges'
);

select ok(
  not exists (
    select 1
    from (
      values
        ('meet_stream_live_inputs'),
        ('meet_stream_events')
    ) as tables(table_name)
    cross join (
      values
        ('select'),
        ('insert'),
        ('update'),
        ('delete')
    ) as privileges(privilege_name)
    where not has_table_privilege(
      'service_role',
      format('private.%I', tables.table_name),
      privileges.privilege_name
    )
  ),
  'service role can manage private Meet stream tables'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.meet_stream_live_inputs'::regclass),
  'Meet stream live inputs have RLS enabled'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'private.meet_stream_events'::regclass),
  'Meet stream events have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'meet_stream_live_inputs_meeting_id_fkey'
      and conrelid = 'private.meet_stream_live_inputs'::regclass
      and confrelid = 'public.workspace_meetings'::regclass
  ),
  'Meet stream live inputs reference workspace meetings'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'private'
      and tablename like 'meet_stream_%'
  ),
  'private Meet stream tables are not published directly to Supabase Realtime'
);

select * from finish();

rollback;
