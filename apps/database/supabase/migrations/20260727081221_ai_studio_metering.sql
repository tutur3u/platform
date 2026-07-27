-- Atomic AI Studio policy resolution, run reservation, and exact settlement.

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
  v_effectively_enabled BOOLEAN;
BEGIN
  SELECT * INTO v_global
    FROM private.ai_studio_global_settings
   WHERE singleton;

  IF NOT FOUND OR NOT v_global.globally_enabled THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_policy
    FROM private.workspace_ai_studio_policies
   WHERE ws_id = p_ws_id;

  v_effectively_enabled := CASE COALESCE(v_policy.state, 'inherit')
    WHEN 'enabled' THEN TRUE
    WHEN 'disabled' THEN FALSE
    ELSE v_global.workspace_default_enabled
  END;

  IF NOT v_effectively_enabled OR NOT EXISTS (
    SELECT 1
      FROM private.ai_gateway_models model
     WHERE model.id = p_model_id
       AND model.is_enabled
  ) THEN
    RETURN FALSE;
  END IF;

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

CREATE OR REPLACE FUNCTION private.begin_ai_studio_run(
  p_request_id TEXT,
  p_ws_id UUID,
  p_user_id UUID,
  p_api_key_id UUID,
  p_model_id TEXT,
  p_feature TEXT,
  p_reserved_credits NUMERIC,
  p_idempotency_key TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  run_id UUID,
  reservation_id UUID,
  remaining_credits NUMERIC,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO private, public, pg_temp
AS $$
DECLARE
  v_key private.ai_studio_api_keys%ROWTYPE;
  v_policy private.workspace_ai_studio_policies%ROWTYPE;
  v_reservation RECORD;
  v_run_id UUID;
  v_existing_reservation_id UUID;
  v_monthly_committed NUMERIC;
  v_monthly_reserved NUMERIC;
  v_effective_rpm INTEGER;
  v_recent_requests INTEGER;
BEGIN
  IF COALESCE(p_reserved_credits, 0) <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'INVALID_AMOUNT'::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ws_id::TEXT, 0));

  IF NOT private.ai_studio_model_allowed(p_ws_id, p_api_key_id, p_model_id) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'MODEL_NOT_ALLOWED'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_policy
    FROM private.workspace_ai_studio_policies
   WHERE ws_id = p_ws_id;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT r.id, r.reservation_id
      INTO v_run_id, v_existing_reservation_id
     FROM private.ai_studio_runs r
     WHERE r.ws_id = p_ws_id
       AND r.api_key_id IS NOT DISTINCT FROM p_api_key_id
       AND r.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY
        SELECT TRUE, v_run_id, v_existing_reservation_id, NULL::NUMERIC, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  IF p_api_key_id IS NOT NULL THEN
    SELECT * INTO v_key
      FROM private.ai_studio_api_keys
     WHERE id = p_api_key_id
       AND ws_id = p_ws_id
     FOR UPDATE;

    IF NOT FOUND OR v_key.revoked_at IS NOT NULL
      OR (v_key.expires_at IS NOT NULL AND v_key.expires_at <= now()) THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'INVALID_API_KEY'::TEXT;
      RETURN;
    END IF;

    IF v_key.credit_budget IS NOT NULL
      AND v_key.credits_used + v_key.credits_reserved + p_reserved_credits
        > v_key.credit_budget THEN
      RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'KEY_BUDGET_EXCEEDED'::TEXT;
      RETURN;
    END IF;
  END IF;

  v_effective_rpm := CASE
    WHEN p_api_key_id IS NULL THEN
      COALESCE(v_policy.requests_per_minute, 10000)
    ELSE LEAST(
      COALESCE(v_policy.requests_per_minute, 10000),
      COALESCE(v_key.requests_per_minute, 10000)
    )
  END;

  SELECT count(*) INTO v_recent_requests
    FROM private.ai_studio_runs
   WHERE ws_id = p_ws_id
     AND created_at >= now() - interval '1 minute'
     AND (p_api_key_id IS NULL OR api_key_id = p_api_key_id);

  IF v_recent_requests >= v_effective_rpm THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC, 'RATE_LIMIT_EXCEEDED'::TEXT;
    RETURN;
  END IF;

  IF v_policy.monthly_credit_budget IS NOT NULL THEN
    SELECT COALESCE(sum(usage.billed_credits), 0)
      INTO v_monthly_committed
      FROM private.ai_studio_usage usage
     WHERE usage.ws_id = p_ws_id
       AND usage.created_at >= date_trunc('month', now());

    SELECT COALESCE(sum(run.reserved_credits), 0)
      INTO v_monthly_reserved
      FROM private.ai_studio_runs run
     WHERE run.ws_id = p_ws_id
       AND run.status IN ('reserved', 'running')
       AND run.created_at >= GREATEST(
         date_trunc('month', now()),
         now() - interval '30 minutes'
       );

    IF v_monthly_committed + v_monthly_reserved + p_reserved_credits
      > v_policy.monthly_credit_budget THEN
      RETURN QUERY
        SELECT FALSE, NULL::UUID, NULL::UUID, 0::NUMERIC,
          'WORKSPACE_BUDGET_EXCEEDED'::TEXT;
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_reservation
    FROM public.reserve_fixed_ai_credits(
      p_ws_id,
      p_user_id,
      p_reserved_credits,
      p_model_id,
      p_feature,
      COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('request_id', p_request_id),
      1800
    );

  IF NOT COALESCE(v_reservation.success, FALSE) THEN
    RETURN QUERY
      SELECT FALSE, NULL::UUID, NULL::UUID,
        COALESCE(v_reservation.remaining_credits, 0),
        COALESCE(v_reservation.error_code, 'RESERVATION_FAILED');
    RETURN;
  END IF;

  INSERT INTO private.ai_studio_runs (
    request_id, ws_id, api_key_id, actor_id, model_id, feature,
    reservation_id, reserved_credits, idempotency_key, metadata
  )
  VALUES (
    p_request_id, p_ws_id, p_api_key_id, p_user_id, p_model_id, p_feature,
    v_reservation.reservation_id, p_reserved_credits, p_idempotency_key,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  RETURNING id INTO v_run_id;

  IF p_api_key_id IS NOT NULL THEN
    UPDATE private.ai_studio_api_keys
       SET credits_reserved = credits_reserved + p_reserved_credits,
           last_used_at = now(),
           updated_at = now()
     WHERE id = p_api_key_id;
  END IF;

  RETURN QUERY
    SELECT TRUE, v_run_id, v_reservation.reservation_id,
      v_reservation.remaining_credits, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.settle_ai_studio_run(
  p_run_id UUID,
  p_status TEXT,
  p_actual_credits NUMERIC,
  p_provider_cost_usd NUMERIC DEFAULT 0,
  p_input_tokens INTEGER DEFAULT 0,
  p_output_tokens INTEGER DEFAULT 0,
  p_reasoning_tokens INTEGER DEFAULT 0,
  p_embedding_units INTEGER DEFAULT 0,
  p_image_units INTEGER DEFAULT 0,
  p_latency_ms INTEGER DEFAULT NULL,
  p_first_token_latency_ms INTEGER DEFAULT NULL,
  p_error_class TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
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
SET search_path TO private, public, pg_temp
AS $$
DECLARE
  v_run private.ai_studio_runs%ROWTYPE;
  v_reservation private.ai_credit_reservations%ROWTYPE;
  v_balance public.workspace_ai_credit_balances%ROWTYPE;
  v_refund NUMERIC;
BEGIN
  IF p_status NOT IN ('succeeded', 'failed', 'aborted') THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'INVALID_STATUS'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_run
    FROM private.ai_studio_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'RUN_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  IF v_run.status IN ('succeeded', 'failed', 'aborted') THEN
    SELECT * INTO v_balance
      FROM public.workspace_ai_credit_balances b
     WHERE b.id = (
       SELECT r.balance_id FROM private.ai_credit_reservations r
        WHERE r.id = v_run.reservation_id
     );
    RETURN QUERY SELECT TRUE, v_run.billed_credits,
      COALESCE(v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used, 0),
      NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_reservation
    FROM private.ai_credit_reservations
   WHERE id = v_run.reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
      SELECT FALSE, 0::NUMERIC, 0::NUMERIC, 'RESERVATION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_balance
    FROM public.workspace_ai_credit_balances
   WHERE id = v_reservation.balance_id
   FOR UPDATE;

  IF v_reservation.status <> 'reserved' THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC,
      v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used,
      'RESERVATION_NOT_ACTIVE'::TEXT;
    RETURN;
  END IF;

  IF p_actual_credits IS NULL
    OR p_actual_credits < 0
    OR p_actual_credits > v_reservation.amount THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC,
      v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used,
      'ACTUAL_USAGE_OUT_OF_RANGE'::TEXT;
    RETURN;
  END IF;

  v_refund := v_reservation.amount - p_actual_credits;

  UPDATE public.workspace_ai_credit_balances
     SET total_used = GREATEST(total_used - v_refund, 0),
         updated_at = now()
   WHERE id = v_balance.id
  RETURNING * INTO v_balance;

  UPDATE private.ai_credit_reservations
     SET amount = p_actual_credits,
         status = 'committed',
         committed_at = now(),
         updated_at = now(),
         metadata = metadata || COALESCE(p_metadata, '{}'::JSONB)
   WHERE id = v_reservation.id;

  IF p_actual_credits > 0 THEN
    INSERT INTO public.ai_credit_transactions (
      ws_id, user_id, balance_id, transaction_type, amount, cost_usd,
      model_id, feature, input_tokens, output_tokens, reasoning_tokens, metadata
    )
    VALUES (
      v_run.ws_id, v_reservation.user_id, v_balance.id, 'deduction',
      -p_actual_credits, GREATEST(COALESCE(p_provider_cost_usd, 0), 0),
      v_run.model_id, v_run.feature,
      GREATEST(COALESCE(p_input_tokens, 0), 0),
      GREATEST(COALESCE(p_output_tokens, 0), 0),
      GREATEST(COALESCE(p_reasoning_tokens, 0), 0),
      COALESCE(p_metadata, '{}'::JSONB) ||
        jsonb_build_object('reservation_id', v_reservation.id, 'run_id', v_run.id)
    );
  END IF;

  UPDATE private.ai_studio_runs
     SET status = p_status,
         billed_credits = p_actual_credits,
         provider_cost_usd = GREATEST(COALESCE(p_provider_cost_usd, 0), 0),
         input_tokens = GREATEST(COALESCE(p_input_tokens, 0), 0),
         output_tokens = GREATEST(COALESCE(p_output_tokens, 0), 0),
         reasoning_tokens = GREATEST(COALESCE(p_reasoning_tokens, 0), 0),
         embedding_units = GREATEST(COALESCE(p_embedding_units, 0), 0),
         image_units = GREATEST(COALESCE(p_image_units, 0), 0),
         latency_ms = p_latency_ms,
         first_token_latency_ms = p_first_token_latency_ms,
         error_class = p_error_class,
         error_message = p_error_message,
         metadata = metadata || COALESCE(p_metadata, '{}'::JSONB),
         completed_at = now()
   WHERE id = p_run_id;

  INSERT INTO private.ai_studio_usage (
    run_id, ws_id, api_key_id, model_id, feature, billed_credits,
    provider_cost_usd, input_tokens, output_tokens, units
  )
  VALUES (
    v_run.id, v_run.ws_id, v_run.api_key_id, v_run.model_id, v_run.feature,
    p_actual_credits, GREATEST(COALESCE(p_provider_cost_usd, 0), 0),
    GREATEST(COALESCE(p_input_tokens, 0), 0),
    GREATEST(COALESCE(p_output_tokens, 0), 0),
    GREATEST(COALESCE(p_embedding_units, 0), 0) +
      GREATEST(COALESCE(p_image_units, 0), 0)
  )
  ON CONFLICT (run_id) DO NOTHING;

  IF v_run.api_key_id IS NOT NULL THEN
    UPDATE private.ai_studio_api_keys
       SET credits_reserved = GREATEST(
             credits_reserved - v_run.reserved_credits,
             0
           ),
           credits_used = credits_used + p_actual_credits,
           updated_at = now()
     WHERE id = v_run.api_key_id;
  END IF;

  RETURN QUERY SELECT TRUE, p_actual_credits,
    v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used,
    NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.cleanup_ai_studio_retention()
RETURNS TABLE (content_rows_deleted BIGINT, metadata_rows_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO private, public, pg_temp
AS $$
DECLARE
  v_content BIGINT;
  v_metadata BIGINT;
  v_expired RECORD;
BEGIN
  FOR v_expired IN
    SELECT run.id AS run_id,
           run.api_key_id,
           run.reserved_credits,
           reservation.balance_id
      FROM private.ai_studio_runs run
      JOIN private.ai_credit_reservations reservation
        ON reservation.id = run.reservation_id
     WHERE run.status IN ('reserved', 'running')
       AND reservation.status = 'reserved'
       AND reservation.expires_at <= now()
     FOR UPDATE OF run, reservation
  LOOP
    PERFORM public._release_expired_ai_credit_reservations(
      v_expired.balance_id
    );

    UPDATE private.ai_studio_runs
       SET status = 'aborted',
           error_class = 'reservation_expired',
           error_message = 'The credit reservation expired before settlement.',
           completed_at = now()
     WHERE id = v_expired.run_id
       AND status IN ('reserved', 'running');

    IF v_expired.api_key_id IS NOT NULL THEN
      UPDATE private.ai_studio_api_keys
         SET credits_reserved = GREATEST(
               credits_reserved - v_expired.reserved_credits,
               0
             ),
             updated_at = now()
       WHERE id = v_expired.api_key_id;
    END IF;
  END LOOP;

  DELETE FROM private.ai_studio_run_content WHERE expires_at <= now();
  GET DIAGNOSTICS v_content = ROW_COUNT;

  DELETE FROM private.ai_studio_runs r
   USING private.ai_studio_global_settings g
   WHERE g.singleton
     AND r.created_at < now() - make_interval(
       days => COALESCE(
         (
           SELECT p.metadata_retention_days
             FROM private.workspace_ai_studio_policies p
            WHERE p.ws_id = r.ws_id
         ),
         g.metadata_retention_days
       )
     );
  GET DIAGNOSTICS v_metadata = ROW_COUNT;

  RETURN QUERY SELECT v_content, v_metadata;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.begin_ai_studio_run(
  TEXT, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.ai_studio_model_allowed(
  UUID, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.settle_ai_studio_run(
  UUID, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.cleanup_ai_studio_retention()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.begin_ai_studio_run(
  TEXT, UUID, UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION private.ai_studio_model_allowed(
  UUID, UUID, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION private.settle_ai_studio_run(
  UUID, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, TEXT, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION private.cleanup_ai_studio_retention()
TO service_role;
