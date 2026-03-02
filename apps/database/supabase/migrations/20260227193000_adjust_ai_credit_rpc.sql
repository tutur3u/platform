CREATE OR REPLACE FUNCTION public._get_active_payg_credits(p_ws_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(tokens_remaining), 0)
    INTO v_total
    FROM public.workspace_credit_pack_purchases
   WHERE ws_id = p_ws_id
     AND status = 'active'
     AND expires_at > now()
     AND tokens_remaining > 0;

  RETURN COALESCE(v_total, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public._consume_payg_credits(
  p_ws_id UUID,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_remaining NUMERIC := GREATEST(COALESCE(p_amount, 0), 0);
  v_consumed NUMERIC := 0;
  v_row RECORD;
  v_take NUMERIC;
  v_total NUMERIC;
BEGIN
  IF v_remaining <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.workspace_credit_pack_purchases
     SET status = 'canceled',
         updated_at = now()
   WHERE ws_id = p_ws_id
     AND status = 'active'
     AND expires_at <= now()
     AND tokens_remaining > 0;

  SELECT COALESCE(SUM(tokens_remaining), 0)
    INTO v_total
    FROM public.workspace_credit_pack_purchases
   WHERE ws_id = p_ws_id
     AND status = 'active'
     AND expires_at > now()
     AND tokens_remaining > 0
   FOR UPDATE;

  IF v_total < v_remaining THEN
    RETURN 0;
  END IF;

  FOR v_row IN
    SELECT id, tokens_remaining
      FROM public.workspace_credit_pack_purchases
     WHERE ws_id = p_ws_id
       AND status = 'active'
       AND expires_at > now()
       AND tokens_remaining > 0
     ORDER BY expires_at ASC, granted_at ASC, created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_take := LEAST(v_row.tokens_remaining, v_remaining);

    UPDATE public.workspace_credit_pack_purchases
       SET tokens_remaining = tokens_remaining - v_take,
           status = CASE
             WHEN tokens_remaining - v_take <= 0 THEN 'canceled'
             ELSE 'active'
           END,
           updated_at = now()
     WHERE id = v_row.id;

    v_remaining := v_remaining - v_take;
    v_consumed := v_consumed + v_take;
  END LOOP;

  RETURN v_consumed;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ai_credit_allowance(
  p_ws_id UUID,
  p_model_id TEXT,
  p_feature TEXT,
  p_estimated_input_tokens INTEGER DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining_credits NUMERIC,
  tier TEXT,
  max_output_tokens INTEGER,
  error_code TEXT,
  error_message TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_tier workspace_product_tier;
  v_allocation RECORD;
  v_balance RECORD;
  v_remaining NUMERIC;
  v_model RECORD;
  v_feature_access RECORD;
  v_feature_exists BOOLEAN;
  v_daily_used NUMERIC;
  v_daily_request_count INTEGER;
  v_feature_daily_count INTEGER;
  v_effective_max_output INTEGER;
  v_estimated_cost NUMERIC;
  v_included_remaining NUMERIC;
  v_payg_remaining NUMERIC;
BEGIN
  v_tier := public._resolve_workspace_tier(p_ws_id);

  SELECT * INTO v_allocation
    FROM public.ai_credit_plan_allocations
   WHERE ai_credit_plan_allocations.tier = v_tier AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, v_tier::TEXT, NULL::INTEGER,
      'NO_ALLOCATION'::TEXT, 'No credit allocation configured for this tier'::TEXT;
    RETURN;
  END IF;

  IF array_length(v_allocation.allowed_models, 1) > 0 THEN
    IF NOT (p_model_id = ANY(v_allocation.allowed_models)) THEN
      IF NOT EXISTS (
        SELECT 1 FROM unnest(v_allocation.allowed_models) AS m
        WHERE m = p_model_id OR split_part(m, '/', 2) = p_model_id
           OR p_model_id = split_part(m, '/', 2)
      ) THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC, v_tier::TEXT, NULL::INTEGER,
          'MODEL_NOT_ALLOWED'::TEXT,
          format('Model %s is not available on the %s plan', p_model_id, v_tier::TEXT)::TEXT;
        RETURN;
      END IF;
    END IF;
  END IF;

  SELECT gm.max_tokens, gm.input_price_per_token, gm.output_price_per_token
    INTO v_model
    FROM public.ai_gateway_models gm
   WHERE (gm.id = p_model_id OR gm.id = 'google/' || p_model_id)
     AND gm.is_enabled = TRUE;

  SELECT * INTO v_feature_access
    FROM public.ai_credit_feature_access fa
   WHERE fa.tier = v_tier AND fa.feature = p_feature;

  v_feature_exists := FOUND;

  IF v_feature_exists AND NOT v_feature_access.enabled THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, v_tier::TEXT, NULL::INTEGER,
      'FEATURE_NOT_ALLOWED'::TEXT,
      format('Feature %s is not available on the %s plan', p_feature, v_tier::TEXT)::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id, p_user_id)
    FOR UPDATE;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := v_included_remaining + COALESCE(v_payg_remaining, 0);

  IF v_remaining <= 0 THEN
    RETURN QUERY SELECT FALSE, v_remaining, v_tier::TEXT, NULL::INTEGER,
      'CREDITS_EXHAUSTED'::TEXT,
      'AI credits have been used up'::TEXT;
    RETURN;
  END IF;

  IF v_allocation.daily_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_daily_used
      FROM public.ai_credit_transactions
     WHERE balance_id = v_balance.id
       AND transaction_type = 'deduction'
       AND created_at >= date_trunc('day', now());

    IF v_daily_used >= v_allocation.daily_limit THEN
      RETURN QUERY SELECT FALSE, v_remaining, v_tier::TEXT, NULL::INTEGER,
        'DAILY_LIMIT_REACHED'::TEXT,
        'Daily AI credit limit has been reached'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_allocation.max_requests_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO v_daily_request_count
      FROM public.ai_credit_transactions
     WHERE balance_id = v_balance.id
       AND transaction_type = 'deduction'
       AND created_at >= date_trunc('day', now());

    IF v_daily_request_count >= v_allocation.max_requests_per_day THEN
      RETURN QUERY SELECT FALSE, v_remaining, v_tier::TEXT, NULL::INTEGER,
        'DAILY_LIMIT_REACHED'::TEXT,
        'Daily AI request limit has been reached'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_feature_exists AND v_feature_access.max_requests_per_day IS NOT NULL THEN
    SELECT COUNT(*) INTO v_feature_daily_count
      FROM public.ai_credit_transactions
     WHERE balance_id = v_balance.id
       AND transaction_type = 'deduction'
       AND feature = p_feature
       AND created_at >= date_trunc('day', now());

    IF v_feature_daily_count >= v_feature_access.max_requests_per_day THEN
      RETURN QUERY SELECT FALSE, v_remaining, v_tier::TEXT, NULL::INTEGER,
        'DAILY_LIMIT_REACHED'::TEXT,
        format('Daily limit for %s has been reached', p_feature)::TEXT;
      RETURN;
    END IF;
  END IF;

  v_effective_max_output := v_allocation.max_output_tokens_per_request;
  IF v_model.max_tokens IS NOT NULL THEN
    IF v_effective_max_output IS NULL THEN
      v_effective_max_output := v_model.max_tokens;
    ELSE
      v_effective_max_output := LEAST(v_effective_max_output, v_model.max_tokens);
    END IF;
  END IF;

  IF p_estimated_input_tokens IS NOT NULL AND v_model.input_price_per_token IS NOT NULL THEN
    v_estimated_cost := (
      p_estimated_input_tokens::NUMERIC * v_model.input_price_per_token +
      COALESCE(v_effective_max_output, 8192)::NUMERIC * v_model.output_price_per_token
    ) / 0.0001 * v_allocation.markup_multiplier;

    IF v_estimated_cost > v_remaining THEN
      RETURN QUERY SELECT FALSE, v_remaining, v_tier::TEXT, v_effective_max_output,
        'CREDITS_EXHAUSTED'::TEXT,
        'Insufficient credits for estimated request cost'::TEXT;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT TRUE, v_remaining, v_tier::TEXT, v_effective_max_output,
    NULL::TEXT, NULL::TEXT;
  RETURN;
END;
$$;

DROP FUNCTION IF EXISTS public.deduct_ai_credits(
  UUID,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID,
  UUID,
  JSONB,
  UUID,
  INTEGER,
  INTEGER
);

CREATE OR REPLACE FUNCTION public.deduct_ai_credits(
  p_ws_id UUID,
  p_model_id TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_reasoning_tokens INTEGER DEFAULT 0,
  p_feature TEXT DEFAULT NULL,
  p_execution_id UUID DEFAULT NULL,
  p_chat_message_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}',
  p_user_id UUID DEFAULT NULL,
  p_image_count INTEGER DEFAULT 0,
  p_search_count INTEGER DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  credits_deducted NUMERIC,
  remaining_credits NUMERIC,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_balance RECORD;
  v_cost_usd NUMERIC;
  v_credits NUMERIC;
  v_tier workspace_product_tier;
  v_markup NUMERIC;
  v_new_total_used NUMERIC;
  v_remaining NUMERIC;
  v_included_remaining NUMERIC;
  v_payg_remaining NUMERIC;
  v_included_to_consume NUMERIC;
  v_payg_to_consume NUMERIC;
  v_payg_consumed NUMERIC;
  v_metadata JSONB;
BEGIN
  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id, p_user_id)
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'NO_BALANCE'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_balance
    FROM public.workspace_ai_credit_balances
   WHERE id = v_balance.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'NO_BALANCE'::TEXT;
    RETURN;
  END IF;

  v_tier := public._resolve_workspace_tier(p_ws_id);

  SELECT COALESCE(markup_multiplier, 1.0) INTO v_markup
    FROM public.ai_credit_plan_allocations
   WHERE tier = v_tier AND is_active = TRUE;

  IF v_markup IS NULL THEN
    v_markup := 1.0;
  END IF;

  v_cost_usd := public.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_image_count,
    p_search_count
  );

  v_credits := (v_cost_usd / 0.0001) * v_markup;

  IF v_credits < 1
    AND (
      COALESCE(p_input_tokens, 0)
      + COALESCE(p_output_tokens, 0)
      + COALESCE(p_reasoning_tokens, 0)
      + COALESCE(p_image_count, 0)
      + COALESCE(p_search_count, 0)
    ) > 0 THEN
    v_credits := 1;
  END IF;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);

  IF (v_included_remaining + COALESCE(v_payg_remaining, 0)) < v_credits THEN
    RETURN QUERY
    SELECT
      FALSE,
      0::NUMERIC,
      (v_included_remaining + COALESCE(v_payg_remaining, 0))::NUMERIC,
      'INSUFFICIENT_CREDITS'::TEXT;
    RETURN;
  END IF;

  v_included_to_consume := LEAST(GREATEST(v_included_remaining, 0), v_credits);
  v_payg_to_consume := v_credits - v_included_to_consume;

  v_payg_consumed := 0;
  IF v_payg_to_consume > 0 THEN
    v_payg_consumed := public._consume_payg_credits(p_ws_id, v_payg_to_consume);

    IF v_payg_consumed < v_payg_to_consume THEN
      RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'INSUFFICIENT_CREDITS'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_included_to_consume > 0 THEN
    UPDATE public.workspace_ai_credit_balances
       SET total_used = total_used + v_included_to_consume,
           updated_at = now()
     WHERE id = v_balance.id
    RETURNING total_used INTO v_new_total_used;
  ELSE
    v_new_total_used := v_balance.total_used;
  END IF;

  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := (v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used)
    + COALESCE(v_payg_remaining, 0);

  v_metadata := COALESCE(p_metadata, '{}'::JSONB)
    || jsonb_build_object(
      'credit_split',
      jsonb_build_object(
        'included', v_included_to_consume,
        'payg', v_payg_consumed
      )
    );

  INSERT INTO public.ai_credit_transactions
    (ws_id, user_id, balance_id, execution_id, chat_message_id,
     transaction_type, amount, cost_usd, model_id, feature,
     input_tokens, output_tokens, reasoning_tokens, image_count, search_count, metadata)
  VALUES
    (CASE WHEN v_balance.ws_id IS NOT NULL THEN p_ws_id ELSE NULL END,
     p_user_id, v_balance.id, p_execution_id, p_chat_message_id,
     'deduction', -v_credits, v_cost_usd, p_model_id, p_feature,
     p_input_tokens, p_output_tokens, p_reasoning_tokens, p_image_count, p_search_count, v_metadata);

  RETURN QUERY SELECT TRUE, v_credits, v_remaining, NULL::TEXT;
  RETURN;
END;
$$;

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
  v_remaining NUMERIC;
  v_included_remaining NUMERIC;
  v_payg_remaining NUMERIC;
  v_included_to_consume NUMERIC;
  v_payg_to_consume NUMERIC;
  v_payg_consumed NUMERIC;
  v_metadata JSONB;
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

  SELECT * INTO v_balance
    FROM public.workspace_ai_credit_balances
   WHERE id = v_balance.id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'NO_BALANCE'::TEXT;
    RETURN;
  END IF;

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);

  IF (v_included_remaining + COALESCE(v_payg_remaining, 0)) < p_amount THEN
    RETURN QUERY
    SELECT
      FALSE,
      (v_included_remaining + COALESCE(v_payg_remaining, 0))::NUMERIC,
      'INSUFFICIENT_CREDITS'::TEXT;
    RETURN;
  END IF;

  v_included_to_consume := LEAST(GREATEST(v_included_remaining, 0), p_amount);
  v_payg_to_consume := p_amount - v_included_to_consume;

  v_payg_consumed := 0;
  IF v_payg_to_consume > 0 THEN
    v_payg_consumed := public._consume_payg_credits(p_ws_id, v_payg_to_consume);

    IF v_payg_consumed < v_payg_to_consume THEN
      RETURN QUERY SELECT FALSE, 0::NUMERIC, 'INSUFFICIENT_CREDITS'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_included_to_consume > 0 THEN
    UPDATE public.workspace_ai_credit_balances
       SET total_used = total_used + v_included_to_consume,
           updated_at = now()
     WHERE id = v_balance.id
    RETURNING total_used INTO v_new_total_used;
  ELSE
    v_new_total_used := v_balance.total_used;
  END IF;

  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := (v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used)
    + COALESCE(v_payg_remaining, 0);

  v_metadata := COALESCE(p_metadata, '{}'::JSONB)
    || jsonb_build_object(
      'credit_split',
      jsonb_build_object(
        'included', v_included_to_consume,
        'payg', v_payg_consumed
      )
    );

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
      v_metadata
    );

  RETURN QUERY
  SELECT
    TRUE,
    v_remaining,
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

REVOKE EXECUTE ON FUNCTION public._get_active_payg_credits(UUID)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._get_active_payg_credits(UUID)
TO service_role;

REVOKE EXECUTE ON FUNCTION public._consume_payg_credits(UUID, NUMERIC)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._consume_payg_credits(UUID, NUMERIC)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.check_ai_credit_allowance(
  UUID,
  TEXT,
  TEXT,
  INTEGER,
  UUID
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_ai_credit_allowance(
  UUID,
  TEXT,
  TEXT,
  INTEGER,
  UUID
)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.deduct_ai_credits(
  UUID,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID,
  UUID,
  JSONB,
  UUID,
  INTEGER,
  INTEGER
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_ai_credits(
  UUID,
  TEXT,
  INTEGER,
  INTEGER,
  INTEGER,
  TEXT,
  UUID,
  UUID,
  JSONB,
  UUID,
  INTEGER,
  INTEGER
)
TO service_role;
