-- Revise AI Credit Allocation: dual-track (user-level FREE, workspace-level PAID)
-- Additive migration on top of 20260214120000_add_ai_credit_system.sql

-------------------------------------------------------------------------------
-- 1. SCHEMA CHANGES
-------------------------------------------------------------------------------

-- 1a. workspace_ai_credit_balances: support user-level balances
-- Make ws_id nullable for user-level FREE balances
ALTER TABLE public.workspace_ai_credit_balances ALTER COLUMN ws_id DROP NOT NULL;

-- Add user_id column for user-level balances
ALTER TABLE public.workspace_ai_credit_balances
  ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

-- Drop old unique constraint (ws_id, period_start)
ALTER TABLE public.workspace_ai_credit_balances
  DROP CONSTRAINT IF EXISTS workspace_ai_credit_balances_ws_id_period_start_key;

-- Partial unique indexes for each track
CREATE UNIQUE INDEX idx_credit_balance_user_period
  ON public.workspace_ai_credit_balances (user_id, period_start)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX idx_credit_balance_ws_period
  ON public.workspace_ai_credit_balances (ws_id, period_start)
  WHERE ws_id IS NOT NULL AND user_id IS NULL;

-- CHECK: exactly one of user_id or ws_id must be set
ALTER TABLE public.workspace_ai_credit_balances
  ADD CONSTRAINT chk_balance_scope
  CHECK (
    (user_id IS NOT NULL AND ws_id IS NULL)
    OR (user_id IS NULL AND ws_id IS NOT NULL)
  );

-- 1b. ai_credit_transactions: add first-class user_id
ALTER TABLE public.ai_credit_transactions
  ADD COLUMN user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Make ws_id nullable on transactions (user-level balances have no ws_id)
ALTER TABLE public.ai_credit_transactions ALTER COLUMN ws_id DROP NOT NULL;

-- Index for per-user usage queries
CREATE INDEX idx_credit_txn_user
  ON public.ai_credit_transactions (user_id, created_at)
  WHERE user_id IS NOT NULL;

-- 1c. ai_credit_plan_allocations: add credits_per_seat
ALTER TABLE public.ai_credit_plan_allocations
  ADD COLUMN credits_per_seat NUMERIC(14,4);

-- Update seed data with per-seat allocations
UPDATE public.ai_credit_plan_allocations SET credits_per_seat = NULL WHERE tier = 'FREE';
UPDATE public.ai_credit_plan_allocations SET credits_per_seat = 10000 WHERE tier = 'PLUS';
UPDATE public.ai_credit_plan_allocations SET credits_per_seat = 30000 WHERE tier = 'PRO';
UPDATE public.ai_credit_plan_allocations SET credits_per_seat = 100000 WHERE tier = 'ENTERPRISE';

-------------------------------------------------------------------------------
-- 2. RLS POLICIES FOR USER-LEVEL ROWS
-------------------------------------------------------------------------------

-- User-level balances: user can see their own
CREATE POLICY "Users can view own credit balances"
  ON public.workspace_ai_credit_balances FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- User-level transactions: user can see their own
CREATE POLICY "Users can view own credit transactions"
  ON public.ai_credit_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-------------------------------------------------------------------------------
-- 3. REVISED SQL FUNCTIONS
-------------------------------------------------------------------------------

-- Helper: resolve workspace tier
CREATE OR REPLACE FUNCTION public._resolve_workspace_tier(p_ws_id UUID)
RETURNS workspace_product_tier
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT wsp.tier
       FROM public.workspace_subscriptions ws2
       JOIN public.workspace_subscription_products wsp ON wsp.id = ws2.product_id
      WHERE ws2.ws_id = p_ws_id AND ws2.status = 'active'
      ORDER BY ws2.created_at DESC
      LIMIT 1),
    'FREE'::workspace_product_tier
  );
END;
$$;

-- 3a. Get or create credit balance (revised with user_id)
CREATE OR REPLACE FUNCTION public.get_or_create_credit_balance(
  p_ws_id UUID,
  p_user_id UUID DEFAULT NULL
)
RETURNS SETOF public.workspace_ai_credit_balances
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_balance RECORD;
  v_tier workspace_product_tier;
  v_allocation RECORD;
  v_total_credits NUMERIC;
  v_seat_count INTEGER;
BEGIN
  v_period_start := date_trunc('month', now());
  v_period_end := (date_trunc('month', now()) + INTERVAL '1 month');

  -- Resolve workspace tier
  v_tier := public._resolve_workspace_tier(p_ws_id);

  -- Route based on tier
  IF v_tier = 'FREE' AND p_user_id IS NOT NULL THEN
    -- FREE track: user-level balance
    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances
     WHERE user_id = p_user_id AND ws_id IS NULL AND period_start = v_period_start;

    IF FOUND THEN
      RETURN NEXT v_balance;
      RETURN;
    END IF;

    -- Read allocation for FREE tier
    SELECT * INTO v_allocation
      FROM public.ai_credit_plan_allocations
     WHERE tier = 'FREE' AND is_active = TRUE;

    v_total_credits := COALESCE(v_allocation.monthly_credits, 0);

    INSERT INTO public.workspace_ai_credit_balances
      (user_id, ws_id, period_start, period_end, total_allocated, total_used, bonus_credits)
    VALUES
      (p_user_id, NULL, v_period_start, v_period_end, v_total_credits, 0, 0)
    ON CONFLICT DO NOTHING;

    -- Re-fetch
    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances
     WHERE user_id = p_user_id AND ws_id IS NULL AND period_start = v_period_start;

    -- Insert allocation transaction
    IF v_balance IS NOT NULL THEN
      INSERT INTO public.ai_credit_transactions
        (ws_id, user_id, balance_id, transaction_type, amount, feature, metadata)
      VALUES
        (NULL, p_user_id, v_balance.id, 'allocation', v_balance.total_allocated, NULL,
         jsonb_build_object('tier', 'FREE', 'scope', 'user', 'period_start', v_period_start::TEXT))
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEXT v_balance;
    RETURN;
  ELSE
    -- PAID track (or FREE without user_id): workspace-level balance
    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances
     WHERE ws_id = p_ws_id AND user_id IS NULL AND period_start = v_period_start;

    IF FOUND THEN
      RETURN NEXT v_balance;
      RETURN;
    END IF;

    -- Read allocation for tier
    SELECT * INTO v_allocation
      FROM public.ai_credit_plan_allocations
     WHERE tier = v_tier AND is_active = TRUE;

    IF NOT FOUND THEN
      INSERT INTO public.workspace_ai_credit_balances
        (ws_id, user_id, period_start, period_end, total_allocated, total_used, bonus_credits)
      VALUES
        (p_ws_id, NULL, v_period_start, v_period_end, 0, 0, 0)
      ON CONFLICT DO NOTHING;
    ELSE
      -- For paid tiers, compute allocation from credits_per_seat * seat_count
      IF v_allocation.credits_per_seat IS NOT NULL THEN
        -- Get seat count from subscription, fallback to member count
        SELECT COALESCE(
          (SELECT ws2.seat_count
             FROM public.workspace_subscriptions ws2
            WHERE ws2.ws_id = p_ws_id AND ws2.status = 'active'
            ORDER BY ws2.created_at DESC
            LIMIT 1),
          (SELECT count(*)::INTEGER FROM public.workspace_members WHERE ws_id = p_ws_id)
        ) INTO v_seat_count;

        v_total_credits := v_allocation.credits_per_seat * GREATEST(v_seat_count, 1);
      ELSE
        v_total_credits := v_allocation.monthly_credits;
      END IF;

      INSERT INTO public.workspace_ai_credit_balances
        (ws_id, user_id, period_start, period_end, total_allocated, total_used, bonus_credits)
      VALUES
        (p_ws_id, NULL, v_period_start, v_period_end, v_total_credits, 0, 0)
      ON CONFLICT DO NOTHING;
    END IF;

    -- Re-fetch
    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances
     WHERE ws_id = p_ws_id AND user_id IS NULL AND period_start = v_period_start;

    -- Insert allocation transaction
    IF v_balance IS NOT NULL THEN
      INSERT INTO public.ai_credit_transactions
        (ws_id, user_id, balance_id, transaction_type, amount, feature, metadata)
      VALUES
        (p_ws_id, NULL, v_balance.id, 'allocation', v_balance.total_allocated, NULL,
         jsonb_build_object('tier', v_tier::TEXT, 'scope', 'workspace', 'period_start', v_period_start::TEXT))
      ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEXT v_balance;
    RETURN;
  END IF;
END;
$$;

-- 3b. Pre-flight credit allowance check (revised with user_id)
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
STABLE
SECURITY DEFINER
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

-- 3c. Deduct AI credits (revised with user_id)
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
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  credits_deducted NUMERIC,
  remaining_credits NUMERIC,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    p_model_id, p_input_tokens, p_output_tokens, p_reasoning_tokens
  );

  -- Convert to credits: cost_usd / 0.0001 * markup
  v_credits := (v_cost_usd / 0.0001) * v_markup;

  -- Enforce minimum 1 credit deduction for any non-zero token usage
  IF v_credits < 1 AND (COALESCE(p_input_tokens, 0) + COALESCE(p_output_tokens, 0) + COALESCE(p_reasoning_tokens, 0)) > 0 THEN
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
     input_tokens, output_tokens, reasoning_tokens, metadata)
  VALUES
    (CASE WHEN v_balance.ws_id IS NOT NULL THEN p_ws_id ELSE NULL END,
     p_user_id, v_balance.id, p_execution_id, p_chat_message_id,
     'deduction', -v_credits, v_cost_usd, p_model_id, p_feature,
     p_input_tokens, p_output_tokens, p_reasoning_tokens, p_metadata);

  RETURN QUERY SELECT TRUE, v_credits, v_remaining, NULL::TEXT;
  RETURN;
END;
$$;

-- 3d. Get AI credit usage summary (revised with user_id)
CREATE OR REPLACE FUNCTION public.get_ai_credit_usage_summary(
  p_ws_id UUID,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

-- 3e. Platform-wide AI credit overview (revised for dual-track)
CREATE OR REPLACE FUNCTION public.get_platform_ai_credit_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_workspaces_with_balance', (
      SELECT COUNT(DISTINCT ws_id)
        FROM public.workspace_ai_credit_balances
       WHERE period_start = date_trunc('month', now())
         AND ws_id IS NOT NULL
    ),
    'total_users_with_balance', (
      SELECT COUNT(DISTINCT user_id)
        FROM public.workspace_ai_credit_balances
       WHERE period_start = date_trunc('month', now())
         AND user_id IS NOT NULL
    ),
    'total_credits_consumed', (
      SELECT COALESCE(SUM(total_used), 0)
        FROM public.workspace_ai_credit_balances
       WHERE period_start = date_trunc('month', now())
    ),
    'total_credits_allocated', (
      SELECT COALESCE(SUM(total_allocated), 0)
        FROM public.workspace_ai_credit_balances
       WHERE period_start = date_trunc('month', now())
    ),
    'total_bonus_credits', (
      SELECT COALESCE(SUM(bonus_credits), 0)
        FROM public.workspace_ai_credit_balances
       WHERE period_start = date_trunc('month', now())
    ),
    'top_workspace_consumers', (
      SELECT COALESCE(jsonb_agg(row_to_json(tc)), '[]'::JSONB)
        FROM (
          SELECT ws_id, total_used, total_allocated, bonus_credits
            FROM public.workspace_ai_credit_balances
           WHERE period_start = date_trunc('month', now())
             AND ws_id IS NOT NULL
           ORDER BY total_used DESC
           LIMIT 10
        ) tc
    ),
    'top_user_consumers', (
      SELECT COALESCE(jsonb_agg(row_to_json(uc)), '[]'::JSONB)
        FROM (
          SELECT user_id, total_used, total_allocated, bonus_credits
            FROM public.workspace_ai_credit_balances
           WHERE period_start = date_trunc('month', now())
             AND user_id IS NOT NULL
           ORDER BY total_used DESC
           LIMIT 10
        ) uc
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
