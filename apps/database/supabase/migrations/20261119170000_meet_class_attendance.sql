-- Join and leave intervals for a Meet call.
-- user_id and guest_id are recorded identities, not live account foreign keys.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.meet_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.workspace_meetings (id) on delete cascade,
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  source_key text not null,
  participant_kind text not null,
  user_id uuid,
  guest_id uuid,
  display_name text not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  constraint meet_attendance_sessions_source_key_length
    check (char_length(source_key) between 1 and 200),
  constraint meet_attendance_sessions_kind
    check (participant_kind in ('member', 'guest')),
  constraint meet_attendance_sessions_identity
    check (
      (
        participant_kind = 'member'
        and user_id is not null
        and guest_id is null
      )
      or (
        participant_kind = 'guest'
        and guest_id is not null
        and user_id is null
      )
    ),
  constraint meet_attendance_sessions_display_name_length
    check (char_length(display_name) between 1 and 120),
  constraint meet_attendance_sessions_left_after_join
    check (left_at is null or left_at >= joined_at),
  constraint meet_attendance_sessions_meeting_source_key
    unique (meeting_id, source_key)
);

comment on table private.meet_attendance_sessions is
  'Join and leave intervals for a Meet call. user_id and guest_id are recorded identities, not live account foreign keys.';

create index meet_attendance_sessions_meeting_joined_idx
  on private.meet_attendance_sessions (meeting_id, joined_at);

alter table private.meet_attendance_sessions enable row level security;

create policy meet_attendance_sessions_host_select
  on private.meet_attendance_sessions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_meetings as meeting
      where meeting.id = meet_attendance_sessions.meeting_id
        and meeting.creator_id = (select auth.uid())
    )
  );

revoke all on table private.meet_attendance_sessions from public, anon, authenticated;
grant select, insert, update, delete on table private.meet_attendance_sessions to service_role;
