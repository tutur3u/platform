-- Include measured native-search counts from centrally settled meeting chat runs.
CREATE OR REPLACE FUNCTION private.collect_ai_studio_consumption_events(
  p_ws_id UUID,
  p_user_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  event_id UUID,
  request_id TEXT,
  model_id TEXT,
  feature TEXT,
  source_type TEXT,
  source_id TEXT,
  execution_mode TEXT,
  status TEXT,
  billed_credits NUMERIC,
  unmetered_credits NUMERIC,
  provider_cost_usd NUMERIC,
  input_tokens BIGINT,
  output_tokens BIGINT,
  reasoning_tokens BIGINT,
  embedding_units BIGINT,
  image_units BIGINT,
  search_units BIGINT,
  latency_ms INTEGER,
  first_token_latency_ms INTEGER,
  error_class TEXT,
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
BEGIN
  IF p_ws_id IS NULL
    OR p_user_id IS NULL
    OR p_from IS NULL
    OR p_to IS NULL
    OR p_to <= p_from
    OR p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION
      'AI consumption range must be between 1 second and 366 days';
  END IF;

  RETURN QUERY
  WITH consumption_scope AS (
    SELECT public._resolve_workspace_tier(p_ws_id)
      = 'FREE'::public.workspace_product_tier AS include_personal_ledger
  ),
  studio_events AS (
    SELECT
      run.id AS event_id,
      run.request_id,
      run.model_id,
      run.feature,
      -- App attribution wins over key attribution. A key bound to an app is a
      -- credential the app authenticates with, not a separate spender, so filing
      -- its runs under the key UUID would hide the app's real cost.
      CASE
        WHEN run.metadata ->> 'external_app_id' IS NOT NULL
          OR run.metadata ->> 'billing_mode' = 'external_app_unmetered'
          THEN 'external_app'
        WHEN run.api_key_id IS NOT NULL THEN 'api_key'
        ELSE 'session'
      END AS source_type,
      CASE
        WHEN run.metadata ->> 'external_app_id' IS NOT NULL
          THEN run.metadata ->> 'external_app_id'
        WHEN run.api_key_id IS NOT NULL THEN run.api_key_id::TEXT
        WHEN run.metadata ->> 'app' IN ('meet', 'parley') THEN 'app:' || (run.metadata ->> 'app')
        ELSE COALESCE(run.actor_id::TEXT, 'session')
      END AS source_id,
      -- Runs predating the machine credential were all user-triggered.
      COALESCE(run.metadata ->> 'execution_mode', 'interactive') AS execution_mode,
      run.status,
      run.billed_credits,
      run.unmetered_credits,
      run.provider_cost_usd,
      run.input_tokens::BIGINT,
      run.output_tokens::BIGINT,
      run.reasoning_tokens::BIGINT,
      run.embedding_units::BIGINT,
      run.image_units::BIGINT,
      CASE WHEN jsonb_typeof(run.metadata -> 'search_count') = 'number'
        THEN LEAST(GREATEST((run.metadata ->> 'search_count')::NUMERIC, 0), 2147483647)::BIGINT
        ELSE 0::BIGINT END AS search_units,
      run.latency_ms,
      run.first_token_latency_ms,
      run.error_class,
      run.created_at,
      run.completed_at
    FROM private.ai_studio_runs run
    WHERE run.ws_id = p_ws_id
      AND run.created_at >= p_from
      AND run.created_at < p_to
  ),
  ledger_events AS (
    SELECT
      transaction.id AS event_id,
      'credit:' || transaction.id::TEXT AS request_id,
      COALESCE(NULLIF(transaction.model_id, ''), 'unknown') AS model_id,
      COALESCE(NULLIF(transaction.feature, ''), 'unclassified') AS feature,
      'workspace_credit'::TEXT AS source_type,
      CASE WHEN transaction.metadata ->> 'app' IN ('meet', 'parley')
        THEN 'app:' || (transaction.metadata ->> 'app')
        ELSE COALESCE(transaction.user_id::TEXT, 'workspace') END AS source_id,
      'interactive'::TEXT AS execution_mode,
      'succeeded'::TEXT AS status,
      abs(transaction.amount) AS billed_credits,
      0::NUMERIC AS unmetered_credits,
      GREATEST(COALESCE(transaction.cost_usd, 0), 0) AS provider_cost_usd,
      GREATEST(COALESCE(transaction.input_tokens, 0), 0)::BIGINT
        AS input_tokens,
      GREATEST(COALESCE(transaction.output_tokens, 0), 0)::BIGINT
        AS output_tokens,
      GREATEST(COALESCE(transaction.reasoning_tokens, 0), 0)::BIGINT
        AS reasoning_tokens,
      0::BIGINT AS embedding_units,
      GREATEST(COALESCE(transaction.image_count, 0), 0)::BIGINT
        AS image_units,
      GREATEST(COALESCE(transaction.search_count, 0), 0)::BIGINT
        AS search_units,
      NULL::INTEGER AS latency_ms,
      NULL::INTEGER AS first_token_latency_ms,
      NULL::TEXT AS error_class,
      transaction.created_at,
      transaction.created_at AS completed_at
    FROM public.ai_credit_transactions transaction
    CROSS JOIN consumption_scope scope
    WHERE transaction.transaction_type = 'deduction'
      AND transaction.created_at >= p_from
      AND transaction.created_at < p_to
      AND (
        transaction.ws_id = p_ws_id
        OR (
          scope.include_personal_ledger
          AND transaction.ws_id IS NULL
          AND transaction.user_id = p_user_id
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM private.ai_studio_runs run
        WHERE run.id::TEXT = transaction.metadata ->> 'run_id'
      )
  )
  SELECT * FROM studio_events
  UNION ALL
  SELECT * FROM ledger_events;
END;
$$;
