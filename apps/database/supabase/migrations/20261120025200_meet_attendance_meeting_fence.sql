-- A recorded interval cannot move to another meeting. The fence outlives
-- the meeting so a sync that started before erasure cannot write it back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.meet_attendance_reject_meeting_move()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.meeting_id is distinct from old.meeting_id then
    raise exception 'meet attendance meeting is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.meet_attendance_reject_meeting_move()
  from public, anon, authenticated;

drop trigger if exists meet_attendance_sessions_reject_meeting_move
  on private.meet_attendance_sessions;
create trigger meet_attendance_sessions_reject_meeting_move
  before update of meeting_id on private.meet_attendance_sessions
  for each row
  execute function private.meet_attendance_reject_meeting_move();

create table private.meet_attendance_fences (
  meeting_id uuid not null,
  ws_id uuid not null,
  generation bigint not null default 0,
  primary key (meeting_id, ws_id),
  constraint meet_attendance_fences_generation_nonnegative
    check (generation >= 0)
);

comment on table private.meet_attendance_fences is
  'Erasure generation for one meeting and workspace. No meeting foreign key: the fence must survive deletion of the meeting.';

alter table private.meet_attendance_fences enable row level security;

revoke all on table private.meet_attendance_fences
  from public, anon, authenticated;
grant select, insert, update, delete on table private.meet_attendance_fences
  to service_role;

commit;
