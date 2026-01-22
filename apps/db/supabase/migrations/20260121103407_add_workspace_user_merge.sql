-- Migration: Add workspace user duplicate detection and merge functionality
-- This provides tools to find and merge duplicate workspace_users within a workspace

-- ============================================================================
-- SCHEMA: Add deleted column to workspace_users for soft-delete during merges
-- ============================================================================
ALTER TABLE workspace_users ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;

-- Add index for efficient filtering of non-deleted users
CREATE INDEX IF NOT EXISTS idx_workspace_users_deleted ON workspace_users(deleted) WHERE deleted = false;

-- ============================================================================
-- PERMISSION: Add merge_users permission
-- ============================================================================
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'merge_users';

-- ============================================================================
-- FUNCTION: find_duplicate_workspace_users
-- Finds workspace users with duplicate email or phone within a workspace
-- Returns groups of users sharing the same non-null, non-empty email or phone
-- ============================================================================
CREATE OR REPLACE FUNCTION find_duplicate_workspace_users(
  target_ws_id UUID,
  duplicate_type TEXT DEFAULT 'all' -- 'email' | 'phone' | 'all'
)
RETURNS TABLE(
  duplicate_key TEXT,
  duplicate_field TEXT,
  user_ids UUID[],
  users JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH email_duplicates AS (
    SELECT
      LOWER(TRIM(wu.email)) AS dup_key,
      'email'::TEXT AS dup_field,
      ARRAY_AGG(wu.id ORDER BY wu.created_at) AS uids,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', wu.id,
          'full_name', wu.full_name,
          'display_name', wu.display_name,
          'email', wu.email,
          'phone', wu.phone,
          'avatar_url', wu.avatar_url,
          'balance', wu.balance,
          'note', wu.note,
          'created_at', wu.created_at,
          'archived', wu.archived
        ) ORDER BY wu.created_at
      ) AS user_data
    FROM workspace_users wu
    WHERE wu.ws_id = target_ws_id
      AND wu.email IS NOT NULL
      AND TRIM(wu.email) != ''
      AND NOT COALESCE(wu.deleted, false)
    GROUP BY LOWER(TRIM(wu.email))
    HAVING COUNT(*) > 1
  ),
  phone_duplicates AS (
    SELECT
      REGEXP_REPLACE(wu.phone, '[^0-9+]', '', 'g') AS dup_key,
      'phone'::TEXT AS dup_field,
      ARRAY_AGG(wu.id ORDER BY wu.created_at) AS uids,
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', wu.id,
          'full_name', wu.full_name,
          'display_name', wu.display_name,
          'email', wu.email,
          'phone', wu.phone,
          'avatar_url', wu.avatar_url,
          'balance', wu.balance,
          'note', wu.note,
          'created_at', wu.created_at,
          'archived', wu.archived
        ) ORDER BY wu.created_at
      ) AS user_data
    FROM workspace_users wu
    WHERE wu.ws_id = target_ws_id
      AND wu.phone IS NOT NULL
      AND TRIM(wu.phone) != ''
      AND NOT COALESCE(wu.deleted, false)
    GROUP BY REGEXP_REPLACE(wu.phone, '[^0-9+]', '', 'g')
    HAVING COUNT(*) > 1
  )
  SELECT ed.dup_key, ed.dup_field, ed.uids, ed.user_data
  FROM email_duplicates ed
  WHERE duplicate_type IN ('all', 'email')
  UNION ALL
  SELECT pd.dup_key, pd.dup_field, pd.uids, pd.user_data
  FROM phone_duplicates pd
  WHERE duplicate_type IN ('all', 'phone')
  ORDER BY dup_field, dup_key;
END;
$$;

-- ============================================================================
-- FUNCTION: preview_workspace_user_merge
-- Returns detailed information for merge preview including affected record counts
-- ============================================================================
CREATE OR REPLACE FUNCTION preview_workspace_user_merge(
  keep_user_id UUID,
  delete_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  keep_user RECORD;
  delete_user RECORD;
  affected_counts JSONB;
  warnings TEXT[];
  linked_users_count INT;
BEGIN
  -- Validate users exist and are in the same workspace
  SELECT * INTO keep_user FROM workspace_users WHERE id = keep_user_id AND NOT COALESCE(deleted, false);
  SELECT * INTO delete_user FROM workspace_users WHERE id = delete_user_id AND NOT COALESCE(deleted, false);

  IF keep_user IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Keep user not found or deleted');
  END IF;

  IF delete_user IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Delete user not found or deleted');
  END IF;

  IF keep_user.ws_id != delete_user.ws_id THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Users must be in the same workspace');
  END IF;

  IF keep_user_id = delete_user_id THEN
    RETURN JSONB_BUILD_OBJECT('error', 'Cannot merge a user with itself');
  END IF;

  -- Initialize warnings array
  warnings := ARRAY[]::TEXT[];

  -- Check for linked platform users
  SELECT COUNT(*) INTO linked_users_count
  FROM workspace_user_linked_users
  WHERE virtual_user_id = delete_user_id;

  IF linked_users_count > 0 THEN
    warnings := array_append(warnings, format('User to delete has %s linked platform user(s). These links will be transferred or removed.', linked_users_count));
  END IF;

  -- Count affected records in each table
  affected_counts := JSONB_BUILD_OBJECT(
    'workspace_users', JSONB_BUILD_OBJECT(
      'referred_by', (SELECT COUNT(*) FROM workspace_users WHERE referred_by = delete_user_id),
      'created_by', (SELECT COUNT(*) FROM workspace_users WHERE created_by = delete_user_id),
      'updated_by', (SELECT COUNT(*) FROM workspace_users WHERE updated_by = delete_user_id)
    ),
    'finance_invoices', JSONB_BUILD_OBJECT(
      'customer_id', (SELECT COUNT(*) FROM finance_invoices WHERE customer_id = delete_user_id),
      'creator_id', (SELECT COUNT(*) FROM finance_invoices WHERE creator_id = delete_user_id)
    ),
    'wallet_transactions', JSONB_BUILD_OBJECT(
      'creator_id', (SELECT COUNT(*) FROM wallet_transactions WHERE creator_id = delete_user_id)
    ),
    'healthcare_checkups', JSONB_BUILD_OBJECT(
      'patient_id', (SELECT COUNT(*) FROM healthcare_checkups WHERE patient_id = delete_user_id)
    ),
    'calendar_event_virtual_participants', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM calendar_event_virtual_participants WHERE user_id = delete_user_id)
    ),
    'workspace_user_groups_users', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM workspace_user_groups_users WHERE user_id = delete_user_id)
    ),
    'user_group_attendance', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM user_group_attendance WHERE user_id = delete_user_id)
    ),
    'user_group_post_checks', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM user_group_post_checks WHERE user_id = delete_user_id)
    ),
    'user_feedbacks', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM user_feedbacks WHERE user_id = delete_user_id),
      'creator_id', (SELECT COUNT(*) FROM user_feedbacks WHERE creator_id = delete_user_id)
    ),
    'user_indicators', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM user_indicators WHERE user_id = delete_user_id),
      'creator_id', (SELECT COUNT(*) FROM user_indicators WHERE creator_id = delete_user_id)
    ),
    'user_linked_promotions', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM user_linked_promotions WHERE user_id = delete_user_id)
    ),
    'workspace_promotions', JSONB_BUILD_OBJECT(
      'owner_id', (SELECT COUNT(*) FROM workspace_promotions WHERE owner_id = delete_user_id),
      'creator_id', (SELECT COUNT(*) FROM workspace_promotions WHERE creator_id = delete_user_id)
    ),
    'workspace_products', JSONB_BUILD_OBJECT(
      'creator_id', (SELECT COUNT(*) FROM workspace_products WHERE creator_id = delete_user_id)
    ),
    'product_stock_changes', JSONB_BUILD_OBJECT(
      'creator_id', (SELECT COUNT(*) FROM product_stock_changes WHERE creator_id = delete_user_id),
      'beneficiary_id', (SELECT COUNT(*) FROM product_stock_changes WHERE beneficiary_id = delete_user_id)
    ),
    'external_user_monthly_reports', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM external_user_monthly_reports WHERE user_id = delete_user_id),
      'creator_id', (SELECT COUNT(*) FROM external_user_monthly_reports WHERE creator_id = delete_user_id)
    ),
    'external_user_monthly_report_logs', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM external_user_monthly_report_logs WHERE user_id = delete_user_id),
      'creator_id', (SELECT COUNT(*) FROM external_user_monthly_report_logs WHERE creator_id = delete_user_id)
    ),
    'sent_emails', JSONB_BUILD_OBJECT(
      'sender_id', (SELECT COUNT(*) FROM sent_emails WHERE sender_id = delete_user_id),
      'receiver_id', (SELECT COUNT(*) FROM sent_emails WHERE receiver_id = delete_user_id)
    ),
    'workspace_ai_prompts', JSONB_BUILD_OBJECT(
      'creator_id', (SELECT COUNT(*) FROM workspace_ai_prompts WHERE creator_id = delete_user_id)
    ),
    'workspace_user_status_changes', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM workspace_user_status_changes WHERE user_id = delete_user_id),
      'creator_id', (SELECT COUNT(*) FROM workspace_user_status_changes WHERE creator_id = delete_user_id)
    ),
    'guest_users_lead_generation', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM guest_users_lead_generation WHERE user_id = delete_user_id)
    ),
    'workspace_user_linked_users', JSONB_BUILD_OBJECT(
      'virtual_user_id', linked_users_count
    ),
    'workforce_contracts', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM workforce_contracts WHERE user_id = delete_user_id)
    ),
    'payroll_run_items', JSONB_BUILD_OBJECT(
      'user_id', (SELECT COUNT(*) FROM payroll_run_items WHERE user_id = delete_user_id)
    )
  );

  RETURN JSONB_BUILD_OBJECT(
    'keepUser', JSONB_BUILD_OBJECT(
      'id', keep_user.id,
      'full_name', keep_user.full_name,
      'display_name', keep_user.display_name,
      'email', keep_user.email,
      'phone', keep_user.phone,
      'avatar_url', keep_user.avatar_url,
      'balance', keep_user.balance,
      'birthday', keep_user.birthday,
      'gender', keep_user.gender,
      'ethnicity', keep_user.ethnicity,
      'guardian', keep_user.guardian,
      'national_id', keep_user.national_id,
      'address', keep_user.address,
      'note', keep_user.note,
      'archived', keep_user.archived,
      'created_at', keep_user.created_at
    ),
    'deleteUser', JSONB_BUILD_OBJECT(
      'id', delete_user.id,
      'full_name', delete_user.full_name,
      'display_name', delete_user.display_name,
      'email', delete_user.email,
      'phone', delete_user.phone,
      'avatar_url', delete_user.avatar_url,
      'balance', delete_user.balance,
      'birthday', delete_user.birthday,
      'gender', delete_user.gender,
      'ethnicity', delete_user.ethnicity,
      'guardian', delete_user.guardian,
      'national_id', delete_user.national_id,
      'address', delete_user.address,
      'note', delete_user.note,
      'archived', delete_user.archived,
      'created_at', delete_user.created_at
    ),
    'affectedRecords', affected_counts,
    'warnings', TO_JSONB(warnings)
  );
END;
$$;

-- ============================================================================
-- FUNCTION: merge_workspace_users
-- Executes the merge operation in a transaction
-- field_strategy: JSON object mapping field names to 'keep' or 'delete'
-- balance_strategy: 'keep' (use keep_user's balance) or 'add' (sum both)
-- ============================================================================
CREATE OR REPLACE FUNCTION merge_workspace_users(
  keep_user_id UUID,
  delete_user_id UUID,
  field_strategy JSONB DEFAULT '{}',
  balance_strategy TEXT DEFAULT 'keep' -- 'keep' | 'add'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  keep_user RECORD;
  delete_user RECORD;
  update_counts JSONB;
  merged_note TEXT;
  new_balance NUMERIC;
  fields_from_deleted TEXT[];
  field_name TEXT;
  field_choice TEXT;
BEGIN
  -- Validate users exist and are in the same workspace
  SELECT * INTO keep_user FROM workspace_users WHERE id = keep_user_id AND NOT COALESCE(deleted, false) FOR UPDATE;
  SELECT * INTO delete_user FROM workspace_users WHERE id = delete_user_id AND NOT COALESCE(deleted, false) FOR UPDATE;

  IF keep_user IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Keep user not found or deleted');
  END IF;

  IF delete_user IS NULL THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Delete user not found or deleted');
  END IF;

  IF keep_user.ws_id != delete_user.ws_id THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Users must be in the same workspace');
  END IF;

  IF keep_user_id = delete_user_id THEN
    RETURN JSONB_BUILD_OBJECT('success', false, 'error', 'Cannot merge a user with itself');
  END IF;

  -- Initialize update counts
  update_counts := '{}'::JSONB;
  fields_from_deleted := ARRAY[]::TEXT[];

  -- Process field strategy to update keep_user fields from delete_user where specified
  FOR field_name, field_choice IN SELECT * FROM jsonb_each_text(field_strategy)
  LOOP
    IF field_choice = 'delete' THEN
      fields_from_deleted := array_append(fields_from_deleted, field_name);

      -- Update each field individually based on strategy
      CASE field_name
        WHEN 'full_name' THEN UPDATE workspace_users SET full_name = delete_user.full_name WHERE id = keep_user_id;
        WHEN 'display_name' THEN UPDATE workspace_users SET display_name = delete_user.display_name WHERE id = keep_user_id;
        WHEN 'email' THEN UPDATE workspace_users SET email = delete_user.email WHERE id = keep_user_id;
        WHEN 'phone' THEN UPDATE workspace_users SET phone = delete_user.phone WHERE id = keep_user_id;
        WHEN 'avatar_url' THEN UPDATE workspace_users SET avatar_url = delete_user.avatar_url WHERE id = keep_user_id;
        WHEN 'birthday' THEN UPDATE workspace_users SET birthday = delete_user.birthday WHERE id = keep_user_id;
        WHEN 'gender' THEN UPDATE workspace_users SET gender = delete_user.gender WHERE id = keep_user_id;
        WHEN 'ethnicity' THEN UPDATE workspace_users SET ethnicity = delete_user.ethnicity WHERE id = keep_user_id;
        WHEN 'guardian' THEN UPDATE workspace_users SET guardian = delete_user.guardian WHERE id = keep_user_id;
        WHEN 'national_id' THEN UPDATE workspace_users SET national_id = delete_user.national_id WHERE id = keep_user_id;
        WHEN 'address' THEN UPDATE workspace_users SET address = delete_user.address WHERE id = keep_user_id;
        ELSE NULL; -- Ignore unknown fields
      END CASE;
    END IF;
  END LOOP;

  -- Handle balance based on strategy
  IF balance_strategy = 'add' THEN
    new_balance := COALESCE(keep_user.balance, 0) + COALESCE(delete_user.balance, 0);
    UPDATE workspace_users SET balance = new_balance WHERE id = keep_user_id;
  END IF;

  -- Update self-referential fields (handle circular reference for referred_by)
  WITH updated AS (
    UPDATE workspace_users
    SET referred_by = keep_user_id
    WHERE referred_by = delete_user_id
      AND id != keep_user_id  -- Don't create self-reference
    RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_users,referred_by}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Special case: if keep_user was referred by delete_user, inherit delete_user's referrer
  IF keep_user.referred_by = delete_user_id THEN
    UPDATE workspace_users SET referred_by = delete_user.referred_by WHERE id = keep_user_id;
  END IF;

  WITH updated AS (
    UPDATE workspace_users SET created_by = keep_user_id WHERE created_by = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_users,created_by}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE workspace_users SET updated_by = keep_user_id WHERE updated_by = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_users,updated_by}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update finance_invoices
  WITH updated AS (
    UPDATE finance_invoices SET customer_id = keep_user_id WHERE customer_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{finance_invoices,customer_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE finance_invoices SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{finance_invoices,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update wallet_transactions
  WITH updated AS (
    UPDATE wallet_transactions SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{wallet_transactions,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update healthcare tables
  WITH updated AS (
    UPDATE healthcare_checkups SET patient_id = keep_user_id WHERE patient_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{healthcare_checkups,patient_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update calendar_event_virtual_participants
  WITH updated AS (
    UPDATE calendar_event_virtual_participants SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{calendar_event_virtual_participants,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update workspace_user_groups_users (handle unique constraint violations)
  -- First delete any duplicates that would conflict
  DELETE FROM workspace_user_groups_users wugu1
  WHERE wugu1.user_id = delete_user_id
    AND EXISTS (
      SELECT 1 FROM workspace_user_groups_users wugu2
      WHERE wugu2.group_id = wugu1.group_id AND wugu2.user_id = keep_user_id
    );

  WITH updated AS (
    UPDATE workspace_user_groups_users SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_user_groups_users,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update user_group_attendance (handle unique constraint violations)
  DELETE FROM user_group_attendance uga1
  WHERE uga1.user_id = delete_user_id
    AND EXISTS (
      SELECT 1 FROM user_group_attendance uga2
      WHERE uga2.group_id = uga1.group_id
        AND uga2.user_id = keep_user_id
        AND uga2.date = uga1.date
    );

  WITH updated AS (
    UPDATE user_group_attendance SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{user_group_attendance,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update user_group_post_checks
  DELETE FROM user_group_post_checks ugpc1
  WHERE ugpc1.user_id = delete_user_id
    AND EXISTS (
      SELECT 1 FROM user_group_post_checks ugpc2
      WHERE ugpc2.post_id = ugpc1.post_id AND ugpc2.user_id = keep_user_id
    );

  WITH updated AS (
    UPDATE user_group_post_checks SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{user_group_post_checks,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update user_feedbacks
  WITH updated AS (
    UPDATE user_feedbacks SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{user_feedbacks,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE user_feedbacks SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{user_feedbacks,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update user_indicators
  WITH updated AS (
    UPDATE user_indicators SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{user_indicators,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE user_indicators SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{user_indicators,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update user_linked_promotions (handle unique constraint)
  DELETE FROM user_linked_promotions ulp1
  WHERE ulp1.user_id = delete_user_id
    AND EXISTS (
      SELECT 1 FROM user_linked_promotions ulp2
      WHERE ulp2.promotion_id = ulp1.promotion_id AND ulp2.user_id = keep_user_id
    );

  WITH updated AS (
    UPDATE user_linked_promotions SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{user_linked_promotions,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update workspace_promotions
  WITH updated AS (
    UPDATE workspace_promotions SET owner_id = keep_user_id WHERE owner_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_promotions,owner_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE workspace_promotions SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_promotions,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update workspace_products
  WITH updated AS (
    UPDATE workspace_products SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_products,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update product_stock_changes
  WITH updated AS (
    UPDATE product_stock_changes SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{product_stock_changes,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE product_stock_changes SET beneficiary_id = keep_user_id WHERE beneficiary_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{product_stock_changes,beneficiary_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update external_user_monthly_reports
  WITH updated AS (
    UPDATE external_user_monthly_reports SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{external_user_monthly_reports,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE external_user_monthly_reports SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{external_user_monthly_reports,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update external_user_monthly_report_logs
  WITH updated AS (
    UPDATE external_user_monthly_report_logs SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{external_user_monthly_report_logs,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE external_user_monthly_report_logs SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{external_user_monthly_report_logs,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update sent_emails
  WITH updated AS (
    UPDATE sent_emails SET sender_id = keep_user_id WHERE sender_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{sent_emails,sender_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE sent_emails SET receiver_id = keep_user_id WHERE receiver_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{sent_emails,receiver_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update workspace_ai_prompts
  WITH updated AS (
    UPDATE workspace_ai_prompts SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_ai_prompts,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update workspace_user_status_changes
  WITH updated AS (
    UPDATE workspace_user_status_changes SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_user_status_changes,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  WITH updated AS (
    UPDATE workspace_user_status_changes SET creator_id = keep_user_id WHERE creator_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_user_status_changes,creator_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update guest_users_lead_generation
  WITH updated AS (
    UPDATE guest_users_lead_generation SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{guest_users_lead_generation,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update workforce_contracts
  WITH updated AS (
    UPDATE workforce_contracts SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workforce_contracts,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Update payroll_run_items
  WITH updated AS (
    UPDATE payroll_run_items SET user_id = keep_user_id WHERE user_id = delete_user_id RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{payroll_run_items,user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Handle workspace_user_linked_users (composite PK with platform_user_id, ws_id)
  -- For each linked platform user:
  -- - If already linked to keep_user: Delete the duplicate link
  -- - If not linked to keep_user: Update virtual_user_id to keep_user.id
  DELETE FROM workspace_user_linked_users wulu1
  WHERE wulu1.virtual_user_id = delete_user_id
    AND EXISTS (
      SELECT 1 FROM workspace_user_linked_users wulu2
      WHERE wulu2.platform_user_id = wulu1.platform_user_id
        AND wulu2.ws_id = wulu1.ws_id
        AND wulu2.virtual_user_id = keep_user_id
    );

  WITH updated AS (
    UPDATE workspace_user_linked_users
    SET virtual_user_id = keep_user_id
    WHERE virtual_user_id = delete_user_id
    RETURNING 1
  )
  SELECT jsonb_set(update_counts, '{workspace_user_linked_users,virtual_user_id}', to_jsonb((SELECT COUNT(*) FROM updated))) INTO update_counts;

  -- Add merge audit note to keep_user
  merged_note := format(
    E'\n[MERGED: %s]\nMerged from user %s (%s)\nFields from merged user: %s\nBalance strategy: %s',
    NOW()::TEXT,
    delete_user_id::TEXT,
    COALESCE(delete_user.email, delete_user.full_name, 'Unknown'),
    COALESCE(array_to_string(fields_from_deleted, ', '), 'none'),
    balance_strategy
  );

  UPDATE workspace_users
  SET note = COALESCE(note, '') || merged_note
  WHERE id = keep_user_id;

  -- Soft delete the merged user (mark as deleted rather than hard delete)
  UPDATE workspace_users
  SET deleted = true,
      note = COALESCE(note, '') || format(E'\n[DELETED BY MERGE: %s]\nMerged into user %s', NOW()::TEXT, keep_user_id::TEXT)
  WHERE id = delete_user_id;

  RETURN JSONB_BUILD_OBJECT(
    'success', true,
    'mergedUserId', keep_user_id,
    'deletedUserId', delete_user_id,
    'updates', update_counts,
    'fieldsFromDeleted', TO_JSONB(fields_from_deleted),
    'balanceStrategy', balance_strategy
  );
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================
GRANT EXECUTE ON FUNCTION find_duplicate_workspace_users(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION preview_workspace_user_merge(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_workspace_users(UUID, UUID, JSONB, TEXT) TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION find_duplicate_workspace_users(UUID, TEXT) IS
  'Finds workspace users with duplicate email or phone values within a workspace. Returns groups of users sharing the same identifier.';

COMMENT ON FUNCTION preview_workspace_user_merge(UUID, UUID) IS
  'Generates a preview of what would happen if two workspace users were merged. Returns affected record counts and warnings.';

COMMENT ON FUNCTION merge_workspace_users(UUID, UUID, JSONB, TEXT) IS
  'Merges two workspace users by updating all references from delete_user to keep_user, then soft-deleting delete_user. Supports field selection strategy and balance handling.';
