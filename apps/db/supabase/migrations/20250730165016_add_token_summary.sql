 -- Create RPC functions for AI execution analytics

-- Function to get AI execution summary statistics
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
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_executions,
    COALESCE(SUM(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ), 0) as total_cost_usd,
    COALESCE(SUM(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ) * 26000, 0) as total_cost_vnd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    SUM(wae.input_tokens)::BIGINT as total_input_tokens,
    SUM(wae.output_tokens)::BIGINT as total_output_tokens,
    SUM(wae.reasoning_tokens)::BIGINT as total_reasoning_tokens,
    COALESCE(AVG(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ), 0) as avg_cost_per_execution,
    COALESCE(AVG(wae.total_tokens::NUMERIC), 0) as avg_tokens_per_execution
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND (p_start_date IS NULL OR wae.created_at >= p_start_date)
    AND (p_end_date IS NULL OR wae.created_at <= p_end_date);
END;
$$;

-- Function to get daily AI execution statistics
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
BEGIN
  RETURN QUERY
  SELECT 
    DATE(wae.created_at) as date,
    COUNT(*)::BIGINT as executions,
    COALESCE(SUM(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ), 0) as total_cost_usd,
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

-- Function to get model usage statistics
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
BEGIN
  -- Get total executions for percentage calculation
  SELECT COUNT(*) INTO total_executions
  FROM workspace_ai_executions
  WHERE ws_id = p_ws_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date);

  RETURN QUERY
  SELECT 
    wae.model_id,
    COUNT(*)::BIGINT as executions,
    COALESCE(SUM(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ), 0) as total_cost_usd,
    SUM(wae.total_tokens)::BIGINT as total_tokens,
    COALESCE(AVG(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ), 0) as avg_cost_per_execution,
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

-- Function to get monthly cost statistics
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
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ), 0) as total_cost_usd,
    COALESCE(SUM(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ) * 26000, 0) as total_cost_vnd,
    COUNT(*)::BIGINT as executions,
    COALESCE(AVG(
      CASE 
        WHEN wae.model_id = 'gemini-2.0-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.1 + 
          (wae.output_tokens::NUMERIC / 1000000) * 0.4 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 0.4
        WHEN wae.model_id = 'gemini-2.5-flash' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 0.3 + 
          (wae.output_tokens::NUMERIC / 1000000) * 2.5 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 2.5
        WHEN wae.model_id = 'gemini-2.5-pro' THEN 
          (wae.input_tokens::NUMERIC / 1000000) * 1.25 + 
          (wae.output_tokens::NUMERIC / 1000000) * 10 + 
          (wae.reasoning_tokens::NUMERIC / 1000000) * 10
        ELSE 0
      END
    ), 0) as avg_daily_cost
  FROM workspace_ai_executions wae
  WHERE wae.ws_id = p_ws_id
    AND EXTRACT(YEAR FROM wae.created_at) = p_year
    AND EXTRACT(MONTH FROM wae.created_at) = p_month;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_ai_execution_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_daily_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_model_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ai_execution_monthly_cost(UUID, INTEGER, INTEGER) TO authenticated;

-- Add indexes for better performance on AI execution analytics queries

-- Index for workspace and date range queries
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_created_at 
ON workspace_ai_executions (ws_id, created_at DESC);

-- Index for model-specific queries
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_model_id 
ON workspace_ai_executions (ws_id, model_id);

-- Composite index for workspace, model, and date
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_model_created 
ON workspace_ai_executions (ws_id, model_id, created_at DESC);

-- Index for token-based queries
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_tokens 
ON workspace_ai_executions (ws_id, total_tokens DESC);

-- Index for cost-related queries (using model_id for cost calculation)
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_model_tokens 
ON workspace_ai_executions (ws_id, model_id, input_tokens, output_tokens, reasoning_tokens);

-- Add comments for documentation
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_created_at IS 'Optimizes queries for workspace-specific execution history';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_model_id IS 'Optimizes model-specific analytics queries';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_model_created IS 'Optimizes complex analytics queries with model and date filters';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_tokens IS 'Optimizes token usage analytics';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_model_tokens IS 'Optimizes cost calculation queries';

-- Add indexes for better performance on AI execution analytics queries

-- Index for workspace and date range queries
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_created_at 
ON workspace_ai_executions (ws_id, created_at DESC);

-- Index for model-specific queries
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_model_id 
ON workspace_ai_executions (ws_id, model_id);

-- Composite index for workspace, model, and date
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_model_created 
ON workspace_ai_executions (ws_id, model_id, created_at DESC);

-- Index for token-based queries
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_tokens 
ON workspace_ai_executions (ws_id, total_tokens DESC);

-- Index for cost-related queries (using model_id for cost calculation)
CREATE INDEX IF NOT EXISTS idx_workspace_ai_executions_ws_id_model_tokens 
ON workspace_ai_executions (ws_id, model_id, input_tokens, output_tokens, reasoning_tokens);

-- Add comments for documentation
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_created_at IS 'Optimizes queries for workspace-specific execution history';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_model_id IS 'Optimizes model-specific analytics queries';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_model_created IS 'Optimizes complex analytics queries with model and date filters';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_tokens IS 'Optimizes token usage analytics';
COMMENT ON INDEX idx_workspace_ai_executions_ws_id_model_tokens IS 'Optimizes cost calculation queries';