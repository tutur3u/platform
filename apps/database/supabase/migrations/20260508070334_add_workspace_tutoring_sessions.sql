create table if not exists public.workspace_tutoring_sessions (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on update cascade on delete cascade,
  student_user_id uuid not null references public.workspace_users(id) on update cascade on delete cascade,
  teacher_user_id uuid references public.workspace_users(id) on update cascade on delete set null,
  session_date date not null,
  start_time time not null,
  duration_minutes integer not null default 45 check (duration_minutes > 0),
  reason_type text not null check (reason_type in ('ABSENT_RECOVERY', 'WEAK_SUPPORT', 'CUSTOM')),
  reason_detail text not null default '',
  content text not null default '',
  attendance_status text not null default 'PENDING' check (attendance_status in ('PENDING', 'DONE', 'NO_SHOW', 'CANCELLED')),
  parent_message_preview text not null default '',
  source_feedback_id uuid references public.user_feedbacks(id) on update cascade on delete set null,
  resolved_at timestamp with time zone,
  created_by uuid references public.users(id) on update cascade on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists workspace_tutoring_sessions_ws_id_session_date_idx
  on public.workspace_tutoring_sessions (ws_id, session_date desc);

create index if not exists workspace_tutoring_sessions_ws_id_teacher_date_idx
  on public.workspace_tutoring_sessions (ws_id, teacher_user_id, session_date desc);

create index if not exists workspace_tutoring_sessions_ws_id_group_date_idx
  on public.workspace_tutoring_sessions (ws_id, group_id, session_date desc);

create index if not exists workspace_tutoring_sessions_ws_id_student_date_idx
  on public.workspace_tutoring_sessions (ws_id, student_user_id, session_date desc);

create index if not exists workspace_tutoring_sessions_ws_id_status_date_idx
  on public.workspace_tutoring_sessions (ws_id, attendance_status, session_date desc);

create index if not exists workspace_tutoring_sessions_source_feedback_id_idx
  on public.workspace_tutoring_sessions (source_feedback_id)
  where source_feedback_id is not null;

drop trigger if exists workspace_tutoring_sessions_updated_at
  on public.workspace_tutoring_sessions;

create trigger workspace_tutoring_sessions_updated_at
  before update on public.workspace_tutoring_sessions
  for each row
  execute function public.update_updated_at_column();

create or replace function public.enforce_workspace_tutoring_session_scope()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.workspace_user_groups group_row
    where group_row.id = new.group_id
      and group_row.ws_id = new.ws_id
  ) then
    raise exception 'group_id does not belong to ws_id';
  end if;

  if not exists (
    select 1
    from public.workspace_users student_row
    where student_row.id = new.student_user_id
      and student_row.ws_id = new.ws_id
  ) then
    raise exception 'student_user_id does not belong to ws_id';
  end if;

  if new.teacher_user_id is not null and not exists (
    select 1
    from public.workspace_users teacher_row
    where teacher_row.id = new.teacher_user_id
      and teacher_row.ws_id = new.ws_id
  ) then
    raise exception 'teacher_user_id does not belong to ws_id';
  end if;

  if new.source_feedback_id is not null and not exists (
    select 1
    from public.user_feedbacks feedback_row
    join public.workspace_users feedback_user
      on feedback_user.id = feedback_row.user_id
    where feedback_row.id = new.source_feedback_id
      and feedback_row.group_id = new.group_id
      and feedback_row.user_id = new.student_user_id
      and feedback_user.ws_id = new.ws_id
  ) then
    raise exception 'source_feedback_id does not belong to ws_id/group/student';
  end if;

  return new;
end;
$$;

drop trigger if exists workspace_tutoring_sessions_scope_guard
  on public.workspace_tutoring_sessions;

create trigger workspace_tutoring_sessions_scope_guard
  before insert or update on public.workspace_tutoring_sessions
  for each row
  execute function public.enforce_workspace_tutoring_session_scope();

alter table public.workspace_tutoring_sessions enable row level security;

drop policy if exists "Allow workspace members to view tutoring sessions"
  on public.workspace_tutoring_sessions;

create policy "Allow workspace members to view tutoring sessions"
  on public.workspace_tutoring_sessions
  as permissive
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = workspace_tutoring_sessions.ws_id
        and wm.user_id = auth.uid()
    )
  );

drop policy if exists "Allow workspace members to manage tutoring sessions"
  on public.workspace_tutoring_sessions;

create policy "Allow workspace members to manage tutoring sessions"
  on public.workspace_tutoring_sessions
  as permissive
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = workspace_tutoring_sessions.ws_id
        and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.ws_id = workspace_tutoring_sessions.ws_id
        and wm.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.workspace_tutoring_sessions to authenticated;
grant all on public.workspace_tutoring_sessions to service_role;
