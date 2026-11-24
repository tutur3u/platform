-- Meet transcription and notes model entitlement (#8460, decision D434).
--
-- Meet AI transcription and notes always run on google/gemini-3.1-flash-lite
-- (MEET_AI_MODEL) with the 'generate' feature. Until now no migration put
-- that model on any plan's allowed_models, so admission returned
-- MODEL_NOT_ALLOWED (HTTP 402 MEET_AI_MODEL_NOT_ON_PLAN) for every payer.
--
-- 1. Paid tiers. MEET_AI_RELEASE=paid-and-staff opens Meet AI to verified
--    staff and to Plus, Pro and Enterprise accounts (MIRA_PAID_TIERS, the
--    same tiers as canVerifiedAccountHostMeeting). The model is appended to
--    the active PLUS, PRO and ENTERPRISE allocations that restrict models.
--    An empty list already means every model and is left alone. FREE is not
--    changed: FREE workspaces stay without the model.
-- 2. Staff payer. Verified-staff Meet AI is billed to the Tuturuuu root
--    workspace, which has no subscription and so resolves to FREE. The
--    application selects root as payer only for a verified-staff session
--    (requireMeetTranscriptPayer), and these credit RPCs are service-role
--    only. private.ai_internal_payer_allows_model grants root, and only
--    root, this one model for the 'generate' feature in the plan model and
--    feature gates. Credit balance, daily limits, budgets and settlement
--    still apply to root unchanged, and AI Studio API keys never use it.

update public.ai_credit_plan_allocations
set
  allowed_models = array_append(allowed_models, 'google/gemini-3.1-flash-lite'),
  updated_at = now()
where is_active
  and tier in ('PLUS', 'PRO', 'ENTERPRISE')
  and coalesce(array_length(allowed_models, 1), 0) > 0
  and not exists (
    select 1
    from unnest(allowed_models) as allowed_model
    where allowed_model in ('google/gemini-3.1-flash-lite', 'gemini-3.1-flash-lite')
  );

create or replace function private.ai_internal_payer_allows_model(
  p_ws_id uuid,
  p_model_id text,
  p_feature text
)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
      and p_model_id in ('google/gemini-3.1-flash-lite', 'gemini-3.1-flash-lite')
      and p_feature = 'generate',
    false
  );
$$;

comment on function private.ai_internal_payer_allows_model(uuid, text, text) is
  'Internal root allowance for the Meet AI model; root pays only for verified-staff Meet AI (D434).';

revoke execute on function private.ai_internal_payer_allows_model(uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.ai_internal_payer_allows_model(uuid, text, text)
  to service_role;

create or replace function public.check_ai_credit_allowance(
  p_ws_id uuid,
  p_model_id text,
  p_feature text,
  p_estimated_input_tokens integer default null,
  p_user_id uuid default null
)
returns table (
  allowed boolean,
  remaining_credits numeric,
  tier text,
  max_output_tokens integer,
  error_code text,
  error_message text
)
language plpgsql
volatile
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_tier workspace_product_tier;
  v_allocation record;
  v_balance record;
  v_remaining numeric;
  v_model record;
  v_feature_access record;
  v_feature_exists boolean;
  v_daily_used numeric;
  v_daily_request_count integer;
  v_feature_daily_count integer;
  v_effective_max_output integer;
  v_estimated_cost numeric;
  v_included_remaining numeric;
  v_payg_remaining numeric;
begin
  v_tier := public._resolve_workspace_tier(p_ws_id);

  select * into v_allocation
    from public.ai_credit_plan_allocations
   where ai_credit_plan_allocations.tier = v_tier and is_active = true;

  if not found then
    return query select false, 0::numeric, v_tier::text, null::integer,
      'NO_ALLOCATION'::text, 'No credit allocation configured for this tier'::text;
    return;
  end if;

  if array_length(v_allocation.allowed_models, 1) > 0
    and not private.ai_internal_payer_allows_model(p_ws_id, p_model_id, p_feature) then
    if not (p_model_id = any(v_allocation.allowed_models)) then
      if not exists (
        select 1 from unnest(v_allocation.allowed_models) as m
        where m = p_model_id or split_part(m, '/', 2) = p_model_id
           or p_model_id = split_part(m, '/', 2)
      ) then
        return query select false, 0::numeric, v_tier::text, null::integer,
          'MODEL_NOT_ALLOWED'::text,
          format('Model %s is not available on the %s plan', p_model_id, v_tier::text)::text;
        return;
      end if;
    end if;
  end if;

  select gm.max_tokens, gm.input_price_per_token, gm.output_price_per_token
    into v_model
    from private.ai_gateway_models gm
   where (gm.id = p_model_id or gm.id = 'google/' || p_model_id)
     and gm.is_enabled = true;

  select * into v_feature_access
    from public.ai_credit_feature_access fa
   where fa.tier = v_tier and fa.feature = p_feature;

  v_feature_exists := found;

  if v_feature_exists and not v_feature_access.enabled
    and not private.ai_internal_payer_allows_model(p_ws_id, p_model_id, p_feature) then
    return query select false, 0::numeric, v_tier::text, null::integer,
      'FEATURE_NOT_ALLOWED'::text,
      format('Feature %s is not available on the %s plan', p_feature, v_tier::text)::text;
    return;
  end if;

  select * into v_balance
    from public.get_or_create_credit_balance(p_ws_id, p_user_id);

  v_included_remaining := v_balance.total_allocated + v_balance.bonus_credits - v_balance.total_used;
  v_payg_remaining := public._get_active_payg_credits(p_ws_id);
  v_remaining := v_included_remaining + coalesce(v_payg_remaining, 0);

  if v_remaining <= 0 then
    return query select false, v_remaining, v_tier::text, null::integer,
      'CREDITS_EXHAUSTED'::text,
      'AI credits have been used up'::text;
    return;
  end if;

  if v_allocation.daily_limit is not null then
    select coalesce(sum(abs(amount)), 0) into v_daily_used
      from public.ai_credit_transactions
     where balance_id = v_balance.id
       and transaction_type = 'deduction'
       and created_at >= date_trunc('day', now());

    if v_daily_used >= v_allocation.daily_limit then
      return query select false, v_remaining, v_tier::text, null::integer,
        'DAILY_LIMIT_REACHED'::text,
        'Daily AI credit limit has been reached'::text;
      return;
    end if;
  end if;

  if v_allocation.max_requests_per_day is not null then
    select count(*) into v_daily_request_count
      from public.ai_credit_transactions
     where balance_id = v_balance.id
       and transaction_type = 'deduction'
       and created_at >= date_trunc('day', now());

    if v_daily_request_count >= v_allocation.max_requests_per_day then
      return query select false, v_remaining, v_tier::text, null::integer,
        'DAILY_LIMIT_REACHED'::text,
        'Daily AI request limit has been reached'::text;
      return;
    end if;
  end if;

  if v_feature_exists and v_feature_access.max_requests_per_day is not null then
    select count(*) into v_feature_daily_count
      from public.ai_credit_transactions
     where balance_id = v_balance.id
       and transaction_type = 'deduction'
       and feature = p_feature
       and created_at >= date_trunc('day', now());

    if v_feature_daily_count >= v_feature_access.max_requests_per_day then
      return query select false, v_remaining, v_tier::text, null::integer,
        'DAILY_LIMIT_REACHED'::text,
        format('Daily limit for %s has been reached', p_feature)::text;
      return;
    end if;
  end if;

  v_effective_max_output := v_allocation.max_output_tokens_per_request;
  if v_model.max_tokens is not null then
    if v_effective_max_output is null then
      v_effective_max_output := v_model.max_tokens;
    else
      v_effective_max_output := least(v_effective_max_output, v_model.max_tokens);
    end if;
  end if;

  if p_estimated_input_tokens is not null and v_model.input_price_per_token is not null then
    v_estimated_cost := (
      p_estimated_input_tokens::numeric * v_model.input_price_per_token +
      coalesce(v_effective_max_output, 8192)::numeric * v_model.output_price_per_token
    ) / 0.0001 * v_allocation.markup_multiplier;

    if v_estimated_cost > v_remaining then
      return query select false, v_remaining, v_tier::text, v_effective_max_output,
        'CREDITS_EXHAUSTED'::text,
        'Insufficient credits for estimated request cost'::text;
      return;
    end if;
  end if;

  return query select true, v_remaining, v_tier::text, v_effective_max_output,
    null::text, null::text;
  return;
end;
$$;

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
    AND NOT (
      p_api_key_id IS NULL
      AND private.ai_internal_payer_allows_model(p_ws_id, p_model_id, 'generate')
    )
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
