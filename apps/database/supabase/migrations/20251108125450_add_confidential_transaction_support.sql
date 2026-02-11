-- Add confidential transaction support with granular field-level permissions
-- This migration adds:
-- 1. Confidentiality flags for amount, description, and category
-- 2. Six new permissions for managing confidential transactions
-- 3. Server-side redaction function for secure data access
-- 4. Updated RLS policies for confidential transaction operations

-- Step 1: Add confidentiality flags to wallet_transactions table
ALTER TABLE "public"."wallet_transactions"
ADD COLUMN IF NOT EXISTS "is_amount_confidential" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "is_description_confidential" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "is_category_confidential" boolean NOT NULL DEFAULT false;

-- Step 2: Add new permissions to workspace_role_permission enum
-- Note: Using ALTER TYPE ADD VALUE which is safe and idempotent
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_confidential_amount';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_confidential_description';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_confidential_category';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_confidential_transactions';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_confidential_transactions';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_confidential_transactions';

-- Step 3: Create server-side redaction function
-- This function returns transactions with confidential fields redacted based on user permissions
CREATE OR REPLACE FUNCTION public.get_wallet_transactions_with_permissions(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid(),
  p_transaction_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  amount numeric,
  category_id uuid,
  created_at timestamp with time zone,
  creator_id uuid,
  description text,
  invoice_id uuid,
  report_opt_in boolean,
  taken_at timestamp with time zone,
  wallet_id uuid,
  is_amount_confidential boolean,
  is_description_confidential boolean,
  is_category_confidential boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  can_view_amount boolean;
  can_view_description boolean;
  can_view_category boolean;
BEGIN
  -- Check user's permissions for viewing confidential fields
  can_view_amount := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_amount');
  can_view_description := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_description');
  can_view_category := public.has_workspace_permission(p_ws_id, p_user_id, 'view_confidential_category');

  RETURN QUERY
  SELECT
    wt.id,
    -- Redact amount if confidential and user lacks permission
    CASE 
      WHEN wt.is_amount_confidential AND NOT can_view_amount THEN NULL
      ELSE wt.amount
    END AS amount,
    -- Redact category if confidential and user lacks permission
    CASE 
      WHEN wt.is_category_confidential AND NOT can_view_category THEN NULL
      ELSE wt.category_id
    END AS category_id,
    wt.created_at,
    wt.creator_id,
    -- Redact description if confidential and user lacks permission
    CASE 
      WHEN wt.is_description_confidential AND NOT can_view_description THEN '[CONFIDENTIAL]'
      ELSE wt.description
    END AS description,
    wt.invoice_id,
    wt.report_opt_in,
    wt.taken_at,
    wt.wallet_id,
    -- Always include confidentiality flags so UI knows to show redaction indicators
    wt.is_amount_confidential,
    wt.is_description_confidential,
    wt.is_category_confidential
  FROM public.wallet_transactions wt
  JOIN public.workspace_wallets ww ON wt.wallet_id = ww.id
  WHERE ww.ws_id = p_ws_id
    AND (p_transaction_ids IS NULL OR wt.id = ANY(p_transaction_ids));
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_wallet_transactions_with_permissions(uuid, uuid, uuid[]) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_wallet_transactions_with_permissions(uuid, uuid, uuid[]) IS
  'Returns wallet transactions with confidential fields redacted based on user permissions. Uses has_workspace_permission to check view_confidential_* permissions.';

-- Step 4: Create secure view with automatic field-level redaction
-- This view automatically redacts confidential fields based on user permissions
-- and allows users to see ALL transactions (with redaction) rather than hiding them entirely
CREATE OR REPLACE VIEW public.wallet_transactions_secure AS
SELECT
  wt.id,
  -- Redact amount if confidential and user lacks permission
  CASE 
    WHEN wt.is_amount_confidential 
      AND NOT EXISTS (
        SELECT 1 FROM workspace_wallets ww 
        WHERE ww.id = wt.wallet_id 
        AND public.has_workspace_permission(ww.ws_id, auth.uid(), 'view_confidential_amount')
      )
    THEN NULL
    ELSE wt.amount
  END AS amount,
  -- Redact category if confidential and user lacks permission  
  CASE 
    WHEN wt.is_category_confidential 
      AND NOT EXISTS (
        SELECT 1 FROM workspace_wallets ww 
        WHERE ww.id = wt.wallet_id 
        AND public.has_workspace_permission(ww.ws_id, auth.uid(), 'view_confidential_category')
      )
    THEN NULL
    ELSE wt.category_id
  END AS category_id,
  wt.created_at,
  wt.creator_id,
  -- Redact description if confidential and user lacks permission
  CASE 
    WHEN wt.is_description_confidential 
      AND NOT EXISTS (
        SELECT 1 FROM workspace_wallets ww 
        WHERE ww.id = wt.wallet_id 
        AND public.has_workspace_permission(ww.ws_id, auth.uid(), 'view_confidential_description')
      )
    THEN '[CONFIDENTIAL]'
    ELSE wt.description
  END AS description,
  wt.invoice_id,
  wt.report_opt_in,
  wt.taken_at,
  wt.wallet_id,
  -- Always include confidentiality flags so UI knows to show redaction indicators
  wt.is_amount_confidential,
  wt.is_description_confidential,
  wt.is_category_confidential
FROM public.wallet_transactions wt;

-- Grant SELECT on the secure view to authenticated users
GRANT SELECT ON public.wallet_transactions_secure TO authenticated;

-- Add RLS policy on the secure view to allow workspace members to see all transactions (with redaction)
ALTER VIEW public.wallet_transactions_secure SET (security_invoker = true);

-- Add comment explaining the view
COMMENT ON VIEW public.wallet_transactions_secure IS
  'Secure view of wallet_transactions with automatic field-level redaction based on user permissions. Always use this view instead of querying the base table directly to ensure confidential fields are properly redacted.';

-- Step 5: Update RLS policies for confidential transaction operations
-- Drop existing policy for wallet_transactions if it exists
DROP POLICY IF EXISTS "Enable all access for organization members" ON "public"."wallet_transactions";

-- Policy for SELECT: BLOCK direct access to confidential transaction data
-- Users can only SELECT transactions if:
-- 1. Transaction has NO confidential fields, OR
-- 2. User has ALL required view permissions for confidential fields
-- This forces users to use the RPC function for proper redaction
CREATE POLICY "workspace_members_can_select_transactions"
ON "public"."wallet_transactions"
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_wallets ww
    JOIN workspace_members wm ON wm.ws_id = ww.ws_id
    WHERE ww.id = wallet_transactions.wallet_id
    AND wm.user_id = auth.uid()
    AND (
      -- Allow if transaction has NO confidential fields
      (
        NOT wallet_transactions.is_amount_confidential 
        AND NOT wallet_transactions.is_description_confidential 
        AND NOT wallet_transactions.is_category_confidential
      )
      OR
      -- Allow ONLY if user has ALL required view permissions for confidential fields
      (
        (NOT wallet_transactions.is_amount_confidential OR public.has_workspace_permission(ww.ws_id, auth.uid(), 'view_confidential_amount'))
        AND
        (NOT wallet_transactions.is_description_confidential OR public.has_workspace_permission(ww.ws_id, auth.uid(), 'view_confidential_description'))
        AND
        (NOT wallet_transactions.is_category_confidential OR public.has_workspace_permission(ww.ws_id, auth.uid(), 'view_confidential_category'))
      )
    )
  )
);

-- Policy for INSERT: Allow creating transactions
-- Creating confidential transactions requires create_confidential_transactions permission
CREATE POLICY "workspace_members_can_insert_transactions"
ON "public"."wallet_transactions"
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM workspace_wallets ww
    JOIN workspace_members wm ON wm.ws_id = ww.ws_id
    WHERE ww.id = wallet_transactions.wallet_id
    AND wm.user_id = auth.uid()
    AND (
      -- If any field is confidential, require create_confidential_transactions permission
      (
        NOT (wallet_transactions.is_amount_confidential OR wallet_transactions.is_description_confidential OR wallet_transactions.is_category_confidential)
      )
      OR
      public.has_workspace_permission(ww.ws_id, auth.uid(), 'create_confidential_transactions')
    )
  )
);

-- Policy for UPDATE: Allow updating transactions
-- Updating confidential transactions requires update_confidential_transactions permission
CREATE POLICY "workspace_members_can_update_transactions"
ON "public"."wallet_transactions"
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_wallets ww
    JOIN workspace_members wm ON wm.ws_id = ww.ws_id
    WHERE ww.id = wallet_transactions.wallet_id
    AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM workspace_wallets ww
    JOIN workspace_members wm ON wm.ws_id = ww.ws_id
    WHERE ww.id = wallet_transactions.wallet_id
    AND wm.user_id = auth.uid()
    AND (
      -- If any field is/becomes confidential, require update_confidential_transactions permission
      (
        NOT (wallet_transactions.is_amount_confidential OR wallet_transactions.is_description_confidential OR wallet_transactions.is_category_confidential)
      )
      OR
      public.has_workspace_permission(ww.ws_id, auth.uid(), 'update_confidential_transactions')
    )
  )
);

-- Policy for DELETE: Allow deleting transactions
-- Deleting confidential transactions requires delete_confidential_transactions permission
CREATE POLICY "workspace_members_can_delete_transactions"
ON "public"."wallet_transactions"
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM workspace_wallets ww
    JOIN workspace_members wm ON wm.ws_id = ww.ws_id
    WHERE ww.id = wallet_transactions.wallet_id
    AND wm.user_id = auth.uid()
    AND (
      -- If any field is confidential, require delete_confidential_transactions permission
      (
        NOT (wallet_transactions.is_amount_confidential OR wallet_transactions.is_description_confidential OR wallet_transactions.is_category_confidential)
      )
      OR
      public.has_workspace_permission(ww.ws_id, auth.uid(), 'delete_confidential_transactions')
    )
  )
);

-- Add index for performance on confidentiality checks
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_confidential_flags
ON "public"."wallet_transactions" (is_amount_confidential, is_description_confidential, is_category_confidential)
WHERE is_amount_confidential OR is_description_confidential OR is_category_confidential;

