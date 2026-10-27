-- Preserve signatures and supported callers while tightening admission.

CREATE OR REPLACE FUNCTION private.handle_request_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
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

CREATE OR REPLACE FUNCTION private.update_time_tracking_request(p_request_id uuid, p_action text, p_workspace_id uuid, p_actor_auth_uid uuid, p_rejection_reason text DEFAULT NULL::text, p_needs_info_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
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
      PERFORM 1 FROM public.time_tracking_sessions s
      WHERE s.id = v_request.linked_session_id
        AND s.ws_id = v_request.workspace_id
        AND s.user_id = v_request.user_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Linked session does not belong to request owner and workspace'
          USING ERRCODE = '42501';
      END IF;
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

CREATE OR REPLACE FUNCTION public.get_workspace_time_tracking_stats(p_workspace_id uuid, p_target_date timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_start_of_day timestamptz;
    v_start_of_yesterday timestamptz;
    v_start_of_week timestamptz;
    v_start_of_month timestamptz;
    v_result jsonb;
BEGIN

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
    -- Calculate time boundaries using GMT+7 timezone
    v_start_of_day := date_trunc('day', p_target_date AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
    v_start_of_yesterday := v_start_of_day - INTERVAL '1 day';
    v_start_of_week := date_trunc('week', v_start_of_day);
    v_start_of_month := date_trunc('month', v_start_of_day);

    -- Aggregate time tracking stats for all workspace members
    SELECT jsonb_build_object(
        'aggregated', COALESCE(jsonb_agg(
            jsonb_build_object(
                'user', jsonb_build_object(
                    'platform_user_id', u.id,
                    'display_name', u.display_name,
                    'handle', u.handle
                ),
                'stats', jsonb_build_object(
                    'todayTime', COALESCE(user_stats.today_time, 0),
                    'yesterdayTime', COALESCE(user_stats.yesterday_time, 0),
                    'weekTime', COALESCE(user_stats.week_time, 0),
                    'monthTime', COALESCE(user_stats.month_time, 0)
                )
            )
        ), '[]'::jsonb),
        'members', COALESCE(jsonb_agg(
            jsonb_build_object(
                'platform_user_id', u.id,
                'display_name', u.display_name,
                'handle', u.handle
            )
        ), '[]'::jsonb)
    ) INTO v_result
    FROM public.workspace_members wm
    INNER JOIN public.users u ON u.id = wm.user_id
    LEFT JOIN LATERAL (
        SELECT
            -- Today's time (sessions starting today)
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_day
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS today_time,
            -- Yesterday's time
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_yesterday
                        AND tts.start_time < v_start_of_day
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS yesterday_time,
            -- Week's time
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_week
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS week_time,
            -- Month's time
            SUM(
                CASE
                    WHEN tts.start_time >= v_start_of_month
                    THEN tts.duration_seconds
                    ELSE 0
                END
            ) AS month_time
        FROM public.time_tracking_sessions tts
        WHERE tts.user_id = u.id
            AND tts.ws_id = p_workspace_id
            AND tts.start_time >= v_start_of_month
            AND tts.duration_seconds IS NOT NULL
    ) user_stats ON true
    WHERE wm.ws_id = p_workspace_id;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.insert_time_tracking_session_with_bypass(p_ws_id uuid, p_user_id uuid, p_title text, p_description text DEFAULT NULL::text, p_category_id uuid DEFAULT NULL::uuid, p_task_id uuid DEFAULT NULL::uuid, p_start_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_time timestamp with time zone DEFAULT NULL::timestamp with time zone, p_duration_seconds integer DEFAULT NULL::integer, p_is_running boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_id UUID;
BEGIN

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
    -- Set bypass flag for this transaction so the BEFORE INSERT trigger skips
    -- the missed-entry threshold check
    PERFORM set_config('time_tracking.bypass_insert_limit', 'on', true);

    INSERT INTO public.time_tracking_sessions (
        ws_id, user_id, title, description, category_id, task_id,
        start_time, end_time, duration_seconds, is_running
    ) VALUES (
        p_ws_id, p_user_id, p_title, p_description, p_category_id, p_task_id,
        p_start_time, p_end_time, p_duration_seconds, p_is_running
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pause_session_for_break(p_session_id uuid, p_end_time timestamp with time zone, p_duration_seconds integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_session RECORD;
    v_result json;
BEGIN

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
    -- Set the bypass flag for this transaction
    PERFORM set_config('time_tracking.is_break_pause', 'on', true);

    -- Update the session
    UPDATE public.time_tracking_sessions
    SET
        end_time = p_end_time,
        duration_seconds = p_duration_seconds,
        is_running = false,
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_session;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    -- Return the updated session as JSON
    SELECT json_build_object(
        'id', v_session.id,
        'ws_id', v_session.ws_id,
        'user_id', v_session.user_id,
        'title', v_session.title,
        'description', v_session.description,
        'category_id', v_session.category_id,
        'task_id', v_session.task_id,
        'start_time', v_session.start_time,
        'end_time', v_session.end_time,
        'duration_seconds', v_session.duration_seconds,
        'is_running', v_session.is_running,
        'was_resumed', v_session.was_resumed,
        'parent_session_id', v_session.parent_session_id,
        'created_at', v_session.created_at,
        'updated_at', v_session.updated_at
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pause_session_for_break(p_session_id uuid, p_end_time timestamp with time zone, p_duration_seconds integer, p_pending_approval boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
    v_session RECORD;
    v_result json;
BEGIN

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
    -- Set the bypass flag for this transaction
    PERFORM set_config('time_tracking.is_break_pause', 'on', true);

    -- Update the session
    UPDATE public.time_tracking_sessions
    SET
        end_time = p_end_time,
        duration_seconds = p_duration_seconds,
        is_running = false,
        pending_approval = COALESCE(p_pending_approval, false),
        updated_at = NOW()
    WHERE id = p_session_id
    RETURNING * INTO v_session;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Session not found';
    END IF;

    -- Return the updated session as JSON
    SELECT json_build_object(
        'id', v_session.id,
        'ws_id', v_session.ws_id,
        'user_id', v_session.user_id,
        'title', v_session.title,
        'description', v_session.description,
        'category_id', v_session.category_id,
        'task_id', v_session.task_id,
        'start_time', v_session.start_time,
        'end_time', v_session.end_time,
        'duration_seconds', v_session.duration_seconds,
        'is_running', v_session.is_running,
        'was_resumed', v_session.was_resumed,
        'parent_session_id', v_session.parent_session_id,
        'pending_approval', v_session.pending_approval,
        'created_at', v_session.created_at,
        'updated_at', v_session.updated_at
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_time_tracking_session_with_bypass(p_session_id uuid, p_fields jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN

  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
    -- Set bypass flag for this transaction so the BEFORE UPDATE trigger skips
    -- the missed-entry threshold check
    PERFORM set_config('time_tracking.bypass_update_limit', 'on', true);

    UPDATE public.time_tracking_sessions
    SET
        title          = CASE WHEN p_fields ? 'title'          THEN (p_fields->>'title')                              ELSE title END,
        description    = CASE WHEN p_fields ? 'description'    THEN (p_fields->>'description')                        ELSE description END,
        category_id    = CASE WHEN p_fields ? 'category_id'    THEN (p_fields->>'category_id')::UUID                  ELSE category_id END,
        task_id        = CASE WHEN p_fields ? 'task_id'        THEN (p_fields->>'task_id')::UUID                      ELSE task_id END,
        start_time     = CASE WHEN p_fields ? 'start_time'     THEN (p_fields->>'start_time')::TIMESTAMPTZ            ELSE start_time END,
        end_time       = CASE WHEN p_fields ? 'end_time'       THEN (p_fields->>'end_time')::TIMESTAMPTZ              ELSE end_time END,
        duration_seconds = CASE WHEN p_fields ? 'duration_seconds' THEN (p_fields->>'duration_seconds')::INTEGER      ELSE duration_seconds END,
        is_running     = CASE WHEN p_fields ? 'is_running'     THEN (p_fields->>'is_running')::BOOLEAN                ELSE is_running END,
        updated_at     = NOW()
    WHERE id = p_session_id;

    RETURN p_session_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.handle_request_status_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.handle_request_status_change() TO service_role;
REVOKE ALL ON FUNCTION private.update_time_tracking_request(uuid,text,uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.update_time_tracking_request(uuid,text,uuid,uuid,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_workspace_time_tracking_stats(uuid,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_time_tracking_stats(uuid,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.insert_time_tracking_session_with_bypass(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_time_tracking_session_with_bypass(uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,integer,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.pause_session_for_break(uuid,timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_session_for_break(uuid,timestamptz,integer) TO service_role;
REVOKE ALL ON FUNCTION public.pause_session_for_break(uuid,timestamptz,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_session_for_break(uuid,timestamptz,integer,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.update_time_tracking_session_with_bypass(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_time_tracking_session_with_bypass(uuid,jsonb) TO service_role;
