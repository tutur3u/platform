-- Not a migration: release-authority approval only.
-- Drops the reference guard triggers and functions, and restores the exact
-- prior definitions of private.handle_request_status_change and
-- private.update_time_tracking_request (20260531222033). Existing rows are
-- untouched. Grants to anon or PUBLIC are never restored; service_role keeps
-- EXECUTE on the restored functions.
begin;

drop trigger if exists enforce_time_tracking_session_category_workspace_trigger
on public.time_tracking_sessions;
drop function if exists public.enforce_time_tracking_session_category_workspace();

drop trigger if exists enforce_time_tracking_request_reference_workspace_trigger
on private.time_tracking_requests;
drop function if exists private.enforce_time_tracking_request_reference_workspace();

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
      where id = new.linked_session_id;
    elsif new.approval_status = 'REJECTED' then
      delete from public.time_tracking_sessions
      where id = new.linked_session_id;

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
      delete from public.time_tracking_sessions
      where id = v_session_id
        and ws_id = p_workspace_id;
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
