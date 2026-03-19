CREATE OR REPLACE FUNCTION public.update_workspace_configs_with_approval_transitions(
  p_ws_id uuid,
  p_updates jsonb,
  p_actor_virtual_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_post_approval_enabled boolean := true;
  v_current_report_approval_enabled boolean := true;
  v_next_post_approval_enabled boolean := true;
  v_next_report_approval_enabled boolean := true;
  v_posts_auto_approved integer := 0;
  v_reports_auto_approved integer := 0;
  v_now timestamptz := now();
BEGIN
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' THEN
    RAISE EXCEPTION 'p_updates must be a JSON object';
  END IF;

  SELECT COALESCE((
    SELECT wc.value = 'true'
    FROM workspace_configs wc
    WHERE wc.ws_id = p_ws_id
      AND wc.id = 'ENABLE_POST_APPROVAL'
  ), true)
  INTO v_current_post_approval_enabled;

  SELECT COALESCE((
    SELECT wc.value = 'true'
    FROM workspace_configs wc
    WHERE wc.ws_id = p_ws_id
      AND wc.id = 'ENABLE_REPORT_APPROVAL'
  ), true)
  INTO v_current_report_approval_enabled;

  v_next_post_approval_enabled :=
    CASE
      WHEN p_updates ? 'ENABLE_POST_APPROVAL'
        THEN lower(trim(p_updates->>'ENABLE_POST_APPROVAL')) = 'true'
      ELSE v_current_post_approval_enabled
    END;

  v_next_report_approval_enabled :=
    CASE
      WHEN p_updates ? 'ENABLE_REPORT_APPROVAL'
        THEN lower(trim(p_updates->>'ENABLE_REPORT_APPROVAL')) = 'true'
      ELSE v_current_report_approval_enabled
    END;

  IF v_current_report_approval_enabled AND NOT v_next_report_approval_enabled THEN
    UPDATE external_user_monthly_reports r
    SET
      report_approval_status = 'APPROVED',
      approved_by = p_actor_virtual_user_id,
      approved_at = v_now,
      rejected_by = NULL,
      rejected_at = NULL,
      rejection_reason = NULL
    WHERE r.report_approval_status = 'PENDING'
      AND EXISTS (
        SELECT 1
        FROM workspace_users wu
        WHERE wu.id = r.user_id
          AND wu.ws_id = p_ws_id
      );

    GET DIAGNOSTICS v_reports_auto_approved = ROW_COUNT;
  END IF;

  IF v_current_post_approval_enabled AND NOT v_next_post_approval_enabled THEN
    UPDATE user_group_posts p
    SET
      post_approval_status = 'APPROVED',
      approved_by = p_actor_virtual_user_id,
      approved_at = v_now,
      rejected_by = NULL,
      rejected_at = NULL,
      rejection_reason = NULL
    WHERE p.post_approval_status = 'PENDING'
      AND EXISTS (
        SELECT 1
        FROM workspace_user_groups wug
        WHERE wug.id = p.group_id
          AND wug.ws_id = p_ws_id
      );

    GET DIAGNOSTICS v_posts_auto_approved = ROW_COUNT;
  END IF;

  INSERT INTO workspace_configs (id, ws_id, value, updated_at)
  SELECT cfg.key, p_ws_id, cfg.value, v_now
  FROM jsonb_each_text(p_updates) AS cfg(key, value)
  ON CONFLICT (ws_id, id)
  DO UPDATE
  SET
    value = EXCLUDED.value,
    updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'posts_auto_approved', v_posts_auto_approved,
    'reports_auto_approved', v_reports_auto_approved
  );
END;
$$;
