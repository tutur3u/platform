begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(18);

select ok(
  to_regclass('public.recording_transcripts') is null,
  'recording transcripts are no longer in the public schema'
);

select ok(
  to_regclass('private.recording_transcripts') is not null,
  'recording transcripts exist in the private schema'
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
      'private.recording_transcripts',
      privilege_name
    )
  ),
  'anon cannot select or mutate private recording transcripts'
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
      'private.recording_transcripts',
      privilege_name
    )
  ),
  'authenticated cannot select or mutate private recording transcripts'
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
      'private.recording_transcripts',
      privilege_name
    )
  ),
  'service role can select and mutate private recording transcripts'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.recording_transcripts'::regclass
  ),
  'private recording transcripts have RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'recording_transcripts'
      and policyname = 'Service role can manage private recording transcripts'
  ),
  'private recording transcripts have a service-role policy'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'private'
      and tablename = 'recording_transcripts'
      and policyname = 'Allow workspace members to have full permissions'
  ),
  'old workspace-member transcript policy was removed'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'recording_transcripts_session_id_fkey'
      and conrelid = 'private.recording_transcripts'::regclass
      and confrelid = 'public.recording_sessions'::regclass
  ),
  'recording transcripts still reference public recording sessions'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'recording_transcripts_session_id_key'
      and conrelid = 'private.recording_transcripts'::regclass
      and contype = 'u'
  ),
  'recording transcripts preserve unique session constraint'
);

select ok(
  to_regclass('private.recording_transcripts_pkey') is not null,
  'recording transcript primary-key index moved with the private table'
);

select ok(
  to_regclass('private.recording_transcripts_session_id_key') is not null,
  'recording transcript session uniqueness index moved with the private table'
);

select lives_ok(
  $$
  set local role service_role;

  insert into public.workspace_meetings (
    id,
    ws_id,
    name,
    creator_id
  ) values (
    '10000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'pgTAP private transcript meeting',
    '00000000-0000-0000-0000-000000000001'
  );

  insert into public.recording_sessions (
    id,
    user_id,
    meeting_id,
    status
  ) values (
    '10000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000101',
    'pending_transcription'
  );

  insert into private.recording_transcripts (
    session_id,
    text,
    segments,
    language,
    duration_in_seconds
  ) values (
    '10000000-0000-0000-0000-000000000102',
    'pgTAP private transcript',
    '[{"text":"pgTAP private transcript"}]'::jsonb,
    'en',
    5
  );

  reset role;
  $$,
  'service role can insert private recording transcripts'
);

select ok(
  exists (
    select 1
    from private.recording_transcripts
    where session_id = '10000000-0000-0000-0000-000000000102'
      and text = 'pgTAP private transcript'
  ),
  'inserted transcript is readable through private schema'
);

select lives_ok(
  $$
  set local role service_role;

  delete from public.recording_sessions
  where id = '10000000-0000-0000-0000-000000000102';

  reset role;
  $$,
  'service role can delete a public recording session with private transcript cascade'
);

select ok(
  not exists (
    select 1
    from private.recording_transcripts
    where session_id = '10000000-0000-0000-0000-000000000102'
  ),
  'private recording transcripts cascade when the public session is deleted'
);

select * from finish();

rollback;
