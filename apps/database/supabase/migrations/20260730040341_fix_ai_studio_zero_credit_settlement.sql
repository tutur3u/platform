-- Failed and aborted AI Studio executions often settle at zero credits. Keep
-- the original positive reservation amount for auditability, release it in
-- full, and avoid violating ai_credit_reservations_amount_check.

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
      COALESCE(
        v_balance.total_allocated + v_balance.bonus_credits -
          v_balance.total_used,
        0
      ),
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
      v_balance.total_allocated + v_balance.bonus_credits -
        v_balance.total_used,
      'RESERVATION_NOT_ACTIVE'::TEXT;
    RETURN;
  END IF;

  IF p_actual_credits IS NULL
    OR p_actual_credits < 0
    OR p_actual_credits > v_reservation.amount THEN
    RETURN QUERY SELECT FALSE, 0::NUMERIC,
      v_balance.total_allocated + v_balance.bonus_credits -
        v_balance.total_used,
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
     SET amount = CASE
           WHEN p_actual_credits > 0 THEN p_actual_credits
           ELSE amount
         END,
         status = CASE
           WHEN p_actual_credits > 0 THEN 'committed'
           ELSE 'released'
         END,
         committed_at = CASE
           WHEN p_actual_credits > 0 THEN now()
           ELSE NULL
         END,
         released_at = CASE
           WHEN p_actual_credits = 0 THEN now()
           ELSE NULL
         END,
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
        jsonb_build_object(
          'reservation_id',
          v_reservation.id,
          'run_id',
          v_run.id
        )
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

REVOKE EXECUTE ON FUNCTION private.settle_ai_studio_run(
  UUID, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.settle_ai_studio_run(
  UUID, TEXT, NUMERIC, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER,
  INTEGER, INTEGER, TEXT, TEXT, JSONB
) TO service_role;
