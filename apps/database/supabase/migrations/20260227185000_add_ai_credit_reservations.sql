CREATE TABLE IF NOT EXISTS public.ai_credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  balance_id UUID NOT NULL REFERENCES public.workspace_ai_credit_balances(id) ON DELETE CASCADE,
  amount NUMERIC(14,4) NOT NULL CHECK (amount > 0),
  model_id TEXT,
  feature TEXT,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'committed', 'released', 'expired')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  committed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_credit_reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_credit_reservations_balance_status
  ON public.ai_credit_reservations (balance_id, status, expires_at);

CREATE INDEX IF NOT EXISTS idx_ai_credit_reservations_ws_created
  ON public.ai_credit_reservations (ws_id, created_at DESC);

CREATE POLICY "ai_credit_reservations_select_members"
  ON public.ai_credit_reservations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = ai_credit_reservations.ws_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public._release_expired_ai_credit_reservations(
  p_balance_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_released_amount NUMERIC := 0;
BEGIN
  WITH expired AS (
    UPDATE public.ai_credit_reservations
       SET status = 'expired',
           released_at = now(),
           updated_at = now(),
           metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object('expired_at', now())
     WHERE balance_id = p_balance_id
       AND status = 'reserved'
       AND expires_at <= now()
    RETURNING amount
  )
  SELECT COALESCE(SUM(amount), 0)
    INTO v_released_amount
    FROM expired;

  IF v_released_amount > 0 THEN
    UPDATE public.workspace_ai_credit_balances
       SET total_used = GREATEST(total_used - v_released_amount, 0),
           updated_at = now()
     WHERE id = p_balance_id;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.reserve_fixed_ai_credits(
  UUID,
  UUID,
  NUMERIC,
  TEXT,
  TEXT,
  JSONB,
  INTEGER
);

CREATE OR REPLACE FUNCTION public.reserve_fixed_ai_credits(
  p_ws_id UUID,
  p_user_id UUID,
  p_amount NUMERIC,
  p_model_id TEXT DEFAULT 'markitdown/conversion',
  p_feature TEXT DEFAULT 'chat',
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_expires_in_seconds INTEGER DEFAULT 1800
)
RETURNS TABLE (
  success BOOLEAN,
  reservation_id UUID,
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
  v_reservation_id UUID;
BEGIN
  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id, p_user_id);

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'NO_BALANCE'::TEXT;
    RETURN;
  END IF;

  IF COALESCE(p_amount, 0) <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::NUMERIC, 'INVALID_AMOUNT'::TEXT;
    RETURN;
  END IF;

  PERFORM public._release_expired_ai_credit_reservations(v_balance.id);

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
      NULL::UUID,
      (
        COALESCE(v_current_total_allocated, COALESCE(v_balance.total_allocated, 0)) +
        COALESCE(v_current_bonus_credits, COALESCE(v_balance.bonus_credits, 0)) -
        COALESCE(v_current_total_used, COALESCE(v_balance.total_used, 0))
      )::NUMERIC,
      'INSUFFICIENT_CREDITS'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.ai_credit_reservations
    (ws_id, user_id, balance_id, amount, model_id, feature, status, metadata, expires_at)
  VALUES
    (
      p_ws_id,
      p_user_id,
      v_balance.id,
      p_amount,
      p_model_id,
      p_feature,
      'reserved',
      COALESCE(p_metadata, '{}'::JSONB),
      now() + make_interval(secs => GREATEST(COALESCE(p_expires_in_seconds, 1800), 60))
    )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY
  SELECT
    TRUE,
    v_reservation_id,
    (v_total_allocated + v_bonus_credits - v_new_total_used)::NUMERIC,
    NULL::TEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.commit_fixed_ai_credit_reservation(
  UUID,
  JSONB
);

CREATE OR REPLACE FUNCTION public.commit_fixed_ai_credit_reservation(
  p_reservation_id UUID,
  p_metadata JSONB DEFAULT '{}'::JSONB
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
  v_reservation RECORD;
  v_balance_total_used NUMERIC;
  v_balance_total_allocated NUMERIC;
  v_balance_bonus_credits NUMERIC;
BEGIN
  SELECT
    r.*,
    b.total_used AS balance_total_used,
    b.total_allocated AS balance_total_allocated,
    b.bonus_credits AS balance_bonus_credits
    INTO v_reservation
    FROM public.ai_credit_reservations r
    JOIN public.workspace_ai_credit_balances b
      ON b.id = r.balance_id
   WHERE r.id = p_reservation_id
   FOR UPDATE OF r, b;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'RESERVATION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  IF v_reservation.status = 'committed' THEN
    RETURN QUERY
    SELECT
      TRUE,
      v_reservation.amount,
      (
        v_reservation.balance_total_allocated +
        v_reservation.balance_bonus_credits -
        v_reservation.balance_total_used
      )::NUMERIC,
      NULL::TEXT;
    RETURN;
  END IF;

  IF v_reservation.status IN ('released', 'expired') THEN
    RETURN QUERY
    SELECT
      FALSE,
      0::NUMERIC,
      (
        v_reservation.balance_total_allocated +
        v_reservation.balance_bonus_credits -
        v_reservation.balance_total_used
      )::NUMERIC,
      'RESERVATION_NOT_ACTIVE'::TEXT;
    RETURN;
  END IF;

  IF v_reservation.expires_at <= now() THEN
    UPDATE public.workspace_ai_credit_balances
       SET total_used = GREATEST(total_used - v_reservation.amount, 0),
           updated_at = now()
     WHERE id = v_reservation.balance_id
  RETURNING total_used, total_allocated, bonus_credits
    INTO v_balance_total_used, v_balance_total_allocated, v_balance_bonus_credits;

    UPDATE public.ai_credit_reservations
       SET status = 'expired',
           released_at = now(),
           updated_at = now(),
           metadata = COALESCE(metadata, '{}'::JSONB) || COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('expired_during_commit', true)
     WHERE id = p_reservation_id;

    RETURN QUERY
    SELECT
      FALSE,
      0::NUMERIC,
      (
        v_balance_total_allocated +
        v_balance_bonus_credits -
        v_balance_total_used
      )::NUMERIC,
      'RESERVATION_EXPIRED'::TEXT;
    RETURN;
  END IF;

  UPDATE public.ai_credit_reservations
     SET status = 'committed',
         committed_at = now(),
         updated_at = now(),
         metadata = COALESCE(metadata, '{}'::JSONB) || COALESCE(p_metadata, '{}'::JSONB)
   WHERE id = p_reservation_id;

  INSERT INTO public.ai_credit_transactions
    (ws_id, user_id, balance_id, transaction_type, amount, cost_usd, model_id, feature, metadata)
  VALUES
    (
      v_reservation.ws_id,
      v_reservation.user_id,
      v_reservation.balance_id,
      'deduction',
      -v_reservation.amount,
      v_reservation.amount * 0.0001,
      v_reservation.model_id,
      v_reservation.feature,
      COALESCE(v_reservation.metadata, '{}'::JSONB) || COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('reservation_id', v_reservation.id)
    );

  RETURN QUERY
  SELECT
    TRUE,
    v_reservation.amount,
    (
      v_reservation.balance_total_allocated +
      v_reservation.balance_bonus_credits -
      v_reservation.balance_total_used
    )::NUMERIC,
    NULL::TEXT;
END;
$$;

DROP FUNCTION IF EXISTS public.release_fixed_ai_credit_reservation(
  UUID,
  JSONB
);

CREATE OR REPLACE FUNCTION public.release_fixed_ai_credit_reservation(
  p_reservation_id UUID,
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
  v_reservation RECORD;
  v_balance_total_used NUMERIC;
  v_balance_total_allocated NUMERIC;
  v_balance_bonus_credits NUMERIC;
BEGIN
  SELECT
    r.*,
    b.total_used AS balance_total_used,
    b.total_allocated AS balance_total_allocated,
    b.bonus_credits AS balance_bonus_credits
    INTO v_reservation
    FROM public.ai_credit_reservations r
    JOIN public.workspace_ai_credit_balances b
      ON b.id = r.balance_id
   WHERE r.id = p_reservation_id
   FOR UPDATE OF r, b;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 'RESERVATION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  IF v_reservation.status = 'committed' THEN
    RETURN QUERY
    SELECT
      FALSE,
      (
        v_reservation.balance_total_allocated +
        v_reservation.balance_bonus_credits -
        v_reservation.balance_total_used
      )::NUMERIC,
      'RESERVATION_ALREADY_COMMITTED'::TEXT;
    RETURN;
  END IF;

  IF v_reservation.status IN ('released', 'expired') THEN
    RETURN QUERY
    SELECT
      TRUE,
      (
        v_reservation.balance_total_allocated +
        v_reservation.balance_bonus_credits -
        v_reservation.balance_total_used
      )::NUMERIC,
      NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.workspace_ai_credit_balances
     SET total_used = GREATEST(total_used - v_reservation.amount, 0),
         updated_at = now()
   WHERE id = v_reservation.balance_id
  RETURNING total_used, total_allocated, bonus_credits
    INTO v_balance_total_used, v_balance_total_allocated, v_balance_bonus_credits;

  UPDATE public.ai_credit_reservations
     SET status = 'released',
         released_at = now(),
         updated_at = now(),
         metadata = COALESCE(metadata, '{}'::JSONB) || COALESCE(p_metadata, '{}'::JSONB)
   WHERE id = p_reservation_id;

  RETURN QUERY
  SELECT
    TRUE,
    (
      v_balance_total_allocated +
      v_balance_bonus_credits -
      v_balance_total_used
    )::NUMERIC,
    NULL::TEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_fixed_ai_credits(
  UUID,
  UUID,
  NUMERIC,
  TEXT,
  TEXT,
  JSONB,
  INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_fixed_ai_credits(
  UUID,
  UUID,
  NUMERIC,
  TEXT,
  TEXT,
  JSONB,
  INTEGER
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.commit_fixed_ai_credit_reservation(
  UUID,
  JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.commit_fixed_ai_credit_reservation(
  UUID,
  JSONB
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_fixed_ai_credit_reservation(
  UUID,
  JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.release_fixed_ai_credit_reservation(
  UUID,
  JSONB
) TO service_role;

REVOKE EXECUTE ON FUNCTION public._release_expired_ai_credit_reservations(
  UUID
) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- OVERRIDING BALANCE CHECK/DEDUCT FUNCTIONS FROM EARLIER MIGRATIONS
-- TO INCLUDE EXPIRY CLEANUP
-- -----------------------------------------------------------------------------

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
  v_daily_used NUMERIC;
  v_daily_request_count INTEGER;
  v_feature_daily_count INTEGER;
  v_effective_max_output INTEGER;
  v_estimated_cost NUMERIC;
BEGIN
  -- Resolve workspace tier
  v_tier := public._resolve_workspace_tier(p_ws_id);

  -- Read allocation for tier
  SELECT * INTO v_allocation
    FROM public.ai_credit_plan_allocations
   WHERE ai_credit_plan_allocations.tier = v_tier AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, v_tier::TEXT, NULL::INTEGER,
      'NO_ALLOCATION'::TEXT, 'No credit allocation configured for this tier'::TEXT;
    RETURN;
  END IF;

  -- Check model allowed for tier
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

  -- Check model is enabled in gateway
  SELECT gm.max_tokens, gm.input_price_per_token, gm.output_price_per_token
    INTO v_model
    FROM public.ai_gateway_models gm
   WHERE (gm.id = p_model_id OR gm.id = 'google/' || p_model_id)
     AND gm.is_enabled = TRUE;

  -- Check feature access
  SELECT * INTO v_feature_access
    FROM public.ai_credit_feature_access fa
   WHERE fa.tier = v_tier AND fa.feature = p_feature;

  IF FOUND AND NOT v_feature_access.enabled THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, v_tier::TEXT, NULL::INTEGER,
      'FEATURE_NOT_ALLOWED'::TEXT,
      format('Feature %s is not available on the %s plan', p_feature, v_tier::TEXT)::TEXT;
    RETURN;
  END IF;

  -- Get or create balance (routes to correct pool based on tier)
  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id, p_user_id);

  -- CLEAUP EXPIRED RESERVATIONS
  PERFORM public._release_expired_ai_credit_reservations(v_balance.id);
  SELECT * INTO v_balance FROM public.workspace_ai_credit_balances WHERE id = v_balance.id;

  v_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;

  IF v_remaining <= 0 THEN
    RETURN QUERY SELECT FALSE, v_remaining, v_tier::TEXT, NULL::INTEGER,
      'CREDITS_EXHAUSTED'::TEXT,
      'Monthly AI credits have been used up'::TEXT;
    RETURN;
  END IF;

  -- Check daily limit (scoped to correct pool)
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

  -- Check daily request count
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

  -- Check per-feature daily request count
  IF FOUND AND v_feature_access.max_requests_per_day IS NOT NULL THEN
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

  -- Compute effective max output tokens
  v_effective_max_output := v_allocation.max_output_tokens_per_request;
  IF v_model.max_tokens IS NOT NULL THEN
    IF v_effective_max_output IS NULL THEN
      v_effective_max_output := v_model.max_tokens;
    ELSE
      v_effective_max_output := LEAST(v_effective_max_output, v_model.max_tokens);
    END IF;
  END IF;

  -- Budget estimation if input tokens provided
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

  -- All checks passed
  RETURN QUERY SELECT TRUE, v_remaining, v_tier::TEXT, v_effective_max_output,
    NULL::TEXT, NULL::TEXT;
  RETURN;
END;
$$;


DROP FUNCTION IF EXISTS public.deduct_ai_credits(UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID, UUID, JSONB, UUID);
DROP FUNCTION IF EXISTS public.deduct_ai_credits(UUID, TEXT, INTEGER, INTEGER, INTEGER, TEXT, UUID, UUID, JSONB, UUID, INTEGER);

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
BEGIN
  -- Get current balance (routes to correct pool based on tier)
  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id, p_user_id);

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'NO_BALANCE'::TEXT;
    RETURN;
  END IF;

  -- CLEANUP EXPIRED RESERVATIONS
  PERFORM public._release_expired_ai_credit_reservations(v_balance.id);

  -- Resolve tier for markup
  v_tier := public._resolve_workspace_tier(p_ws_id);

  SELECT COALESCE(markup_multiplier, 1.0) INTO v_markup
    FROM public.ai_credit_plan_allocations
   WHERE tier = v_tier AND is_active = TRUE;

  IF v_markup IS NULL THEN
    v_markup := 1.0;
  END IF;

  -- Compute cost using gateway pricing
  v_cost_usd := public.compute_ai_cost_from_gateway(
    p_model_id, p_input_tokens, p_output_tokens, p_reasoning_tokens, p_image_count, p_search_count
  );

  -- Convert to credits: cost_usd / 0.0001 * markup
  v_credits := (v_cost_usd / 0.0001) * v_markup;

  -- Enforce minimum 1 credit deduction for any non-zero token usage
  IF v_credits < 1 AND (
    COALESCE(p_input_tokens, 0) + COALESCE(p_output_tokens, 0)
    + COALESCE(p_reasoning_tokens, 0) + COALESCE(p_image_count, 0)
    + COALESCE(p_search_count, 0)
  ) > 0 THEN
    v_credits := 1;
  END IF;

  -- Atomically increment total_used
  UPDATE public.workspace_ai_credit_balances
     SET total_used = total_used + v_credits,
         updated_at = now()
   WHERE id = v_balance.id
  RETURNING total_used INTO v_new_total_used;

  v_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_new_total_used;

  -- Insert ledger entry with first-class user_id
  INSERT INTO public.ai_credit_transactions
    (ws_id, user_id, balance_id, execution_id, chat_message_id,
     transaction_type, amount, cost_usd, model_id, feature,
     input_tokens, output_tokens, reasoning_tokens, image_count, search_count, metadata)
  VALUES
    (CASE WHEN v_balance.ws_id IS NOT NULL THEN p_ws_id ELSE NULL END,
     p_user_id, v_balance.id, p_execution_id, p_chat_message_id,
     'deduction', -v_credits, v_cost_usd, p_model_id, p_feature,
     p_input_tokens, p_output_tokens, p_reasoning_tokens, p_image_count, p_search_count, p_metadata);

  RETURN QUERY SELECT TRUE, v_credits, v_remaining, NULL::TEXT;
  RETURN;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_ai_credit_usage_summary(
  p_ws_id UUID,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_balance RECORD;
  v_by_feature JSONB;
  v_by_model JSONB;
  v_daily_usage JSONB;
  v_period TIMESTAMPTZ;
  v_tier workspace_product_tier;
BEGIN
  v_period := COALESCE(p_period_start, date_trunc('month', now()));
  v_tier := public._resolve_workspace_tier(p_ws_id);

  -- Route to correct balance based on tier
  IF v_tier = 'FREE' AND p_user_id IS NOT NULL THEN
    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances
     WHERE user_id = p_user_id AND ws_id IS NULL AND period_start = v_period;
  ELSE
    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances
     WHERE ws_id = p_ws_id AND user_id IS NULL AND period_start = v_period;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_balance
      FROM public.get_or_create_credit_balance(p_ws_id, p_user_id);
  END IF;

  -- CLEANUP EXPIRED RESERVATIONS
  PERFORM public._release_expired_ai_credit_reservations(v_balance.id);
  SELECT * INTO v_balance FROM public.workspace_ai_credit_balances WHERE id = v_balance.id;

  -- By feature
  SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::JSONB) INTO v_by_feature
    FROM (
      SELECT feature, SUM(ABS(amount)) AS credits_used, COUNT(*) AS request_count
        FROM public.ai_credit_transactions
       WHERE balance_id = v_balance.id
         AND transaction_type = 'deduction'
       GROUP BY feature
       ORDER BY credits_used DESC
    ) f;

  -- By model
  SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::JSONB) INTO v_by_model
    FROM (
      SELECT model_id, SUM(ABS(amount)) AS credits_used, COUNT(*) AS request_count,
             SUM(input_tokens) AS total_input_tokens,
             SUM(output_tokens) AS total_output_tokens
        FROM public.ai_credit_transactions
       WHERE balance_id = v_balance.id
         AND transaction_type = 'deduction'
       GROUP BY model_id
       ORDER BY credits_used DESC
    ) m;

  -- Daily usage (last 30 days)
  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB) INTO v_daily_usage
    FROM (
      SELECT date_trunc('day', created_at)::DATE AS day,
             SUM(ABS(amount)) AS credits_used,
             COUNT(*) AS request_count
        FROM public.ai_credit_transactions
       WHERE balance_id = v_balance.id
         AND transaction_type = 'deduction'
       GROUP BY date_trunc('day', created_at)::DATE
       ORDER BY day DESC
       LIMIT 30
    ) d;

  RETURN jsonb_build_object(
    'total_allocated', v_balance.total_allocated,
    'total_used', v_balance.total_used,
    'bonus_credits', v_balance.bonus_credits,
    'remaining', v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used,
    'period_start', v_balance.period_start,
    'period_end', v_balance.period_end,
    'by_feature', v_by_feature,
    'by_model', v_by_model,
    'daily_usage', v_daily_usage
  );
END;
$$;


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

  -- CLEANUP EXPIRED RESERVATIONS
  PERFORM public._release_expired_ai_credit_reservations(v_balance.id);

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
