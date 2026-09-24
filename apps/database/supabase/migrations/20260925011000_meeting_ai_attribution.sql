-- Reserve through the central credit system and attach only non-content provenance.
create function private.begin_meeting_ai_live_session(
  p_user_id uuid, p_access_ws_id uuid, p_billing_ws_id uuid,
  p_model_id text, p_expires_at timestamptz, p_app text, p_meeting_id uuid
) returns table(success boolean, live_session_id uuid, reservation_id uuid,
  reserved_credits numeric, error_code text)
language plpgsql security definer set search_path = '' as $$
declare result record;
begin
  if p_app is null or p_app not in ('meet', 'parley') then raise exception 'Invalid meeting app'; end if;
  if not exists (select 1 from public.workspace_meetings
    where id = p_meeting_id and ws_id = p_access_ws_id) then
    raise exception 'Invalid meeting workspace';
  end if;
  select * into result from private.begin_ai_live_session(
    p_user_id, p_access_ws_id, p_billing_ws_id, p_model_id, p_expires_at);
  if result.success then
    update private.ai_credit_reservations
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'app', p_app, 'source', p_app || '_live', 'meetingId', p_meeting_id)
      where id = result.reservation_id;
  end if;
  return query select result.success, result.live_session_id,
    result.reservation_id, result.reserved_credits, result.error_code;
end;
$$;
revoke all on function private.begin_meeting_ai_live_session(uuid, uuid, uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function private.begin_meeting_ai_live_session(uuid, uuid, uuid, text, timestamptz, text, uuid) to service_role;

-- Settlement retains reservation attribution without changing pricing or refunds.
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
        coalesce(v_reservation.metadata, '{}'::jsonb) || jsonb_build_object(
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
