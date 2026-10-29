-- Manual rollback only; restores the prior definitions from main.
-- WARNING: a rollback removes the NULL-safe merge permission guards and
-- reopens SR-108 for authenticated callers. Anonymous and PUBLIC execute
-- stay revoked; only authenticated and service_role keep execute.

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1a(_source_id uuid, _target_id uuid, _ws_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_migrated_tables TEXT[] := '{}';
  v_migrated_count INTEGER := 0;
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1a');
  END IF;

  -- Validate permissions
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'delete_users') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: delete_users required', 'phase', '1a');
  END IF;
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'update_users') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: update_users required', 'phase', '1a');
  END IF;

  -- Validate source exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1a', 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables);
  END IF;

  -- Validate target exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _target_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found in workspace', 'phase', '1a');
  END IF;

  -- Prevent self-merge
  IF _source_id = _target_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot merge user with itself', 'phase', '1a');
  END IF;

  -- ========== BATCH 1: High-volume financial/inventory tables ==========

  -- wallet_transactions (creator_id) - often high volume
  UPDATE wallet_transactions SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'wallet_transactions'); v_migrated_count := v_migrated_count + 1; END IF;

  -- product_stock_changes (beneficiary_id, creator_id) - often high volume
  UPDATE product_stock_changes SET beneficiary_id = _target_id WHERE beneficiary_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.beneficiary_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE product_stock_changes SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'product_stock_changes.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  -- finance_invoices (customer_id, creator_id)
  UPDATE finance_invoices SET customer_id = _target_id WHERE customer_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.customer_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE finance_invoices SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'finance_invoices.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1a',
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1a(uuid, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1a(uuid, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phased(_source_id uuid, _target_id uuid, _ws_id uuid, _start_phase integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phased(uuid, uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phased(uuid, uuid, uuid, integer) TO authenticated, service_role;

COMMIT;
