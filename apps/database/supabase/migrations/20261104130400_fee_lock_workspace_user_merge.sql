BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Workspace-user merge keeps fee locks. fee_locks.student_id is ON DELETE NO
-- ACTION, so the two merge paths that delete the source user (the single-call
-- merge and phase 5 of the phased merge) first move the source's fee locks to
-- the target. Rule: months the target has no fee lock for move to the target
-- (version + 1, so open editors get a conflict). If both users have a fee lock
-- for the same month the merge is refused with FEE_LOCK_MERGE_CONFLICT, listing
-- the months: staff resolve them first, nothing is dropped. Locked revision
-- snapshots keep the old student id as history.
--
-- The two merge functions below are copied verbatim from their current
-- definitions (20261029050410 and 20261029050400) with one added line each:
-- the PERFORM call just before the source user is deleted. Same signatures,
-- grants and settings.

CREATE FUNCTION private.fee_lock_merge_students(_source_id UUID, _target_id UUID, _ws_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_months TEXT;
  v_moved INTEGER;
BEGIN
  SELECT string_agg(to_char(s.period_month, 'YYYY-MM'), ', ' ORDER BY s.period_month) INTO v_months
  FROM public.fee_locks s
  JOIN public.fee_locks t ON t.ws_id = s.ws_id AND t.period_month = s.period_month AND t.student_id = _target_id
  WHERE s.ws_id = _ws_id AND s.student_id = _source_id;
  IF v_months IS NOT NULL THEN
    RAISE EXCEPTION 'FEE_LOCK_MERGE_CONFLICT' USING ERRCODE = '23505',
      DETAIL = 'Both users have a fee lock for: ' || v_months, HINT = 'Resolve these fee locks before merging.';
  END IF;
  UPDATE public.fee_locks SET student_id = _target_id, version = version + 1, updated_at = now()
  WHERE ws_id = _ws_id AND student_id = _source_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RETURN v_moved;
END;
$$;

-- tuturuuu: no-grant (internal)
REVOKE ALL ON FUNCTION private.fee_lock_merge_students(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.merge_workspace_users(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_source_record public.workspace_users%ROWTYPE;
  v_target_record public.workspace_users%ROWTYPE;
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
  IF public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: delete_users required'
    );
  END IF;

  -- Check if user has permission to update users (merging updates the target)
  IF public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS NOT TRUE THEN
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
  FROM public.workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Source user not found in workspace'
    );
  END IF;

  SELECT * INTO v_target_record
  FROM public.workspace_users
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
  FROM public.workspace_user_linked_users
  WHERE virtual_user_id = _source_id AND ws_id = _ws_id;

  SELECT
    platform_user_id IS NOT NULL,
    platform_user_id
  INTO v_target_linked, v_target_platform_user_id
  FROM public.workspace_user_linked_users
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
  UPDATE public.product_stock_changes SET beneficiary_id = _target_id WHERE beneficiary_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.beneficiary_id'); END IF;
  UPDATE public.product_stock_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.creator_id'); END IF;

  -- user_feedbacks (user_id, creator_id)
  UPDATE public.user_feedbacks SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.user_id'); END IF;
  UPDATE public.user_feedbacks SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.creator_id'); END IF;

  -- finance_invoices (customer_id, creator_id)
  UPDATE public.finance_invoices SET customer_id = _target_id WHERE customer_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.customer_id'); END IF;
  UPDATE public.finance_invoices SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.creator_id'); END IF;

  -- wallet_transactions (creator_id)
  UPDATE public.wallet_transactions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'wallet_transactions'); END IF;

  -- workspace_user_status_changes (user_id, creator_id)
  UPDATE public.workspace_user_status_changes SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.user_id'); END IF;
  UPDATE public.workspace_user_status_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_status_changes.creator_id'); END IF;

  -- external_user_monthly_report_logs (user_id, creator_id)
  UPDATE private.external_user_monthly_report_logs SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.user_id'); END IF;
  UPDATE private.external_user_monthly_report_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_report_logs.creator_id'); END IF;

  -- workspace_products (creator_id)
  UPDATE public.workspace_products SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_products'); END IF;

  -- workspace_promotions (creator_id, owner_id)
  UPDATE private.workspace_promotions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.creator_id'); END IF;
  UPDATE private.workspace_promotions SET owner_id = _target_id WHERE owner_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_promotions.owner_id'); END IF;

  -- healthcare_checkups (patient_id)
  UPDATE private.healthcare_checkups SET patient_id = _target_id WHERE patient_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'healthcare_checkups'); END IF;

  -- guest_users_lead_generation (user_id)
  UPDATE public.guest_users_lead_generation SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'guest_users_lead_generation'); END IF;

  -- sent_emails (receiver_id - sender_id references platform users, not workspace_users)
  UPDATE public.sent_emails SET receiver_id = _target_id WHERE receiver_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'sent_emails'); END IF;

  -- user_group_post_logs (creator_id)
  UPDATE private.user_group_post_logs SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_post_logs'); END IF;

  -- user_group_posts (creator_id, updated_by)
  UPDATE private.user_group_posts SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.creator_id'); END IF;
  UPDATE private.user_group_posts SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_posts.updated_by'); END IF;

  -- payroll_run_items (user_id)
  UPDATE private.payroll_run_items SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'payroll_run_items'); END IF;

  -- workforce_contracts (user_id)
  UPDATE public.workforce_contracts SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workforce_contracts'); END IF;

  -- user_indicators (creator_id - not part of composite PK)
  UPDATE public.user_indicators SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.creator_id'); END IF;

  -- external_user_monthly_reports (user_id, creator_id, updated_by - table has simple id PK)
  UPDATE private.external_user_monthly_reports SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.user_id'); END IF;
  UPDATE private.external_user_monthly_reports SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.creator_id'); END IF;
  UPDATE private.external_user_monthly_reports SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.updated_by'); END IF;

  -- ========== COMPOSITE PK TABLES (collision detection needed) ==========
  -- For these tables, user_id is part of a composite primary key.
  -- We must delete source records that would collide with existing target records.

  -- user_indicators: PK = (user_id, indicator_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_indicators.user_id'); END IF;

  -- workspace_user_groups_users: PK = (user_id, group_id)
  -- Note: FK constraint is named workspace_user_roles_users_user_id_fkey (legacy naming)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_groups_users'); END IF;

  -- user_group_attendance: PK = (user_id, date, group_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_attendance'); END IF;

  -- user_linked_promotions: PK = (user_id, promo_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_linked_promotions'); END IF;

  -- calendar_event_virtual_participants: PK = (user_id, event_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'calendar_event_virtual_participants'); END IF;

  -- user_group_post_checks: PK = (user_id, post_id)
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
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_group_post_checks'); END IF;

  -- ============================================
  -- SECTION 4: PLATFORM LINK TRANSFER
  -- ============================================

  -- Transfer link if source is linked and target is not
  IF v_source_linked AND NOT v_target_linked THEN
    UPDATE public.workspace_user_linked_users
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

    -- Delete source's field values
    DELETE FROM public.workspace_user_fields_values
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
    -- Preserve higher balance
    balance = GREATEST(COALESCE(balance, 0), COALESCE(v_source_record.balance, 0))
  WHERE id = _target_id;

  -- ============================================
  -- SECTION 7: DELETE SOURCE & RETURN RESULT
  -- ============================================

  PERFORM private.fee_lock_merge_students(_source_id, _target_id, _ws_id);
  -- Delete source user
  DELETE FROM public.workspace_users
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
$function$;

-- Same end state as before: authenticated and service_role execute (the body
-- checks auth.uid() and permissions), PUBLIC and anon do not.
REVOKE ALL ON FUNCTION public.merge_workspace_users(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.merge_workspace_users(uuid,uuid,uuid) review=https://github.com/tutur3u/platform/pull/7002
GRANT EXECUTE ON FUNCTION public.merge_workspace_users(uuid, uuid, uuid) TO authenticated, service_role;

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
  v_deleted INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL
    OR public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS DISTINCT FROM TRUE
    OR public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Insufficient permissions to merge workspace users' USING ERRCODE = '42501';
  END IF;
  -- Lock both rows in id order so concurrent or swapped merges serialize
  -- before the existence checks and cannot delete both users.
  PERFORM 1 FROM public.workspace_users
  WHERE ws_id = _ws_id AND id IN (_source_id, _target_id)
  ORDER BY id
  FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id)
    OR _source_id IS NOT DISTINCT FROM _target_id THEN
    RAISE EXCEPTION 'Invalid merge target' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_source_record
  FROM public.workspace_users
  WHERE id = _source_id AND ws_id = _ws_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'phase', 5, 'message', 'Source user already deleted (merge complete)');
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
  WHERE id = _target_id AND ws_id = _ws_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merge target changed during merge' USING ERRCODE = '40001';
  END IF;
  PERFORM private.fee_lock_merge_students(_source_id, _target_id, _ws_id);
  DELETE FROM public.workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'Merge source changed during merge' USING ERRCODE = '40001';
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'phase', 5,
    'source_deleted', true
  );
END;
$function$;

-- Same end state as before: authenticated and service_role execute (the body
-- checks auth.uid() and permissions), PUBLIC and anon do not.
REVOKE ALL ON FUNCTION public.merge_workspace_users_phase5(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.merge_workspace_users_phase5(uuid,uuid,uuid) review=https://github.com/tutur3u/platform/pull/7002
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase5(uuid, uuid, uuid) TO authenticated, service_role;

COMMIT;
