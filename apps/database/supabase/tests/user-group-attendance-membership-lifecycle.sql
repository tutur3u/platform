begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions, audit, private;

select plan(17);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conname = 'user_group_attendance_member_fkey'
      and conrelid = 'public.user_group_attendance'::regclass
  ),
  'attendance no longer cascades with membership deletion'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.restore_cascaded_user_group_attendance()',
    'execute'
  ),
  'authenticated users cannot execute attendance recovery'
);

select ok(
  has_function_privilege(
    'service_role',
    'private.restore_cascaded_user_group_attendance()',
    'execute'
  ),
  'service role can execute attendance recovery'
);

insert into public.users (id)
values ('00000000-0000-0000-0000-000000030001')
on conflict (id) do nothing;

insert into public.workspaces (id, name, personal, creator_id)
values (
  '00000000-0000-0000-0000-000000030010',
  'Attendance Membership Lifecycle Workspace',
  false,
  '00000000-0000-0000-0000-000000030001'
)
on conflict (id) do nothing;

insert into public.workspace_user_groups (id, ws_id, name, archived)
values (
  '00000000-0000-0000-0000-000000030101',
  '00000000-0000-0000-0000-000000030010',
  'Attendance Membership Lifecycle Group',
  false
)
on conflict (id) do nothing;

insert into public.workspace_users (id, ws_id, display_name)
values (
  '00000000-0000-0000-0000-000000030201',
  '00000000-0000-0000-0000-000000030010',
  'Attendance Membership Learner'
)
on conflict (id) do nothing;

insert into public.workspace_user_groups_users (group_id, user_id, role, created_at)
values (
  '00000000-0000-0000-0000-000000030101',
  '00000000-0000-0000-0000-000000030201',
  'STUDENT',
  '2026-01-15 08:00:00+07'
)
on conflict (group_id, user_id) do nothing;

do $$ begin
  perform private.admin_upsert_workspace_user_group_members_with_audit_actor(
    '00000000-0000-0000-0000-000000030010',
    '00000000-0000-0000-0000-000000030101',
    array['00000000-0000-0000-0000-000000030201'::uuid],
    'TEACHER',
    null
  );
end $$;

select is(
  (select created_at from public.workspace_user_groups_users where group_id = '00000000-0000-0000-0000-000000030101' and user_id = '00000000-0000-0000-0000-000000030201'),
  '2026-01-15 08:00:00+07'::timestamptz,
  'changing membership role preserves the original join timestamp'
);

select ok(
  exists (
    select 1 from audit.record_version log
    where log.table_schema = 'public'
      and log.table_name = 'workspace_user_groups_users'
      and log.op = 'UPDATE'
      and log.record->>'user_id' = '00000000-0000-0000-0000-000000030201'
  ),
  'the membership role change is recorded in the audit history'
);

insert into public.user_group_attendance (
  id,
  group_id,
  user_id,
  date,
  status,
  notes
)
values (
  '00000000-0000-0000-0000-000000030301',
  '00000000-0000-0000-0000-000000030101',
  '00000000-0000-0000-0000-000000030201',
  '2026-01-15',
  'PRESENT',
  'preserved history'
);

select is(
  (
    private.admin_delete_workspace_user_group_member_with_audit_actor(
      '00000000-0000-0000-0000-000000030010',
      '00000000-0000-0000-0000-000000030101',
      '00000000-0000-0000-0000-000000030201',
      null
    )
  ).user_id,
  '00000000-0000-0000-0000-000000030201'::uuid,
  'membership deletion succeeds'
);

select is(
  (
    select count(*)::integer
    from public.user_group_attendance
    where id = '00000000-0000-0000-0000-000000030301'
  ),
  1,
  'membership deletion preserves historical attendance'
);

select throws_ok(
  $$
    select private.admin_save_user_group_attendance_with_audit_actor(
      '00000000-0000-0000-0000-000000030010',
      '00000000-0000-0000-0000-000000030101',
      '2026-01-16',
      jsonb_build_array(
        jsonb_build_object(
          'user_id', '00000000-0000-0000-0000-000000030201',
          'date', '2026-01-16',
          'status', 'PRESENT',
          'notes', '',
          'session_id', null
        )
      ),
      null
    )
  $$,
  '22023',
  'invalid_attendance_group_member',
  'attendance saver still rejects non-members'
);

select is(
  (
    select count(*)::integer
    from private.admin_upsert_workspace_user_group_members_with_audit_actor(
      '00000000-0000-0000-0000-000000030010',
      '00000000-0000-0000-0000-000000030101',
      array['00000000-0000-0000-0000-000000030201'::uuid],
      'STUDENT',
      null
    )
  ),
  1,
  'membership can be added again'
);

select is(
  (
    select count(*)::integer
    from public.user_group_attendance
    where id = '00000000-0000-0000-0000-000000030301'
  ),
  1,
  'historical attendance remains visible after re-adding membership'
);

select is(
  (
    select count(*)::integer
    from audit.record_version log
    where log.table_schema = 'public'
      and log.table_name = 'workspace_user_groups_users'
      and coalesce(log.record, log.old_record)->>'user_id' = '00000000-0000-0000-0000-000000030201'
      and coalesce(log.record, log.old_record)->>'group_id' = '00000000-0000-0000-0000-000000030101'
      and log.op in ('INSERT', 'DELETE')
  ),
  3,
  'membership audit retains the initial join, departure, and rejoin'
);

select ok(
  exists (
    select 1
    from audit.record_version log
    where log.table_schema = 'public'
      and log.table_name = 'workspace_user_groups_users'
      and log.op = 'INSERT'
      and log.record->>'user_id' = '00000000-0000-0000-0000-000000030201'
      and log.record->>'group_id' = '00000000-0000-0000-0000-000000030101'
      and log.record->>'created_at' is not null
  ),
  'each recorded join preserves its membership timestamp for analytics'
);

insert into audit.record_version (
  old_record_id,
  op,
  ts,
  table_oid,
  table_schema,
  table_name,
  old_record
)
values
  (
    gen_random_uuid(),
    'DELETE',
    '2026-06-10 10:00:00+07',
    'public.user_group_attendance'::regclass,
    'public',
    'user_group_attendance',
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000030302',
      'group_id', '00000000-0000-0000-0000-000000030101',
      'user_id', '00000000-0000-0000-0000-000000030201',
      'date', '2026-02-01',
      'session_id', null,
      'status', 'LATE',
      'notes', 'recover me',
      'created_at', '2026-02-01 08:00:00+07'
    )
  ),
  (
    gen_random_uuid(),
    'DELETE',
    '2026-06-10 10:00:00+07',
    'public.workspace_user_groups_users'::regclass,
    'public',
    'workspace_user_groups_users',
    jsonb_build_object(
      'group_id', '00000000-0000-0000-0000-000000030101',
      'user_id', '00000000-0000-0000-0000-000000030201',
      'role', 'STUDENT'
    )
  );

select is(
  private.restore_cascaded_user_group_attendance(),
  1,
  'recovery restores an attendance delete paired with membership deletion'
);

select is(
  (
    select status
    from public.user_group_attendance
    where id = '00000000-0000-0000-0000-000000030302'
  ),
  'LATE',
  'recovery restores the audited attendance values'
);

insert into audit.record_version (
  old_record_id,
  op,
  ts,
  table_oid,
  table_schema,
  table_name,
  old_record
)
values (
  gen_random_uuid(),
  'DELETE',
  '2026-06-11 10:00:00+07',
  'public.user_group_attendance'::regclass,
  'public',
  'user_group_attendance',
  jsonb_build_object(
    'id', '00000000-0000-0000-0000-000000030303',
    'group_id', '00000000-0000-0000-0000-000000030101',
    'user_id', '00000000-0000-0000-0000-000000030201',
    'date', '2026-02-02',
    'session_id', null,
    'status', 'ABSENT',
    'notes', 'intentional deletion',
    'created_at', '2026-02-02 08:00:00+07'
  )
);

select is(
  private.restore_cascaded_user_group_attendance(),
  0,
  'recovery ignores an intentional standalone attendance deletion'
);

insert into audit.record_version (
  old_record_id,
  op,
  ts,
  table_oid,
  table_schema,
  table_name,
  old_record
)
values
  (
    gen_random_uuid(),
    'DELETE',
    '2026-06-12 10:00:00+07',
    'public.user_group_attendance'::regclass,
    'public',
    'user_group_attendance',
    jsonb_build_object(
      'id', '00000000-0000-0000-0000-000000030304',
      'group_id', '00000000-0000-0000-0000-000000030101',
      'user_id', '00000000-0000-0000-0000-000000030201',
      'date', '2026-02-03',
      'session_id', null,
      'status', 'ABSENT',
      'notes', 'stale deletion',
      'created_at', '2026-02-03 08:00:00+07'
    )
  ),
  (
    gen_random_uuid(),
    'DELETE',
    '2026-06-12 10:00:00+07',
    'public.workspace_user_groups_users'::regclass,
    'public',
    'workspace_user_groups_users',
    jsonb_build_object(
      'group_id', '00000000-0000-0000-0000-000000030101',
      'user_id', '00000000-0000-0000-0000-000000030201',
      'role', 'STUDENT'
    )
  );

insert into public.user_group_attendance (
  id,
  group_id,
  user_id,
  date,
  status,
  notes
)
values (
  '00000000-0000-0000-0000-000000030305',
  '00000000-0000-0000-0000-000000030101',
  '00000000-0000-0000-0000-000000030201',
  '2026-02-03',
  'PRESENT',
  'newer live value'
);

select is(
  private.restore_cascaded_user_group_attendance(),
  0,
  'recovery does not overwrite a newer live attendance event'
);

select is(
  (
    select status
    from public.user_group_attendance
    where id = '00000000-0000-0000-0000-000000030305'
  ),
  'PRESENT',
  'newer live attendance remains unchanged'
);

select * from finish();

rollback;
