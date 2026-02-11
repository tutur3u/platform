-- Migration: Enhance workspace user merge function
-- Purpose: Add validation for both-linked users and improve collision logging
-- Addresses: Both-Linked Edge Case (MEDIUM RISK), Silent Data Loss (HIGH RISK)

-- Drop and recreate the function with enhancements
CREATE OR REPLACE FUNCTION public.merge_workspace_users(
  _source_id UUID,
  _target_id UUID,
  _ws_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_source_record workspace_users%ROWTYPE;
  v_target_record workspace_users%ROWTYPE;
  v_source_linked BOOLEAN := FALSE;
  v_target_linked BOOLEAN := FALSE;
  v_source_platform_user_id UUID;
  v_target_platform_user_id UUID;
  v_fk_record RECORD;
  v_table_name TEXT;
  v_column_name TEXT;
  v_pk_columns TEXT[];
  v_other_pk_col TEXT;
  v_update_sql TEXT;
  v_delete_sql TEXT;
  v_count_migrated INTEGER := 0;
  v_count_deleted INTEGER := 0;
  v_migrated_tables TEXT[] := '{}';
  v_collision_tables TEXT[] := '{}';
  v_collision_details JSONB[] := '{}';
  v_collision_record_ids TEXT[];
  v_custom_fields_merged INTEGER := 0;
  v_result JSONB;
BEGIN
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

  -- NEW: Check if both users are linked to platform users
  -- This prevents losing platform links during merge
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

  -- Find all foreign keys referencing workspace_users
  FOR v_fk_record IN
    SELECT
      kcu.table_name,
      kcu.column_name,
      tc.constraint_name,
      -- Get all PK columns for this table
      ARRAY(
        SELECT kcu2.column_name
        FROM information_schema.table_constraints tc2
        JOIN information_schema.key_column_usage kcu2
          ON tc2.constraint_name = kcu2.constraint_name
          AND tc2.table_schema = kcu2.table_schema
        WHERE tc2.table_name = kcu.table_name
          AND tc2.table_schema = 'public'
          AND tc2.constraint_type = 'PRIMARY KEY'
      ) AS pk_columns
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON rc.constraint_name = kcu.constraint_name
      AND rc.constraint_schema = kcu.constraint_schema
    JOIN information_schema.table_constraints tc
      ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.constraint_schema
    WHERE rc.unique_constraint_schema = 'public'
      AND EXISTS (
        SELECT 1
        FROM information_schema.key_column_usage kcu_pk
        JOIN information_schema.table_constraints tc_pk
          ON kcu_pk.constraint_name = tc_pk.constraint_name
        WHERE tc_pk.table_name = 'workspace_users'
          AND tc_pk.table_schema = 'public'
          AND tc_pk.constraint_type = 'PRIMARY KEY'
          AND kcu_pk.column_name = 'id'
          AND rc.unique_constraint_name = tc_pk.constraint_name
      )
      AND kcu.table_schema = 'public'
  LOOP
    v_table_name := v_fk_record.table_name;
    v_column_name := v_fk_record.column_name;
    v_pk_columns := v_fk_record.pk_columns;

    -- Skip the workspace_users table itself (self-referential FKs)
    IF v_table_name = 'workspace_users' THEN
      CONTINUE;
    END IF;

    -- Check for composite primary key (collision detection)
    IF array_length(v_pk_columns, 1) > 1 THEN
      -- Find the other PK column(s)
      v_other_pk_col := NULL;
      FOREACH v_other_pk_col IN ARRAY v_pk_columns
      LOOP
        IF v_other_pk_col != v_column_name THEN
          EXIT;
        END IF;
      END LOOP;

      IF v_other_pk_col IS NOT NULL THEN
        -- NEW: Capture IDs of records that will be deleted for logging
        EXECUTE format(
          'SELECT ARRAY_AGG((%I)::text) FROM %I WHERE %I = $1 AND %I IN (
            SELECT %I FROM %I WHERE %I = $2
          )',
          v_other_pk_col, v_table_name, v_column_name, v_other_pk_col,
          v_other_pk_col, v_table_name, v_column_name
        ) INTO v_collision_record_ids USING _source_id, _target_id;

        -- Delete records that would cause collision
        -- (source has same other PK value as an existing target record)
        EXECUTE format(
          'DELETE FROM %I WHERE %I = $1 AND %I IN (
            SELECT %I FROM %I WHERE %I = $2
          )',
          v_table_name, v_column_name, v_other_pk_col,
          v_other_pk_col, v_table_name, v_column_name
        ) USING _source_id, _target_id;

        GET DIAGNOSTICS v_count_deleted = ROW_COUNT;

        IF v_count_deleted > 0 THEN
          v_collision_tables := array_append(v_collision_tables, v_table_name);
          -- NEW: Store detailed collision info for recovery assessment
          v_collision_details := array_append(
            v_collision_details,
            jsonb_build_object(
              'table', v_table_name,
              'deleted_count', v_count_deleted,
              'pk_column', v_other_pk_col,
              'deleted_pk_values', COALESCE(v_collision_record_ids, ARRAY[]::TEXT[])
            )
          );
        END IF;
      END IF;
    END IF;

    -- Migrate remaining records from source to target
    EXECUTE format(
      'UPDATE %I SET %I = $1 WHERE %I = $2',
      v_table_name, v_column_name, v_column_name
    ) USING _target_id, _source_id;

    GET DIAGNOSTICS v_count_migrated = ROW_COUNT;

    IF v_count_migrated > 0 THEN
      v_migrated_tables := array_append(v_migrated_tables, v_table_name);
    END IF;
  END LOOP;

  -- Special handling for workspace_user_linked_users
  -- Transfer link if source is linked and target is not
  IF v_source_linked AND NOT v_target_linked THEN
    UPDATE workspace_user_linked_users
    SET virtual_user_id = _target_id
    WHERE virtual_user_id = _source_id AND ws_id = _ws_id;

    v_migrated_tables := array_append(v_migrated_tables, 'workspace_user_linked_users (link transferred)');
  END IF;

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

  -- Delete source user
  DELETE FROM workspace_users
  WHERE id = _source_id AND ws_id = _ws_id;

  -- Build result with enhanced collision details
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

-- Add updated comment for documentation
COMMENT ON FUNCTION public.merge_workspace_users IS
  'Merges source workspace user into target user. Features: (1) Validates both users are not linked to different platform accounts, (2) Migrates all FK references with collision detection, (3) Logs detailed collision information for recovery assessment, (4) Transfers platform link if applicable, (5) Fills NULL target fields from source. Source user is deleted after merge. Requires: delete_users AND update_users permissions.';
