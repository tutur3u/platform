drop policy if exists "Users can create habit trackers in their workspaces"
  on public.workspace_habit_trackers;

drop policy if exists "Users can update habit trackers in their workspaces"
  on public.workspace_habit_trackers;

drop policy if exists "Users can delete habit trackers in their workspaces"
  on public.workspace_habit_trackers;

drop policy if exists "Users can create habit tracker entries in their workspaces"
  on public.workspace_habit_tracker_entries;

drop policy if exists "Users can update habit tracker entries in their workspaces"
  on public.workspace_habit_tracker_entries;

drop policy if exists "Users can delete habit tracker entries in their workspaces"
  on public.workspace_habit_tracker_entries;

drop policy if exists "Users can create habit tracker streak actions in their workspaces"
  on public.workspace_habit_tracker_streak_actions;

drop policy if exists "Users can update habit tracker streak actions in their workspaces"
  on public.workspace_habit_tracker_streak_actions;

drop policy if exists "Users can delete habit tracker streak actions in their workspaces"
  on public.workspace_habit_tracker_streak_actions;

revoke insert, update, delete
  on public.workspace_habit_trackers
  from public, anon, authenticated;

revoke insert, update, delete
  on public.workspace_habit_tracker_entries
  from public, anon, authenticated;

revoke insert, update, delete
  on public.workspace_habit_tracker_streak_actions
  from public, anon, authenticated;

comment on table public.workspace_habit_trackers is
  'Workspace-scoped trackers. Direct client reads are RLS-scoped; writes must go through server-owned habit tracker routes.';

comment on table public.workspace_habit_tracker_entries is
  'Per-user habit tracker entries. Direct client reads are RLS-scoped; writes must go through server-owned habit tracker routes.';

comment on table public.workspace_habit_tracker_streak_actions is
  'Per-user streak actions. Direct client reads are RLS-scoped; writes must go through server-owned habit tracker routes.';
