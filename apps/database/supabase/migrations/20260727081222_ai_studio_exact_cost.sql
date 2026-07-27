create or replace function private.calculate_ai_studio_usage_cost(
  p_ws_id uuid,
  p_model_id text,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_reasoning_tokens integer default 0,
  p_image_count integer default 0,
  p_search_count integer default 0
)
returns table (
  provider_cost_usd numeric,
  billed_credits numeric
)
language plpgsql
stable
security definer
set search_path to public, private, pg_temp
as $$
declare
  v_cost numeric;
  v_markup numeric;
  v_tier public.workspace_product_tier;
  v_units integer;
begin
  if least(
    coalesce(p_input_tokens, 0),
    coalesce(p_output_tokens, 0),
    coalesce(p_reasoning_tokens, 0),
    coalesce(p_image_count, 0),
    coalesce(p_search_count, 0)
  ) < 0 then
    raise exception using errcode = '22023', message = 'AI usage values cannot be negative';
  end if;

  v_cost := private.compute_ai_cost_from_gateway(
    p_model_id,
    p_input_tokens,
    p_output_tokens,
    p_reasoning_tokens,
    p_image_count,
    p_search_count
  );
  v_tier := public._resolve_workspace_tier(p_ws_id);

  select coalesce(markup_multiplier, 1)
    into v_markup
    from public.ai_credit_plan_allocations
   where tier = v_tier
     and is_active = true;

  v_markup := coalesce(v_markup, 1);
  v_units := coalesce(p_input_tokens, 0)
    + coalesce(p_output_tokens, 0)
    + coalesce(p_reasoning_tokens, 0)
    + coalesce(p_image_count, 0)
    + coalesce(p_search_count, 0);
  provider_cost_usd := coalesce(v_cost, 0);
  billed_credits := (provider_cost_usd / 0.0001) * v_markup;

  if billed_credits < 1 and v_units > 0 then
    billed_credits := 1;
  end if;

  return next;
end;
$$;

revoke all on function private.calculate_ai_studio_usage_cost(
  uuid, text, integer, integer, integer, integer, integer
) from public, anon, authenticated;

grant execute on function private.calculate_ai_studio_usage_cost(
  uuid, text, integer, integer, integer, integer, integer
) to service_role;
