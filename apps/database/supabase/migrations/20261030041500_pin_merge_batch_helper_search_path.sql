-- Pin the search_path of the two dynamic-identifier merge helpers to
-- pg_catalog, pg_temp (least privilege for SECURITY DEFINER code).
--
-- 20261029050430_merge_batch_null_guards defined
-- public.merge_workspace_users_batch_update with
-- 'public', 'private', 'pg_temp' and public.merge_workspace_users_table_batch
-- with 'public', 'pg_temp'. Both reached their target relations through
-- format('%I') identifiers resolved by that path, so the path could not simply
-- be shortened with ALTER FUNCTION. Qualification audit of the previous bodies
-- (unqualified references, line numbers in 20261029050430):
--   batch_update: dynamic FROM %I (:83), UPDATE %I (:87), FROM %I (:99).
--   table_batch:  dynamic FROM %I (:220, :228, :244), UPDATE %I (:232).
-- Everything else was already qualified or resolves in pg_catalog: auth.uid(),
-- public.has_workspace_permission, public.workspace_users, jsonb_build_object,
-- format, COUNT, the uuid/text/integer/boolean/jsonb types and every operator.
--
-- This migration replaces the bodies with identical semantics, except that the
-- owning schema of each allowlisted (table, column) pair is now part of the
-- fixed phase 1a-1d allowlist and the dynamic SQL uses schema-qualified
-- identifiers. The allowlist pairs, the 22023 refusal for anything else (NULLs
-- included), the authentication and delete_users/update_users checks, the
-- batch/limit behavior, the result shape and statement_timeout are unchanged.
--
-- Not a regression: the previous definitions carried the same search paths.
-- Same-file ACL: service_role only (no PUBLIC, anon or authenticated EXECUTE),
-- as set by 20261027151000 and 20261029050430.

BEGIN;

-- tuturuuu: reviewed(dynamic-sql-review): SR-108 merge helper; %I.%I identifiers come only from the fixed phase 1a-1d allowlist
CREATE OR REPLACE FUNCTION public.merge_workspace_users_batch_update(_source_id uuid, _target_id uuid, _ws_id uuid, _table_name text, _column_name text, _batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_schema_name TEXT;
  v_user_id UUID;
  v_rows_updated INTEGER := 0;
  v_has_more BOOLEAN := FALSE;
  v_remaining INTEGER := 0;
BEGIN
  -- Only the fixed phase 1a-1d merge references; anything else is refused before any check or write.
  -- The owning schema comes from this list, so no relation depends on the search path.
  SELECT m.schema_name INTO v_schema_name
  FROM (VALUES
      ('private', 'external_user_monthly_report_logs', 'creator_id'),
      ('private', 'external_user_monthly_report_logs', 'user_id'),
      ('private', 'external_user_monthly_reports', 'creator_id'),
      ('private', 'external_user_monthly_reports', 'updated_by'),
      ('private', 'external_user_monthly_reports', 'user_id'),
      ('public', 'finance_invoices', 'creator_id'),
      ('public', 'finance_invoices', 'customer_id'),
      ('public', 'guest_users_lead_generation', 'user_id'),
      ('private', 'healthcare_checkups', 'patient_id'),
      ('private', 'payroll_run_items', 'user_id'),
      ('public', 'product_stock_changes', 'beneficiary_id'),
      ('public', 'product_stock_changes', 'creator_id'),
      ('public', 'sent_emails', 'receiver_id'),
      ('public', 'user_feedbacks', 'creator_id'),
      ('public', 'user_feedbacks', 'user_id'),
      ('private', 'user_group_post_logs', 'creator_id'),
      ('private', 'user_group_posts', 'creator_id'),
      ('private', 'user_group_posts', 'updated_by'),
      ('public', 'user_indicators', 'creator_id'),
      ('public', 'wallet_transactions', 'creator_id'),
      ('public', 'workforce_contracts', 'user_id'),
      ('public', 'workspace_products', 'creator_id'),
      ('private', 'workspace_promotions', 'creator_id'),
      ('private', 'workspace_promotions', 'owner_id'),
      ('public', 'workspace_user_status_changes', 'creator_id'),
      ('public', 'workspace_user_status_changes', 'user_id')
  ) AS m(schema_name, table_name, column_name)
  WHERE m.table_name = _table_name AND m.column_name = _column_name;

  IF v_schema_name IS NULL THEN
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
      SELECT ctid FROM %I.%I
      WHERE %I = $1
      LIMIT $3
    )
    UPDATE %I.%I t
    SET %I = $2
    FROM batch
    WHERE t.ctid = batch.ctid',
    v_schema_name, _table_name, _column_name,
    v_schema_name, _table_name, _column_name
  ) USING _source_id, _target_id, _batch_size;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  -- Check if there are more rows to process
  EXECUTE format(
    'SELECT COUNT(*) FROM %I.%I WHERE %I = $1 LIMIT 1',
    v_schema_name, _table_name, _column_name
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

-- tuturuuu: reviewed(dynamic-sql-review): SR-108 merge helper; %I.%I identifiers come only from the fixed phase 1a-1d allowlist
CREATE OR REPLACE FUNCTION public.merge_workspace_users_table_batch(_source_id uuid, _target_id uuid, _ws_id uuid, _table_name text, _column_name text, _batch_size integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, pg_temp
 SET statement_timeout TO '25s'
AS $function$
DECLARE
  v_schema_name TEXT;
  v_user_id UUID;
  v_rows_updated INT := 0;
  v_has_more BOOLEAN := false;
  v_count_before INT;
  v_count_after INT;
BEGIN
  -- Only the fixed phase 1a-1d merge references; anything else is refused before any check or write.
  -- The owning schema comes from this list, so no relation depends on the search path.
  SELECT m.schema_name INTO v_schema_name
  FROM (VALUES
      ('private', 'external_user_monthly_report_logs', 'creator_id'),
      ('private', 'external_user_monthly_report_logs', 'user_id'),
      ('private', 'external_user_monthly_reports', 'creator_id'),
      ('private', 'external_user_monthly_reports', 'updated_by'),
      ('private', 'external_user_monthly_reports', 'user_id'),
      ('public', 'finance_invoices', 'creator_id'),
      ('public', 'finance_invoices', 'customer_id'),
      ('public', 'guest_users_lead_generation', 'user_id'),
      ('private', 'healthcare_checkups', 'patient_id'),
      ('private', 'payroll_run_items', 'user_id'),
      ('public', 'product_stock_changes', 'beneficiary_id'),
      ('public', 'product_stock_changes', 'creator_id'),
      ('public', 'sent_emails', 'receiver_id'),
      ('public', 'user_feedbacks', 'creator_id'),
      ('public', 'user_feedbacks', 'user_id'),
      ('private', 'user_group_post_logs', 'creator_id'),
      ('private', 'user_group_posts', 'creator_id'),
      ('private', 'user_group_posts', 'updated_by'),
      ('public', 'user_indicators', 'creator_id'),
      ('public', 'wallet_transactions', 'creator_id'),
      ('public', 'workforce_contracts', 'user_id'),
      ('public', 'workspace_products', 'creator_id'),
      ('private', 'workspace_promotions', 'creator_id'),
      ('private', 'workspace_promotions', 'owner_id'),
      ('public', 'workspace_user_status_changes', 'creator_id'),
      ('public', 'workspace_user_status_changes', 'user_id')
  ) AS m(schema_name, table_name, column_name)
  WHERE m.table_name = _table_name AND m.column_name = _column_name;

  IF v_schema_name IS NULL THEN
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
    'SELECT COUNT(*) FROM %I.%I WHERE %I = $1',
    v_schema_name, _table_name, _column_name
  ) INTO v_count_before USING _source_id;

  -- Perform batched update using ctid for efficiency
  IF v_count_before > 0 THEN
    EXECUTE format(
      'WITH batch AS (
        SELECT ctid FROM %I.%I
        WHERE %I = $1
        LIMIT $3
      )
      UPDATE %I.%I t
      SET %I = $2
      FROM batch
      WHERE t.ctid = batch.ctid',
      v_schema_name, _table_name, _column_name,
      v_schema_name, _table_name, _column_name
    ) USING _source_id, _target_id, _batch_size;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    -- Check if there are more rows to process
    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I WHERE %I = $1',
      v_schema_name, _table_name, _column_name
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

COMMIT;
