DROP FUNCTION IF EXISTS public.update_time_tracking_threshold_settings(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.update_time_tracking_threshold_settings(uuid, integer, boolean, integer);

CREATE OR REPLACE FUNCTION public.update_time_tracking_threshold_settings(
    p_ws_id uuid,
    p_threshold integer,
    p_no_approval_needed boolean,
    p_status_change_grace_period_minutes integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_actor_id uuid := auth.uid();
    v_is_workspace_member boolean := false;
    v_can_manage_workspace_settings boolean := false;
    v_can_manage_time_tracking_requests boolean := false;
    v_is_personal_workspace boolean := false;
    v_effective_threshold integer;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_threshold < 0 THEN
        RAISE EXCEPTION 'Threshold must be a non-negative integer';
    END IF;

    IF p_status_change_grace_period_minutes < 0 THEN
        RAISE EXCEPTION 'Status change grace period must be a non-negative integer';
    END IF;

    v_effective_threshold := CASE
        WHEN p_no_approval_needed THEN NULL
        ELSE p_threshold
    END;

    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE ws_id = p_ws_id
          AND user_id = v_actor_id
    )
    INTO v_is_workspace_member;

    IF NOT v_is_workspace_member THEN
        RAISE EXCEPTION 'Workspace access denied';
    END IF;

    v_can_manage_workspace_settings := public.has_workspace_permission(
        p_ws_id,
        v_actor_id,
        'manage_workspace_settings'
    );

    v_can_manage_time_tracking_requests := public.has_workspace_permission(
        p_ws_id,
        v_actor_id,
        'manage_time_tracking_requests'
    );

    IF NOT v_can_manage_workspace_settings OR NOT v_can_manage_time_tracking_requests THEN
        RAISE EXCEPTION 'Insufficient permissions to modify time tracking settings';
    END IF;

    SELECT COALESCE(w.personal, false)
    INTO v_is_personal_workspace
    FROM public.workspaces w
    WHERE w.id = p_ws_id
    LIMIT 1;

    IF v_is_personal_workspace THEN
        RAISE EXCEPTION 'Time tracking threshold settings are not available for personal workspaces';
    END IF;

    INSERT INTO public.workspace_settings (
        ws_id,
        missed_entry_date_threshold,
        updated_at
    ) VALUES (
        p_ws_id,
        v_effective_threshold,
        now()
    )
    ON CONFLICT (ws_id) DO UPDATE SET
        missed_entry_date_threshold = EXCLUDED.missed_entry_date_threshold,
        updated_at = now();

    INSERT INTO public.workspace_configs (
        ws_id,
        id,
        value,
        updated_at
    ) VALUES (
        p_ws_id,
        'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES',
        p_status_change_grace_period_minutes::text,
        now()
    )
    ON CONFLICT (ws_id, id) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.update_time_tracking_threshold_settings(uuid, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_time_tracking_threshold_settings(uuid, integer, boolean, integer) TO authenticated;
