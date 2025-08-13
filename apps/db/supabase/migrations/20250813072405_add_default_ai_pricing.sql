-- Dynamic pricing support for AI execution analytics

-- 1) Default pricing map matching apps/web cost-calculator.ts
CREATE OR REPLACE FUNCTION get_default_ai_pricing()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'gemini-2.0-flash', jsonb_build_object(
      'per1MInputTokens', 0.1,
      'per1MOutputTokens', 0.4,
      'per1MReasoningTokens', 0.4
    ),
    'gemini-2.0-flash-lite', jsonb_build_object(
      'per1MInputTokens', 0.075,
      'per1MOutputTokens', 0.3,
      'per1MReasoningTokens', 0.3
    ),
    'gemini-2.5-flash', jsonb_build_object(
      'per1MInputTokens', 0.3,
      'per1MOutputTokens', 2.5,
      'per1MReasoningTokens', 2.5
    ),
    'gemini-2.5-flash-lite', jsonb_build_object(
      'per1MInputTokens', 0.1,
      'per1MOutputTokens', 0.4,
      'per1MReasoningTokens', 0.4
    ),
    'gemini-2.5-pro', jsonb_build_object(
      'per1MInputTokens', 1.25,
      'per1MOutputTokens', 10,
      'per1MReasoningTokens', 10
    )
  );
$$;

COMMENT ON FUNCTION get_default_ai_pricing() IS 'Returns default per-1M token pricing for supported models.';

-- 2) Helper to compute cost in USD for a single execution row
CREATE OR REPLACE FUNCTION compute_ai_cost_usd(
  p_model_id TEXT,
  p_input_tokens NUMERIC,
  p_output_tokens NUMERIC,
  p_reasoning_tokens NUMERIC,
  p_pricing JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pricing JSONB := p_pricing;
  v_model JSONB;
  v_in NUMERIC := 0;
  v_out NUMERIC := 0;
  v_reason NUMERIC := 0;
BEGIN
  IF v_pricing IS NULL THEN
    v_pricing := get_default_ai_pricing();
  END IF;

  v_model := v_pricing -> p_model_id;
  IF v_model IS NULL THEN
    RETURN 0;
  END IF;

  v_in := COALESCE((v_model ->> 'per1MInputTokens')::NUMERIC, 0);
  v_out := COALESCE((v_model ->> 'per1MOutputTokens')::NUMERIC, 0);
  v_reason := COALESCE((v_model ->> 'per1MReasoningTokens')::NUMERIC, 0);

  RETURN (COALESCE(p_input_tokens, 0) / 1000000.0) * v_in
       + (COALESCE(p_output_tokens, 0) / 1000000.0) * v_out
       + (COALESCE(p_reasoning_tokens, 0) / 1000000.0) * v_reason;
END;
$$;

COMMENT ON FUNCTION compute_ai_cost_usd(TEXT, NUMERIC, NUMERIC, NUMERIC, JSONB) IS 'Computes USD cost for a given model and token usage using provided pricing JSON (or defaults).';

-- 3) Replace existing RPCs to use helper and support lite models by default
--    (keep original signatures intact for backward compatibility)

CREATE OR REPLACE FUNCTION get_ai_execution_summary(
  p_ws_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_executions BIGINT,
  total_cost_usd NUMERIC,
  total_cost_vnd NUMERIC,
  total_tokens BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_reasoning_tokens BIGINT,
  avg_cost_per_execution NUMERIC,
  avg_tokens_per_execution NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := get_default_ai_pricing();
  v_exchange_rate NUMERIC := 26000;
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_executions,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)) * v_exchange_rate, 0) as total_cost_vnd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    SUM(wae.input_tokens)::BIGINT as total_input_tokens,
    SUM(wae.output_tokens)::BIGINT as total_output_tokens,
    SUM(wae.reasoning_tokens)::BIGINT as total_reasoning_tokens,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as avg_cost_per_execution,
    COALESCE(AVG(wae.total_tokens::NUMERIC), 0) as avg_tokens_per_execution
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date);
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_execution_daily_stats(
  p_ws_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  date DATE,
  executions BIGINT,
  total_cost_usd NUMERIC,
  total_tokens BIGINT,
  input_tokens BIGINT,
  output_tokens BIGINT,
  reasoning_tokens BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := get_default_ai_pricing();
BEGIN
  RETURN QUERY
  SELECT 
    DATE(wae.created_at) as date,
    COUNT(*)::BIGINT as executions,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    SUM(wae.input_tokens)::BIGINT as input_tokens,
    SUM(wae.output_tokens)::BIGINT as output_tokens,
    SUM(wae.reasoning_tokens)::BIGINT as reasoning_tokens
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date)
  GROUP BY DATE(wae.created_at)
  ORDER BY date;
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_execution_model_stats(
  p_ws_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  model_id TEXT,
  executions BIGINT,
  total_cost_usd NUMERIC,
  total_tokens BIGINT,
  avg_cost_per_execution NUMERIC,
  avg_tokens_per_execution NUMERIC,
  percentage_of_total NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_executions BIGINT;
  v_pricing JSONB := get_default_ai_pricing();
BEGIN
  SELECT COUNT(*) INTO total_executions
  FROM workspace_ai_executions
  WHERE ws_id = p_ws_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  RETURN QUERY
  SELECT 
    wae.model_id,
    COUNT(*)::BIGINT as executions,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as avg_cost_per_execution,
    COALESCE(AVG(wae.total_tokens::NUMERIC), 0) as avg_tokens_per_execution,
    CASE 
      WHEN total_executions > 0 THEN (COUNT(*)::NUMERIC / total_executions) * 100
      ELSE 0
    END as percentage_of_total
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date)
  GROUP BY wae.model_id
  ORDER BY executions DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_execution_monthly_cost(
  p_ws_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)
)
RETURNS TABLE (
  total_cost_usd NUMERIC,
  total_cost_vnd NUMERIC,
  executions BIGINT,
  avg_daily_cost NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := get_default_ai_pricing();
  v_exchange_rate NUMERIC := 26000;
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)) * v_exchange_rate, 0) as total_cost_vnd,
    COUNT(*)::BIGINT as executions,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae_output_tokens := wae.output_tokens, p_reasoning_tokens := wae.reasoning_tokens, v_pricing)), 0) as avg_daily_cost
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND EXTRACT(YEAR FROM wae.created_at) = p_year
    AND EXTRACT(MONTH FROM wae.created_at) = p_month;
END;
$$;

-- 4) Overloaded RPCs that accept client-supplied pricing and exchange rate

CREATE OR REPLACE FUNCTION get_ai_execution_summary(
  p_ws_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_pricing JSONB DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT 26000
)
RETURNS TABLE (
  total_executions BIGINT,
  total_cost_usd NUMERIC,
  total_cost_vnd NUMERIC,
  total_tokens BIGINT,
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  total_reasoning_tokens BIGINT,
  avg_cost_per_execution NUMERIC,
  avg_tokens_per_execution NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := COALESCE(p_pricing, get_default_ai_pricing());
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_executions,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)) * p_exchange_rate, 0) as total_cost_vnd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    SUM(wae.input_tokens)::BIGINT as total_input_tokens,
    SUM(wae.output_tokens)::BIGINT as total_output_tokens,
    SUM(wae.reasoning_tokens)::BIGINT as total_reasoning_tokens,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as avg_cost_per_execution,
    COALESCE(AVG(wae.total_tokens::NUMERIC), 0) as avg_tokens_per_execution
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date);
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_execution_daily_stats(
  p_ws_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_pricing JSONB DEFAULT NULL
)
RETURNS TABLE (
  date DATE,
  executions BIGINT,
  total_cost_usd NUMERIC,
  total_tokens BIGINT,
  input_tokens BIGINT,
  output_tokens BIGINT,
  reasoning_tokens BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := COALESCE(p_pricing, get_default_ai_pricing());
BEGIN
  RETURN QUERY
  SELECT 
    DATE(wae.created_at) as date,
    COUNT(*)::BIGINT as executions,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    SUM(wae.input_tokens)::BIGINT as input_tokens,
    SUM(wae.output_tokens)::BIGINT as output_tokens,
    SUM(wae.reasoning_tokens)::BIGINT as reasoning_tokens
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date)
  GROUP BY DATE(wae.created_at)
  ORDER BY date;
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_execution_model_stats(
  p_ws_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_pricing JSONB DEFAULT NULL
)
RETURNS TABLE (
  model_id TEXT,
  executions BIGINT,
  total_cost_usd NUMERIC,
  total_tokens BIGINT,
  avg_cost_per_execution NUMERIC,
  avg_tokens_per_execution NUMERIC,
  percentage_of_total NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_executions BIGINT;
  v_pricing JSONB := COALESCE(p_pricing, get_default_ai_pricing());
BEGIN
  SELECT COUNT(*) INTO total_executions
  FROM workspace_ai_executions
  WHERE ws_id = p_ws_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  RETURN QUERY
  SELECT 
    wae.model_id,
    COUNT(*)::BIGINT as executions,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as avg_cost_per_execution,
    COALESCE(AVG(wae.total_tokens::NUMERIC), 0) as avg_tokens_per_execution,
    CASE 
      WHEN total_executions > 0 THEN (COUNT(*)::NUMERIC / total_executions) * 100
      ELSE 0
    END as percentage_of_total
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date)
  GROUP BY wae.model_id
  ORDER BY executions DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_ai_execution_monthly_cost(
  p_ws_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  p_month INTEGER DEFAULT EXTRACT(MONTH FROM CURRENT_DATE),
  p_pricing JSONB DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT 26000
)
RETURNS TABLE (
  total_cost_usd NUMERIC,
  total_cost_vnd NUMERIC,
  executions BIGINT,
  avg_daily_cost NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pricing JSONB := COALESCE(p_pricing, get_default_ai_pricing());
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as total_cost_usd,
    COALESCE(SUM(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)) * p_exchange_rate, 0) as total_cost_vnd,
    COUNT(*)::BIGINT as executions,
    COALESCE(AVG(compute_ai_cost_usd(wae.model_id, wae.input_tokens, wae.output_tokens, wae.reasoning_tokens, v_pricing)), 0) as avg_daily_cost
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND EXTRACT(YEAR FROM wae.created_at) = p_year
    AND EXTRACT(MONTH FROM wae.created_at) = p_month;
END;
$$;

-- 5) Grants
GRANT EXECUTE ON FUNCTION get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER, JSONB, NUMERIC) TO authenticated;

-- Resolve PostgREST overload ambiguity by dropping 3-arg versions

DO $$
BEGIN
  -- get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_summary'
      AND oid::regprocedure::text = 'get_ai_execution_summary(uuid, timestamp with time zone, timestamp with time zone)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ)';
  END IF;

  -- get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_daily_stats'
      AND oid::regprocedure::text = 'get_ai_execution_daily_stats(uuid, timestamp with time zone, timestamp with time zone)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)';
  END IF;

  -- get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_model_stats'
      AND oid::regprocedure::text = 'get_ai_execution_model_stats(uuid, timestamp with time zone, timestamp with time zone)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ)';
  END IF;

  -- get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER)
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'get_ai_execution_monthly_cost'
      AND oid::regprocedure::text = 'get_ai_execution_monthly_cost(uuid, integer, integer)'
  ) THEN
    EXECUTE 'DROP FUNCTION get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER)';
  END IF;
END $$;

-- Re-grant execute on the extended signatures (already created in prior migration)
GRANT EXECUTE ON FUNCTION get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER, JSONB, NUMERIC) TO authenticated;