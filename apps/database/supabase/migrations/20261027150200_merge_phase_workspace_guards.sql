-- Require workspace merge permissions for each resumable phase.

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1b(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_migrated_tables TEXT[] := '{}';
  v_migrated_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1b', 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables);
  END IF;
  UPDATE public.workspace_user_status_changes SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE public.workspace_user_status_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.external_user_monthly_report_logs SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.external_user_monthly_report_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.external_user_monthly_reports SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.external_user_monthly_reports SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.external_user_monthly_reports SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.updated_by'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE public.user_feedbacks SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE public.user_feedbacks SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  RETURN jsonb_build_object(
    'success', true,
    'phase', '1b',
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1b(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1b(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1c(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_migrated_tables TEXT[] := '{}';
  v_migrated_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1c', 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables);
  END IF;
  UPDATE public.workspace_products SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_products'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.workspace_promotions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.workspace_promotions SET owner_id = _target_id WHERE owner_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.owner_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.healthcare_checkups SET patient_id = _target_id WHERE patient_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'healthcare_checkups'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE public.guest_users_lead_generation SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'guest_users_lead_generation'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE public.sent_emails SET receiver_id = _target_id WHERE receiver_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'sent_emails'); v_migrated_count := v_migrated_count + 1; END IF;
  RETURN jsonb_build_object(
    'success', true,
    'phase', '1c',
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1c(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1c(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1d(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_migrated_tables TEXT[] := '{}';
  v_migrated_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1d', 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables);
  END IF;
  UPDATE private.user_group_post_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_post_logs'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.user_group_posts SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.user_group_posts SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.updated_by'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE private.payroll_run_items SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'payroll_run_items'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE public.workforce_contracts SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workforce_contracts'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE public.user_indicators SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  RETURN jsonb_build_object(
    'success', true,
    'phase', '1d',
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1d(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1d(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase2(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_migrated_tables TEXT[] := '{}';
  v_collision_tables TEXT[] := '{}';
  v_collision_details JSONB[] := '{}';
  v_collision_record_ids TEXT[];
  v_count_deleted INTEGER := 0;
  v_migrated_count INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', 2, 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables, 'collision_details', v_collision_details);
  END IF;
  SELECT ARRAY_AGG(indicator_id::text) INTO v_collision_record_ids
  FROM public.user_indicators
  WHERE user_id = _source_id
    AND indicator_id IN (SELECT indicator_id FROM public.user_indicators WHERE user_id = _target_id);
  DELETE FROM public.user_indicators
  WHERE user_id = _source_id
    AND indicator_id IN (SELECT indicator_id FROM public.user_indicators WHERE user_id = _target_id);
  GET DIAGNOSTICS v_count_deleted = ROW_COUNT;
  IF v_count_deleted > 0 THEN
    v_collision_tables := array_append(v_collision_tables, 'user_indicators');
    v_collision_details := array_append(v_collision_details, jsonb_build_object(
      'table', 'user_indicators',
      'deleted_count', v_count_deleted,
      'pk_column', 'indicator_id',
      'deleted_pk_values', COALESCE(v_collision_record_ids, ARRAY[]::TEXT[])
    ));
  END IF;
  UPDATE public.user_indicators SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  SELECT ARRAY_AGG(group_id::text) INTO v_collision_record_ids
  FROM public.workspace_user_groups_users
  WHERE user_id = _source_id
    AND group_id IN (SELECT group_id FROM public.workspace_user_groups_users WHERE user_id = _target_id);
  DELETE FROM public.workspace_user_groups_users
  WHERE user_id = _source_id
    AND group_id IN (SELECT group_id FROM public.workspace_user_groups_users WHERE user_id = _target_id);
  GET DIAGNOSTICS v_count_deleted = ROW_COUNT;
  IF v_count_deleted > 0 THEN
    v_collision_tables := array_append(v_collision_tables, 'workspace_user_groups_users');
    v_collision_details := array_append(v_collision_details, jsonb_build_object(
      'table', 'workspace_user_groups_users',
      'deleted_count', v_count_deleted,
      'pk_column', 'group_id',
      'deleted_pk_values', COALESCE(v_collision_record_ids, ARRAY[]::TEXT[])
    ));
  END IF;
  UPDATE public.workspace_user_groups_users SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_groups_users'); v_migrated_count := v_migrated_count + 1; END IF;
  SELECT ARRAY_AGG(date::text || '|' || group_id::text) INTO v_collision_record_ids
  FROM public.user_group_attendance
  WHERE user_id = _source_id
    AND (date, group_id) IN (SELECT date, group_id FROM public.user_group_attendance WHERE user_id = _target_id);
  DELETE FROM public.user_group_attendance
  WHERE user_id = _source_id
    AND (date, group_id) IN (SELECT date, group_id FROM public.user_group_attendance WHERE user_id = _target_id);
  GET DIAGNOSTICS v_count_deleted = ROW_COUNT;
  IF v_count_deleted > 0 THEN
    v_collision_tables := array_append(v_collision_tables, 'user_group_attendance');
    v_collision_details := array_append(v_collision_details, jsonb_build_object(
      'table', 'user_group_attendance',
      'deleted_count', v_count_deleted,
      'pk_column', 'date,group_id',
      'deleted_pk_values', COALESCE(v_collision_record_ids, ARRAY[]::TEXT[])
    ));
  END IF;
  UPDATE public.user_group_attendance SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_attendance'); v_migrated_count := v_migrated_count + 1; END IF;
  SELECT ARRAY_AGG(promo_id::text) INTO v_collision_record_ids
  FROM private.user_linked_promotions
  WHERE user_id = _source_id
    AND promo_id IN (SELECT promo_id FROM private.user_linked_promotions WHERE user_id = _target_id);
  DELETE FROM private.user_linked_promotions
  WHERE user_id = _source_id
    AND promo_id IN (SELECT promo_id FROM private.user_linked_promotions WHERE user_id = _target_id);
  GET DIAGNOSTICS v_count_deleted = ROW_COUNT;
  IF v_count_deleted > 0 THEN
    v_collision_tables := array_append(v_collision_tables, 'user_linked_promotions');
    v_collision_details := array_append(v_collision_details, jsonb_build_object(
      'table', 'user_linked_promotions',
      'deleted_count', v_count_deleted,
      'pk_column', 'promo_id',
      'deleted_pk_values', COALESCE(v_collision_record_ids, ARRAY[]::TEXT[])
    ));
  END IF;
  UPDATE private.user_linked_promotions SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_linked_promotions'); v_migrated_count := v_migrated_count + 1; END IF;
  SELECT ARRAY_AGG(event_id::text) INTO v_collision_record_ids
  FROM private.calendar_event_virtual_participants
  WHERE user_id = _source_id
    AND event_id IN (SELECT event_id FROM private.calendar_event_virtual_participants WHERE user_id = _target_id);
  DELETE FROM private.calendar_event_virtual_participants
  WHERE user_id = _source_id
    AND event_id IN (SELECT event_id FROM private.calendar_event_virtual_participants WHERE user_id = _target_id);
  GET DIAGNOSTICS v_count_deleted = ROW_COUNT;
  IF v_count_deleted > 0 THEN
    v_collision_tables := array_append(v_collision_tables, 'calendar_event_virtual_participants');
    v_collision_details := array_append(v_collision_details, jsonb_build_object(
      'table', 'calendar_event_virtual_participants',
      'deleted_count', v_count_deleted,
      'pk_column', 'event_id',
      'deleted_pk_values', COALESCE(v_collision_record_ids, ARRAY[]::TEXT[])
    ));
  END IF;
  UPDATE private.calendar_event_virtual_participants SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'calendar_event_virtual_participants'); v_migrated_count := v_migrated_count + 1; END IF;
  SELECT ARRAY_AGG(post_id::text) INTO v_collision_record_ids
  FROM private.user_group_post_checks
  WHERE user_id = _source_id
    AND post_id IN (SELECT post_id FROM private.user_group_post_checks WHERE user_id = _target_id);
  DELETE FROM private.user_group_post_checks
  WHERE user_id = _source_id
    AND post_id IN (SELECT post_id FROM private.user_group_post_checks WHERE user_id = _target_id);
  GET DIAGNOSTICS v_count_deleted = ROW_COUNT;
  IF v_count_deleted > 0 THEN
    v_collision_tables := array_append(v_collision_tables, 'user_group_post_checks');
    v_collision_details := array_append(v_collision_details, jsonb_build_object(
      'table', 'user_group_post_checks',
      'deleted_count', v_count_deleted,
      'pk_column', 'post_id',
      'deleted_pk_values', COALESCE(v_collision_record_ids, ARRAY[]::TEXT[])
    ));
  END IF;
  UPDATE private.user_group_post_checks SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_post_checks'); v_migrated_count := v_migrated_count + 1; END IF;
  RETURN jsonb_build_object(
    'success', true,
    'phase', 2,
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count,
    'collision_tables', v_collision_tables,
    'collision_details', v_collision_details
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase2(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase2(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase3(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_custom_fields_merged INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', 3, 'message', 'Source user already deleted (merge complete)', 'custom_fields_merged', 0);
  END IF;
  BEGIN
    UPDATE public.workspace_user_fields_values dst
    SET value = src.value
    FROM public.workspace_user_fields_values src
    WHERE dst.user_id = _target_id
      AND src.user_id = _source_id
      AND dst.field_id = src.field_id
      AND (dst.value IS NULL OR dst.value = '')
      AND src.value IS NOT NULL
      AND src.value != '';
    GET DIAGNOSTICS v_custom_fields_merged = ROW_COUNT;
      DELETE FROM public.workspace_user_fields_values
    WHERE user_id = _source_id;
  EXCEPTION
    WHEN undefined_table THEN
          v_custom_fields_merged := 0;
  END;
  RETURN jsonb_build_object(
    'success', true,
    'phase', 3,
    'custom_fields_merged', v_custom_fields_merged
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase3(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase3(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase4(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_source_linked BOOLEAN := FALSE;
  v_target_linked BOOLEAN := FALSE;
  v_source_platform_user_id UUID;
  v_target_platform_user_id UUID;
  v_link_transferred BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', 4, 'message', 'Source user already deleted (merge complete)', 'link_transferred', false);
  END IF;
  SELECT
    platform_user_id IS NOT NULL,
    platform_user_id
  INTO v_source_linked, v_source_platform_user_id
  FROM public.workspace_user_linked_users
  WHERE virtual_user_id = _source_id AND ws_id = _ws_id;
  SELECT
    platform_user_id IS NOT NULL,
    platform_user_id
  INTO v_target_linked, v_target_platform_user_id
  FROM public.workspace_user_linked_users
  WHERE virtual_user_id = _target_id AND ws_id = _ws_id;
  v_source_linked := COALESCE(v_source_linked, FALSE);
  v_target_linked := COALESCE(v_target_linked, FALSE);
  IF v_source_linked AND v_target_linked AND v_source_platform_user_id != v_target_platform_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot merge: Both users are linked to different platform accounts. Merging would cause one platform user to lose their workspace association.',
      'phase', 4,
      'source_platform_user_id', v_source_platform_user_id,
      'target_platform_user_id', v_target_platform_user_id
    );
  END IF;
  IF v_source_linked AND NOT v_target_linked THEN
    UPDATE public.workspace_user_linked_users
    SET virtual_user_id = _target_id
    WHERE virtual_user_id = _source_id AND ws_id = _ws_id;
    v_link_transferred := TRUE;
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'phase', 4,
    'link_transferred', v_link_transferred,
    'source_platform_user_id', v_source_platform_user_id,
    'target_platform_user_id', v_target_platform_user_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase4(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase4(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase5(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_source_record public.workspace_users%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_source_record
  FROM public.workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'phase', 5, 'message', 'Source user already deleted (merge complete)');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found in workspace', 'phase', 5);
  END IF;
  UPDATE public.workspace_users
  SET
    full_name = COALESCE(full_name, v_source_record.full_name),
    display_name = COALESCE(display_name, v_source_record.display_name),
    email = COALESCE(email, v_source_record.email),
    phone = COALESCE(phone, v_source_record.phone),
    gender = COALESCE(gender, v_source_record.gender),
    birthday = COALESCE(birthday, v_source_record.birthday),
    ethnicity = COALESCE(ethnicity, v_source_record.ethnicity),
    guardian = COALESCE(guardian, v_source_record.guardian),
    national_id = COALESCE(national_id, v_source_record.national_id),
    address = COALESCE(address, v_source_record.address),
    avatar_url = COALESCE(avatar_url, v_source_record.avatar_url),
    note = CASE
      WHEN note IS NULL OR note = '' THEN v_source_record.note
      WHEN v_source_record.note IS NOT NULL AND v_source_record.note != ''
        THEN note || E'\n\n[Merged from user ' || _source_id || ']:\n' || v_source_record.note
      ELSE note
    END,
      balance = GREATEST(COALESCE(balance, 0), COALESCE(v_source_record.balance, 0))
  WHERE id = _target_id;
  DELETE FROM public.workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;
  RETURN jsonb_build_object(
    'success', true,
    'phase', 5,
    'source_deleted', true
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase5(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase5(uuid, uuid, uuid) TO authenticated, service_role;

COMMIT;
