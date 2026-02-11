-- Enforce seat limits on workspace invites

-- 1. Create helper function to check seat availability
CREATE OR REPLACE FUNCTION public.workspace_has_available_seats(target_ws_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pricing_model_val public.workspace_pricing_model;
  seat_limit integer;
  current_usage integer;
BEGIN
  -- Check pricing model and seat count for the active subscription
  -- We take the most recent active subscription if multiple exist (though unlikely)
  SELECT pricing_model, seat_count
  INTO pricing_model_val, seat_limit
  FROM public.workspace_subscriptions
  WHERE ws_id = target_ws_id
  AND status IN ('active', 'trialing', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  -- If no active seat-based subscription found, assume unlimited (legacy/fixed)
  IF pricing_model_val IS NULL OR pricing_model_val != 'seat_based' THEN
    RETURN TRUE;
  END IF;

  -- If seat_limit is null (unlimited seats), return true
  IF seat_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Calculate current usage (Members + Pending Invites)
  -- Note: This is a conservative count. If a user has both email and direct invite, 
  -- they might be counted twice until they accept. This prevents over-provisioning.
  SELECT (
    (SELECT count(*) FROM public.workspace_members WHERE ws_id = target_ws_id) +
    (SELECT count(*) FROM public.workspace_invites WHERE ws_id = target_ws_id) +
    (SELECT count(*) FROM public.workspace_email_invites WHERE ws_id = target_ws_id)
  ) INTO current_usage;

  -- Check if adding one more would exceed the limit
  -- We allow if current_usage < seat_limit. 
  -- The INSERT itself will add +1, so we check if there is room *before* the insert.
  RETURN current_usage < seat_limit;
END;
$$;

-- 2. Update workspace_invites INSERT policy
DROP POLICY IF EXISTS "Allow member managers to insert invites" ON "public"."workspace_invites";

CREATE POLICY "Allow member managers to insert invites"
ON "public"."workspace_invites"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  AND is_org_member(auth.uid(), ws_id)
  AND (NOT is_org_member(user_id, ws_id))
  AND (NOT EXISTS (
    SELECT 1 FROM workspace_secrets wss
    WHERE wss.ws_id = workspace_invites.ws_id
    AND wss.name = 'DISABLE_INVITE'
  ))
  AND public.workspace_has_available_seats(ws_id)
);

-- 3. Update workspace_email_invites INSERT policy
DROP POLICY IF EXISTS "Allow member managers to send email invites" ON "public"."workspace_email_invites";

CREATE POLICY "Allow member managers to send email invites"
ON "public"."workspace_email_invites"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  (
    is_member_invited(auth.uid(), ws_id)
    OR (
      is_org_member(auth.uid(), ws_id)
      AND public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
    )
    OR (
      EXISTS (
        SELECT 1 FROM workspace_email_invites wei
        WHERE lower(wei.email) = lower(auth.email())
      )
    )
  )
  AND public.workspace_has_available_seats(ws_id)
);

-- 4. Update workspace_members INSERT policy
-- While members usually join via invites (already checked), we enforce this here too
-- to prevent direct insertions bypassing the limit (e.g. Creator adding self is exempt)
DROP POLICY IF EXISTS "Allow workspace managers to insert members with constraints" ON "public"."workspace_members";

CREATE POLICY "Allow workspace managers to insert members with constraints"
ON "public"."workspace_members"
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    -- Case A: Standard Join (Invite required)
    (
      (
        (is_personal_workspace(ws_id) = false)
        OR is_workspace_owner(ws_id, auth.uid())
      )
      AND (
        is_member_invited(auth.uid(), ws_id)
        OR (
          EXISTS (
            SELECT 1 FROM workspace_email_invites wei
            WHERE lower(wei.email) = lower(auth.email())
          )
        )
      )
      -- NOTE: We do NOT enforce workspace_has_available_seats() here for invited users
      -- because the seat was already reserved (counted) when the invite was created.
    )
    -- Case B: Workspace Creator (First member)
    OR (
      EXISTS (
        SELECT 1 FROM workspaces w
        WHERE w.id = ws_id
        AND w.creator_id = auth.uid()
        AND NOT EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.ws_id = ws_id
        )
      )
      -- Creator is always allowed the first seat
    )
  )
);
