-- Migration: Single-table batch merge functions
-- Purpose: Process one table at a time with smaller batches to prevent timeouts
-- Each function handles a single table and returns has_more for continuation

-- ============================================================================
-- Generic single-table batch update function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.merge_workspace_users_table_batch(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID,
  _table_name TEXT,
  _column_name TEXT,
  _batch_size INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '25s'
AS $$
DECLARE
  v_user_id UUID;
  v_rows_updated INT := 0;
  v_has_more BOOLEAN := false;
  v_count_before INT;
  v_count_after INT;
BEGIN
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
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'delete_users') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: delete_users required',
      'table', _table_name,
      'column', _column_name
    );
  END IF;
  IF NOT has_workspace_permission(_ws_id, v_user_id, 'update_users') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Permission denied: update_users required',
      'table', _table_name,
      'column', _column_name
    );
  END IF;

  -- Validate source exists (may already be deleted if merge complete)
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _source_id AND ws_id = _ws_id) THEN
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
  IF NOT EXISTS (SELECT 1 FROM workspace_users WHERE id = _target_id AND ws_id = _ws_id) THEN
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
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.merge_workspace_users_table_batch(UUID, UUID, UUID, TEXT, TEXT, INT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.merge_workspace_users_table_batch IS
  'Batch update a single table column during workspace user merge. Processes up to batch_size rows per call and returns has_more=true if more rows remain.';
