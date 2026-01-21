-- Migration: wallet_role_whitelist
-- Creates table for whitelisting wallets to workspace roles with viewing window restrictions

-- 1. Create workspace_role_wallet_whitelist table
CREATE TABLE IF NOT EXISTS public.workspace_role_wallet_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.workspace_roles(id) ON DELETE CASCADE,
  wallet_id UUID NOT NULL REFERENCES public.workspace_wallets(id) ON DELETE CASCADE,
  viewing_window TEXT NOT NULL DEFAULT '1_month',
  custom_days INTEGER,  -- Only used when viewing_window = 'custom'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, wallet_id)
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_role_wallet_whitelist_role_id 
  ON public.workspace_role_wallet_whitelist(role_id);
CREATE INDEX IF NOT EXISTS idx_workspace_role_wallet_whitelist_wallet_id 
  ON public.workspace_role_wallet_whitelist(wallet_id);

-- 3. Helper function to calculate days from viewing window
CREATE OR REPLACE FUNCTION public.get_wallet_viewing_window_days(
  p_viewing_window TEXT,
  p_custom_days INTEGER DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  CASE p_viewing_window
    WHEN '1_day' THEN RETURN 1;
    WHEN '3_days' THEN RETURN 3;
    WHEN '7_days' THEN RETURN 7;
    WHEN '2_weeks' THEN RETURN 14;
    WHEN '1_month' THEN RETURN 30;
    WHEN '1_quarter' THEN RETURN 90;
    WHEN '1_year' THEN RETURN 365;
    WHEN 'custom' THEN 
      IF p_custom_days IS NULL OR p_custom_days < 1 THEN
        RETURN 30; -- Default to 1 month if custom_days is invalid
      END IF;
      RETURN p_custom_days;
    ELSE RETURN 30; -- Default to 1 month for unknown values
  END CASE;
END;
$$;

-- 4. Helper function to check if user has wallet access via role whitelist
CREATE OR REPLACE FUNCTION public.user_has_wallet_access_via_role(
  p_user_id UUID,
  p_wallet_id UUID,
  p_ws_id UUID
)
RETURNS TABLE (
  has_access BOOLEAN,
  viewing_window TEXT,
  custom_days INTEGER,
  window_start_date TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_whitelist_record RECORD;
  v_window_days INTEGER;
BEGIN
  -- Check if user is a member of any role that has this wallet whitelisted
  SELECT 
    wrww.viewing_window,
    wrww.custom_days
  INTO v_whitelist_record
  FROM public.workspace_role_wallet_whitelist wrww
  JOIN public.workspace_role_members wrm ON wrm.role_id = wrww.role_id
  JOIN public.workspace_roles wr ON wr.id = wrww.role_id
  WHERE wrm.user_id = p_user_id
    AND wrww.wallet_id = p_wallet_id
    AND wr.ws_id = p_ws_id
  LIMIT 1;

  IF v_whitelist_record IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::INTEGER, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  -- Calculate window start date (rolling from today)
  v_window_days := public.get_wallet_viewing_window_days(
    v_whitelist_record.viewing_window,
    v_whitelist_record.custom_days
  );

  RETURN QUERY SELECT 
    TRUE,
    v_whitelist_record.viewing_window,
    v_whitelist_record.custom_days,
    (CURRENT_TIMESTAMP - (v_window_days || ' days')::INTERVAL)::TIMESTAMPTZ;
END;
$$;

-- 5. RLS Policies
ALTER TABLE public.workspace_role_wallet_whitelist ENABLE ROW LEVEL SECURITY;

-- Policy: Allow role managers to view wallet whitelists
CREATE POLICY "Allow role managers to view wallet whitelists"
ON public.workspace_role_wallet_whitelist
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = workspace_role_wallet_whitelist.role_id
      AND public.has_workspace_permission(wr.ws_id, auth.uid(), 'manage_workspace_roles')
  )
);

-- Policy: Allow role managers to insert wallet whitelists
CREATE POLICY "Allow role managers to insert wallet whitelists"
ON public.workspace_role_wallet_whitelist
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = workspace_role_wallet_whitelist.role_id
      AND public.has_workspace_permission(wr.ws_id, auth.uid(), 'manage_workspace_roles')
  )
  AND EXISTS (
    SELECT 1
    FROM public.workspace_wallets ww
    WHERE ww.id = workspace_role_wallet_whitelist.wallet_id
      AND ww.ws_id = (SELECT ws_id FROM public.workspace_roles WHERE id = workspace_role_wallet_whitelist.role_id)
  )
);

-- Policy: Allow role managers to update wallet whitelists
CREATE POLICY "Allow role managers to update wallet whitelists"
ON public.workspace_role_wallet_whitelist
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = workspace_role_wallet_whitelist.role_id
      AND public.has_workspace_permission(wr.ws_id, auth.uid(), 'manage_workspace_roles')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = workspace_role_wallet_whitelist.role_id
      AND public.has_workspace_permission(wr.ws_id, auth.uid(), 'manage_workspace_roles')
  )
);

-- Policy: Allow role managers to delete wallet whitelists
CREATE POLICY "Allow role managers to delete wallet whitelists"
ON public.workspace_role_wallet_whitelist
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = workspace_role_wallet_whitelist.role_id
      AND public.has_workspace_permission(wr.ws_id, auth.uid(), 'manage_workspace_roles')
  )
);

-- 6. Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION public.get_wallet_viewing_window_days(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_wallet_access_via_role(UUID, UUID, UUID) TO authenticated;
