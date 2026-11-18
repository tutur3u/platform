create table private.usage_pack_products (
  id uuid primary key,
  meter text not null,
  price_cents integer not null,
  units bigint not null,
  check ((meter,price_cents,units) in (
    ('sandbox_seconds',500,60000),('participant_seconds',500,120000),('stored_bytes',300,26843545600)
  ))
);
alter table private.usage_pack_products enable row level security;
revoke all on private.usage_pack_products from public,anon,authenticated,service_role;

create table private.usage_pack_orders (
  id uuid primary key,
  ws_id uuid not null references public.workspaces(id),
  meter text not null,
  customer_ref text not null,
  product_id uuid not null references private.usage_pack_products,
  net_cents integer not null check (net_cents >= 0),
  refunded boolean not null,
  grant_id uuid unique references private.usage_grants,
  observed_at timestamptz not null
);
alter table private.usage_pack_orders enable row level security;
revoke all on private.usage_pack_orders from public,anon,authenticated,service_role;

-- Only verified server-side Polar events or provider order reconciliation enter here.
create function public.apply_usage_pack_order(
  p_ws uuid,p_order uuid,p_product uuid,p_customer_ref text,p_meter text,p_status text,
  p_net_cents integer,p_created timestamptz,p_observed timestamptz,p_end timestamptz
) returns void language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  old private.usage_pack_orders;
  grant_id uuid;
  units bigint;
  expiry timestamptz;
  is_refund boolean := p_status in ('partially_refunded','refunded');
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order::text,0));
  if p_status not in ('paid','refunded','partially_refunded') or p_status is null then raise exception 'Invalid payment state'; end if;
  if not exists (
    select 1 from public.workspaces w where w.id = p_ws
      and p_customer_ref = case when w.personal then w.creator_id::text else 'workspace_' || w.id::text end
  ) then raise exception 'Order customer mismatch'; end if;
  select catalog.units into units from private.usage_pack_products catalog
    where catalog.id = p_product and catalog.meter = p_meter and p_net_cents between 0 and catalog.price_cents
      and (is_refund or p_net_cents = catalog.price_cents) for share;
  if not found then raise exception 'Unbound usage product or amount'; end if;
  if units is null or p_net_cents < 0 or p_created > p_observed then raise exception 'Invalid order evidence'; end if;
  expiry := case when p_meter = 'stored_bytes' then p_end else p_created + interval '12 months' end;
  if expiry is null or expiry <= p_created then raise exception 'Invalid pack expiration'; end if;

  select * into old from private.usage_pack_orders where id = p_order for update;
  if found then
    if old.ws_id <> p_ws or old.meter <> p_meter or old.product_id <> p_product
      or old.customer_ref <> p_customer_ref then raise exception 'Conflicting order binding'; end if;
    if old.refunded and not is_refund then return; end if;
    if old.observed_at > p_observed then return; end if;
    if old.observed_at = p_observed and old.net_cents <> p_net_cents and old.refunded = is_refund then
      raise exception 'Conflicting order revision';
    end if;
    if is_refund and not old.refunded and old.grant_id is not null then
      -- Preserve exact held/spent history. Deny future commercial use pending
      -- refund reconciliation, including outstanding leases.
      update private.usage_meter_periods set blocked = true where ws_id = p_ws and meter = p_meter;
      update private.usage_admission_controls set killed = true,generation = generation + 1,updated_at = now()
        where scope_key = 'workspace/' || p_ws::text || '/' || p_meter and not killed;
      update private.usage_grants set expires_at = least(expires_at,greatest(clock_timestamp(),starts_at + interval '1 microsecond'))
        where id = old.grant_id;
    end if;
    update private.usage_pack_orders set net_cents = p_net_cents,refunded = is_refund,observed_at = p_observed where id = p_order;
    return;
  end if;
  if not is_refund then
    insert into private.usage_grants(ws_id,meter,source_key,starts_at,expires_at,units)
      values(p_ws,p_meter,'polar-order/'||p_order::text,p_created,expiry,units) returning id into grant_id;
  end if;
  insert into private.usage_pack_orders values(p_order,p_ws,p_meter,p_customer_ref,p_product,p_net_cents,is_refund,grant_id,p_observed);
end $$;
revoke all on function public.apply_usage_pack_order(uuid,uuid,uuid,text,text,text,integer,timestamptz,timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.apply_usage_pack_order(uuid,uuid,uuid,text,text,text,integer,timestamptz,timestamptz,timestamptz)
  to service_role;
