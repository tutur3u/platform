-- Binding an API key to an external app made a run that is *both* key-authenticated
-- and app-attributed. Three places assumed those were mutually exclusive, and each
-- one is wrong now:
--
--   1. settle_external_ai_studio_run refuses a run with api_key_id set, so a bound
--      key's run would begin and then never settle — it would sit 'running'
--      forever, with no usage row and no provider cost recorded.
--   2. The consumption feed classifies a run as 'api_key' whenever api_key_id is
--      set, checked *before* the external-app branch. Every background run would be
--      filed under an opaque key UUID instead of the app, which defeats the point
--      of the binding: seeing what an app actually costs.
--   3. Unmetered runs bill zero credits by design, so the credits an app consumed
--      on its allocation were not recorded anywhere. Provider cost alone cannot
--      answer "what would this have cost the workspace", which is the number
--      needed to decide whether an app should stay unmetered.

alter table private.ai_studio_runs
  add column if not exists unmetered_credits numeric not null default 0
    check (unmetered_credits >= 0);

comment on column private.ai_studio_runs.unmetered_credits is
  'Credits this run would have billed had it been metered. Zero for metered runs, '
  'whose real charge is billed_credits. Lets an external app''s allocation be '
  'reported as a distinct quantity from both billed credits and provider cost.';

-- (1) A run belongs to the external-app path because of how it is billed, not
-- because of which credential started it. `reservation_id is null` plus the
-- billing mode is the real test; api_key_id only records *which* bound key it was.
create or replace function private.settle_external_ai_studio_run(
  p_run_id uuid,
  p_status text,
  p_provider_cost_usd numeric default 0,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_reasoning_tokens integer default 0,
  p_embedding_units integer default 0,
  p_image_units integer default 0,
  p_latency_ms integer default null,
  p_first_token_latency_ms integer default null,
  p_error_class text default null,
  p_error_message text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_unmetered_credits numeric default 0
)
returns table (
  success boolean,
  error_code text
)
language plpgsql
security definer
set search_path to private, public, pg_temp
as $$
declare
  v_run private.ai_studio_runs%rowtype;
begin
  if p_status not in ('succeeded', 'failed', 'aborted') then
    return query select false, 'INVALID_STATUS'::text;
    return;
  end if;

  select * into v_run
    from private.ai_studio_runs
   where id = p_run_id
   for update;

  if not found then
    return query select false, 'RUN_NOT_FOUND'::text;
    return;
  end if;

  if v_run.metadata ->> 'billing_mode'
      is distinct from 'external_app_unmetered'
    or v_run.reservation_id is not null then
    return query select false, 'RUN_NOT_EXTERNAL_APP'::text;
    return;
  end if;

  if v_run.status in ('succeeded', 'failed', 'aborted') then
    return query select true, null::text;
    return;
  end if;

  update private.ai_studio_runs
     set status = p_status,
         billed_credits = 0,
         unmetered_credits = greatest(coalesce(p_unmetered_credits, 0), 0),
         provider_cost_usd = greatest(coalesce(p_provider_cost_usd, 0), 0),
         input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
         reasoning_tokens = greatest(coalesce(p_reasoning_tokens, 0), 0),
         embedding_units = greatest(coalesce(p_embedding_units, 0), 0),
         image_units = greatest(coalesce(p_image_units, 0), 0),
         latency_ms = p_latency_ms,
         first_token_latency_ms = p_first_token_latency_ms,
         error_class = p_error_class,
         error_message = p_error_message,
         metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
         completed_at = now()
   where id = p_run_id;

  insert into private.ai_studio_usage (
    run_id,
    ws_id,
    api_key_id,
    model_id,
    feature,
    billed_credits,
    provider_cost_usd,
    input_tokens,
    output_tokens,
    units
  )
  values (
    v_run.id,
    v_run.ws_id,
    -- Kept so an app's usage stays traceable to the key that produced it, and so
    -- revoking a key can be reconciled against what it spent.
    v_run.api_key_id,
    v_run.model_id,
    v_run.feature,
    0,
    greatest(coalesce(p_provider_cost_usd, 0), 0),
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    greatest(coalesce(p_embedding_units, 0), 0)
      + greatest(coalesce(p_image_units, 0), 0)
  )
  on conflict (run_id) do nothing;

  return query select true, null::text;
end;
$$;

revoke all on function private.settle_external_ai_studio_run(
  uuid, text, numeric, integer, integer, integer, integer, integer,
  integer, integer, text, text, jsonb, numeric
) from public, anon, authenticated;

grant execute on function private.settle_external_ai_studio_run(
  uuid, text, numeric, integer, integer, integer, integer, integer,
  integer, integer, text, text, jsonb, numeric
) to service_role;

-- The thirteen-argument signature is replaced by the fourteen-argument one above.
drop function if exists private.settle_external_ai_studio_run(
  uuid, text, numeric, integer, integer, integer, integer, integer,
  integer, integer, text, text, jsonb
);

-- (2) and (3): attribute by app first, and carry execution mode and the unmetered
-- allocation through the consumption feed.
--
-- All three are dropped rather than replaced because each gains output columns,
-- and CREATE OR REPLACE cannot change a function's return type. They are dropped
-- consumers-first so no dependency is left dangling, and recreated immediately
-- below in the same migration.
DROP FUNCTION IF EXISTS private.get_ai_studio_consumption_breakdown(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS private.list_ai_studio_consumption_events(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TIMESTAMPTZ, UUID,
  TEXT, TEXT, TEXT
);
DROP FUNCTION IF EXISTS private.collect_ai_studio_consumption_events(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
);

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
  execution_mode TEXT,
  request_count BIGINT,
  succeeded_count BIGINT,
  failed_count BIGINT,
  aborted_count BIGINT,
  billed_credits NUMERIC,
  unmetered_credits NUMERIC,
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
    event.execution_mode,
    count(*)::BIGINT AS request_count,
    count(*) FILTER (WHERE event.status = 'succeeded')::BIGINT
      AS succeeded_count,
    count(*) FILTER (WHERE event.status = 'failed')::BIGINT AS failed_count,
    count(*) FILTER (WHERE event.status = 'aborted')::BIGINT AS aborted_count,
    COALESCE(sum(event.billed_credits), 0) AS billed_credits,
    COALESCE(sum(event.unmetered_credits), 0) AS unmetered_credits,
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
  ) AS event
  GROUP BY 1, 2, 3, 4, 5, 6
  ORDER BY 1, 2, 3, 4, 5, 6;
$$;

REVOKE ALL ON FUNCTION private.collect_ai_studio_consumption_events(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.collect_ai_studio_consumption_events(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION private.get_ai_studio_consumption_breakdown(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_ai_studio_consumption_breakdown(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

-- The activity list gains the same two dimensions, so a cost figure found in the
-- breakdown can be drilled into rather than only totalled.
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
  p_model TEXT DEFAULT NULL,
  p_external_app TEXT DEFAULT NULL,
  p_execution_mode TEXT DEFAULT NULL
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
    event.source_id,
    event.execution_mode,
    event.status,
    event.billed_credits,
    event.unmetered_credits,
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
      p_external_app IS NULL
      OR (event.source_type = 'external_app' AND event.source_id = p_external_app)
    )
    AND (p_execution_mode IS NULL OR event.execution_mode = p_execution_mode)
    AND (
      p_cursor_created_at IS NULL
      OR p_cursor_id IS NULL
      OR (event.created_at, event.event_id)
        < (p_cursor_created_at, p_cursor_id)
    )
  ORDER BY event.created_at DESC, event.event_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 101);
$$;

REVOKE ALL ON FUNCTION private.list_ai_studio_consumption_events(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TIMESTAMPTZ, UUID,
  TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.list_ai_studio_consumption_events(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TIMESTAMPTZ, UUID,
  TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION private.collect_ai_studio_consumption_events(
  UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ
) IS
  'Combines sanitized AI Studio runs with unmatched workspace or personal AI credit deductions without double counting. Runs belonging to a registered external app are attributed to that app whether a user session or a bound API key started them.';
