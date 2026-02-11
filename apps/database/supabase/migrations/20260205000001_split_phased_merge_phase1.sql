-- Migration: Split phase 1 into smaller sub-phases
-- Purpose: Phase 1 with all 15+ tables can timeout for users with large data footprints.
-- Split into 3 sub-phases (1a, 1b, 1c) for better timeout resilience.

-- ============================================================================
-- PHASE 1A: Simple FK Updates - Batch 1 (High-volume tables)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1a(
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
$$;

-- ============================================================================
-- PHASE 1B: Simple FK Updates - Batch 2 (Medium-volume tables)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1b(
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
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1b');
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1b', 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables);
  END IF;

  -- ========== BATCH 2: Status/report tables ==========

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

  -- external_user_monthly_reports (user_id, creator_id, updated_by)
  UPDATE external_user_monthly_reports SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE external_user_monthly_reports SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE external_user_monthly_reports SET updated_by = _target_id WHERE updated_by = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'external_user_monthly_reports.updated_by'); v_migrated_count := v_migrated_count + 1; END IF;

  -- user_feedbacks (user_id, creator_id)
  UPDATE user_feedbacks SET user_id = _target_id WHERE user_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.user_id'); v_migrated_count := v_migrated_count + 1; END IF;
  UPDATE user_feedbacks SET creator_id = _target_id WHERE creator_id = _source_id;
  IF FOUND THEN v_migrated_tables := array_append(v_migrated_tables, 'user_feedbacks.creator_id'); v_migrated_count := v_migrated_count + 1; END IF;

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1b',
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$$;

-- ============================================================================
-- PHASE 1C: Simple FK Updates - Batch 3 (Low-volume/miscellaneous tables)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1c(
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
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1c');
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1c', 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables);
  END IF;

  -- ========== BATCH 3: Product/promotion/misc tables ==========

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

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1c',
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$$;

-- ============================================================================
-- PHASE 1D: Simple FK Updates - Batch 4 (User group/post tables)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1d(
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
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1d');
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1d', 'message', 'Source user already deleted (merge complete)', 'migrated_tables', v_migrated_tables);
  END IF;

  -- ========== BATCH 4: User group/post/workforce tables ==========

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

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1d',
    'migrated_tables', v_migrated_tables,
    'migrated_count', v_migrated_count
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1a(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1b(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1c(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1d(UUID, UUID, UUID) TO authenticated;

-- Add comments
COMMENT ON FUNCTION public.merge_workspace_users_phase1a IS
  'Phase 1a of workspace user merge: High-volume financial/inventory tables (wallet_transactions, product_stock_changes, finance_invoices).';

COMMENT ON FUNCTION public.merge_workspace_users_phase1b IS
  'Phase 1b of workspace user merge: Status and report tables (workspace_user_status_changes, external_user_monthly_report_logs, external_user_monthly_reports, user_feedbacks).';

COMMENT ON FUNCTION public.merge_workspace_users_phase1c IS
  'Phase 1c of workspace user merge: Product/promotion/misc tables (workspace_products, workspace_promotions, healthcare_checkups, guest_users_lead_generation, sent_emails).';

COMMENT ON FUNCTION public.merge_workspace_users_phase1d IS
  'Phase 1d of workspace user merge: User group/post/workforce tables (user_group_post_logs, user_group_posts, payroll_run_items, workforce_contracts, user_indicators.creator_id).';
