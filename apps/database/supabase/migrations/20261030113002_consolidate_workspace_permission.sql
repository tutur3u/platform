-- End-user JWT roles evaluate their own identity outside triggers.
-- Service-role, database-owner and notification-trigger evaluation retain their
-- existing scope. Time-tracking actors ignore end-user override settings.
-- Trigger inventory (latest callers):
--   private.notify_time_tracking_request_submitted()
--   private.notify_time_tracking_request_status_change()
--   private.handle_report_approval()
--   private.handle_post_approval()
--   public.enforce_workspace_member_type_update()
--   private.check_time_tracking_request_update()
-- The first two evaluate notification recipients; the remaining callers use
-- the authenticated actor. Mastermind access requires the recorded root role.
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND _user_id IS DISTINCT FROM auth.uid()
  THEN
    RETURN false;
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.workspace_members wsm
    WHERE wsm.ws_id = _org_id AND wsm.user_id = _user_id
      AND wsm.type = 'MEMBER'::public.workspace_member_type);
END;
$$;
CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND p_user_id IS DISTINCT FROM auth.uid()
  THEN
    RETURN false;
  END IF;

  -- Explicit-grant permission: only membership of the recorded root role.
  -- Creator, admin and default permissions never imply it.
  IF p_permission = 'manage_mastermind' THEN
    RETURN p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND public.is_org_member(p_user_id, p_ws_id)
      AND EXISTS (
        SELECT 1
        FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr
          ON wr.id = wrm.role_id
         AND wr.ws_id = p_ws_id
        JOIN public.workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
         AND wrp.ws_id = p_ws_id
        JOIN private.mastermind_access_role mar
          ON mar.role_id = wrm.role_id
        WHERE wrm.user_id = p_user_id
          AND wrp.permission::text = 'manage_mastermind'
          AND wrp.enabled = true
      );
  END IF;

  -- Workspace creators keep full workspace access.
  IF EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE id = p_ws_id
      AND creator_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Default and role workspace permissions are member-only. Guests use the
  -- guest default evaluator in application code, plus workspace_guest_permissions
  -- for resource-scoped grants such as course access.
  IF NOT public.is_org_member(p_user_id, p_ws_id) THEN
    RETURN false;
  END IF;

  -- Admin grants all member permissions except manage_subscription.
  IF p_permission != 'manage_subscription' AND EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = 'admin'::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = 'admin'::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = p_permission::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = p_permission::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  );
END;
$$;

COMMENT ON FUNCTION public.has_workspace_permission(uuid, uuid, text) IS
  'Checks member workspace permissions. Priority: 0) manage_mastermind only via membership of the recorded root Mastermind role, 1) workspace creators, 2) MEMBER role/default admin except manage_subscription, 3) MEMBER role/default explicit grants. GUEST defaults are evaluated separately and missing guest rows deny access.';

REVOKE ALL ON FUNCTION public.has_workspace_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.has_workspace_permission(uuid,uuid,text) anon-required review=https://github.com/tutur3u/platform/pull/7178
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, uuid, text) TO PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.is_org_member(uuid,uuid) anon-required review=https://github.com/tutur3u/platform/pull/7178
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO PUBLIC, anon, authenticated, service_role;
create or replace function private.check_time_tracking_request_update()
returns trigger
language plpgsql
set search_path = private, public, pg_temp
as $function$
declare
  v_actor_override text := nullif(
    current_setting('time_tracking.override_auth_uid', true),
    ''
  );
  -- Under an end-user JWT role the actor is always the caller; only
  -- service_role RPCs set the override.
  v_actor_id uuid := case
    when coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) in ('anon', 'authenticated') then auth.uid()
    else coalesce(v_actor_override::uuid, auth.uid())
  end;
  v_has_manage_permission boolean;
  v_content_changed boolean;
  v_status_changed boolean;
  v_status_change_grace_period_minutes integer := 0;
  v_can_reject_approved boolean := false;
  v_can_approve_rejected boolean := false;
begin
  if current_setting('time_tracking.bypass_approval_rules', true) = 'on' then
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'User authentication required for time tracking request updates';
  end if;

  v_has_manage_permission := public.has_workspace_permission(
    new.workspace_id,
    v_actor_id,
    'manage_time_tracking_requests'::text
  );

  v_content_changed := (
    new.title <> old.title
    or new.description is distinct from old.description
    or new.start_time <> old.start_time
    or new.end_time <> old.end_time
    or new.task_id is distinct from old.task_id
    or new.category_id is distinct from old.category_id
    or new.images is distinct from old.images
  );

  v_status_changed := (new.approval_status <> old.approval_status);

  if not v_status_changed then
    if new.linked_session_id is distinct from old.linked_session_id
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason
      or new.needs_info_requested_by is distinct from old.needs_info_requested_by
      or new.needs_info_requested_at is distinct from old.needs_info_requested_at
      or new.needs_info_reason is distinct from old.needs_info_reason then
      raise exception 'Cannot modify system-managed request fields without an approval status transition';
    end if;
  else
    if new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at then
      if not (
        new.approval_status = 'APPROVED'
        or (
          old.approval_status = 'APPROVED'
          and new.approval_status = 'REJECTED'
          and new.approved_by is null
          and new.approved_at is null
        )
      ) then
        raise exception 'Approval audit fields can only change when transitioning to APPROVED or clearing APPROVED -> REJECTED';
      end if;
    end if;

    if new.rejected_by is distinct from old.rejected_by
      or new.rejected_at is distinct from old.rejected_at
      or new.rejection_reason is distinct from old.rejection_reason then
      if not (
        new.approval_status = 'REJECTED'
        or (
          old.approval_status = 'REJECTED'
          and new.approval_status = 'APPROVED'
          and new.rejected_by is null
          and new.rejected_at is null
          and new.rejection_reason is null
        )
      ) then
        raise exception 'Rejection audit fields can only change when transitioning to REJECTED or clearing REJECTED -> APPROVED';
      end if;
    end if;

    if new.needs_info_requested_by is distinct from old.needs_info_requested_by
      or new.needs_info_requested_at is distinct from old.needs_info_requested_at
      or new.needs_info_reason is distinct from old.needs_info_reason then
      if not (
        new.approval_status = 'NEEDS_INFO'
        or (
          old.approval_status = 'NEEDS_INFO'
          and new.approval_status = 'PENDING'
          and new.needs_info_requested_by is null
          and new.needs_info_requested_at is null
          and new.needs_info_reason is null
        )
      ) then
        raise exception 'Needs-info audit fields can only change when transitioning to NEEDS_INFO or clearing NEEDS_INFO -> PENDING';
      end if;
    end if;

    if new.linked_session_id is distinct from old.linked_session_id then
      if not (
        new.approval_status = 'APPROVED'
        or (
          old.approval_status = 'APPROVED'
          and new.approval_status = 'REJECTED'
          and new.linked_session_id is null
        )
      ) then
        raise exception 'linked_session_id can only change when approving or when reverting APPROVED to REJECTED';
      end if;
    end if;
  end if;

  if v_status_changed
    and (
      (new.approval_status = 'REJECTED' and old.approval_status = 'APPROVED')
      or (new.approval_status = 'APPROVED' and old.approval_status = 'REJECTED')
    ) then
    select coalesce(
      (
        select value::integer
        from public.workspace_configs
        where ws_id = new.workspace_id
          and id = 'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES'
          and value ~ '^[0-9]+$'
        limit 1
      ),
      0
    )
    into v_status_change_grace_period_minutes;

    v_can_reject_approved := (
      new.approval_status = 'REJECTED'
      and old.approval_status = 'APPROVED'
      and v_status_change_grace_period_minutes > 0
      and old.approved_at is not null
      and now() <= (old.approved_at + make_interval(mins => v_status_change_grace_period_minutes))
    );

    v_can_approve_rejected := (
      new.approval_status = 'APPROVED'
      and old.approval_status = 'REJECTED'
      and v_status_change_grace_period_minutes > 0
      and old.rejected_at is not null
      and now() <= (old.rejected_at + make_interval(mins => v_status_change_grace_period_minutes))
    );
  end if;

  if new.user_id <> old.user_id
    or new.workspace_id <> old.workspace_id
    or new.created_at <> old.created_at then
    raise exception 'Cannot modify ownership or creation fields';
  end if;

  if new.user_id <> v_actor_id and not v_has_manage_permission then
    raise exception 'Only approvers can update requests submitted by other users';
  end if;

  if v_has_manage_permission then
    if new.user_id <> v_actor_id and v_content_changed then
      raise exception 'Approvers cannot modify request content fields';
    end if;

    if new.user_id = v_actor_id and v_content_changed and v_status_changed then
      raise exception 'Cannot modify content and change approval status in the same update';
    end if;

    if v_status_changed then
      if new.approval_status = 'APPROVED' then
        if old.approval_status <> 'PENDING' and not v_can_approve_rejected then
          raise exception 'Can only approve from PENDING status';
        end if;
        if new.approved_by <> v_actor_id or new.approved_at is null then
          raise exception 'Invalid approval data';
        end if;
        if new.rejected_by is not null
          or new.rejected_at is not null
          or new.rejection_reason is not null then
          raise exception 'Cannot have rejection data when approving';
        end if;
        if new.needs_info_requested_by is not null
          or new.needs_info_requested_at is not null
          or new.needs_info_reason is not null then
          raise exception 'Cannot have needs_info data when approving';
        end if;
      elsif new.approval_status = 'REJECTED' then
        if old.approval_status = 'APPROVED' then
          if not v_can_reject_approved then
            raise exception 'Can only reject approved requests within the configured grace period';
          end if;
        elsif old.approval_status <> 'PENDING' then
          raise exception 'Can only reject from PENDING status';
        end if;
        if new.rejected_by <> v_actor_id
          or new.rejected_at is null
          or new.rejection_reason is null then
          raise exception 'Invalid rejection data';
        end if;
        if new.approved_by is not null or new.approved_at is not null then
          raise exception 'Cannot have approval data when rejecting';
        end if;
        if new.needs_info_requested_by is not null
          or new.needs_info_requested_at is not null
          or new.needs_info_reason is not null then
          raise exception 'Cannot have needs_info data when rejecting';
        end if;
      elsif new.approval_status = 'NEEDS_INFO' then
        if old.approval_status <> 'PENDING' then
          raise exception 'Can only request more info from PENDING status';
        end if;
        if new.needs_info_requested_by <> v_actor_id
          or new.needs_info_requested_at is null
          or new.needs_info_reason is null then
          raise exception 'Invalid needs_info data';
        end if;
        if new.approved_by is not null or new.approved_at is not null then
          raise exception 'Cannot have approval data when requesting info';
        end if;
        if new.rejected_by is not null
          or new.rejected_at is not null
          or new.rejection_reason is not null then
          raise exception 'Cannot have rejection data when requesting info';
        end if;
      elsif new.approval_status = 'PENDING' then
        if old.approval_status <> 'NEEDS_INFO' then
          raise exception 'Can only resubmit to PENDING from NEEDS_INFO status';
        end if;
        if new.needs_info_requested_by is not null
          or new.needs_info_requested_at is not null
          or new.needs_info_reason is not null then
          raise exception 'Needs info fields must be cleared when resubmitting';
        end if;
        if new.approved_by is not null or new.approved_at is not null then
          raise exception 'Cannot have approval data when resubmitting';
        end if;
        if new.rejected_by is not null
          or new.rejected_at is not null
          or new.rejection_reason is not null then
          raise exception 'Cannot have rejection data when resubmitting';
        end if;
      else
        raise exception 'Invalid approval status transition';
      end if;
    end if;

    return new;
  end if;

  if v_status_changed then
    raise exception 'Request owners cannot change approval status';
  end if;

  if not v_content_changed then
    raise exception 'No editable request fields changed';
  end if;

  if old.approval_status <> 'PENDING'
    and old.approval_status <> 'NEEDS_INFO' then
    raise exception 'Only pending or needs-info requests can be edited';
  end if;

  if new.approved_by is distinct from old.approved_by
    or new.approved_at is distinct from old.approved_at
    or new.rejected_by is distinct from old.rejected_by
    or new.rejected_at is distinct from old.rejected_at
    or new.rejection_reason is distinct from old.rejection_reason
    or new.needs_info_requested_by is distinct from old.needs_info_requested_by
    or new.needs_info_requested_at is distinct from old.needs_info_requested_at
    or new.needs_info_reason is distinct from old.needs_info_reason
    or new.linked_session_id is distinct from old.linked_session_id then
    raise exception 'Request owners cannot modify approval metadata';
  end if;

  return new;
end;
$function$;

-- Check the invite target directly; caller-bound predicates answer only for self.
ALTER POLICY "Allow member managers to insert invites" ON public.workspace_invites
    WITH CHECK ((has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text) AND is_org_member((select auth.uid()), ws_id) AND (NOT EXISTS (SELECT 1 FROM public.workspace_members invite_member WHERE invite_member.ws_id = workspace_invites.ws_id AND invite_member.user_id = workspace_invites.user_id AND invite_member.type = 'MEMBER'::public.workspace_member_type)) AND (NOT (EXISTS ( SELECT 1 FROM workspace_secrets wss WHERE ((wss.ws_id = workspace_invites.ws_id) AND (wss.name = 'DISABLE_INVITE'::text))))) AND workspace_has_available_seats(ws_id)));

REVOKE ALL ON FUNCTION private.check_time_tracking_request_update()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.check_time_tracking_request_update() TO service_role;
