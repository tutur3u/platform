-- Migration: Optimize workspace user merge function
-- Purpose: Replace dynamic FK discovery (information_schema queries) with explicit table handling
-- Addresses: Statement timeout (error code 57014) caused by slow information_schema queries
--
-- MAINTENANCE NOTE: When adding new foreign keys to workspace_users, update this function.
-- To find all current FK references, run:
--   grep "referencedRelation: 'workspace_users'" packages/types/src/supabase.ts

-- Drop and recreate the function with optimized FK handling
CREATE OR REPLACE FUNCTION public.merge_workspace_users(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'  -- Safety net: 30 second timeout
AS $$
DECLARE
  v_user_id UUID;
  v_source_record workspace_users%ROWTYPE;
  v_target_record workspace_users%ROWTYPE;
  v_source_linked BOOLEAN := FALSE;
  v_target_linked BOOLEAN := FALSE;
  v_source_platform_user_id UUID;
  v_target_platform_user_id UUID;
  v_count_migrated INTEGER := 0;
  v_count_deleted INTEGER := 0;
  v_migrated_tables TEXT[] := '{}';
  v_collision_tables TEXT[] := '{}';
  v_collision_details JSONB[] := '{}';
  v_collision_record_ids TEXT[];
  v_custom_fields_merged INTEGER := 0;
  v_result JSONB;
BEGIN
  -- ============================================
  -- SECTION 1: AUTHENTICATION & AUTHORIZATION
  -- ============================================

  -- Get the current authenticated user
  v_user_id := auth.uid();

  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  END IF;

  -- Check if user has permission to delete users (merging deletes the source)
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'delete_users') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: delete_users required'
    );
  END IF;

  -- Check if user has permission to update users (merging updates the target)
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'update_users') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: update_users required'
    );
  END IF;

  -- ============================================
  -- SECTION 2: VALIDATION
  -- ============================================

  -- Validate source and target exist and belong to the workspace
  SELECT * INTO v_source_record
  FROM workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Source user not found in workspace'
    );
  END IF;

  SELECT * INTO v_target_record
  FROM workspace_users
  WHERE id = _target_id AND ws_id = _ws_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Target user not found in workspace'
    );
  END IF;

  -- Prevent self-merge
  IF _source_id = _target_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot merge user with itself'
    );
  END IF;

  -- Check if both users are linked to platform users
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
      'source_platform_user_id', v_source_platform_user_id,
      'target_platform_user_id', v_target_platform_user_id
    );
  END IF;

  -- ============================================
  -- SECTION 3: FK MIGRATION (OPTIMIZED - EXPLICIT TABLES)
  -- ============================================
  -- This section replaces the slow information_schema loop with direct statements.
  -- Tables are organized by: Simple FKs (just UPDATE) vs Composite PK FKs (collision detection needed)

  -- ========== SIMPLE FK TABLES (just UPDATE, no collision detection) ==========
  -- These tables have single-column PKs or the FK column is not part of the PK

  -- product_stock_changes (beneficiary_id, creator_id)
  UPDATE product_stock_changes SET beneficiary_id = _target_id WHERE beneficiary_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.beneficiary_id'); END IF;
  UPDATE product_stock_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.creator_id'); END IF;

  -- user_feedbacks (user_id, creator_id)
  UPDATE user_feedbacks SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.user_id'); END IF;
  UPDATE user_feedbacks SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.creator_id'); END IF;

  -- finance_invoices (customer_id, creator_id)
  UPDATE finance_invoices SET customer_id = _target_id WHERE customer_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.customer_id'); END IF;
  UPDATE finance_invoices SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.creator_id'); END IF;

  -- wallet_transactions (creator_id)
  UPDATE wallet_transactions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'wallet_transactions'); END IF;

  -- workspace_user_status_changes (user_id, creator_id)
  UPDATE workspace_user_status_changes SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.user_id'); END IF;
  UPDATE workspace_user_status_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.creator_id'); END IF;

  -- external_user_monthly_report_logs (user_id, creator_id)
  UPDATE external_user_monthly_report_logs SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.user_id'); END IF;
  UPDATE external_user_monthly_report_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.creator_id'); END IF;

  -- workspace_products (creator_id)
  UPDATE workspace_products SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_products'); END IF;

  -- workspace_promotions (creator_id, owner_id)
  UPDATE workspace_promotions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.creator_id'); END IF;
  UPDATE workspace_promotions SET owner_id = _target_id WHERE owner_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.owner_id'); END IF;

  -- healthcare_checkups (patient_id)
  UPDATE healthcare_checkups SET patient_id = _target_id WHERE patient_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'healthcare_checkups'); END IF;

  -- guest_users_lead_generation (user_id)
  UPDATE guest_users_lead_generation SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'guest_users_lead_generation'); END IF;

  -- sent_emails (receiver_id - sender_id references platform users, not workspace_users)
  UPDATE sent_emails SET receiver_id = _target_id WHERE receiver_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'sent_emails'); END IF;

  -- user_group_post_logs (creator_id)
  UPDATE user_group_post_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_post_logs'); END IF;

  -- user_group_posts (creator_id, updated_by)
  UPDATE user_group_posts SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.creator_id'); END IF;
  UPDATE user_group_posts SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.updated_by'); END IF;

  -- payroll_run_items (user_id)
  UPDATE payroll_run_items SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'payroll_run_items'); END IF;

  -- workforce_contracts (user_id)
  UPDATE workforce_contracts SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workforce_contracts'); END IF;

  -- user_indicators (creator_id - not part of composite PK)
  UPDATE user_indicators SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.creator_id'); END IF;

  -- external_user_monthly_reports (user_id, creator_id, updated_by - table has simple id PK)
  UPDATE external_user_monthly_reports SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.user_id'); END IF;
  UPDATE external_user_monthly_reports SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.creator_id'); END IF;
  UPDATE external_user_monthly_reports SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.updated_by'); END IF;

  -- ========== COMPOSITE PK TABLES (collision detection needed) ==========
  -- For these tables, user_id is part of a composite primary key.
  -- We must delete source records that would collide with existing target records.

  -- user_indicators: PK = (user_id, indicator_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.user_id'); END IF;

  -- workspace_user_groups_users: PK = (user_id, group_id)
  -- Note: FK constraint is named workspace_user_roles_users_user_id_fkey (legacy naming)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_groups_users'); END IF;

  -- user_group_attendance: PK = (user_id, date, group_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_attendance'); END IF;

  -- user_linked_promotions: PK = (user_id, promo_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_linked_promotions'); END IF;

  -- calendar_event_virtual_participants: PK = (user_id, event_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'calendar_event_virtual_participants'); END IF;

  -- user_group_post_checks: PK = (user_id, post_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_post_checks'); END IF;

  -- ============================================
  -- SECTION 4: PLATFORM LINK TRANSFER
  -- ============================================

  -- Transfer link if source is linked and target is not
  IF v_source_linked AND NOT v_target_linked THEN
    UPDATE workspace_user_linked_users
    SET virtual_user_id = _target_id
    WHERE virtual_user_id = _source_id AND ws_id = _ws_id;

    v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_linked_users (link transferred)');
  END IF;

  -- ============================================
  -- SECTION 5: CUSTOM FIELD MERGE
  -- ============================================

  -- Merge custom field values (source fills NULL gaps only)
  -- Note: This table may not exist in all deployments
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

    -- Delete source's field values
    DELETE FROM workspace_user_fields_values
    WHERE user_id = _source_id;
  EXCEPTION
    WHEN undefined_table THEN
      -- Table doesn't exist, skip
      v_custom_fields_merged := 0;
  END;

  -- ============================================
  -- SECTION 6: USER DATA MERGE
  -- ============================================

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

  -- ============================================
  -- SECTION 7: DELETE SOURCE & RETURN RESULT
  -- ============================================

  -- Delete source user
  DELETE FROM workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;

  -- Build result with collision details
  v_result := jsonb_build_object(
    'success', true,
    'source_user_id', _source_id,
    'target_user_id', _target_id,
    'migrated_tables', v_migrated_tables,
    'collision_tables', v_collision_tables,
    'collision_details', v_collision_details,
    'custom_fields_merged', v_custom_fields_merged
  );

  RETURN v_result;
END;
$$;

-- Update comment with maintenance instructions
COMMENT ON FUNCTION public.merge_workspace_users IS
  'Merges source workspace user into target user. Features: (1) Validates both users are not linked to different platform accounts, (2) Migrates all FK references with collision detection for composite PKs, (3) Logs detailed collision information for recovery assessment, (4) Transfers platform link if applicable, (5) Fills NULL target fields from source. Source user is deleted after merge. Requires: delete_users AND update_users permissions.

MAINTENANCE: When adding new FKs to workspace_users, update this function. Run: grep "referencedRelation: ''workspace_users''" packages/types/src/supabase.ts';
