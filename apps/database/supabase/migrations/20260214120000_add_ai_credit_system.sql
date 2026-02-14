-- AI Credit System: tables, functions, RLS, and seed data
-- 1 credit = $0.0001 USD

-------------------------------------------------------------------------------
-- 1. TABLES
-------------------------------------------------------------------------------

-- Gateway models: synced from Vercel AI Gateway, single source of truth for pricing
CREATE TABLE IF NOT EXISTS public.ai_gateway_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'language',
  context_window INTEGER,
  max_tokens INTEGER,
  tags TEXT[] DEFAULT '{}',
  input_price_per_token NUMERIC(18,15) NOT NULL DEFAULT 0,
  output_price_per_token NUMERIC(18,15) NOT NULL DEFAULT 0,
  input_tiers JSONB,
  output_tiers JSONB,
  cache_read_price_per_token NUMERIC(18,15),
  cache_write_price_per_token NUMERIC(18,15),
  web_search_price NUMERIC(10,4),
  released_at TIMESTAMPTZ,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_gateway_models ENABLE ROW LEVEL SECURITY;

-- Per-tier credit plan allocations
CREATE TABLE IF NOT EXISTS public.ai_credit_plan_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier workspace_product_tier NOT NULL UNIQUE,
  monthly_credits NUMERIC(14,4) NOT NULL DEFAULT 0,
  daily_limit NUMERIC(14,4),
  weekly_limit NUMERIC(14,4),
  max_credits_per_request NUMERIC(14,4),
  max_output_tokens_per_request INTEGER,
  markup_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.0,
  allowed_models TEXT[] NOT NULL DEFAULT '{}',
  allowed_features TEXT[] NOT NULL DEFAULT '{}',
  max_requests_per_day INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_credit_plan_allocations ENABLE ROW LEVEL SECURITY;

-- Per-tier per-feature access control
CREATE TABLE IF NOT EXISTS public.ai_credit_feature_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier workspace_product_tier NOT NULL,
  feature TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  max_requests_per_day INTEGER,
  UNIQUE (tier, feature)
);

ALTER TABLE public.ai_credit_feature_access ENABLE ROW LEVEL SECURITY;

-- Per-workspace per-billing-period running balance
CREATE TABLE IF NOT EXISTS public.workspace_ai_credit_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_allocated NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_used NUMERIC(14,4) NOT NULL DEFAULT 0,
  bonus_credits NUMERIC(14,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ws_id, period_start)
);

ALTER TABLE public.workspace_ai_credit_balances ENABLE ROW LEVEL SECURITY;

-- Immutable append-only credit transaction ledger
CREATE TABLE IF NOT EXISTS public.ai_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  balance_id UUID NOT NULL REFERENCES public.workspace_ai_credit_balances(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES public.workspace_ai_executions(id) ON DELETE SET NULL,
  chat_message_id UUID REFERENCES public.ai_chat_messages(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deduction', 'allocation', 'bonus', 'refund', 'adjustment')),
  amount NUMERIC(14,4) NOT NULL,
  cost_usd NUMERIC(14,8),
  model_id TEXT,
  feature TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_credit_transactions ENABLE ROW LEVEL SECURITY;

-- Index for fast balance lookups
CREATE INDEX IF NOT EXISTS idx_ai_credit_balances_ws_period
  ON public.workspace_ai_credit_balances (ws_id, period_start DESC);

-- Index for fast transaction queries
CREATE INDEX IF NOT EXISTS idx_ai_credit_transactions_ws_balance
  ON public.ai_credit_transactions (ws_id, balance_id, created_at DESC);

-- Index for daily usage aggregation
CREATE INDEX IF NOT EXISTS idx_ai_credit_transactions_ws_day
  ON public.ai_credit_transactions (ws_id, created_at);

-- Index for gateway model provider lookup
CREATE INDEX IF NOT EXISTS idx_ai_gateway_models_provider
  ON public.ai_gateway_models (provider, is_enabled);

-------------------------------------------------------------------------------
-- 2. RLS POLICIES
-------------------------------------------------------------------------------

-- ai_gateway_models: readable by all authenticated users
CREATE POLICY "ai_gateway_models_select_authenticated"
  ON public.ai_gateway_models FOR SELECT
  TO authenticated
  USING (true);

-- ai_credit_plan_allocations: readable by all authenticated users (public config)
CREATE POLICY "ai_credit_plan_allocations_select_authenticated"
  ON public.ai_credit_plan_allocations FOR SELECT
  TO authenticated
  USING (true);

-- ai_credit_feature_access: readable by all authenticated users
CREATE POLICY "ai_credit_feature_access_select_authenticated"
  ON public.ai_credit_feature_access FOR SELECT
  TO authenticated
  USING (true);

-- workspace_ai_credit_balances: readable by workspace members
CREATE POLICY "ai_credit_balances_select_members"
  ON public.workspace_ai_credit_balances FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = workspace_ai_credit_balances.ws_id
        AND wm.user_id = auth.uid()
    )
  );

-- ai_credit_transactions: readable by workspace members
CREATE POLICY "ai_credit_transactions_select_members"
  ON public.ai_credit_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = ai_credit_transactions.ws_id
        AND wm.user_id = auth.uid()
    )
  );

-------------------------------------------------------------------------------
-- 3. SQL FUNCTIONS
-------------------------------------------------------------------------------

-- 3a. Compute AI cost using gateway pricing (replaces hardcoded pricing)
CREATE OR REPLACE FUNCTION public.compute_ai_cost_from_gateway(
  p_model_id TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_reasoning_tokens INTEGER DEFAULT 0
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_model RECORD;
  v_input_cost NUMERIC := 0;
  v_output_cost NUMERIC := 0;
  v_reasoning_cost NUMERIC := 0;
  v_tier JSONB;
  v_tier_cost NUMERIC;
  v_tier_min INTEGER;
  v_tier_max INTEGER;
BEGIN
  -- Try to find model in gateway table
  SELECT input_price_per_token, output_price_per_token,
         input_tiers, output_tiers
    INTO v_model
    FROM public.ai_gateway_models
   WHERE id = p_model_id AND is_enabled = TRUE;

  -- If not found, try with google/ prefix (bare model name compat)
  IF NOT FOUND THEN
    SELECT input_price_per_token, output_price_per_token,
           input_tiers, output_tiers
      INTO v_model
      FROM public.ai_gateway_models
     WHERE id = 'google/' || p_model_id AND is_enabled = TRUE;
  END IF;

  -- Fall back to existing compute_ai_cost_usd if still not found
  IF NOT FOUND THEN
    RETURN public.compute_ai_cost_usd(
      p_model_id,
      COALESCE(p_input_tokens, 0)::NUMERIC,
      COALESCE(p_output_tokens, 0)::NUMERIC,
      COALESCE(p_reasoning_tokens, 0)::NUMERIC,
      NULL
    );
  END IF;

  -- Calculate input cost (tiered if available)
  IF v_model.input_tiers IS NOT NULL AND jsonb_array_length(v_model.input_tiers) > 0 THEN
    FOR v_tier IN SELECT * FROM jsonb_array_elements(v_model.input_tiers)
    LOOP
      v_tier_cost := (v_tier ->> 'cost')::NUMERIC;
      v_tier_min := COALESCE((v_tier ->> 'min')::INTEGER, 0);
      v_tier_max := (v_tier ->> 'max')::INTEGER; -- NULL means unlimited
      IF COALESCE(p_input_tokens, 0) >= v_tier_min AND
         (v_tier_max IS NULL OR COALESCE(p_input_tokens, 0) <= v_tier_max) THEN
        v_input_cost := COALESCE(p_input_tokens, 0)::NUMERIC * v_tier_cost;
        EXIT;
      END IF;
    END LOOP;
  ELSE
    v_input_cost := COALESCE(p_input_tokens, 0)::NUMERIC * v_model.input_price_per_token;
  END IF;

  -- Calculate output cost (tiered if available)
  IF v_model.output_tiers IS NOT NULL AND jsonb_array_length(v_model.output_tiers) > 0 THEN
    FOR v_tier IN SELECT * FROM jsonb_array_elements(v_model.output_tiers)
    LOOP
      v_tier_cost := (v_tier ->> 'cost')::NUMERIC;
      v_tier_min := COALESCE((v_tier ->> 'min')::INTEGER, 0);
      v_tier_max := (v_tier ->> 'max')::INTEGER;
      IF COALESCE(p_output_tokens, 0) >= v_tier_min AND
         (v_tier_max IS NULL OR COALESCE(p_output_tokens, 0) <= v_tier_max) THEN
        v_output_cost := COALESCE(p_output_tokens, 0)::NUMERIC * v_tier_cost;
        EXIT;
      END IF;
    END LOOP;
  ELSE
    v_output_cost := COALESCE(p_output_tokens, 0)::NUMERIC * v_model.output_price_per_token;
  END IF;

  -- Reasoning tokens use output pricing
  v_reasoning_cost := COALESCE(p_reasoning_tokens, 0)::NUMERIC * v_model.output_price_per_token;

  RETURN v_input_cost + v_output_cost + v_reasoning_cost;
END;
$$;

-- 3b. Get or create credit balance for current billing period
CREATE OR REPLACE FUNCTION public.get_or_create_credit_balance(
  p_ws_id UUID
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
BEGIN
  v_period_start := date_trunc('month', now());
  v_period_end := (date_trunc('month', now()) + INTERVAL '1 month');

  -- Try to find existing balance
  SELECT * INTO v_balance
    FROM public.workspace_ai_credit_balances
   WHERE ws_id = p_ws_id AND period_start = v_period_start;

  IF FOUND THEN
    RETURN NEXT v_balance;
    RETURN;
  END IF;

  -- Resolve workspace tier
  SELECT COALESCE(
    (SELECT wsp.tier
       FROM public.workspace_subscriptions ws2
       JOIN public.workspace_subscription_products wsp ON wsp.id = ws2.product_id
      WHERE ws2.ws_id = p_ws_id AND ws2.status = 'active'
      ORDER BY ws2.created_at DESC
      LIMIT 1),
    'FREE'::workspace_product_tier
  ) INTO v_tier;

  -- Read allocation for tier
  SELECT * INTO v_allocation
    FROM public.ai_credit_plan_allocations
   WHERE tier = v_tier AND is_active = TRUE;

  IF NOT FOUND THEN
    -- Default: 0 credits if no allocation configured
    INSERT INTO public.workspace_ai_credit_balances
      (ws_id, period_start, period_end, total_allocated, total_used, bonus_credits)
    VALUES
      (p_ws_id, v_period_start, v_period_end, 0, 0, 0)
    ON CONFLICT (ws_id, period_start) DO NOTHING;
  ELSE
    INSERT INTO public.workspace_ai_credit_balances
      (ws_id, period_start, period_end, total_allocated, total_used, bonus_credits)
    VALUES
      (p_ws_id, v_period_start, v_period_end, v_allocation.monthly_credits, 0, 0)
    ON CONFLICT (ws_id, period_start) DO NOTHING;
  END IF;

  -- Re-fetch (handles race condition where another request created it)
  SELECT * INTO v_balance
    FROM public.workspace_ai_credit_balances
   WHERE ws_id = p_ws_id AND period_start = v_period_start;

  -- Insert allocation transaction
  INSERT INTO public.ai_credit_transactions
    (ws_id, balance_id, transaction_type, amount, feature, metadata)
  VALUES
    (p_ws_id, v_balance.id, 'allocation', v_balance.total_allocated, NULL,
     jsonb_build_object('tier', v_tier::TEXT, 'period_start', v_period_start::TEXT))
  ON CONFLICT DO NOTHING;

  RETURN NEXT v_balance;
  RETURN;
END;
$$;

-- 3c. Pre-flight credit allowance check
CREATE OR REPLACE FUNCTION public.check_ai_credit_allowance(
  p_ws_id UUID,
  p_model_id TEXT,
  p_feature TEXT,
  p_estimated_input_tokens INTEGER DEFAULT NULL
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
  SELECT COALESCE(
    (SELECT wsp.tier
       FROM public.workspace_subscriptions ws2
       JOIN public.workspace_subscription_products wsp ON wsp.id = ws2.product_id
      WHERE ws2.ws_id = p_ws_id AND ws2.status = 'active'
      ORDER BY ws2.created_at DESC
      LIMIT 1),
    'FREE'::workspace_product_tier
  ) INTO v_tier;

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
      -- Also check bare model name (without provider prefix)
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

  -- Skip gateway check if model not synced yet (graceful degradation)

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

  -- Get or create balance
  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id);

  v_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;

  IF v_remaining <= 0 THEN
    RETURN QUERY SELECT FALSE, v_remaining, v_tier::TEXT, NULL::INTEGER,
      'CREDITS_EXHAUSTED'::TEXT,
      'Monthly AI credits have been used up'::TEXT;
    RETURN;
  END IF;

  -- Check daily limit
  IF v_allocation.daily_limit IS NOT NULL THEN
    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_daily_used
      FROM public.ai_credit_transactions
     WHERE ws_id = p_ws_id
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
     WHERE ws_id = p_ws_id
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
     WHERE ws_id = p_ws_id
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

-- 3d. Deduct AI credits after execution
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(
  p_ws_id UUID,
  p_model_id TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_reasoning_tokens INTEGER DEFAULT 0,
  p_feature TEXT DEFAULT NULL,
  p_execution_id UUID DEFAULT NULL,
  p_chat_message_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
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
  -- Get current balance
  SELECT * INTO v_balance
    FROM public.get_or_create_credit_balance(p_ws_id);

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'NO_BALANCE'::TEXT;
    RETURN;
  END IF;

  -- Resolve tier for markup
  SELECT COALESCE(
    (SELECT wsp.tier
       FROM public.workspace_subscriptions ws2
       JOIN public.workspace_subscription_products wsp ON wsp.id = ws2.product_id
      WHERE ws2.ws_id = p_ws_id AND ws2.status = 'active'
      ORDER BY ws2.created_at DESC
      LIMIT 1),
    'FREE'::workspace_product_tier
  ) INTO v_tier;

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

  -- Insert ledger entry
  INSERT INTO public.ai_credit_transactions
    (ws_id, balance_id, execution_id, chat_message_id,
     transaction_type, amount, cost_usd, model_id, feature,
     input_tokens, output_tokens, reasoning_tokens, metadata)
  VALUES
    (p_ws_id, v_balance.id, p_execution_id, p_chat_message_id,
     'deduction', -v_credits, v_cost_usd, p_model_id, p_feature,
     p_input_tokens, p_output_tokens, p_reasoning_tokens, p_metadata);

  RETURN QUERY SELECT TRUE, v_credits, v_remaining, NULL::TEXT;
  RETURN;
END;
$$;

-- 3e. Get AI credit usage summary for a workspace
CREATE OR REPLACE FUNCTION public.get_ai_credit_usage_summary(
  p_ws_id UUID,
  p_period_start TIMESTAMPTZ DEFAULT NULL
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
BEGIN
  v_period := COALESCE(p_period_start, date_trunc('month', now()));

  SELECT * INTO v_balance
    FROM public.workspace_ai_credit_balances
   WHERE ws_id = p_ws_id AND period_start = v_period;

  IF NOT FOUND THEN
    SELECT * INTO v_balance
      FROM public.get_or_create_credit_balance(p_ws_id);
  END IF;

  -- By feature
  SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::JSONB) INTO v_by_feature
    FROM (
      SELECT feature, SUM(ABS(amount)) AS credits_used, COUNT(*) AS request_count
        FROM public.ai_credit_transactions
       WHERE ws_id = p_ws_id AND balance_id = v_balance.id
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
       WHERE ws_id = p_ws_id AND balance_id = v_balance.id
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
       WHERE ws_id = p_ws_id AND balance_id = v_balance.id
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

-- 3f. Platform-wide AI credit overview (for root admin)
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
    'top_consumers', (
      SELECT COALESCE(jsonb_agg(row_to_json(tc)), '[]'::JSONB)
        FROM (
          SELECT ws_id, total_used, total_allocated
            FROM public.workspace_ai_credit_balances
           WHERE period_start = date_trunc('month', now())
           ORDER BY total_used DESC
           LIMIT 10
        ) tc
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-------------------------------------------------------------------------------
-- 4. SEED DATA
-------------------------------------------------------------------------------

-- Tier allocations
INSERT INTO public.ai_credit_plan_allocations (tier, monthly_credits, daily_limit, max_output_tokens_per_request, markup_multiplier, allowed_models, allowed_features)
VALUES
  ('FREE', 10000, 1000, 4096, 1.0,
   ARRAY['google/gemini-2.0-flash-lite', 'google/gemini-2.0-flash'],
   ARRAY['chat', 'generate', 'task_journal', 'email_draft']),
  ('PLUS', 50000, 5000, 16384, 1.0,
   ARRAY['google/gemini-2.0-flash-lite', 'google/gemini-2.0-flash', 'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash'],
   ARRAY['chat', 'generate', 'task_journal', 'email_draft']),
  ('PRO', 150000, 15000, 65536, 1.0,
   ARRAY['google/gemini-2.0-flash-lite', 'google/gemini-2.0-flash', 'google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash', 'google/gemini-2.5-pro'],
   ARRAY['chat', 'generate', 'task_journal', 'email_draft']),
  ('ENTERPRISE', 500000, NULL, NULL, 1.0,
   ARRAY[]::TEXT[],
   ARRAY['chat', 'generate', 'task_journal', 'email_draft'])
ON CONFLICT (tier) DO UPDATE SET
  monthly_credits = EXCLUDED.monthly_credits,
  daily_limit = EXCLUDED.daily_limit,
  max_output_tokens_per_request = EXCLUDED.max_output_tokens_per_request,
  markup_multiplier = EXCLUDED.markup_multiplier,
  allowed_models = EXCLUDED.allowed_models,
  allowed_features = EXCLUDED.allowed_features,
  updated_at = now();

-- Feature access matrix
INSERT INTO public.ai_credit_feature_access (tier, feature, enabled, max_requests_per_day)
VALUES
  -- FREE tier: only task_journal, email_draft
  ('FREE', 'chat', TRUE, NULL),
  ('FREE', 'generate', TRUE, NULL),
  ('FREE', 'task_journal', TRUE, NULL),
  ('FREE', 'email_draft', TRUE, NULL),
  -- PLUS tier: all features
  ('PLUS', 'chat', TRUE, NULL),
  ('PLUS', 'generate', TRUE, NULL),
  ('PLUS', 'task_journal', TRUE, NULL),
  ('PLUS', 'email_draft', TRUE, NULL),
  -- PRO tier: all features
  ('PRO', 'chat', TRUE, NULL),
  ('PRO', 'generate', TRUE, NULL),
  ('PRO', 'task_journal', TRUE, NULL),
  ('PRO', 'email_draft', TRUE, NULL),
  -- ENTERPRISE tier: all features
  ('ENTERPRISE', 'chat', TRUE, NULL),
  ('ENTERPRISE', 'generate', TRUE, NULL),
  ('ENTERPRISE', 'task_journal', TRUE, NULL),
  ('ENTERPRISE', 'email_draft', TRUE, NULL)
ON CONFLICT (tier, feature) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  max_requests_per_day = EXCLUDED.max_requests_per_day;
