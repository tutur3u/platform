-- Fix workspace_has_available_seats() to read pricing_model from
-- workspace_subscription_products (column was dropped from workspace_subscriptions
-- in migration 20260209122805).
-- Also add a hard trigger-based constraint limiting personal workspaces to 1 member.

-- Part A: Drop orphaned partial index (references dropped column)
DROP INDEX IF EXISTS idx_ws_subscriptions_seat_based;

-- Part B: Recreate workspace_has_available_seats() with correct JOIN
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
  -- pricing_model now lives on workspace_subscription_products,
  -- seat_count remains on workspace_subscriptions.
  SELECT wsp.pricing_model, ws.seat_count
  INTO pricing_model_val, seat_limit
  FROM public.workspace_subscriptions ws
  JOIN public.workspace_subscription_products wsp ON wsp.id = ws.product_id
  WHERE ws.ws_id = target_ws_id
  AND ws.status IN ('active', 'trialing', 'past_due')
  ORDER BY ws.created_at DESC
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
  SELECT (
    (SELECT count(*) FROM public.workspace_members WHERE ws_id = target_ws_id) +
    (SELECT count(*) FROM public.workspace_invites WHERE ws_id = target_ws_id) +
    (SELECT count(*) FROM public.workspace_email_invites WHERE ws_id = target_ws_id)
  ) INTO current_usage;

  RETURN current_usage < seat_limit;
END;
$$;

-- Part C: Enforce max 1 member in personal workspaces via trigger
-- This is a hard constraint that fires even for admin client operations.
CREATE OR REPLACE FUNCTION public.enforce_personal_workspace_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = NEW.ws_id
    AND w.personal = true
  ) THEN
    IF (
      SELECT count(*) FROM public.workspace_members
      WHERE ws_id = NEW.ws_id
    ) >= 1 THEN
      RAISE EXCEPTION 'Personal workspaces are limited to 1 member';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_personal_ws_member_limit ON public.workspace_members;

CREATE TRIGGER trg_enforce_personal_ws_member_limit
  BEFORE INSERT ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_personal_workspace_member_limit();
