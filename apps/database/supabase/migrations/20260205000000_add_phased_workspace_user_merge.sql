-- Migration: Add phased workspace user merge functions
-- Purpose: Split the merge into independent phases to handle large data footprints
-- that may exceed the 30-second timeout of the monolithic function.
--
-- Phases:
--   1: Simple FK updates (15 tables) - just UPDATE, no collision risk
--   2: Composite PK tables (6 tables) - collision detection and deletion
--   3: Custom fields merge
--   4: Platform link transfer
--   5: User data merge + source deletion
--
-- MAINTENANCE NOTE: When adding new foreign keys to workspace_users, update
-- the appropriate phase function. Run:
--   grep "referencedRelation: 'workspace_users'" packages/types/src/supabase.ts

-- ============================================================================
-- PHASE 1: Simple FK Updates
-- Tables with single FK to workspace_users - just UPDATE, no collision risk
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id UUID;
  v_migrated_tables TEXT[] := '{}';
  v_migrated_count INTEGER := 0;
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', 1);
  END IF;

  -- Validate permissions
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'delete_users') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: delete_users required', 'phase', 1);
  END IF;
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'update_users') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: update_users required', 'phase', 1);
  END IF;

  -- Validate source exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Source user not found in workspace', 'phase', 1);
  END IF;

  -- Validate target exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _target_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found in workspace', 'phase', 1);
  END IF;

  -- Prevent self-merge
  IF _source_id = _target_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot merge user with itself', 'phase', 1);
  END IF;

  -- ========== SIMPLE FK TABLES ==========

  -- product_stock_changes (beneficiary_id, creator_id)
  UPDATE product_stock_changes SET beneficiary_id = _target_id WHERE beneficiary_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.beneficiary_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE product_stock_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- user_feedbacks (user_id, creator_id)
  UPDATE user_feedbacks SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE user_feedbacks SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- finance_invoices (customer_id, creator_id)
  UPDATE finance_invoices SET customer_id = _target_id WHERE customer_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.customer_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE finance_invoices SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- wallet_transactions (creator_id)
  UPDATE wallet_transactions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'wallet_transactions'); v_migrated_count := v_migrated_count + 1; END IF;

  -- workspace_user_status_changes (user_id, creator_id)
  UPDATE workspace_user_status_changes SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE workspace_user_status_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- external_user_monthly_report_logs (user_id, creator_id)
  UPDATE external_user_monthly_report_logs SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE external_user_monthly_report_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- workspace_products (creator_id)
  UPDATE workspace_products SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_products'); v_migrated_count := v_migrated_count + 1; END IF;

  -- workspace_promotions (creator_id, owner_id)
  UPDATE workspace_promotions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE workspace_promotions SET owner_id = _target_id WHERE owner_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.owner_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- healthcare_checkups (patient_id)
  UPDATE healthcare_checkups SET patient_id = _target_id WHERE patient_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'healthcare_checkups'); v_migrated_count := v_migrated_count + 1; END IF;

  -- guest_users_lead_generation (user_id)
  UPDATE guest_users_lead_generation SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'guest_users_lead_generation'); v_migrated_count := v_migrated_count + 1; END IF;

  -- sent_emails (receiver_id)
  UPDATE sent_emails SET receiver_id = _target_id WHERE receiver_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'sent_emails'); v_migrated_count := v_migrated_count + 1; END IF;

  -- user_group_post_logs (creator_id)
  UPDATE user_group_post_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_post_logs'); v_migrated_count := v_migrated_count + 1; END IF;

  -- user_group_posts (creator_id, updated_by)
  UPDATE user_group_posts SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE user_group_posts SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.updated_by'); v_migrated_count := v_migrated_count + 1; END IF;

  -- payroll_run_items (user_id)
  UPDATE payroll_run_items SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'payroll_run_items'); v_migrated_count := v_migrated_count + 1; END IF;

  -- workforce_contracts (user_id)
  UPDATE workforce_contracts SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workforce_contracts'); v_migrated_count := v_migrated_count + 1; END IF;

  -- user_indicators (creator_id - not part of composite PK)
  UPDATE user_indicators SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- external_user_monthly_reports (user_id, creator_id, updated_by)
  UPDATE external_user_monthly_reports SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE external_user_monthly_reports SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE external_user_monthly_reports SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.updated_by'); v_migrated_count := v_migrated_count + 1; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'phase', 1,
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$$;

-- ============================================================================
-- PHASE 2: Composite PK Tables
-- Tables with composite PKs - need collision detection and deletion
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase2(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id UUID;
  v_migrated_tables TEXT[] := '{}';
  v_collision_tables TEXT[] := '{}';
  v_collision_details JSONB[] := '{}';
  v_collision_record_ids TEXT[];
  v_count_deleted INTEGER := 0;
  v_migrated_count INTEGER := 0;
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', 2);
  END IF;

  -- Validate source still exists (may have been deleted if phase 5 already ran)
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', 2, 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables, 'collision_details', v_collision_details);
  END IF;

  -- ========== user_indicators: PK = (user_id, indicator_id) ==========
  SELECT ARRAY_AGG(indicator_id::text) INTO v_collision_record_ids
  FROM user_indicators
  WHERE user_id = _source_id
    AND indicator_id IN (SELECT indicator_id FROM user_indicators WHERE user_id = _target_id);

  DELETE FROM user_indicators
  WHERE user_id = _source_id
    AND indicator_id IN (SELECT indicator_id FROM user_indicators WHERE user_id = _target_id);

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

  UPDATE user_indicators SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.user_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- ========== workspace_user_groups_users: PK = (user_id, group_id) ==========
  SELECT ARRAY_AGG(group_id::text) INTO v_collision_record_ids
  FROM workspace_user_groups_users
  WHERE user_id = _source_id
    AND group_id IN (SELECT group_id FROM workspace_user_groups_users WHERE user_id = _target_id);

  DELETE FROM workspace_user_groups_users
  WHERE user_id = _source_id
    AND group_id IN (SELECT group_id FROM workspace_user_groups_users WHERE user_id = _target_id);

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

  UPDATE workspace_user_groups_users SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_groups_users'); v_migrated_count := v_migrated_count + 1; END IF;

  -- ========== user_group_attendance: PK = (user_id, date, group_id) ==========
  SELECT ARRAY_AGG(date::text || '|' || group_id::text) INTO v_collision_record_ids
  FROM user_group_attendance
  WHERE user_id = _source_id
    AND (date, group_id) IN (SELECT date, group_id FROM user_group_attendance WHERE user_id = _target_id);

  DELETE FROM user_group_attendance
  WHERE user_id = _source_id
    AND (date, group_id) IN (SELECT date, group_id FROM user_group_attendance WHERE user_id = _target_id);

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

  UPDATE user_group_attendance SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_attendance'); v_migrated_count := v_migrated_count + 1; END IF;

  -- ========== user_linked_promotions: PK = (user_id, promo_id) ==========
  SELECT ARRAY_AGG(promo_id::text) INTO v_collision_record_ids
  FROM user_linked_promotions
  WHERE user_id = _source_id
    AND promo_id IN (SELECT promo_id FROM user_linked_promotions WHERE user_id = _target_id);

  DELETE FROM user_linked_promotions
  WHERE user_id = _source_id
    AND promo_id IN (SELECT promo_id FROM user_linked_promotions WHERE user_id = _target_id);

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

  UPDATE user_linked_promotions SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_linked_promotions'); v_migrated_count := v_migrated_count + 1; END IF;

  -- ========== calendar_event_virtual_participants: PK = (user_id, event_id) ==========
  SELECT ARRAY_AGG(event_id::text) INTO v_collision_record_ids
  FROM calendar_event_virtual_participants
  WHERE user_id = _source_id
    AND event_id IN (SELECT event_id FROM calendar_event_virtual_participants WHERE user_id = _target_id);

  DELETE FROM calendar_event_virtual_participants
  WHERE user_id = _source_id
    AND event_id IN (SELECT event_id FROM calendar_event_virtual_participants WHERE user_id = _target_id);

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

  UPDATE calendar_event_virtual_participants SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'calendar_event_virtual_participants'); v_migrated_count := v_migrated_count + 1; END IF;

  -- ========== user_group_post_checks: PK = (user_id, post_id) ==========
  SELECT ARRAY_AGG(post_id::text) INTO v_collision_record_ids
  FROM user_group_post_checks
  WHERE user_id = _source_id
    AND post_id IN (SELECT post_id FROM user_group_post_checks WHERE user_id = _target_id);

  DELETE FROM user_group_post_checks
  WHERE user_id = _source_id
    AND post_id IN (SELECT post_id FROM user_group_post_checks WHERE user_id = _target_id);

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

  UPDATE user_group_post_checks SET user_id = _target_id WHERE user_id = _source_id;
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
$$;

-- ============================================================================
-- PHASE 3: Custom Fields Merge
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase3(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id UUID;
  v_custom_fields_merged INTEGER := 0;
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', 3);
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', 3, 'message', 'Source user already deleted (merge complete)', 'custom_fields_merged', 0);
  END IF;

  -- Merge custom field values (source fills NULL gaps only)
  BEGIN
    UPDATE workspace_user_fields_values dst
    SET value = src.value
    FROM workspace_user_fields_values src
    WHERE dst.user_id = _target_id
      AND src.user_id = _source_id
      AND dst.field_id = src.field_id
      AND (dst.value IS NULL OR dst.value = '')
      AND src.value IS NOT NULL
      AND src.value != '';

    GET DIAGNOSTICS v_custom_fields_merged = ROW_COUNT;

    -- Delete source's field values (cleanup for phase 5)
    DELETE FROM workspace_user_fields_values
    WHERE user_id = _source_id;
  EXCEPTION
    WHEN undefined_table THEN
      -- Table doesn't exist, skip
      v_custom_fields_merged := 0;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'phase', 3,
    'custom_fields_merged', v_custom_fields_merged
  );
END;
$$;

-- ============================================================================
-- PHASE 4: Platform Link Transfer
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase4(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id UUID;
  v_source_linked BOOLEAN := FALSE;
  v_target_linked BOOLEAN := FALSE;
  v_source_platform_user_id UUID;
  v_target_platform_user_id UUID;
  v_link_transferred BOOLEAN := FALSE;
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', 4);
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', 4, 'message', 'Source user already deleted (merge complete)', 'link_transferred', false);
  END IF;

  -- Check platform link status
  SELECT
    platform_user_id IS NOT NULL,
    platform_user_id
  INTO v_source_linked, v_source_platform_user_id
  FROM workspace_user_linked_users
  WHERE virtual_user_id = _source_id AND ws_id = _ws_id;

  SELECT
    platform_user_id IS NOT NULL,
    platform_user_id
  INTO v_target_linked, v_target_platform_user_id
  FROM workspace_user_linked_users
  WHERE virtual_user_id = _target_id AND ws_id = _ws_id;

  -- Handle NULL from no rows found
  v_source_linked := COALESCE(v_source_linked, FALSE);
  v_target_linked := COALESCE(v_target_linked, FALSE);

  -- If both are linked to DIFFERENT platform users, reject the merge
  IF v_source_linked AND v_target_linked AND v_source_platform_user_id != v_target_platform_user_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot merge: Both users are linked to different platform accounts. Merging would cause one platform user to lose their workspace association.',
      'phase', 4,
      'source_platform_user_id', v_source_platform_user_id,
      'target_platform_user_id', v_target_platform_user_id
    );
  END IF;

  -- Transfer link if source is linked and target is not
  IF v_source_linked AND NOT v_target_linked THEN
    UPDATE workspace_user_linked_users
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
$$;

-- ============================================================================
-- PHASE 5: User Data Merge + Source Deletion (FINAL PHASE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase5(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE
  v_user_id UUID;
  v_source_record workspace_users%ROWTYPE;
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', 5);
  END IF;

  -- Get source record (may not exist if already merged)
  SELECT * INTO v_source_record
  FROM workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'phase', 5, 'message', 'Source user already deleted (merge complete)');
  END IF;

  -- Validate target exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _target_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found in workspace', 'phase', 5);
  END IF;

  -- Merge user data (source fills NULL gaps in target)
  UPDATE workspace_users
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
    -- Preserve higher balance
    balance = GREATEST(COALESCE(balance, 0), COALESCE(v_source_record.balance, 0))
  WHERE id = _target_id;

  -- Delete source user (IRREVERSIBLE)
  DELETE FROM workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;

  RETURN jsonb_build_object(
    'success', true,
    'phase', 5,
    'source_deleted', true
  );
END;
$$;

-- ============================================================================
-- ORCHESTRATOR: merge_workspace_users_phased
-- Runs all phases sequentially, can resume from a specific phase
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phased(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID,
  _start_phase INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_phase_results JSONB[] := '{}';
  v_all_migrated_tables TEXT[] := '{}';
  v_all_collision_tables TEXT[] := '{}';
  v_all_collision_details JSONB[] := '{}';
  v_custom_fields_merged INTEGER := 0;
  v_link_transferred BOOLEAN := FALSE;
  v_source_platform_user_id UUID;
  v_target_platform_user_id UUID;
BEGIN
  -- Validate start phase
  IF _start_phase < 1 OR _start_phase > 5 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid start_phase. Must be 1-5.',
      'completed_phase', 0
    );
  END IF;

  -- Phase 1: Simple FK Updates
  IF _start_phase <= 1 THEN
    v_result := merge_workspace_users_phase1(_source_id, _target_id, _ws_id);
    v_phase_results := array_append(v_phase_results, v_result);

    IF NOT (v_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', v_result->>'error',
        'completed_phase', 0,
        'next_phase', 1,
        'partial', true,
        'phase_results', v_phase_results
      );
    END IF;

    -- Accumulate results
    IF v_result->'migrated_tables' IS NOT NULL THEN
      SELECT array_agg(elem) INTO v_all_migrated_tables
      FROM (
        SELECT unnest(v_all_migrated_tables) AS elem
        UNION ALL
        SELECT jsonb_array_elements_text(v_result->'migrated_tables')
      ) subq;
    END IF;
  END IF;

  -- Phase 2: Composite PK Tables
  IF _start_phase <= 2 THEN
    v_result := merge_workspace_users_phase2(_source_id, _target_id, _ws_id);
    v_phase_results := array_append(v_phase_results, v_result);

    IF NOT (v_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', v_result->>'error',
        'completed_phase', 1,
        'next_phase', 2,
        'partial', true,
        'phase_results', v_phase_results
      );
    END IF;

    -- Accumulate results
    IF v_result->'migrated_tables' IS NOT NULL THEN
      SELECT array_agg(elem) INTO v_all_migrated_tables
      FROM (
        SELECT unnest(v_all_migrated_tables) AS elem
        UNION ALL
        SELECT jsonb_array_elements_text(v_result->'migrated_tables')
      ) subq;
    END IF;

    IF v_result->'collision_tables' IS NOT NULL THEN
      SELECT array_agg(elem) INTO v_all_collision_tables
      FROM (
        SELECT unnest(v_all_collision_tables) AS elem
        UNION ALL
        SELECT jsonb_array_elements_text(v_result->'collision_tables')
      ) subq;
    END IF;

    IF v_result->'collision_details' IS NOT NULL THEN
      SELECT array_agg(elem) INTO v_all_collision_details
      FROM (
        SELECT unnest(v_all_collision_details) AS elem
        UNION ALL
        SELECT jsonb_array_elements(v_result->'collision_details')
      ) subq;
    END IF;
  END IF;

  -- Phase 3: Custom Fields Merge
  IF _start_phase <= 3 THEN
    v_result := merge_workspace_users_phase3(_source_id, _target_id, _ws_id);
    v_phase_results := array_append(v_phase_results, v_result);

    IF NOT (v_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', v_result->>'error',
        'completed_phase', 2,
        'next_phase', 3,
        'partial', true,
        'phase_results', v_phase_results
      );
    END IF;

    v_custom_fields_merged := COALESCE((v_result->>'custom_fields_merged')::integer, 0);
  END IF;

  -- Phase 4: Platform Link Transfer
  IF _start_phase <= 4 THEN
    v_result := merge_workspace_users_phase4(_source_id, _target_id, _ws_id);
    v_phase_results := array_append(v_phase_results, v_result);

    IF NOT (v_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', v_result->>'error',
        'completed_phase', 3,
        'next_phase', 4,
        'partial', true,
        'phase_results', v_phase_results,
        'source_platform_user_id', v_result->>'source_platform_user_id',
        'target_platform_user_id', v_result->>'target_platform_user_id'
      );
    END IF;

    v_link_transferred := COALESCE((v_result->>'link_transferred')::boolean, false);
    v_source_platform_user_id := (v_result->>'source_platform_user_id')::uuid;
    v_target_platform_user_id := (v_result->>'target_platform_user_id')::uuid;

    IF v_link_transferred THEN
      v_all_migrated_tables := array_append(v_all_migrated_tables, 'workspace_user_linked_users (link transferred)');
    END IF;
  END IF;

  -- Phase 5: User Data Merge + Source Deletion
  IF _start_phase <= 5 THEN
    v_result := merge_workspace_users_phase5(_source_id, _target_id, _ws_id);
    v_phase_results := array_append(v_phase_results, v_result);

    IF NOT (v_result->>'success')::boolean THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', v_result->>'error',
        'completed_phase', 4,
        'next_phase', 5,
        'partial', true,
        'phase_results', v_phase_results
      );
    END IF;
  END IF;

  -- All phases complete
  RETURN jsonb_build_object(
    'success', true,
    'completed_phase', 5,
    'partial', false,
    'source_user_id', _source_id,
    'target_user_id', _target_id,
    'migrated_tables', COALESCE(v_all_migrated_tables, ARRAY[]::TEXT[]),
    'collision_tables', COALESCE(v_all_collision_tables, ARRAY[]::TEXT[]),
    'collision_details', COALESCE(v_all_collision_details, ARRAY[]::JSONB[]),
    'custom_fields_merged', v_custom_fields_merged,
    'source_platform_user_id', v_source_platform_user_id,
    'target_platform_user_id', v_target_platform_user_id,
    'phase_results', v_phase_results
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase2(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase3(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase4(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase5(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phased(UUID, UUID, UUID, INT) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.merge_workspace_users_phase1 IS
  'Phase 1 of workspace user merge: Migrates simple FK references (15 tables). Tables with single FK to workspace_users - just UPDATE, no collision risk.';

COMMENT ON FUNCTION public.merge_workspace_users_phase2 IS
  'Phase 2 of workspace user merge: Handles composite PK tables (6 tables) with collision detection and deletion.';

COMMENT ON FUNCTION public.merge_workspace_users_phase3 IS
  'Phase 3 of workspace user merge: Merges custom field values (source fills NULL gaps in target).';

COMMENT ON FUNCTION public.merge_workspace_users_phase4 IS
  'Phase 4 of workspace user merge: Transfers platform link if source is linked and target is not. Rejects if both linked to different users.';

COMMENT ON FUNCTION public.merge_workspace_users_phase5 IS
  'Phase 5 of workspace user merge (FINAL): Merges user data fields and deletes source user. IRREVERSIBLE after completion.';

COMMENT ON FUNCTION public.merge_workspace_users_phased IS
  'Orchestrates the 5-phase workspace user merge. Can resume from a specific phase via start_phase parameter (1-5). Returns partial=true if interrupted, with next_phase indicating where to resume.

MAINTENANCE: When adding new FKs to workspace_users, update the appropriate phase function. Run: grep "referencedRelation: ''workspace_users''" packages/types/src/supabase.ts';
