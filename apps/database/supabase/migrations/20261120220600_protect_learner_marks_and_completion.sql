set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Teach and Web save marks through service-role paths that check
-- update_user_groups_scores and validate the targets.
drop policy if exists "Allow full CRUD for workspace members via indicator"
  on public.user_indicators;

create policy user_indicators_select_workspace_members
  on public.user_indicators
  for select
  to authenticated
  using (public.can_manage_indicator(indicator_id));

revoke insert, update, delete, truncate, trigger, references
  on table public.user_indicators
  from public, anon, authenticated;

-- Stored completion rows may encode correctness from before score release.
-- Learn calculates visible progress from linked submissions and score release.
drop policy if exists "Enable users to view their own data only"
  on public.course_module_completion_status;

revoke select on table public.course_module_completion_status
  from public, anon, authenticated;

-- TRUNCATE bypasses row-level policies.
revoke truncate on table public.workspace_flashcards, public.course_module_flashcards
  from public, anon, authenticated;
