-- Fix cost_usd=0 bug: strip provider prefix before legacy fallback
-- Add admin RPCs for transaction listing and entity detail

-------------------------------------------------------------------------------
-- 1. FIX compute_ai_cost_from_gateway: strip provider prefix before legacy fallback
-------------------------------------------------------------------------------

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
  v_bare_model TEXT;
BEGIN
  -- Try to find model in gateway table (exact match)
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
    -- Strip provider prefix: 'google/gemini-2.5-flash-lite' → 'gemini-2.5-flash-lite'
    v_bare_model := CASE WHEN p_model_id LIKE '%/%'
      THEN substring(p_model_id from position('/' in p_model_id) + 1)
      ELSE p_model_id END;

    RETURN public.compute_ai_cost_usd(
      v_bare_model,
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

-------------------------------------------------------------------------------
-- 2. ADMIN RPC: paginated, enriched transaction listing
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_ai_credit_transactions(
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 50,
  p_ws_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_scope TEXT DEFAULT NULL,        -- 'user' | 'workspace'
  p_transaction_type TEXT DEFAULT NULL,
  p_feature TEXT DEFAULT NULL,
  p_model_id TEXT DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  ws_id UUID,
  user_id UUID,
  balance_id UUID,
  transaction_type TEXT,
  amount NUMERIC,
  cost_usd NUMERIC,
  model_id TEXT,
  feature TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  ws_name TEXT,
  ws_member_count BIGINT,
  user_display_name TEXT,
  user_avatar_url TEXT,
  workspace_tier TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_offset INTEGER;
BEGIN
  v_offset := (GREATEST(p_page, 1) - 1) * p_limit;

  RETURN QUERY
  WITH filtered AS (
    SELECT t.*
      FROM public.ai_credit_transactions t
     WHERE (p_ws_id IS NULL OR t.ws_id = p_ws_id)
       AND (p_user_id IS NULL OR t.user_id = p_user_id)
       AND (p_scope IS NULL
            OR (p_scope = 'user' AND t.user_id IS NOT NULL)
            OR (p_scope = 'workspace' AND t.ws_id IS NOT NULL AND t.user_id IS NULL))
       AND (p_transaction_type IS NULL OR t.transaction_type = p_transaction_type)
       AND (p_feature IS NULL OR t.feature = p_feature)
       AND (p_model_id IS NULL OR t.model_id = p_model_id)
       AND (p_start_date IS NULL OR t.created_at >= p_start_date)
       AND (p_end_date IS NULL OR t.created_at <= p_end_date)
  )
  SELECT
    f.id,
    f.ws_id,
    f.user_id,
    f.balance_id,
    f.transaction_type,
    f.amount,
    f.cost_usd,
    f.model_id,
    f.feature,
    f.input_tokens,
    f.output_tokens,
    f.reasoning_tokens,
    f.metadata,
    f.created_at,
    w.name::TEXT AS ws_name,
    (SELECT COUNT(*) FROM public.workspace_members wm WHERE wm.ws_id = f.ws_id)::BIGINT AS ws_member_count,
    u.display_name::TEXT AS user_display_name,
    u.avatar_url::TEXT AS user_avatar_url,
    public._resolve_workspace_tier(f.ws_id)::TEXT AS workspace_tier,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM filtered f
  LEFT JOIN public.workspaces w ON w.id = f.ws_id
  LEFT JOIN public.users u ON u.id = f.user_id
  ORDER BY f.created_at DESC
  LIMIT p_limit
  OFFSET v_offset;
END;
$$;

-------------------------------------------------------------------------------
-- 3. ADMIN RPC: entity detail (user or workspace)
-------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_ai_credit_entity_detail(
  p_ws_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_entity JSONB;
  v_tier TEXT;
  v_balance RECORD;
  v_by_feature JSONB;
  v_by_model JSONB;
  v_daily_trend JSONB;
  v_period_start TIMESTAMPTZ;
BEGIN
  v_period_start := date_trunc('month', now());

  -- Build entity info
  IF p_ws_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'type', 'workspace',
      'id', w.id,
      'name', w.name,
      'avatar_url', w.avatar_url,
      'member_count', (SELECT COUNT(*) FROM public.workspace_members wm WHERE wm.ws_id = w.id)
    ) INTO v_entity
    FROM public.workspaces w WHERE w.id = p_ws_id;

    v_tier := public._resolve_workspace_tier(p_ws_id)::TEXT;

    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances b
     WHERE b.ws_id = p_ws_id AND b.user_id IS NULL AND b.period_start = v_period_start;
  ELSIF p_user_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'type', 'user',
      'id', u.id,
      'name', u.display_name,
      'avatar_url', u.avatar_url
    ) INTO v_entity
    FROM public.users u WHERE u.id = p_user_id;

    v_tier := 'FREE';

    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances b
     WHERE b.user_id = p_user_id AND b.ws_id IS NULL AND b.period_start = v_period_start;
  ELSE
    RETURN jsonb_build_object('error', 'Must provide ws_id or user_id');
  END IF;

  -- Usage by feature (last 30 days)
  SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::JSONB) INTO v_by_feature
  FROM (
    SELECT t.feature, SUM(ABS(t.amount)) AS credits_used, COUNT(*) AS request_count
      FROM public.ai_credit_transactions t
     WHERE t.transaction_type = 'deduction'
       AND t.created_at >= now() - INTERVAL '30 days'
       AND ((p_ws_id IS NOT NULL AND t.ws_id = p_ws_id)
         OR (p_user_id IS NOT NULL AND t.user_id = p_user_id))
     GROUP BY t.feature
     ORDER BY credits_used DESC
  ) f;

  -- Usage by model (last 30 days)
  SELECT COALESCE(jsonb_agg(row_to_json(m)), '[]'::JSONB) INTO v_by_model
  FROM (
    SELECT t.model_id, SUM(ABS(t.amount)) AS credits_used, COUNT(*) AS request_count,
           SUM(t.input_tokens) AS total_input_tokens,
           SUM(t.output_tokens) AS total_output_tokens
      FROM public.ai_credit_transactions t
     WHERE t.transaction_type = 'deduction'
       AND t.created_at >= now() - INTERVAL '30 days'
       AND ((p_ws_id IS NOT NULL AND t.ws_id = p_ws_id)
         OR (p_user_id IS NOT NULL AND t.user_id = p_user_id))
     GROUP BY t.model_id
     ORDER BY credits_used DESC
  ) m;

  -- Daily trend (last 30 days)
  SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::JSONB) INTO v_daily_trend
  FROM (
    SELECT date_trunc('day', t.created_at)::DATE AS day,
           SUM(ABS(t.amount)) AS credits_used,
           COUNT(*) AS request_count
      FROM public.ai_credit_transactions t
     WHERE t.transaction_type = 'deduction'
       AND t.created_at >= now() - INTERVAL '30 days'
       AND ((p_ws_id IS NOT NULL AND t.ws_id = p_ws_id)
         OR (p_user_id IS NOT NULL AND t.user_id = p_user_id))
     GROUP BY date_trunc('day', t.created_at)::DATE
     ORDER BY day DESC
  ) d;

  RETURN jsonb_build_object(
    'entity', COALESCE(v_entity, '{}'::JSONB),
    'tier', v_tier,
    'balance', CASE WHEN v_balance.id IS NOT NULL THEN jsonb_build_object(
      'total_allocated', v_balance.total_allocated,
      'total_used', v_balance.total_used,
      'bonus_credits', v_balance.bonus_credits,
      'remaining', v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used,
      'period_start', v_balance.period_start,
      'period_end', v_balance.period_end
    ) ELSE NULL END,
    'usage_by_feature', v_by_feature,
    'usage_by_model', v_by_model,
    'daily_trend', v_daily_trend
  );
END;
$$;
