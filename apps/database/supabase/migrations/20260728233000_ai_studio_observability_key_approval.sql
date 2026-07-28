-- Decouple AI Studio observability/execution from legacy enablement switches.
-- Only API-key issuance is platform-approved; existing keys keep working until
-- explicitly revoked and all normal model, plan, credit, budget, and rate
-- controls remain enforced.

ALTER TABLE private.workspace_ai_studio_policies
  ADD COLUMN IF NOT EXISTS api_key_creation_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS api_key_creation_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS api_key_creation_decided_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN private.ai_studio_global_settings.globally_enabled IS
  'Deprecated compatibility field. AI Studio execution and observability no longer depend on this value.';
COMMENT ON COLUMN private.ai_studio_global_settings.workspace_default_enabled IS
  'Deprecated compatibility field. AI Studio execution and observability no longer depend on this value.';
COMMENT ON COLUMN private.workspace_ai_studio_policies.state IS
  'Deprecated compatibility field. AI Studio execution and observability no longer depend on this value.';
COMMENT ON COLUMN private.workspace_ai_studio_policies.api_key_creation_approved IS
  'Standing platform-admin grant for creating or rotating workspace AI API keys.';

CREATE OR REPLACE FUNCTION private.ai_studio_model_allowed(
  p_ws_id UUID,
  p_api_key_id UUID,
  p_model_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO private, public, pg_temp
AS $$
DECLARE
  v_global private.ai_studio_global_settings%ROWTYPE;
  v_policy private.workspace_ai_studio_policies%ROWTYPE;
  v_key private.ai_studio_api_keys%ROWTYPE;
  v_plan_allowed_models TEXT[];
  v_has_grants BOOLEAN;
BEGIN
  SELECT * INTO v_global
    FROM private.ai_studio_global_settings
   WHERE singleton;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
      FROM private.ai_gateway_models model
     WHERE model.id = p_model_id
       AND model.is_enabled
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_policy
    FROM private.workspace_ai_studio_policies
   WHERE ws_id = p_ws_id;

  IF cardinality(v_global.default_models) > 0
    AND NOT (p_model_id = ANY(v_global.default_models)) THEN
    RETURN FALSE;
  END IF;

  IF cardinality(COALESCE(v_policy.denied_models, '{}')) > 0
    AND p_model_id = ANY(v_policy.denied_models) THEN
    RETURN FALSE;
  END IF;

  IF cardinality(COALESCE(v_policy.allowed_models, '{}')) > 0
    AND NOT (p_model_id = ANY(v_policy.allowed_models)) THEN
    RETURN FALSE;
  END IF;

  SELECT allocation.allowed_models
    INTO v_plan_allowed_models
    FROM public.ai_credit_plan_allocations allocation
   WHERE allocation.tier = public._resolve_workspace_tier(p_ws_id)
     AND allocation.is_active;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF cardinality(COALESCE(v_plan_allowed_models, '{}')) > 0
    AND NOT EXISTS (
      SELECT 1
        FROM unnest(v_plan_allowed_models) allowed(model_id)
       WHERE allowed.model_id = p_model_id
          OR split_part(allowed.model_id, '/', 2) = split_part(p_model_id, '/', 2)
    ) THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM private.ai_studio_workspace_model_grants grant_row
     WHERE grant_row.ws_id = p_ws_id
       AND grant_row.enabled
  ) INTO v_has_grants;

  IF v_has_grants AND NOT EXISTS (
    SELECT 1
      FROM private.ai_studio_workspace_model_grants grant_row
     WHERE grant_row.ws_id = p_ws_id
       AND grant_row.model_id = p_model_id
       AND grant_row.enabled
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM private.ai_studio_workspace_model_grants grant_row
     WHERE grant_row.ws_id = p_ws_id
       AND grant_row.model_id = p_model_id
       AND NOT grant_row.enabled
  ) THEN
    RETURN FALSE;
  END IF;

  IF p_api_key_id IS NOT NULL THEN
    SELECT * INTO v_key
      FROM private.ai_studio_api_keys
     WHERE id = p_api_key_id
       AND ws_id = p_ws_id;

    IF NOT FOUND
      OR v_key.revoked_at IS NOT NULL
      OR (v_key.expires_at IS NOT NULL AND v_key.expires_at <= now())
      OR (
        cardinality(v_key.allowed_models) > 0
        AND NOT (p_model_id = ANY(v_key.allowed_models))
      ) THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION private.get_ai_studio_usage_breakdown(
  p_ws_id UUID,
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
  average_latency_ms NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO private, public, pg_temp
AS $$
BEGIN
  IF p_from IS NULL
    OR p_to IS NULL
    OR p_to <= p_from
    OR p_to - p_from > interval '366 days' THEN
    RAISE EXCEPTION 'AI Studio usage range must be between 1 second and 366 days';
  END IF;

  RETURN QUERY
  SELECT
    (run.created_at AT TIME ZONE 'UTC')::DATE,
    run.model_id,
    run.feature,
    CASE
      WHEN run.api_key_id IS NOT NULL THEN 'api_key'
      WHEN run.metadata ->> 'external_app_id' IS NOT NULL
        OR run.metadata ->> 'billing_mode' = 'external_app_unmetered'
        THEN 'external_app'
      ELSE 'session'
    END,
    CASE
      WHEN run.api_key_id IS NOT NULL THEN run.api_key_id::TEXT
      WHEN run.metadata ->> 'external_app_id' IS NOT NULL
        THEN run.metadata ->> 'external_app_id'
      ELSE 'session'
    END,
    count(*)::BIGINT,
    count(*) FILTER (WHERE run.status = 'succeeded')::BIGINT,
    count(*) FILTER (WHERE run.status = 'failed')::BIGINT,
    count(*) FILTER (WHERE run.status = 'aborted')::BIGINT,
    COALESCE(sum(run.billed_credits), 0),
    COALESCE(sum(run.provider_cost_usd), 0),
    COALESCE(sum(run.input_tokens), 0)::BIGINT,
    COALESCE(sum(run.output_tokens), 0)::BIGINT,
    COALESCE(sum(run.reasoning_tokens), 0)::BIGINT,
    COALESCE(sum(run.embedding_units), 0)::BIGINT,
    COALESCE(sum(run.image_units), 0)::BIGINT,
    COALESCE(avg(run.latency_ms) FILTER (WHERE run.latency_ms IS NOT NULL), 0)
  FROM private.ai_studio_runs run
  WHERE run.ws_id = p_ws_id
    AND run.created_at >= p_from
    AND run.created_at < p_to
  GROUP BY 1, 2, 3, 4, 5
  ORDER BY 1 ASC, 2 ASC, 3 ASC, 4 ASC, 5 ASC;
END;
$$;

REVOKE ALL ON FUNCTION private.get_ai_studio_usage_breakdown(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_ai_studio_usage_breakdown(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION private.get_ai_studio_usage_breakdown(
  UUID, TIMESTAMPTZ, TIMESTAMPTZ
) IS
  'Returns complete workspace-scoped settled AI Studio usage aggregates for a bounded UTC range.';
