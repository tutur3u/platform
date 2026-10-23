-- Harden legacy SECURITY DEFINER functions in the public schema.
--
-- Functions created before 20260522172925 inherited EXECUTE for PUBLIC, anon
-- and authenticated from the default privileges in 20230202082703. This
-- migration:
--   1. restricts internal helpers to service_role (every application caller
--      already uses the admin client; definer-to-definer calls run as the
--      owner and are unaffected);
--   2. removes anon access from helpers that back authenticated RLS policies;
--   3. adds actor checks to the Mira XP and focus-session functions that user
--      sessions call directly;
--   4. makes is_task_board_member check workspace membership of _user_id, so
--      the task_lists policy that relies on it is enforced again;
--   5. pins search_path on every function touched. Functions already pinned by
--      an earlier migration keep their existing pin.

-- ---------------------------------------------------------------------------
-- 1. Internal helpers: service_role only.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_get_ai_credit_entity_detail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_platform_ai_credit_overview() from public, anon, authenticated;
revoke all on function public.get_invoice_creators(uuid) from public, anon, authenticated;
revoke all on function public.get_transaction_creators(uuid) from public, anon, authenticated;
revoke all on function public.archive_old_notifications(integer) from public, anon, authenticated;
revoke all on function public.atomic_sync_token_operation(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.record_mira_interaction(uuid) from public, anon, authenticated;
revoke all on function public.get_or_create_mira_pet(uuid) from public, anon, authenticated;
revoke all on function public.set_default_break_type(uuid, uuid) from public, anon, authenticated;
revoke all on function public.upsert_realtime_log_aggregations(jsonb) from public, anon, authenticated;
revoke all on function public.get_task_details(uuid) from public, anon, authenticated;
revoke all on function public.get_task_children(uuid) from public, anon, authenticated;
revoke all on function public.get_task_parents(uuid) from public, anon, authenticated;
revoke all on function public.get_blocking_tasks(uuid) from public, anon, authenticated;
revoke all on function public.get_blocked_tasks(uuid) from public, anon, authenticated;
revoke all on function public.get_related_tasks(uuid) from public, anon, authenticated;
revoke all on function public.get_ai_execution_summary_v2(uuid, timestamptz, timestamptz, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.get_ai_execution_daily_stats_v2(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.get_ai_execution_model_stats_v2(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.get_ai_execution_monthly_cost_v2(uuid, integer, integer, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.get_ai_execution_summary(uuid, timestamptz, timestamptz, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.get_ai_execution_monthly_cost(uuid, integer, integer, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.get_email_audit_stats(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.get_email_audit_stats_global(timestamptz) from public, anon, authenticated;
revoke all on function public.get_email_stats(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.create_system_announcement(text, text, public.notification_priority, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.create_user_notification(uuid, text, text, text, public.notification_priority, text, jsonb) from public, anon, authenticated;
revoke all on function public.cleanup_expired_notifications() from public, anon, authenticated;
revoke all on function public.cleanup_expired_live_sessions() from public, anon, authenticated;
revoke all on function public.cleanup_old_api_key_usage_logs() from public, anon, authenticated;
revoke all on function public.cleanup_old_typing_indicators() from public, anon, authenticated;
revoke all on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid) from public, anon, authenticated;
revoke all on function public.get_workspace_user_id(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_task_workspace_id(uuid) from public, anon, authenticated;
revoke all on function public.get_task_share_permission_from_link(text) from public, anon, authenticated;
revoke all on function public.get_active_ip_block(text) from public, anon, authenticated;
revoke all on function public.get_ip_block_level(text) from public, anon, authenticated;
revoke all on function public.get_user_whitelist_status(uuid) from public, anon, authenticated;
revoke all on function public.is_user_whitelisted(uuid) from public, anon, authenticated;
revoke all on function public.is_user_suspended(uuid) from public, anon, authenticated;
revoke all on function public.is_list_accessible(uuid) from public, anon, authenticated;
revoke all on function public.is_user_task_in_board(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_project_member(uuid) from public, anon, authenticated;
revoke all on function public.get_challenge_stats(uuid, uuid) from public, anon, authenticated;

grant execute on function public.admin_get_ai_credit_entity_detail(uuid, uuid) to service_role;
grant execute on function public.get_platform_ai_credit_overview() to service_role;
grant execute on function public.get_invoice_creators(uuid) to service_role;
grant execute on function public.get_transaction_creators(uuid) to service_role;
grant execute on function public.archive_old_notifications(integer) to service_role;
grant execute on function public.atomic_sync_token_operation(uuid, text, text, text) to service_role;
grant execute on function public.record_mira_interaction(uuid) to service_role;
grant execute on function public.get_or_create_mira_pet(uuid) to service_role;
grant execute on function public.set_default_break_type(uuid, uuid) to service_role;
grant execute on function public.upsert_realtime_log_aggregations(jsonb) to service_role;
grant execute on function public.get_task_details(uuid) to service_role;
grant execute on function public.get_task_children(uuid) to service_role;
grant execute on function public.get_task_parents(uuid) to service_role;
grant execute on function public.get_blocking_tasks(uuid) to service_role;
grant execute on function public.get_blocked_tasks(uuid) to service_role;
grant execute on function public.get_related_tasks(uuid) to service_role;
grant execute on function public.get_ai_execution_summary_v2(uuid, timestamptz, timestamptz, jsonb, numeric) to service_role;
grant execute on function public.get_ai_execution_daily_stats_v2(uuid, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.get_ai_execution_model_stats_v2(uuid, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.get_ai_execution_monthly_cost_v2(uuid, integer, integer, jsonb, numeric) to service_role;
grant execute on function public.get_ai_execution_summary(uuid, timestamptz, timestamptz, jsonb, numeric) to service_role;
grant execute on function public.get_ai_execution_monthly_cost(uuid, integer, integer, jsonb, numeric) to service_role;
grant execute on function public.get_email_audit_stats(uuid, timestamptz) to service_role;
grant execute on function public.get_email_audit_stats_global(timestamptz) to service_role;
grant execute on function public.get_email_stats(uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.create_system_announcement(text, text, public.notification_priority, text, timestamptz, jsonb) to service_role;
grant execute on function public.create_user_notification(uuid, text, text, text, public.notification_priority, text, jsonb) to service_role;
grant execute on function public.cleanup_expired_notifications() to service_role;
grant execute on function public.cleanup_expired_live_sessions() to service_role;
grant execute on function public.cleanup_old_api_key_usage_logs() to service_role;
grant execute on function public.cleanup_old_typing_indicators() to service_role;
grant execute on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid) to service_role;
grant execute on function public.get_workspace_user_id(uuid, uuid) to service_role;
grant execute on function public.get_task_workspace_id(uuid) to service_role;
grant execute on function public.get_task_share_permission_from_link(text) to service_role;
grant execute on function public.get_active_ip_block(text) to service_role;
grant execute on function public.get_ip_block_level(text) to service_role;
grant execute on function public.get_user_whitelist_status(uuid) to service_role;
grant execute on function public.is_user_whitelisted(uuid) to service_role;
grant execute on function public.is_user_suspended(uuid) to service_role;
grant execute on function public.is_list_accessible(uuid) to service_role;
grant execute on function public.is_user_task_in_board(uuid, uuid) to service_role;
grant execute on function public.is_project_member(uuid) to service_role;
grant execute on function public.get_challenge_stats(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Helpers that back authenticated RLS policies: no anon access.
-- ---------------------------------------------------------------------------

revoke all on function public.is_task_sharing_enabled(uuid) from public, anon;
revoke all on function public.user_is_in_channel(uuid, uuid) from public, anon;
revoke all on function public.is_member_invited(uuid, uuid) from public, anon;
revoke all on function public.is_task_board_member(uuid, uuid) from public, anon;

grant execute on function public.is_task_sharing_enabled(uuid) to authenticated, service_role;
grant execute on function public.user_is_in_channel(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_member_invited(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_task_board_member(uuid, uuid) to authenticated, service_role;

-- The full catalog may no longer have the original named read policy. Enforce
-- its security property for any remaining legacy SELECT policy, preserving USING.
alter table public.workspace_chat_messages enable row level security;
do $$
declare read_policy record;
begin
  for read_policy in
    select policyname from pg_policies
    where schemaname='public' and tablename='workspace_chat_messages'
      and cmd='SELECT' and roles && array['public','anon']::name[]
  loop
    execute format('alter policy %I on public.workspace_chat_messages to authenticated',
      read_policy.policyname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Task list membership. The body ignored _user_id and only checked that
--    the board exists, so the task_lists policy admitted every signed-in user.
--    Require a workspace membership row for the board's workspace, matching
--    is_task_workspace_member and is_task_accessible.
-- ---------------------------------------------------------------------------

create or replace function public.is_task_board_member(_user_id uuid, _board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_boards wb
    join public.workspace_members wm on wm.ws_id = wb.ws_id
    where wb.id = _board_id
      and wm.user_id = _user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Mira functions called from user sessions: the actor must be the target
--    user unless the caller is service_role or there is no request JWT at all
--    (cron, migrations or definer chains outside PostgREST).
-- ---------------------------------------------------------------------------

create or replace function public.award_mira_xp(p_user_id uuid, p_xp integer, p_source text default null)
returns public.mira_pets
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pet public.mira_pets;
  v_new_xp integer;
  v_new_level integer;
  v_new_xp_to_next integer;
  v_actor uuid := auth.uid();
  v_role text := auth.role();
begin
  if coalesce(v_role, '') <> 'service_role'
    and not (v_actor is null and v_role is null)
    and v_actor is distinct from p_user_id then
    raise exception 'Not allowed to award XP to another user'
      using errcode = '42501';
  end if;

  select * into v_pet from public.get_or_create_mira_pet(p_user_id);

  v_new_xp := v_pet.xp + p_xp;
  v_new_level := v_pet.level;
  v_new_xp_to_next := v_pet.xp_to_next_level;

  while v_new_xp >= v_new_xp_to_next loop
    v_new_xp := v_new_xp - v_new_xp_to_next;
    v_new_level := v_new_level + 1;
    v_new_xp_to_next := ceil(v_new_xp_to_next * 1.2);
  end loop;

  update public.mira_pets
  set
    xp = v_new_xp,
    level = v_new_level,
    xp_to_next_level = v_new_xp_to_next,
    last_interaction_at = now(),
    updated_at = now()
  where user_id = p_user_id
  returning * into v_pet;

  insert into public.mira_daily_stats (user_id, date, xp_earned)
  values (p_user_id, current_date, p_xp)
  on conflict (user_id, date)
  do update set
    xp_earned = mira_daily_stats.xp_earned + p_xp,
    updated_at = now();

  return v_pet;
end;
$$;

create or replace function public.complete_mira_focus_session(
  p_session_id uuid,
  p_notes text default null
)
returns public.mira_focus_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.mira_focus_sessions;
  v_actual_duration integer;
  v_xp_earned integer;
  v_actor uuid := auth.uid();
  v_role text := auth.role();
begin
  select * into v_session from public.mira_focus_sessions where id = p_session_id;

  -- Report another user's session exactly like a missing one.
  if not found or (
    coalesce(v_role, '') <> 'service_role'
    and not (v_actor is null and v_role is null)
    and v_actor is distinct from v_session.user_id
  ) then
    raise exception 'Focus session not found';
  end if;

  if v_session.ended_at is not null then
    raise exception 'Focus session already completed';
  end if;

  v_actual_duration := extract(epoch from (now() - v_session.started_at)) / 60;

  v_xp_earned := v_actual_duration;
  if v_actual_duration >= v_session.planned_duration then
    v_xp_earned := v_xp_earned + ceil(v_session.planned_duration * 0.5);
  end if;

  update public.mira_focus_sessions
  set
    ended_at = now(),
    actual_duration = v_actual_duration,
    completed = v_actual_duration >= v_session.planned_duration,
    xp_earned = v_xp_earned,
    notes = coalesce(p_notes, notes)
  where id = p_session_id
  returning * into v_session;

  perform public.award_mira_xp(v_session.user_id, v_xp_earned, 'focus_session');

  update public.mira_pets
  set
    total_focus_minutes = total_focus_minutes + v_actual_duration,
    updated_at = now()
  where user_id = v_session.user_id;

  insert into public.mira_daily_stats (user_id, date, focus_minutes, focus_sessions_completed)
  values (
    v_session.user_id,
    current_date,
    v_actual_duration,
    case when v_session.completed then 1 else 0 end
  )
  on conflict (user_id, date)
  do update set
    focus_minutes = mira_daily_stats.focus_minutes + v_actual_duration,
    focus_sessions_completed = mira_daily_stats.focus_sessions_completed +
      case when v_session.completed then 1 else 0 end,
    updated_at = now();

  return v_session;
end;
$$;

revoke all on function public.award_mira_xp(uuid, integer, text) from public, anon;
revoke all on function public.complete_mira_focus_session(uuid, text) from public, anon;
grant execute on function public.award_mira_xp(uuid, integer, text) to authenticated, service_role;
grant execute on function public.complete_mira_focus_session(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. get_task_details used SET LOCAL inside the body, which leaked the
--    search_path change into the rest of the caller's transaction. Pin it at
--    the function level instead; the body is fully qualified.
-- ---------------------------------------------------------------------------

create or replace function public.get_task_details(p_task_id uuid)
returns table (
  task_name text,
  task_id uuid,
  list_id uuid,
  list_name text,
  board_id uuid,
  board_name text,
  ws_id uuid,
  creator_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    t.name as task_name,
    t.id as task_id,
    tl.id as list_id,
    tl.name as list_name,
    wb.id as board_id,
    wb.name as board_name,
    wb.ws_id as ws_id,
    t.creator_id as creator_id
  from public.tasks t
  join public.task_lists tl on t.list_id = tl.id
  join public.workspace_boards wb on tl.board_id = wb.id
  where t.id = p_task_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. search_path pins. Fully qualified bodies get an empty path; bodies with
--    unqualified names keep public. get_transaction_creators is already pinned
--    by 20260601002502. get_challenge_stats reads Nova tables that moved to the
--    private schema in 20260601015949, so it gets the same path as its peers.
-- ---------------------------------------------------------------------------

alter function public.admin_get_ai_credit_entity_detail(uuid, uuid) set search_path = '';
alter function public.get_platform_ai_credit_overview() set search_path = '';
alter function public.get_invoice_creators(uuid) set search_path = '';
alter function public.archive_old_notifications(integer) set search_path = '';
alter function public.record_mira_interaction(uuid) set search_path = '';
alter function public.get_or_create_mira_pet(uuid) set search_path = '';
alter function public.upsert_realtime_log_aggregations(jsonb) set search_path = '';
alter function public.get_task_children(uuid) set search_path = '';
alter function public.get_task_parents(uuid) set search_path = '';
alter function public.get_blocking_tasks(uuid) set search_path = '';
alter function public.get_blocked_tasks(uuid) set search_path = '';
alter function public.get_related_tasks(uuid) set search_path = '';
alter function public.get_email_audit_stats(uuid, timestamptz) set search_path = '';
alter function public.get_email_audit_stats_global(timestamptz) set search_path = '';
alter function public.create_system_announcement(text, text, public.notification_priority, text, timestamptz, jsonb) set search_path = '';
alter function public.create_user_notification(uuid, text, text, text, public.notification_priority, text, jsonb) set search_path = '';
alter function public.cleanup_expired_notifications() set search_path = '';
alter function public.cleanup_expired_live_sessions() set search_path = '';
alter function public.cleanup_old_api_key_usage_logs() set search_path = '';
alter function public.cleanup_old_typing_indicators() set search_path = '';
alter function public.should_send_notification(uuid, text, text, public.notification_scope, uuid) set search_path = '';
alter function public.get_workspace_user_id(uuid, uuid) set search_path = '';
alter function public.get_active_ip_block(text) set search_path = '';
alter function public.get_ip_block_level(text) set search_path = '';
alter function public.get_user_whitelist_status(uuid) set search_path = '';
alter function public.is_user_whitelisted(uuid) set search_path = '';
alter function public.is_user_suspended(uuid) set search_path = '';
alter function public.user_is_in_channel(uuid, uuid) set search_path = '';

alter function public.atomic_sync_token_operation(uuid, text, text, text) set search_path = public;
alter function public.set_default_break_type(uuid, uuid) set search_path = public;
alter function public.get_ai_execution_summary_v2(uuid, timestamptz, timestamptz, jsonb, numeric) set search_path = public;
alter function public.get_ai_execution_daily_stats_v2(uuid, timestamptz, timestamptz, jsonb) set search_path = public;
alter function public.get_ai_execution_model_stats_v2(uuid, timestamptz, timestamptz, jsonb) set search_path = public;
alter function public.get_ai_execution_monthly_cost_v2(uuid, integer, integer, jsonb, numeric) set search_path = public;
alter function public.get_ai_execution_summary(uuid, timestamptz, timestamptz, jsonb, numeric) set search_path = public;
alter function public.get_ai_execution_monthly_cost(uuid, integer, integer, jsonb, numeric) set search_path = public;
alter function public.get_email_stats(uuid, timestamptz, timestamptz) set search_path = public;
alter function public.get_task_workspace_id(uuid) set search_path = public;
alter function public.get_task_share_permission_from_link(text) set search_path = public;
alter function public.is_task_sharing_enabled(uuid) set search_path = public;
alter function public.is_member_invited(uuid, uuid) set search_path = public;
alter function public.is_list_accessible(uuid) set search_path = public;
alter function public.is_user_task_in_board(uuid, uuid) set search_path = public;
alter function public.is_project_member(uuid) set search_path = public;

alter function public.get_challenge_stats(uuid, uuid) set search_path = private, public, pg_temp;

notify pgrst, 'reload schema';
