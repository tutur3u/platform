revoke all on table public.workspace_tutoring_sessions from public;
revoke all on table public.workspace_tutoring_sessions from anon;
revoke all on table public.workspace_tutoring_sessions from authenticated;

drop policy if exists "Allow workspace members to view tutoring sessions"
  on public.workspace_tutoring_sessions;

drop policy if exists "Allow workspace members to manage tutoring sessions"
  on public.workspace_tutoring_sessions;

grant select, insert, update, delete on table public.workspace_tutoring_sessions to service_role;
