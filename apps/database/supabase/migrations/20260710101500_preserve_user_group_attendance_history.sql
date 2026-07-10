alter table public.user_group_attendance
  drop constraint if exists user_group_attendance_member_fkey;

create or replace function private.restore_cascaded_user_group_attendance()
returns integer
language plpgsql
security definer
set search_path = public, audit, private
as $$
declare
  restored_count integer;
begin
  with attendance_audit_events as (
    select
      audit_event.id as audit_id,
      audit_event.op,
      audit_event.ts,
      coalesce(audit_event.record, audit_event.old_record) as snapshot
    from audit.record_version audit_event
    where audit_event.table_schema = 'public'
      and audit_event.table_name = 'user_group_attendance'
  ),
  normalized_attendance_events as (
    select
      attendance_event.audit_id,
      attendance_event.op,
      attendance_event.ts,
      attendance_event.snapshot,
      nullif(attendance_event.snapshot->>'id', '')::uuid as attendance_id,
      nullif(attendance_event.snapshot->>'group_id', '')::uuid as group_id,
      nullif(attendance_event.snapshot->>'user_id', '')::uuid as user_id,
      nullif(attendance_event.snapshot->>'date', '')::date as attendance_date,
      nullif(attendance_event.snapshot->>'session_id', '')::uuid as session_id
    from attendance_audit_events attendance_event
    where nullif(attendance_event.snapshot->>'group_id', '') is not null
      and nullif(attendance_event.snapshot->>'user_id', '') is not null
      and nullif(attendance_event.snapshot->>'date', '') is not null
  ),
  ranked_attendance_events as (
    select
      attendance_event.*,
      row_number() over (
        partition by
          attendance_event.group_id,
          attendance_event.user_id,
          case
            when attendance_event.session_id is not null
              then 'session:' || attendance_event.session_id::text
            else 'date:' || attendance_event.attendance_date::text
          end
        order by attendance_event.ts desc, attendance_event.audit_id desc
      ) as event_rank
    from normalized_attendance_events attendance_event
  ),
  recoverable_deletes as (
    select attendance_event.*
    from ranked_attendance_events attendance_event
    where attendance_event.event_rank = 1
      and attendance_event.op = 'DELETE'
      and attendance_event.ts >= '2026-06-03 09:50:00+07'::timestamptz
      and exists (
        select 1
        from audit.record_version membership_delete
        where membership_delete.table_schema = 'public'
          and membership_delete.table_name = 'workspace_user_groups_users'
          and membership_delete.op = 'DELETE'
          and membership_delete.ts = attendance_event.ts
          and membership_delete.old_record->>'group_id' = attendance_event.group_id::text
          and membership_delete.old_record->>'user_id' = attendance_event.user_id::text
      )
  )
  insert into public.user_group_attendance (
    id,
    group_id,
    user_id,
    date,
    session_id,
    status,
    notes,
    created_at
  )
  select
    coalesce(recoverable.attendance_id, gen_random_uuid()),
    recoverable.group_id,
    recoverable.user_id,
    recoverable.attendance_date,
    recoverable.session_id,
    recoverable.snapshot->>'status',
    coalesce(recoverable.snapshot->>'notes', ''),
    coalesce(
      nullif(recoverable.snapshot->>'created_at', '')::timestamptz,
      recoverable.ts
    )
  from recoverable_deletes recoverable
  join public.workspace_user_groups workspace_group
    on workspace_group.id = recoverable.group_id
  join public.workspace_users workspace_user
    on workspace_user.id = recoverable.user_id
   and workspace_user.ws_id = workspace_group.ws_id
  where recoverable.snapshot->>'status' is not null
    and (
      recoverable.session_id is null
      or exists (
        select 1
        from private.workspace_user_group_sessions session
        where session.id = recoverable.session_id
          and session.group_id = recoverable.group_id
      )
    )
    and not exists (
      select 1
      from public.user_group_attendance live_attendance
      where live_attendance.group_id = recoverable.group_id
        and live_attendance.user_id = recoverable.user_id
        and (
          (
            recoverable.session_id is not null
            and live_attendance.session_id = recoverable.session_id
          )
          or (
            recoverable.session_id is null
            and live_attendance.session_id is null
            and live_attendance.date = recoverable.attendance_date
          )
        )
    )
  on conflict do nothing;

  get diagnostics restored_count = row_count;
  return restored_count;
end;
$$;

revoke all on function private.restore_cascaded_user_group_attendance()
from public, anon, authenticated;
grant execute on function private.restore_cascaded_user_group_attendance()
to service_role;

select private.restore_cascaded_user_group_attendance();

comment on function private.restore_cascaded_user_group_attendance() is
  'Idempotently restores attendance whose latest audit event was a membership-cascade delete.';
