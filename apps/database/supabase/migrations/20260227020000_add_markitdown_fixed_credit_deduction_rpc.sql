DROP FUNCTION IF EXISTS public.deduct_fixed_ai_credits(
  UUID,
  UUID,
  NUMERIC,
  TEXT,
  TEXT,
  JSONB
);

CREATE OR REPLACE FUNCTION public.deduct_fixed_ai_credits(
  p_ws_id UUID,
  p_user_id UUID,
  p_amount NUMERIC,
  p_model_id TEXT DEFAULT 'markitdown/conversion',
  p_feature TEXT DEFAULT 'chat',
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  remaining_credits NUMERIC,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_balance RECORD;
  v_new_total_used NUMERIC;
  v_total_allocated NUMERIC;
  v_bonus_credits NUMERIC;
  v_current_total_used NUMERIC;
  v_current_total_allocated NUMERIC;
  v_current_bonus_credits NUMERIC;
BEGIN
  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id, p_user_id);

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'NO_BALANCE'::TEXT;
    RETURN;
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'INVALID_AMOUNT'::TEXT;
    RETURN;
  END IF;

  UPDATE public.workspace_ai_credit_balances
     SET total_used = total_used + p_amount,
         updated_at = now()
   WHERE id = v_balance.id
     AND (total_allocated + bonus_credits - total_used) >= p_amount
  RETURNING total_used, total_allocated, bonus_credits
    INTO v_new_total_used, v_total_allocated, v_bonus_credits;

  IF NOT FOUND THEN
    SELECT total_used, total_allocated, bonus_credits
      INTO v_current_total_used, v_current_total_allocated, v_current_bonus_credits
      FROM public.workspace_ai_credit_balances
     WHERE id = v_balance.id;

    RETURN QUERY
    SELECT
      FALSE,
      (
        COALESCE(v_current_total_allocated, COALESCE(v_balance.total_allocated, 0)) +
        COALESCE(v_current_bonus_credits, COALESCE(v_balance.bonus_credits, 0)) -
        COALESCE(v_current_total_used, COALESCE(v_balance.total_used, 0))
      )::NUMERIC,
      'INSUFFICIENT_CREDITS'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.ai_credit_transactions
    (ws_id, user_id, balance_id, transaction_type, amount, cost_usd, model_id, feature, metadata)
  VALUES
    (
      CASE WHEN v_balance.ws_id IS NOT NULL THEN p_ws_id ELSE NULL END,
      p_user_id,
      v_balance.id,
      'deduction',
      -p_amount,
      p_amount * 0.0001,
      p_model_id,
      p_feature,
      p_metadata
    );

  RETURN QUERY
  SELECT
    TRUE,
    (v_total_allocated + v_bonus_credits - v_new_total_used)::NUMERIC,
    NULL::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_fixed_ai_credits(
  UUID,
  UUID,
  NUMERIC,
  TEXT,
  TEXT,
  JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_fixed_ai_credits(
  UUID,
  UUID,
  NUMERIC,
  TEXT,
  TEXT,
  JSONB
) TO service_role;
