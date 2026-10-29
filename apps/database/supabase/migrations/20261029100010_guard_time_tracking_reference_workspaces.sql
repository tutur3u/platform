-- Keep time tracking category, task and linked-session references inside the
-- workspace (and, for linked sessions, the user) that owns them.
--
-- 1. public.time_tracking_sessions: reject a category from another workspace
--    (sessions already guard task_id; see
--    20260616003903_harden_time_tracking_session_task_workspace.sql).
-- 2. private.time_tracking_requests: reject a task or category from another
--    workspace, so a forged reference cannot be stored and later copied onto a
--    session on approval.
-- 3. private.update_time_tracking_request and
--    private.handle_request_status_change: only touch a linked session that
--    belongs to the request's workspace and user (SR-117 condition C2).
--
-- Existing rows are NOT modified. Count existing mismatches with
-- apps/database/scripts/time-tracking-reference-mismatch-count.sql.

begin;

create or replace function public.enforce_time_tracking_session_category_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.category_id is not distinct from old.category_id
    and new.ws_id is not distinct from old.ws_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.time_tracking_categories as category
    where category.id = new.category_id
      and category.ws_id = new.ws_id
  ) then
    raise exception
      'time tracking session category must belong to the session workspace'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_time_tracking_session_category_workspace()
from public, anon, authenticated;

drop trigger if exists enforce_time_tracking_session_category_workspace_trigger
on public.time_tracking_sessions;

create trigger enforce_time_tracking_session_category_workspace_trigger
before insert or update of category_id, ws_id on public.time_tracking_sessions
for each row
execute function public.enforce_time_tracking_session_category_workspace();

comment on function public.enforce_time_tracking_session_category_workspace()
is 'Ensures time-tracking session categories stay within the session workspace.';

create or replace function private.enforce_time_tracking_request_reference_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
    and new.task_id is not distinct from old.task_id
    and new.category_id is not distinct from old.category_id
    and new.workspace_id is not distinct from old.workspace_id then
    return new;
  end if;

  if new.task_id is not null and not exists (
    select 1
    from public.tasks as task
    join public.task_lists as list on list.id = task.list_id
    join public.workspace_boards as board on board.id = list.board_id
    where task.id = new.task_id
      and board.ws_id = new.workspace_id
  ) then
    raise exception
      'time tracking request task must belong to the request workspace'
      using errcode = '23514';
  end if;

  if new.category_id is not null and not exists (
    select 1
    from public.time_tracking_categories as category
    where category.id = new.category_id
      and category.ws_id = new.workspace_id
  ) then
    raise exception
      'time tracking request category must belong to the request workspace'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_time_tracking_request_reference_workspace()
from public, anon, authenticated;

drop trigger if exists enforce_time_tracking_request_reference_workspace_trigger
on private.time_tracking_requests;

create trigger enforce_time_tracking_request_reference_workspace_trigger
before insert or update of task_id, category_id, workspace_id
on private.time_tracking_requests
for each row
execute function private.enforce_time_tracking_request_reference_workspace();

comment on function private.enforce_time_tracking_request_reference_workspace()
is 'Ensures time-tracking request task and category links stay within the request workspace.';

create or replace function private.handle_request_status_change()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
begin
  if old.approval_status = new.approval_status then
    return new;
  end if;

  if new.linked_session_id is not null then
    if new.approval_status = 'APPROVED' then
      update public.time_tracking_sessions
      set pending_approval = false,
          updated_at = now()
      where id = new.linked_session_id
        and ws_id = new.workspace_id
        and user_id = new.user_id;
    elsif new.approval_status = 'REJECTED' then
      delete from public.time_tracking_sessions
      where id = new.linked_session_id
        and ws_id = new.workspace_id
        and user_id = new.user_id;

      new.linked_session_id := null;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function private.update_time_tracking_request(
  p_request_id uuid,
  p_action text,
  p_workspace_id uuid,
  p_actor_auth_uid uuid,
  p_rejection_reason text default null::text,
  p_needs_info_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, pg_temp
as $function$
declare
  v_request private.time_tracking_requests%rowtype;
  v_session_id uuid;
  v_duration_seconds integer;
  v_actor_id uuid := p_actor_auth_uid;
  v_is_workspace_member boolean := false;
  v_has_manage_permission boolean := false;
  v_can_bypass boolean := false;
  v_status_change_grace_period_minutes integer := 0;
  v_approved_to_rejected_allowed boolean := false;
  v_rejected_to_approved_allowed boolean := false;
begin
  if v_actor_id is null then
    raise exception 'Unauthorized';
  end if;

  select exists (
    select 1
    from public.workspace_members
    where ws_id = p_workspace_id
      and user_id = v_actor_id
  )
  into v_is_workspace_member;

  if not v_is_workspace_member then
    raise exception 'Workspace access denied';
  end if;

  v_has_manage_permission := public.has_workspace_permission(
    p_workspace_id,
    v_actor_id,
    'manage_time_tracking_requests'
  );

  v_can_bypass := public.has_workspace_permission(
    p_workspace_id,
    v_actor_id,
    'bypass_time_tracking_request_approval'
  );

  select coalesce(
    (
      select value::integer
      from public.workspace_configs
      where ws_id = p_workspace_id
        and id = 'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES'
        and value ~ '^[0-9]+$'
      limit 1
    ),
    0
  )
  into v_status_change_grace_period_minutes;

  select *
  into v_request
  from private.time_tracking_requests
  where id = p_request_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Time tracking request not found';
  end if;

  if p_action in ('approve', 'reject', 'needs_info')
    and not v_has_manage_permission then
    raise exception 'You do not have permission to manage time tracking requests';
  end if;

  v_approved_to_rejected_allowed := (
    v_request.approval_status = 'APPROVED'
    and v_status_change_grace_period_minutes > 0
    and v_request.approved_at is not null
    and now() <= (
      v_request.approved_at
      + make_interval(mins => v_status_change_grace_period_minutes)
    )
  );

  v_rejected_to_approved_allowed := (
    v_request.approval_status = 'REJECTED'
    and v_status_change_grace_period_minutes > 0
    and v_request.rejected_at is not null
    and now() <= (
      v_request.rejected_at
      + make_interval(mins => v_status_change_grace_period_minutes)
    )
  );

  perform set_config('time_tracking.override_auth_uid', v_actor_id::text, true);

  if p_action = 'approve' then
    if v_request.approval_status <> 'PENDING'
      and not v_rejected_to_approved_allowed then
      if v_request.approval_status = 'REJECTED' then
        raise exception 'Status change grace period has expired';
      end if;

      raise exception 'Request has already been %', lower(v_request.approval_status);
    end if;

    if not v_can_bypass and v_request.user_id = v_actor_id then
      raise exception 'Request owner cannot approve their own request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    v_duration_seconds := extract(
      epoch from (v_request.end_time - v_request.start_time)
    )::integer;

    perform set_config('time_tracking.bypass_insert_limit', 'on', true);

    if v_request.linked_session_id is not null then
    if not exists (
      select 1
      from public.time_tracking_sessions as session
      where session.id = v_request.linked_session_id
        and session.ws_id = v_request.workspace_id
        and session.user_id = v_request.user_id
    ) then
      raise exception
        'Linked session must belong to the request workspace and user'
        using errcode = '23514';
    end if;

      v_session_id := v_request.linked_session_id;
    else
      insert into public.time_tracking_sessions (
        ws_id,
        user_id,
        title,
        description,
        category_id,
        task_id,
        start_time,
        end_time,
        duration_seconds
      ) values (
        v_request.workspace_id,
        v_request.user_id,
        v_request.title,
        v_request.description,
        v_request.category_id,
        v_request.task_id,
        v_request.start_time,
        v_request.end_time,
        v_duration_seconds
      )
      returning id into v_session_id;
    end if;

    update private.time_tracking_requests
    set approval_status = 'APPROVED',
        approved_by = v_actor_id,
        approved_at = now(),
        rejected_by = null,
        rejected_at = null,
        rejection_reason = null,
        linked_session_id = coalesce(linked_session_id, v_session_id),
        needs_info_requested_by = null,
        needs_info_requested_at = null,
        needs_info_reason = null,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request approved and time tracking session created',
      'session_id', v_session_id
    );
  elsif p_action = 'reject' then
    if v_request.approval_status <> 'PENDING'
      and not v_approved_to_rejected_allowed then
      if v_request.approval_status = 'APPROVED' then
        raise exception 'Status change grace period has expired';
      end if;

      raise exception 'Request has already been %', lower(v_request.approval_status);
    end if;

    if p_rejection_reason is null or trim(p_rejection_reason) = '' then
      raise exception 'Rejection reason is required';
    end if;

    if not v_can_bypass and v_request.user_id = v_actor_id then
      raise exception 'Request owner cannot reject their own request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    v_session_id := v_request.linked_session_id;

    if v_session_id is not null then
    if not exists (
      select 1
      from public.time_tracking_sessions as session
      where session.id = v_session_id
        and session.ws_id = v_request.workspace_id
        and session.user_id = v_request.user_id
    ) then
      raise exception
        'Linked session must belong to the request workspace and user'
        using errcode = '23514';
    end if;

      delete from public.time_tracking_sessions
      where id = v_session_id
        and ws_id = p_workspace_id
        and user_id = v_request.user_id;
    end if;

    update private.time_tracking_requests
    set approval_status = 'REJECTED',
        approved_by = null,
        approved_at = null,
        rejected_by = v_actor_id,
        rejected_at = now(),
        rejection_reason = p_rejection_reason,
        linked_session_id = null,
        needs_info_requested_by = null,
        needs_info_requested_at = null,
        needs_info_reason = null,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request rejected'
    );
  elsif p_action = 'needs_info' then
    if v_request.approval_status <> 'PENDING' then
      raise exception 'Can only request more info from PENDING status, current status: %',
        v_request.approval_status;
    end if;

    if p_needs_info_reason is null or trim(p_needs_info_reason) = '' then
      raise exception 'Reason for requesting more information is required';
    end if;

    if not v_can_bypass and v_request.user_id = v_actor_id then
      raise exception 'Request owner cannot request info on their own request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    update private.time_tracking_requests
    set approval_status = 'NEEDS_INFO',
        needs_info_requested_by = v_actor_id,
        needs_info_requested_at = now(),
        needs_info_reason = p_needs_info_reason,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request marked as needing more information'
    );
  elsif p_action = 'resubmit' then
    if v_request.approval_status <> 'NEEDS_INFO' then
      raise exception 'Can only resubmit from NEEDS_INFO status, current status: %',
        v_request.approval_status;
    end if;

    if v_request.user_id <> v_actor_id then
      raise exception 'Only the request owner can resubmit the request';
    end if;

    perform set_config('time_tracking.bypass_approval_rules', 'on', true);

    update private.time_tracking_requests
    set approval_status = 'PENDING',
        needs_info_requested_by = null,
        needs_info_requested_at = null,
        needs_info_reason = null,
        updated_at = now()
    where id = p_request_id
      and workspace_id = p_workspace_id;

    return jsonb_build_object(
      'success', true,
      'message', 'Request resubmitted for approval'
    );
  else
    raise exception 'Invalid action. Must be "approve", "reject", "needs_info", or "resubmit"';
  end if;
end;
$function$;

-- Signatures, security definer and grants are unchanged; restate them so this
-- migration is self-contained.
revoke all on function private.handle_request_status_change()
from anon, authenticated, public;

revoke all on function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) from anon, authenticated, public;

grant execute on function private.handle_request_status_change()
to service_role;

grant execute on function private.update_time_tracking_request(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text
) to service_role;

commit;
