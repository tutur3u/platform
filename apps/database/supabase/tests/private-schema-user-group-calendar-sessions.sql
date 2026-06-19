begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(26);

select ok(
  to_regclass('private.workspace_user_group_sessions') is not null,
  'private user group sessions table exists'
);

select ok(
  to_regclass('private.workspace_user_group_session_series') is not null,
  'private user group session series table exists'
);

select ok(
  to_regclass('private.workspace_user_group_session_tags') is not null,
  'private user group session tags table exists'
);

select ok(
  to_regclass('private.workspace_user_group_session_tag_links') is not null,
  'private user group session tag links table exists'
);

select ok(
  to_regclass('private.workspace_user_group_session_files') is not null,
  'private user group session files table exists'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workspace_user_groups'
      and column_name = 'sessions'
  ),
  'legacy workspace_user_groups.sessions column is dropped'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon cannot use private schema'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'workspace_user_group_sessions'
      and column_name = 'description_json'
      and data_type = 'jsonb'
  ),
  'sessions store rich description json'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'private'
      and table_name = 'workspace_user_group_session_series'
      and column_name = 'description_json'
      and data_type = 'jsonb'
  ),
  'session series store rich description json'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_group_attendance'
      and column_name = 'session_id'
      and data_type = 'uuid'
  ),
  'attendance rows can point at a scheduled session'
);

select ok(
  to_regclass('public.user_group_attendance_session_key') is not null,
  'attendance has a unique session-level key'
);

select ok(
  to_regclass('public.user_group_attendance_legacy_date_key') is not null,
  'attendance keeps a unique legacy date key'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'private.workspace_user_group_sessions',
    'select'
  ),
  'authenticated cannot select private user group sessions'
);

select ok(
  has_table_privilege(
    'service_role',
    'private.workspace_user_group_sessions',
    'insert'
  ),
  'service role can insert private user group sessions'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.materialize_workspace_user_group_session_series(uuid,date)',
    'execute'
  ),
  'authenticated cannot execute session materialization RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.materialize_workspace_user_group_session_series(uuid,date)',
    'execute'
  ),
  'service role can execute session materialization RPC'
);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000020001')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id, timezone)
values (
  '00000000-0000-0000-0000-000000020010',
  'User Group Calendar Test Workspace',
  false,
  '00000000-0000-0000-0000-000000020001',
  'Asia/Ho_Chi_Minh'
)
on conflict (id) do update
set timezone = excluded.timezone;

insert into public.workspace_user_groups (id, ws_id, name, archived)
values (
  '00000000-0000-0000-0000-000000020101',
  '00000000-0000-0000-0000-000000020010',
  'Calendar Test Group',
  false
)
on conflict (id) do update
set name = excluded.name;

insert into private.workspace_user_group_sessions (
  id,
  ws_id,
  group_id,
  title,
  starts_at,
  ends_at,
  start_timezone,
  end_timezone,
  recurrence_instance_date,
  source,
  source_legacy_date
)
values (
  '00000000-0000-0000-0000-000000020201',
  '00000000-0000-0000-0000-000000020010',
  '00000000-0000-0000-0000-000000020101',
  'Legacy Date',
  make_timestamptz(2026, 1, 12, 7, 0, 0, 'Asia/Ho_Chi_Minh'),
  make_timestamptz(2026, 1, 12, 8, 0, 0, 'Asia/Ho_Chi_Minh'),
  'Asia/Ho_Chi_Minh',
  'Asia/Ho_Chi_Minh',
  '2026-01-12',
  'legacy_workspace_user_groups.sessions',
  '2026-01-12'
)
on conflict (id) do update
set starts_at = excluded.starts_at,
    ends_at = excluded.ends_at;

select is(
  (
    select starts_at
    from private.workspace_user_group_sessions
    where id = '00000000-0000-0000-0000-000000020201'
  ),
  '2026-01-12 00:00:00+00'::timestamp with time zone,
  'legacy date starts at 7AM GMT+7 / midnight UTC'
);

select is(
  (
    select ends_at
    from private.workspace_user_group_sessions
    where id = '00000000-0000-0000-0000-000000020201'
  ),
  '2026-01-12 01:00:00+00'::timestamp with time zone,
  'legacy date ends at 8AM GMT+7 / 1AM UTC'
);

insert into private.workspace_user_group_session_series (
  id,
  ws_id,
  group_id,
  title,
  start_date,
  until_date,
  days_of_week,
  interval_weeks,
  start_time,
  end_time,
  start_timezone,
  end_timezone,
  source
)
values (
  '00000000-0000-0000-0000-000000020301',
  '00000000-0000-0000-0000-000000020010',
  '00000000-0000-0000-0000-000000020101',
  'Tue Thu Sat',
  '2026-01-06',
  '2026-01-10',
  array[2, 4, 6],
  1,
  '19:00',
  '20:30',
  'Asia/Ho_Chi_Minh',
  'Asia/Ho_Chi_Minh',
  'test'
)
on conflict (id) do update
set start_date = excluded.start_date,
    until_date = excluded.until_date,
    days_of_week = excluded.days_of_week,
    start_time = excluded.start_time,
    end_time = excluded.end_time;

select is(
  private.materialize_workspace_user_group_session_series(
    '00000000-0000-0000-0000-000000020301',
    '2026-01-10'
  ),
  3,
  'recurring series materializes three matching weekdays'
);

select is(
  private.materialize_workspace_user_group_session_series(
    '00000000-0000-0000-0000-000000020301',
    '2026-01-10'
  ),
  3,
  'recurring materialization can be called again'
);

select is(
  (
    select count(*)::integer
    from private.workspace_user_group_sessions
    where series_id = '00000000-0000-0000-0000-000000020301'
  ),
  3,
  'recurring materialization is idempotent'
);

select is(
  (
    select starts_at
    from private.workspace_user_group_sessions
    where series_id = '00000000-0000-0000-0000-000000020301'
      and recurrence_instance_date = '2026-01-06'
  ),
  '2026-01-06 12:00:00+00'::timestamp with time zone,
  'recurring session preserves 7PM GMT+7 start'
);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000020401')
on conflict (id) do nothing;

insert into public.workspace_users (id, ws_id, display_name)
values (
  '00000000-0000-0000-0000-000000020402',
  '00000000-0000-0000-0000-000000020010',
  'Session Attendance Learner'
)
on conflict (id) do update
set display_name = excluded.display_name;

insert into public.workspace_user_groups_users (group_id, user_id, role)
values (
  '00000000-0000-0000-0000-000000020101',
  '00000000-0000-0000-0000-000000020402',
  'STUDENT'
)
on conflict (group_id, user_id) do update
set role = excluded.role;

insert into private.workspace_user_group_sessions (
  id,
  ws_id,
  group_id,
  title,
  starts_at,
  ends_at,
  start_timezone,
  end_timezone,
  recurrence_instance_date,
  source
)
values
  (
    '00000000-0000-0000-0000-000000020501',
    '00000000-0000-0000-0000-000000020010',
    '00000000-0000-0000-0000-000000020101',
    'Morning Session',
    make_timestamptz(2026, 1, 13, 7, 0, 0, 'Asia/Ho_Chi_Minh'),
    make_timestamptz(2026, 1, 13, 8, 0, 0, 'Asia/Ho_Chi_Minh'),
    'Asia/Ho_Chi_Minh',
    'Asia/Ho_Chi_Minh',
    '2026-01-13',
    'test'
  ),
  (
    '00000000-0000-0000-0000-000000020502',
    '00000000-0000-0000-0000-000000020010',
    '00000000-0000-0000-0000-000000020101',
    'Evening Session',
    make_timestamptz(2026, 1, 13, 19, 0, 0, 'Asia/Ho_Chi_Minh'),
    make_timestamptz(2026, 1, 13, 20, 0, 0, 'Asia/Ho_Chi_Minh'),
    'Asia/Ho_Chi_Minh',
    'Asia/Ho_Chi_Minh',
    '2026-01-13',
    'test'
  )
on conflict (id) do update
set starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    recurrence_instance_date = excluded.recurrence_instance_date;

select lives_ok(
  $$
    insert into public.user_group_attendance
      (group_id, user_id, date, session_id, status, notes)
    values
      (
        '00000000-0000-0000-0000-000000020101',
        '00000000-0000-0000-0000-000000020402',
        '2026-01-13',
        '00000000-0000-0000-0000-000000020501',
        'PRESENT',
        'morning'
      ),
      (
        '00000000-0000-0000-0000-000000020101',
        '00000000-0000-0000-0000-000000020402',
        '2026-01-13',
        '00000000-0000-0000-0000-000000020502',
        'LATE',
        'evening'
      )
  $$,
  'attendance accepts multiple same-day session rows for one user'
);

select is(
  (
    select count(*)::integer
    from public.user_group_attendance
    where group_id = '00000000-0000-0000-0000-000000020101'
      and user_id = '00000000-0000-0000-0000-000000020402'
      and date = '2026-01-13'
      and session_id is not null
  ),
  2,
  'session-level attendance rows remain separate'
);

select lives_ok(
  $$
    insert into public.user_group_attendance
      (group_id, user_id, date, session_id, status, notes)
    values (
      '00000000-0000-0000-0000-000000020101',
      '00000000-0000-0000-0000-000000020402',
      '2026-01-13',
      null,
      'ABSENT',
      'legacy'
    )
  $$,
  'legacy date-only attendance can coexist with session rows'
);

select throws_ok(
  $$
    insert into public.user_group_attendance
      (group_id, user_id, date, session_id, status, notes)
    values (
      '00000000-0000-0000-0000-000000020101',
      '00000000-0000-0000-0000-000000020402',
      '2026-01-14',
      '00000000-0000-0000-0000-000000020501',
      'PRESENT',
      'wrong date'
    )
  $$,
  '22023',
  'invalid_attendance_session',
  'session-level attendance rejects mismatched session dates'
);

select * from finish();

rollback;
