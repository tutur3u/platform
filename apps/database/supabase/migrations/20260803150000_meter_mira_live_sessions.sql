-- Reserved, modality-aware metering for browser-to-Gemini Mira Live sessions.

CREATE TABLE private.ai_live_model_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google',
  input_text_per_million NUMERIC(14,6) NOT NULL CHECK (input_text_per_million >= 0),
  input_audio_per_million NUMERIC(14,6) NOT NULL CHECK (input_audio_per_million >= 0),
  input_image_video_per_million NUMERIC(14,6) NOT NULL CHECK (input_image_video_per_million >= 0),
  output_text_per_million NUMERIC(14,6) NOT NULL CHECK (output_text_per_million >= 0),
  output_audio_per_million NUMERIC(14,6) NOT NULL CHECK (output_audio_per_million >= 0),
  search_per_query NUMERIC(14,6) NOT NULL CHECK (search_per_query >= 0),
  source_url TEXT NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, effective_at)
);

CREATE TABLE private.ai_live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  access_ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  billing_ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  pricing_id UUID NOT NULL REFERENCES private.ai_live_model_prices(id),
  reservation_id UUID NOT NULL UNIQUE REFERENCES private.ai_credit_reservations(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  last_sequence INTEGER NOT NULL DEFAULT -1 CHECK (last_sequence >= -1),
  reserved_credits NUMERIC(14,4) NOT NULL CHECK (reserved_credits > 0),
  billed_credits NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (billed_credits >= 0),
  provider_cost_usd NUMERIC(16,8) NOT NULL DEFAULT 0 CHECK (provider_cost_usd >= 0),
  input_text_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_text_tokens >= 0),
  input_audio_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_audio_tokens >= 0),
  input_image_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_image_tokens >= 0),
  input_video_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_video_tokens >= 0),
  output_text_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_text_tokens >= 0),
  output_audio_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_audio_tokens >= 0),
  thinking_tokens BIGINT NOT NULL DEFAULT 0 CHECK (thinking_tokens >= 0),
  search_queries INTEGER NOT NULL DEFAULT 0 CHECK (search_queries >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ai_live_sessions_user_created_idx
  ON private.ai_live_sessions (user_id, created_at DESC);
CREATE INDEX ai_live_sessions_active_expiry_idx
  ON private.ai_live_sessions (expires_at)
  WHERE status = 'active';

ALTER TABLE private.ai_live_model_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.ai_live_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.ai_live_model_prices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE private.ai_live_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.ai_live_model_prices TO service_role;
GRANT ALL ON TABLE private.ai_live_sessions TO service_role;

CREATE POLICY "Service role manages Live model prices"
  ON private.ai_live_model_prices FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages Live billing sessions"
  ON private.ai_live_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

INSERT INTO private.ai_live_model_prices (
  model_id,
  input_text_per_million,
  input_audio_per_million,
  input_image_video_per_million,
  output_text_per_million,
  output_audio_per_million,
  search_per_query,
  source_url,
  effective_at
)
VALUES (
  'gemini-3.1-flash-live-preview',
  0.75,
  3.00,
  1.00,
  4.50,
  12.00,
  0.014,
  'https://ai.google.dev/gemini-api/docs/pricing',
  '2026-06-01T00:00:00Z'
)
ON CONFLICT (model_id, effective_at) DO UPDATE SET
  input_text_per_million = EXCLUDED.input_text_per_million,
  input_audio_per_million = EXCLUDED.input_audio_per_million,
  input_image_video_per_million = EXCLUDED.input_image_video_per_million,
  output_text_per_million = EXCLUDED.output_text_per_million,
  output_audio_per_million = EXCLUDED.output_audio_per_million,
  search_per_query = EXCLUDED.search_per_query,
  source_url = EXCLUDED.source_url;

INSERT INTO private.ai_gateway_models (
  id, name, provider, description, type, context_window, max_tokens, tags,
  input_price_per_token, output_price_per_token, is_enabled, synced_at
)
VALUES (
  'google/gemini-3.1-flash-live-preview',
  'Gemini 3.1 Flash Live Preview',
  'google',
  'Low-latency native audio model used by Mira Live.',
  'audio',
  131072,
  8192,
  ARRAY['audio', 'live', 'gemini'],
  0.00000075,
  0.0000045,
  true,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  type = EXCLUDED.type,
  context_window = EXCLUDED.context_window,
  max_tokens = EXCLUDED.max_tokens,
  tags = EXCLUDED.tags,
  is_enabled = true,
  synced_at = now();

UPDATE public.ai_credit_plan_allocations
SET
  allowed_features = CASE
    WHEN array_position(allowed_features, 'voice_live') IS NULL
      THEN array_append(allowed_features, 'voice_live')
    ELSE allowed_features
  END,
  allowed_models = CASE
    WHEN coalesce(array_length(allowed_models, 1), 0) = 0 THEN allowed_models
    WHEN array_position(allowed_models, 'google/gemini-3.1-flash-live-preview') IS NULL
      THEN array_append(allowed_models, 'google/gemini-3.1-flash-live-preview')
    ELSE allowed_models
  END,
  updated_at = now()
WHERE is_active;

INSERT INTO public.ai_credit_feature_access (
  tier, feature, enabled, max_requests_per_day
)
SELECT tier, 'voice_live', true, NULL
FROM unnest(enum_range(NULL::workspace_product_tier)) AS tier
ON CONFLICT (tier, feature) DO UPDATE SET enabled = true;

CREATE OR REPLACE FUNCTION private.begin_ai_live_session(
  p_user_id UUID,
  p_access_ws_id UUID,
  p_billing_ws_id UUID,
  p_model_id TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  success BOOLEAN,
  live_session_id UUID,
  reservation_id UUID,
  reserved_credits NUMERIC,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO private, public, pg_temp
AS $$
DECLARE
  v_allowance RECORD;
  v_gateway_model_id TEXT;
  v_pricing_id UUID;
  v_reservation RECORD;
  v_reserved_credits NUMERIC;
  v_session_id UUID;
BEGIN
  v_gateway_model_id := CASE
    WHEN position('/' IN p_model_id) > 0 THEN p_model_id
    ELSE 'google/' || p_model_id
  END;

  SELECT * INTO v_allowance
  FROM public.check_ai_credit_allowance(
    p_billing_ws_id,
    v_gateway_model_id,
    'voice_live',
    NULL,
    p_user_id
  );
  IF NOT coalesce(v_allowance.allowed, false) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 0::NUMERIC,
      coalesce(v_allowance.error_code, 'CREDIT_CHECK_FAILED')::TEXT;
    RETURN;
  END IF;

  v_reserved_credits := least(
    2000,
    floor(coalesce(v_allowance.remaining_credits, 0))
  );
  IF v_reserved_credits < 500 THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 0::NUMERIC,
      'INSUFFICIENT_CREDITS'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_pricing_id
  FROM private.ai_live_model_prices
  WHERE model_id = p_model_id AND effective_at <= now()
  ORDER BY effective_at DESC
  LIMIT 1;
  IF v_pricing_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 0::NUMERIC,
      'PRICING_UNAVAILABLE'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_reservation
  FROM public.reserve_fixed_ai_credits(
    p_billing_ws_id,
    p_user_id,
    v_reserved_credits,
    v_gateway_model_id,
    'voice_live',
    jsonb_build_object('accessWsId', p_access_ws_id, 'source', 'mira_live'),
    600
  );
  IF NOT coalesce(v_reservation.success, false)
    OR v_reservation.reservation_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, 0::NUMERIC,
      coalesce(v_reservation.error_code, 'RESERVATION_FAILED')::TEXT;
    RETURN;
  END IF;

  INSERT INTO private.ai_live_sessions (
    user_id, access_ws_id, billing_ws_id, model_id, pricing_id,
    reservation_id, reserved_credits, expires_at
  ) VALUES (
    p_user_id, p_access_ws_id, p_billing_ws_id, p_model_id, v_pricing_id,
    v_reservation.reservation_id, v_reserved_credits, p_expires_at
  ) RETURNING id INTO v_session_id;

  RETURN QUERY SELECT true, v_session_id, v_reservation.reservation_id,
    v_reserved_credits, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.settle_ai_live_session(
  p_live_session_id UUID,
  p_user_id UUID,
  p_sequence INTEGER,
  p_usage JSONB,
  p_close BOOLEAN DEFAULT false
)
RETURNS TABLE (
  success BOOLEAN,
  billed_credits NUMERIC,
  provider_cost_usd NUMERIC,
  remaining_reserved_credits NUMERIC,
  closed BOOLEAN,
  error_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO private, public, pg_temp
AS $$
DECLARE
  v_session private.ai_live_sessions%ROWTYPE;
  v_price private.ai_live_model_prices%ROWTYPE;
  v_reservation private.ai_credit_reservations%ROWTYPE;
  v_balance public.workspace_ai_credit_balances%ROWTYPE;
  v_input_text BIGINT := coalesce((p_usage ->> 'inputTextTokens')::BIGINT, 0);
  v_input_audio BIGINT := coalesce((p_usage ->> 'inputAudioTokens')::BIGINT, 0);
  v_input_image BIGINT := coalesce((p_usage ->> 'inputImageTokens')::BIGINT, 0);
  v_input_video BIGINT := coalesce((p_usage ->> 'inputVideoTokens')::BIGINT, 0);
  v_output_text BIGINT := coalesce((p_usage ->> 'outputTextTokens')::BIGINT, 0);
  v_output_audio BIGINT := coalesce((p_usage ->> 'outputAudioTokens')::BIGINT, 0);
  v_thinking BIGINT := coalesce((p_usage ->> 'thinkingTokens')::BIGINT, 0);
  v_search INTEGER := coalesce((p_usage ->> 'searchQueries')::INTEGER, 0);
  v_cost NUMERIC;
  v_markup NUMERIC := 1;
  v_credits NUMERIC;
  v_refund NUMERIC;
BEGIN
  SELECT * INTO v_session
  FROM private.ai_live_sessions
  WHERE id = p_live_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.user_id IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT false, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC,
      false, 'LIVE_SESSION_NOT_FOUND'::TEXT;
    RETURN;
  END IF;

  IF v_session.status <> 'active' OR p_sequence <= v_session.last_sequence THEN
    RETURN QUERY SELECT true, v_session.billed_credits,
      v_session.provider_cost_usd,
      greatest(v_session.reserved_credits - v_session.billed_credits, 0),
      v_session.status <> 'active', NULL::TEXT;
    RETURN;
  END IF;

  IF least(
    v_input_text, v_input_audio, v_input_image, v_input_video,
    v_output_text, v_output_audio, v_thinking, v_search
  ) < 0 OR greatest(
    v_input_text, v_input_audio, v_input_image, v_input_video,
    v_output_text, v_output_audio, v_thinking
  ) > 100000000 OR v_search > 10000 THEN
    RETURN QUERY SELECT false, v_session.billed_credits,
      v_session.provider_cost_usd,
      greatest(v_session.reserved_credits - v_session.billed_credits, 0),
      false, 'INVALID_USAGE'::TEXT;
    RETURN;
  END IF;

  IF v_input_text < v_session.input_text_tokens
    OR v_input_audio < v_session.input_audio_tokens
    OR v_input_image < v_session.input_image_tokens
    OR v_input_video < v_session.input_video_tokens
    OR v_output_text < v_session.output_text_tokens
    OR v_output_audio < v_session.output_audio_tokens
    OR v_thinking < v_session.thinking_tokens
    OR v_search < v_session.search_queries THEN
    RETURN QUERY SELECT false, v_session.billed_credits,
      v_session.provider_cost_usd,
      greatest(v_session.reserved_credits - v_session.billed_credits, 0),
      false, 'USAGE_REGRESSION'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_price
  FROM private.ai_live_model_prices
  WHERE id = v_session.pricing_id;

  v_cost :=
    (v_input_text * v_price.input_text_per_million / 1000000) +
    (v_input_audio * v_price.input_audio_per_million / 1000000) +
    ((v_input_image + v_input_video) * v_price.input_image_video_per_million / 1000000) +
    ((v_output_text + v_thinking) * v_price.output_text_per_million / 1000000) +
    (v_output_audio * v_price.output_audio_per_million / 1000000) +
    (v_search * v_price.search_per_query);

  SELECT coalesce(allocation.markup_multiplier, 1) INTO v_markup
  FROM public.ai_credit_plan_allocations AS allocation
  WHERE allocation.tier = public._resolve_workspace_tier(v_session.billing_ws_id)
    AND allocation.is_active
  LIMIT 1;

  v_credits := CASE
    WHEN v_cost <= 0 THEN 0
    ELSE greatest(1, (v_cost / 0.0001) * coalesce(v_markup, 1))
  END;
  v_credits := least(v_credits, v_session.reserved_credits);

  UPDATE private.ai_live_sessions
  SET
    last_sequence = p_sequence,
    billed_credits = v_credits,
    provider_cost_usd = v_cost,
    input_text_tokens = v_input_text,
    input_audio_tokens = v_input_audio,
    input_image_tokens = v_input_image,
    input_video_tokens = v_input_video,
    output_text_tokens = v_output_text,
    output_audio_tokens = v_output_audio,
    thinking_tokens = v_thinking,
    search_queries = v_search,
    updated_at = now()
  WHERE id = v_session.id;

  IF p_close THEN
    SELECT * INTO v_reservation
    FROM private.ai_credit_reservations
    WHERE id = v_session.reservation_id
    FOR UPDATE;
    SELECT * INTO v_balance
    FROM public.workspace_ai_credit_balances
    WHERE id = v_reservation.balance_id
    FOR UPDATE;

    IF v_reservation.status <> 'reserved' THEN
      RETURN QUERY SELECT false, v_credits, v_cost,
        greatest(v_session.reserved_credits - v_credits, 0),
        false, 'RESERVATION_NOT_ACTIVE'::TEXT;
      RETURN;
    END IF;

    v_refund := greatest(v_reservation.amount - v_credits, 0);
    UPDATE public.workspace_ai_credit_balances
    SET total_used = greatest(total_used - v_refund, 0), updated_at = now()
    WHERE id = v_balance.id;

    UPDATE private.ai_credit_reservations
    SET
      amount = CASE WHEN v_credits > 0 THEN v_credits ELSE amount END,
      status = CASE WHEN v_credits > 0 THEN 'committed' ELSE 'released' END,
      committed_at = CASE WHEN v_credits > 0 THEN now() ELSE NULL END,
      released_at = CASE WHEN v_credits = 0 THEN now() ELSE NULL END,
      metadata = coalesce(metadata, '{}'::JSONB) || jsonb_build_object(
        'live_session_id', v_session.id,
        'provider_cost_usd', v_cost,
        'pricing_id', v_session.pricing_id,
        'usage', p_usage
      ),
      updated_at = now()
    WHERE id = v_reservation.id;

    IF v_credits > 0 THEN
      INSERT INTO public.ai_credit_transactions (
        ws_id, user_id, balance_id, transaction_type, amount, cost_usd,
        model_id, feature, input_tokens, output_tokens, reasoning_tokens,
        search_count, metadata
      ) VALUES (
        v_reservation.ws_id, v_session.user_id, v_balance.id, 'deduction',
        -v_credits, v_cost, 'google/' || v_session.model_id, 'voice_live',
        least(v_input_text + v_input_audio + v_input_image + v_input_video, 2147483647)::INTEGER,
        least(v_output_text + v_output_audio, 2147483647)::INTEGER,
        least(v_thinking, 2147483647)::INTEGER,
        v_search,
        jsonb_build_object(
          'live_session_id', v_session.id,
          'pricing_id', v_session.pricing_id,
          'usage', p_usage
        )
      );
    END IF;

    UPDATE private.ai_live_sessions
    SET status = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'closed' END,
        closed_at = now(), updated_at = now()
    WHERE id = v_session.id;
  END IF;

  RETURN QUERY SELECT true, v_credits, v_cost,
    greatest(v_session.reserved_credits - v_credits, 0),
    p_close, NULL::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.expire_ai_live_sessions(p_balance_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO private, public, pg_temp
AS $$
DECLARE
  v_session private.ai_live_sessions%ROWTYPE;
BEGIN
  FOR v_session IN
    SELECT session.*
    FROM private.ai_live_sessions AS session
    JOIN private.ai_credit_reservations AS reservation
      ON reservation.id = session.reservation_id
    WHERE reservation.balance_id = p_balance_id
      AND reservation.status = 'reserved'
      AND session.status = 'active'
      AND session.expires_at <= now()
    ORDER BY session.created_at
  LOOP
    PERFORM * FROM private.settle_ai_live_session(
      v_session.id,
      v_session.user_id,
      v_session.last_sequence + 1,
      jsonb_build_object(
        'inputTextTokens', v_session.input_text_tokens,
        'inputAudioTokens', v_session.input_audio_tokens,
        'inputImageTokens', v_session.input_image_tokens,
        'inputVideoTokens', v_session.input_video_tokens,
        'outputTextTokens', v_session.output_text_tokens,
        'outputAudioTokens', v_session.output_audio_tokens,
        'thinkingTokens', v_session.thinking_tokens,
        'searchQueries', v_session.search_queries
      ),
      true
    );
  END LOOP;
END;
$$;

-- Preserve existing reservation and AI Studio expiry reconciliation while
-- settling the last accepted Live provider snapshot before releasing holds.
CREATE OR REPLACE FUNCTION public._release_expired_ai_credit_reservations(
  p_balance_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, private, pg_temp
AS $$
DECLARE
  v_released_amount NUMERIC := 0;
BEGIN
  PERFORM private.expire_ai_live_sessions(p_balance_id);

  WITH expired AS (
    UPDATE private.ai_credit_reservations
    SET status = 'expired', released_at = now(), updated_at = now(),
        metadata = coalesce(metadata, '{}'::JSONB)
          || jsonb_build_object('expired_at', now())
    WHERE balance_id = p_balance_id
      AND status = 'reserved'
      AND expires_at <= now()
    RETURNING amount
  )
  SELECT coalesce(sum(amount), 0) INTO v_released_amount FROM expired;

  IF v_released_amount > 0 THEN
    UPDATE public.workspace_ai_credit_balances
    SET total_used = greatest(total_used - v_released_amount, 0), updated_at = now()
    WHERE id = p_balance_id;
  END IF;

  WITH aborted_runs AS (
    UPDATE private.ai_studio_runs AS run
    SET status = 'aborted', error_class = 'reservation_expired',
        error_message = 'The credit reservation expired before settlement.',
        completed_at = now()
    FROM private.ai_credit_reservations AS reservation
    WHERE reservation.id = run.reservation_id
      AND reservation.balance_id = p_balance_id
      AND reservation.status = 'expired'
      AND run.status IN ('reserved', 'running')
    RETURNING run.api_key_id, run.reserved_credits
  ),
  released_by_key AS (
    SELECT api_key_id, sum(reserved_credits) AS credits
    FROM aborted_runs WHERE api_key_id IS NOT NULL GROUP BY api_key_id
  )
  UPDATE private.ai_studio_api_keys AS api_key
  SET credits_reserved = greatest(api_key.credits_reserved - released_by_key.credits, 0),
      updated_at = now()
  FROM released_by_key
  WHERE api_key.id = released_by_key.api_key_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.begin_ai_live_session(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.settle_ai_live_session(
  UUID, UUID, INTEGER, JSONB, BOOLEAN
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.expire_ai_live_sessions(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.begin_ai_live_session(
  UUID, UUID, UUID, TEXT, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION private.settle_ai_live_session(
  UUID, UUID, INTEGER, JSONB, BOOLEAN
) TO service_role;
GRANT EXECUTE ON FUNCTION private.expire_ai_live_sessions(UUID)
  TO service_role;

COMMENT ON TABLE private.ai_live_model_prices IS
  'Effective-dated Gemini Live list prices used for auditable provider cost accounting.';
COMMENT ON TABLE private.ai_live_sessions IS
  'Server-owned reservations and cumulative provider usage for direct Mira Live sessions.';
