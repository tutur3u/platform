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
  status TEXT,
  billed_credits NUMERIC,
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
      CASE
        WHEN run.api_key_id IS NOT NULL THEN 'api_key'
        WHEN run.metadata ->> 'external_app_id' IS NOT NULL
          OR run.metadata ->> 'billing_mode' = 'external_app_unmetered'
          THEN 'external_app'
        ELSE 'session'
      END AS source_type,
      CASE
        WHEN run.api_key_id IS NOT NULL THEN run.api_key_id::TEXT
        WHEN run.metadata ->> 'external_app_id' IS NOT NULL
          THEN run.metadata ->> 'external_app_id'
        ELSE COALESCE(run.actor_id::TEXT, 'session')
      END AS source_id,
      run.status,
      run.billed_credits,
      run.provider_cost_usd,
      run.input_tokens::BIGINT,
      run.output_tokens::BIGINT,
      run.reasoning_tokens::BIGINT,
      run.embedding_units::BIGINT,
      run.image_units::BIGINT,
      0::BIGINT AS search_units,
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
      COALESCE(transaction.user_id::TEXT, 'workspace') AS source_id,
      'succeeded'::TEXT AS status,
      abs(transaction.amount) AS billed_credits,
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

CREATE OR REPLACE FUNCTION private.get_ai_studio_consumption_breakdown(
  p_ws_id UUID,
  p_user_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS TABLE (
  bucket_date DATE,
  model_id TEXT,
  feature TEXT,
  source_type TEXT,
  source_id TEXT,
  request_count BIGINT,
  succeeded_count BIGINT,
  failed_count BIGINT,
  aborted_count BIGINT,
  billed_credits NUMERIC,
  provider_cost_usd NUMERIC,
  input_tokens BIGINT,
  output_tokens BIGINT,
  reasoning_tokens BIGINT,
  embedding_units BIGINT,
  image_units BIGINT,
  search_units BIGINT,
  average_latency_ms NUMERIC,
  latency_sample_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
  SELECT
    (event.created_at AT TIME ZONE 'UTC')::DATE AS bucket_date,
    event.model_id,
    event.feature,
    event.source_type,
    event.source_id,
    count(*)::BIGINT AS request_count,
    count(*) FILTER (WHERE event.status = 'succeeded')::BIGINT
      AS succeeded_count,
    count(*) FILTER (WHERE event.status = 'failed')::BIGINT AS failed_count,
    count(*) FILTER (WHERE event.status = 'aborted')::BIGINT AS aborted_count,
    COALESCE(sum(event.billed_credits), 0) AS billed_credits,
    COALESCE(sum(event.provider_cost_usd), 0) AS provider_cost_usd,
    COALESCE(sum(event.input_tokens), 0)::BIGINT AS input_tokens,
    COALESCE(sum(event.output_tokens), 0)::BIGINT AS output_tokens,
    COALESCE(sum(event.reasoning_tokens), 0)::BIGINT AS reasoning_tokens,
    COALESCE(sum(event.embedding_units), 0)::BIGINT AS embedding_units,
    COALESCE(sum(event.image_units), 0)::BIGINT AS image_units,
    COALESCE(sum(event.search_units), 0)::BIGINT AS search_units,
    COALESCE(
      avg(event.latency_ms) FILTER (WHERE event.latency_ms IS NOT NULL),
      0
    ) AS average_latency_ms,
    count(event.latency_ms)::BIGINT AS latency_sample_count
  FROM private.collect_ai_studio_consumption_events(
    p_ws_id,
    p_user_id,
    p_from,
    p_to
  ) event
  GROUP BY 1, 2, 3, 4, 5
  ORDER BY 1 ASC, 2 ASC, 3 ASC, 4 ASC, 5 ASC;
$$;

CREATE OR REPLACE FUNCTION private.list_ai_studio_consumption_events(
  p_ws_id UUID,
  p_user_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 50,
  p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_feature TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  request_id TEXT,
  model_id TEXT,
  feature TEXT,
  source_type TEXT,
  status TEXT,
  billed_credits NUMERIC,
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog
AS $$
  SELECT
    event.event_id,
    event.request_id,
    event.model_id,
    event.feature,
    event.source_type,
    event.status,
    event.billed_credits,
    event.provider_cost_usd,
    event.input_tokens,
    event.output_tokens,
    event.reasoning_tokens,
    event.embedding_units,
    event.image_units,
    event.search_units,
    event.latency_ms,
    event.first_token_latency_ms,
    event.error_class,
    event.created_at,
    event.completed_at
  FROM private.collect_ai_studio_consumption_events(
    p_ws_id,
    p_user_id,
    p_from,
    p_to
  ) event
  WHERE (p_status IS NULL OR event.status = p_status)
    AND (p_feature IS NULL OR event.feature = p_feature)
    AND (p_model IS NULL OR event.model_id = p_model)
    AND (
      p_cursor_created_at IS NULL
      OR p_cursor_id IS NULL
      OR (event.created_at, event.event_id)
        < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY event.created_at DESC, event.event_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 101);
$$;

REVOKE ALL ON FUNCTION private.collect_ai_studio_consumption_events(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.collect_ai_studio_consumption_events(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION private.get_ai_studio_consumption_breakdown(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_ai_studio_consumption_breakdown(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION private.list_ai_studio_consumption_events(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  INTEGER,
  TIMESTAMPTZ,
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.list_ai_studio_consumption_events(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  INTEGER,
  TIMESTAMPTZ,
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;

COMMENT ON FUNCTION private.collect_ai_studio_consumption_events(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) IS
  'Combines sanitized AI Studio runs with unmatched workspace or personal AI credit deductions without double counting.';

COMMENT ON FUNCTION private.get_ai_studio_consumption_breakdown(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ
) IS
  'Returns complete workspace-scoped AI consumption aggregates across Studio runs and the legacy AI credit ledger.';

COMMENT ON FUNCTION private.list_ai_studio_consumption_events(
  UUID,
  UUID,
  TIMESTAMPTZ,
  TIMESTAMPTZ,
  INTEGER,
  TIMESTAMPTZ,
  UUID,
  TEXT,
  TEXT,
  TEXT
) IS
  'Returns cursor-paginated sanitized AI activity across Studio runs and unmatched AI credit deductions.';
