-- Fail closed when merge permission checks return NULL (batched phase 1 helpers).
-- Part of SR-108; see 20261027150200_merge_phase_workspace_guards.
-- The two dynamic-identifier helpers refuse any (table, column) outside the fixed
-- phase 1a-1d merge graph and stay service_role-only, matching the emergency
-- revoke in 20261027151000 regardless of the order the two are applied in.

BEGIN;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_batch_update(_source_id uuid, _target_id uuid, _ws_id uuid, _table_name text, _column_name text, _batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_user_id UUID;
  v_rows_updated INTEGER := 0;
  v_has_more BOOLEAN := FALSE;
  v_remaining INTEGER := 0;
BEGIN
  -- Only the fixed phase 1a-1d merge references; anything else is refused before any check or write.
  IF ((_table_name, _column_name) IN (VALUES
    ('external_user_monthly_report_logs', 'creator_id'),
    ('external_user_monthly_report_logs', 'user_id'),
    ('external_user_monthly_reports', 'creator_id'),
    ('external_user_monthly_reports', 'updated_by'),
    ('external_user_monthly_reports', 'user_id'),
    ('finance_invoices', 'creator_id'),
    ('finance_invoices', 'customer_id'),
    ('guest_users_lead_generation', 'user_id'),
    ('healthcare_checkups', 'patient_id'),
    ('payroll_run_items', 'user_id'),
    ('product_stock_changes', 'beneficiary_id'),
    ('product_stock_changes', 'creator_id'),
    ('sent_emails', 'receiver_id'),
    ('user_feedbacks', 'creator_id'),
    ('user_feedbacks', 'user_id'),
    ('user_group_post_logs', 'creator_id'),
    ('user_group_posts', 'creator_id'),
    ('user_group_posts', 'updated_by'),
    ('user_indicators', 'creator_id'),
    ('wallet_transactions', 'creator_id'),
    ('workforce_contracts', 'user_id'),
    ('workspace_products', 'creator_id'),
    ('workspace_promotions', 'creator_id'),
    ('workspace_promotions', 'owner_id'),
    ('workspace_user_status_changes', 'creator_id'),
    ('workspace_user_status_changes', 'user_id')
  )) IS NOT TRUE THEN
    RAISE EXCEPTION 'Unsupported merge reference %.%', _table_name, _column_name
      USING ERRCODE = '22023';
  END IF;

  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Validate permissions
  IF public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: delete_users required');
  END IF;
  IF public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: update_users required');
  END IF;

  -- Validate source exists
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object(
      'success', true,
      'rows_updated', 0,
      'has_more', false,
      'message', 'Source user already deleted'
    );
  END IF;

  -- Perform batched update using a subquery with LIMIT
  -- This updates only _batch_size rows at a time
  EXECUTE format(
    'WITH batch AS (
      SELECT ctid FROM %I
      WHERE %I = $1
      LIMIT $3
    )
    UPDATE %I t
    SET %I = $2
    FROM batch
    WHERE t.ctid = batch.ctid',
    _table_name, _column_name,
    _table_name, _column_name
  ) USING _source_id, _target_id, _batch_size;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- Check if there are more rows to process
  EXECUTE format(
    'SELECT COUNT(*) FROM %I WHERE %I = $1 LIMIT 1',
    _table_name, _column_name
  ) INTO v_remaining USING _source_id;

  v_has_more := v_remaining > 0;

  RETURN jsonb_build_object(
    'success', true,
    'table', _table_name,
    'column', _column_name,
    'rows_updated', v_rows_updated,
    'has_more', v_has_more,
    'remaining', v_remaining
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_batch_update(uuid, uuid, uuid, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_table_batch(_source_id uuid, _target_id uuid, _ws_id uuid, _table_name text, _column_name text, _batch_size integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_user_id UUID;
  v_rows_updated INT := 0;
  v_has_more BOOLEAN := false;
  v_count_before INT;
  v_count_after INT;
BEGIN
  -- Only the fixed phase 1a-1d merge references; anything else is refused before any check or write.
  IF ((_table_name, _column_name) IN (VALUES
    ('external_user_monthly_report_logs', 'creator_id'),
    ('external_user_monthly_report_logs', 'user_id'),
    ('external_user_monthly_reports', 'creator_id'),
    ('external_user_monthly_reports', 'updated_by'),
    ('external_user_monthly_reports', 'user_id'),
    ('finance_invoices', 'creator_id'),
    ('finance_invoices', 'customer_id'),
    ('guest_users_lead_generation', 'user_id'),
    ('healthcare_checkups', 'patient_id'),
    ('payroll_run_items', 'user_id'),
    ('product_stock_changes', 'beneficiary_id'),
    ('product_stock_changes', 'creator_id'),
    ('sent_emails', 'receiver_id'),
    ('user_feedbacks', 'creator_id'),
    ('user_feedbacks', 'user_id'),
    ('user_group_post_logs', 'creator_id'),
    ('user_group_posts', 'creator_id'),
    ('user_group_posts', 'updated_by'),
    ('user_indicators', 'creator_id'),
    ('wallet_transactions', 'creator_id'),
    ('workforce_contracts', 'user_id'),
    ('workspace_products', 'creator_id'),
    ('workspace_promotions', 'creator_id'),
    ('workspace_promotions', 'owner_id'),
    ('workspace_user_status_changes', 'creator_id'),
    ('workspace_user_status_changes', 'user_id')
  )) IS NOT TRUE THEN
    RAISE EXCEPTION 'Unsupported merge reference %.%', _table_name, _column_name
      USING ERRCODE = '22023';
  END IF;

  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authentication required',
      'table', _table_name,
      'column', _column_name
    );
  END IF;

  -- Validate permissions
  IF public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: delete_users required',
      'table', _table_name,
      'column', _column_name
    );
  END IF;
  IF public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: update_users required',
      'table', _table_name,
      'column', _column_name
    );
  END IF;

  -- Validate source exists (may already be deleted if merge complete)
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object(
      'success', true,
      'table', _table_name,
      'column', _column_name,
      'rows_updated', 0,
      'has_more', false,
      'message', 'Source user already deleted'
    );
  END IF;

  -- Validate target exists
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Target user not found in workspace',
      'table', _table_name,
      'column', _column_name
    );
  END IF;

  -- Count rows before update to check if there are more
  EXECUTE format(
    'SELECT COUNT(*) FROM %I WHERE %I = $1',
    _table_name, _column_name
  ) INTO v_count_before USING _source_id;

  -- Perform batched update using ctid for efficiency
  IF v_count_before > 0 THEN
    EXECUTE format(
      'WITH batch AS (
        SELECT ctid FROM %I
        WHERE %I = $1
        LIMIT $3
      )
      UPDATE %I t
      SET %I = $2
      FROM batch
      WHERE t.ctid = batch.ctid',
      _table_name, _column_name,
      _table_name, _column_name
    ) USING _source_id, _target_id, _batch_size;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Check if there are more rows to process
    EXECUTE format(
      'SELECT COUNT(*) FROM %I WHERE %I = $1',
      _table_name, _column_name
    ) INTO v_count_after USING _source_id;

    v_has_more := v_count_after > 0;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'table', _table_name,
    'column', _column_name,
    'rows_updated', v_rows_updated,
    'has_more', v_has_more,
    'remaining', COALESCE(v_count_after, 0)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_workspace_users_table_batch(uuid, uuid, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_table_batch(uuid, uuid, uuid, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1a_batch(_source_id uuid, _target_id uuid, _ws_id uuid, _batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '28s'
AS $function$
DECLARE
  v_user_id UUID;
  v_result JSONB;
  v_total_updated INTEGER := 0;
  v_has_more BOOLEAN := FALSE;
  v_table_results JSONB[] := '{}';
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1a');
  END IF;

  -- Validate permissions
  IF public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: delete_users required', 'phase', '1a');
  END IF;
  IF public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: update_users required', 'phase', '1a');
  END IF;

  -- Validate source exists
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1a', 'message', 'Source user already deleted', 'has_more', false);
  END IF;

  -- Validate target exists
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _target_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user not found in workspace', 'phase', '1a');
  END IF;

  -- Prevent self-merge
  IF _source_id = _target_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot merge user with itself', 'phase', '1a');
  END IF;

  -- Process wallet_transactions (creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'wallet_transactions', 'creator_id', _batch_size);
  IF NOT (v_result->>'success')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_result->>'error', 'phase', '1a', 'failed_table', 'wallet_transactions');
  END IF;
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- Process product_stock_changes (beneficiary_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'product_stock_changes', 'beneficiary_id', _batch_size);
  IF NOT (v_result->>'success')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_result->>'error', 'phase', '1a', 'failed_table', 'product_stock_changes.beneficiary_id');
  END IF;
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- Process product_stock_changes (creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'product_stock_changes', 'creator_id', _batch_size);
  IF NOT (v_result->>'success')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_result->>'error', 'phase', '1a', 'failed_table', 'product_stock_changes.creator_id');
  END IF;
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- Process finance_invoices (customer_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'finance_invoices', 'customer_id', _batch_size);
  IF NOT (v_result->>'success')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_result->>'error', 'phase', '1a', 'failed_table', 'finance_invoices.customer_id');
  END IF;
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- Process finance_invoices (creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'finance_invoices', 'creator_id', _batch_size);
  IF NOT (v_result->>'success')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error', v_result->>'error', 'phase', '1a', 'failed_table', 'finance_invoices.creator_id');
  END IF;
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1a',
    'rows_updated', v_total_updated,
    'has_more', v_has_more,
    'table_results', v_table_results
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1a_batch(uuid, uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1a_batch(uuid, uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1b_batch(_source_id uuid, _target_id uuid, _ws_id uuid, _batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '28s'
AS $function$
DECLARE
  v_user_id UUID;
  v_result JSONB;
  v_total_updated INTEGER := 0;
  v_has_more BOOLEAN := FALSE;
  v_table_results JSONB[] := '{}';
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1b');
  END IF;

  -- Validate permissions
  IF public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: delete_users required', 'phase', '1b');
  END IF;
  IF public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: update_users required', 'phase', '1b');
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1b', 'message', 'Source user already deleted', 'has_more', false);
  END IF;

  -- workspace_user_status_changes (user_id, creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'workspace_user_status_changes', 'user_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'workspace_user_status_changes', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- external_user_monthly_report_logs (user_id, creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'external_user_monthly_report_logs', 'user_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'external_user_monthly_report_logs', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- external_user_monthly_reports (user_id, creator_id, updated_by)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'external_user_monthly_reports', 'user_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'external_user_monthly_reports', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'external_user_monthly_reports', 'updated_by', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- user_feedbacks (user_id, creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'user_feedbacks', 'user_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'user_feedbacks', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1b',
    'rows_updated', v_total_updated,
    'has_more', v_has_more,
    'table_results', v_table_results
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1b_batch(uuid, uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1b_batch(uuid, uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1c_batch(_source_id uuid, _target_id uuid, _ws_id uuid, _batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '28s'
AS $function$
DECLARE
  v_user_id UUID;
  v_result JSONB;
  v_total_updated INTEGER := 0;
  v_has_more BOOLEAN := FALSE;
  v_table_results JSONB[] := '{}';
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1c');
  END IF;

  -- Validate permissions
  IF public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: delete_users required', 'phase', '1c');
  END IF;
  IF public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: update_users required', 'phase', '1c');
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1c', 'message', 'Source user already deleted', 'has_more', false);
  END IF;

  -- workspace_products (creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'workspace_products', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- workspace_promotions (creator_id, owner_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'workspace_promotions', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'workspace_promotions', 'owner_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- healthcare_checkups (patient_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'healthcare_checkups', 'patient_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- guest_users_lead_generation (user_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'guest_users_lead_generation', 'user_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- sent_emails (receiver_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'sent_emails', 'receiver_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1c',
    'rows_updated', v_total_updated,
    'has_more', v_has_more,
    'table_results', v_table_results
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1c_batch(uuid, uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1c_batch(uuid, uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.merge_workspace_users_phase1d_batch(_source_id uuid, _target_id uuid, _ws_id uuid, _batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '28s'
AS $function$
DECLARE
  v_user_id UUID;
  v_result JSONB;
  v_total_updated INTEGER := 0;
  v_has_more BOOLEAN := FALSE;
  v_table_results JSONB[] := '{}';
BEGIN
  -- Validate authentication
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required', 'phase', '1d');
  END IF;

  -- Validate permissions
  IF public.has_workspace_permission(_ws_id, v_user_id, 'delete_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: delete_users required', 'phase', '1d');
  END IF;
  IF public.has_workspace_permission(_ws_id, v_user_id, 'update_users') IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: update_users required', 'phase', '1d');
  END IF;

  -- Validate source still exists
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
    RETURN jsonb_build_object('success', true, 'phase', '1d', 'message', 'Source user already deleted', 'has_more', false);
  END IF;

  -- user_group_post_logs (creator_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'user_group_post_logs', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- user_group_posts (creator_id, updated_by)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'user_group_posts', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'user_group_posts', 'updated_by', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- payroll_run_items (user_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'payroll_run_items', 'user_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- workforce_contracts (user_id)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'workforce_contracts', 'user_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  -- user_indicators (creator_id - not part of composite PK)
  v_result := public.merge_workspace_users_batch_update(_source_id, _target_id, _ws_id, 'user_indicators', 'creator_id', _batch_size);
  v_total_updated := v_total_updated + COALESCE((v_result->>'rows_updated')::integer, 0);
  v_has_more := v_has_more OR COALESCE((v_result->>'has_more')::boolean, false);
  v_table_results := array_append(v_table_results, v_result);

  RETURN jsonb_build_object(
    'success', true,
    'phase', '1d',
    'rows_updated', v_total_updated,
    'has_more', v_has_more,
    'table_results', v_table_results
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.merge_workspace_users_phase1d_batch(uuid, uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_workspace_users_phase1d_batch(uuid, uuid, uuid, integer) TO authenticated, service_role;

COMMIT;
