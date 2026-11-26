create table private.workspace_subscription_product_prices (
  price_id uuid primary key,
  product_id uuid not null references private.workspace_subscription_products (id),
  currency text not null check (currency in ('usd', 'vnd')),
  amount_per_seat bigint not null check (amount_per_seat between 1 and 9007199254740991),
  provider_updated_at timestamptz not null,
  is_current boolean not null default true
);

create unique index workspace_subscription_product_prices_current
  on private.workspace_subscription_product_prices (product_id, currency)
  where is_current;

alter table private.workspace_subscription_product_prices enable row level security;
revoke all on table private.workspace_subscription_product_prices from public, anon, authenticated;
grant select, insert, update on table private.workspace_subscription_product_prices to service_role;

create function public.sync_versioned_workspace_subscription_product(
  p_product_id uuid,
  p_name text,
  p_description text,
  p_tier public.workspace_product_tier,
  p_interval text,
  p_archived boolean,
  p_provider_updated_at timestamptz,
  p_usd_price_id uuid,
  p_usd_amount bigint,
  p_vnd_price_id uuid,
  p_vnd_amount bigint
)
returns private.workspace_subscription_products
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_previous timestamptz;
  v_count bigint;
  v_product private.workspace_subscription_products;
begin
  if p_product_id is null
      or p_tier is null or p_tier not in ('PLUS', 'PRO', 'MAX', 'ULTRA')
      or p_interval is null or p_interval not in ('month', 'year')
      or p_archived is null or p_provider_updated_at is null
      or p_usd_price_id is null or p_vnd_price_id is null
      or p_usd_price_id = p_vnd_price_id
      or p_usd_amount is null or p_vnd_amount is null
      or p_usd_amount not between 1 and 2147483647
      or p_vnd_amount not between 1 and 9007199254740991 then
    raise exception 'Invalid workspace subscription catalog projection'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_product_id::text, 0));

  select max(provider_updated_at) into v_previous
  from private.workspace_subscription_product_prices
  where product_id = p_product_id;

  select * into v_product
  from private.workspace_subscription_products
  where id = p_product_id;

  if v_previous > p_provider_updated_at then
    return v_product;
  end if;

  if v_previous = p_provider_updated_at then
    if v_product.name is not distinct from p_name
        and v_product.description is not distinct from p_description
        and v_product.tier = p_tier
        and v_product.recurring_interval = p_interval
        and v_product.archived = p_archived
        and exists (
          select 1 from private.workspace_subscription_product_prices
          where product_id = p_product_id and price_id = p_usd_price_id
            and currency = 'usd' and amount_per_seat = p_usd_amount and is_current
        )
        and exists (
          select 1 from private.workspace_subscription_product_prices
          where product_id = p_product_id and price_id = p_vnd_price_id
            and currency = 'vnd' and amount_per_seat = p_vnd_amount and is_current
        ) then
      return v_product;
    end if;
    raise exception 'Conflicting workspace catalog events at one provider version'
      using errcode = '22023';
  end if;

  if v_previous is null and v_product.id is not null then
    raise exception 'Existing legacy catalog product cannot be claimed by a new catalog'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from private.workspace_subscription_product_prices
    where (price_id = p_usd_price_id and
        (product_id <> p_product_id or currency <> 'usd' or amount_per_seat <> p_usd_amount))
      or (price_id = p_vnd_price_id and
        (product_id <> p_product_id or currency <> 'vnd' or amount_per_seat <> p_vnd_amount))
  ) then
    raise exception 'Workspace catalog price identity conflict'
      using errcode = '22023';
  end if;

  insert into private.workspace_subscription_products (
    id, name, description, tier, recurring_interval, archived,
    pricing_model, price, price_per_seat, min_seats, max_seats
  ) values (
    p_product_id, p_name, p_description, p_tier, p_interval, p_archived,
    'seat_based', null, p_usd_amount, 1, null
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    tier = excluded.tier,
    recurring_interval = excluded.recurring_interval,
    archived = excluded.archived,
    price_per_seat = excluded.price_per_seat
  returning * into v_product;

  update private.workspace_subscription_product_prices
  set is_current = false
  where product_id = p_product_id and is_current;

  insert into private.workspace_subscription_product_prices (
    price_id, product_id, currency, amount_per_seat, provider_updated_at, is_current
  ) values
    (p_usd_price_id, p_product_id, 'usd', p_usd_amount, p_provider_updated_at, true),
    (p_vnd_price_id, p_product_id, 'vnd', p_vnd_amount, p_provider_updated_at, true)
  on conflict (price_id) do update set
    provider_updated_at = excluded.provider_updated_at,
    is_current = true
  where workspace_subscription_product_prices.product_id = excluded.product_id
    and workspace_subscription_product_prices.currency = excluded.currency
    and workspace_subscription_product_prices.amount_per_seat = excluded.amount_per_seat;
  get diagnostics v_count = row_count;
  if v_count <> 2 then
    raise exception 'Workspace catalog price projection conflict'
      using errcode = '22023';
  end if;

  return v_product;
end;
$$;

revoke all on function public.sync_versioned_workspace_subscription_product(
  uuid, text, text, public.workspace_product_tier, text, boolean, timestamptz,
  uuid, bigint, uuid, bigint
) from public, anon, authenticated;
grant execute on function public.sync_versioned_workspace_subscription_product(
  uuid, text, text, public.workspace_product_tier, text, boolean, timestamptz,
  uuid, bigint, uuid, bigint
) to service_role;

insert into public.ai_credit_plan_allocations (
  tier, monthly_credits, credits_per_seat, markup_multiplier, is_active
) values
  ('MAX', 750000, 750000, 1.0, false),
  ('ULTRA', 1600000, 1600000, 1.0, false)
on conflict (tier) do nothing;

create table private.billing_ai_reference_revisions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique check (length(btrim(version)) > 0),
  approved_at timestamptz not null,
  approved_by uuid not null,
  approval_reason text not null check (length(btrim(approval_reason)) > 0),
  effective_at timestamptz not null check (effective_at >= approved_at)
);

create table private.billing_ai_reference_rates (
  revision_id uuid not null references private.billing_ai_reference_revisions (id),
  model_id text not null check (length(btrim(model_id)) > 0),
  reference_credits bigint not null check (reference_credits between 1 and 9007199254740991),
  multiplier_basis_points integer not null check (multiplier_basis_points > 0),
  example_input_tokens integer not null check (example_input_tokens > 0),
  example_output_tokens integer not null check (example_output_tokens > 0),
  primary key (revision_id, model_id)
);

alter table private.billing_ai_reference_revisions enable row level security;
alter table private.billing_ai_reference_rates enable row level security;
revoke all on table private.billing_ai_reference_revisions, private.billing_ai_reference_rates
  from public, anon, authenticated;
grant select, insert on private.billing_ai_reference_revisions, private.billing_ai_reference_rates
  to service_role;
