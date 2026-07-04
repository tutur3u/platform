drop function if exists private.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
);
drop function if exists private.release_inventory_checkout_session(
  uuid,
  timestamptz
);
drop function if exists public.complete_inventory_checkout_session_payment(
  uuid,
  text,
  timestamptz
);
drop function if exists public.release_inventory_checkout_session(
  uuid,
  timestamptz
);

create or replace function public.release_inventory_checkout_session(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_now timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
  next_status text;
begin
  select *
  into checkout_row
  from private.inventory_checkout_sessions
  where id = p_checkout_id
    and ws_id = p_ws_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if checkout_row.status = 'completed' then
    return;
  end if;

  next_status := case
    when checkout_row.expires_at <= p_now then 'expired'
    else 'cancelled'
  end;

  update private.inventory_reservations
  set
    status = case when next_status = 'expired' then 'expired' else 'released' end,
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = next_status,
    updated_at = p_now
  where id = checkout_row.id
    and ws_id = checkout_row.ws_id
    and status <> 'completed';
end;
$$;

create or replace function public.complete_inventory_checkout_session_payment(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_polar_order_id text,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  checkout_row private.inventory_checkout_sessions%rowtype;
begin
  select *
  into checkout_row
  from private.inventory_checkout_sessions
  where id = p_checkout_id
    and ws_id = p_ws_id
  for update;

  if not found then
    raise exception 'CHECKOUT_NOT_FOUND'
      using errcode = 'P0001';
  end if;

  if checkout_row.status = 'completed' then
    return checkout_row.id;
  end if;

  if checkout_row.status <> 'reserved' then
    raise exception 'CHECKOUT_NOT_RESERVED'
      using errcode = 'P0001';
  end if;

  update private.inventory_reservations
  set
    status = 'consumed',
    released_at = p_now
  where checkout_session_id = checkout_row.id
    and status = 'reserved';

  update private.inventory_checkout_sessions
  set
    status = 'completed',
    polar_order_id = coalesce(nullif(p_polar_order_id, ''), polar_order_id),
    polar_status = 'paid',
    completed_at = p_now,
    updated_at = p_now
  where id = checkout_row.id
    and ws_id = checkout_row.ws_id;

  update private.inventory_settlement_ledger_entries
  set provider_ref = coalesce(nullif(p_polar_order_id, ''), provider_ref)
  where checkout_session_id = checkout_row.id
    and provider_ref is null;

  return checkout_row.id;
end;
$$;

create or replace function private.release_inventory_checkout_session(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_now timestamptz default now()
) returns void
language sql
volatile
security definer
set search_path = private, public, pg_temp
as $$
  select public.release_inventory_checkout_session(
    p_checkout_id := p_checkout_id,
    p_ws_id := p_ws_id,
    p_now := p_now
  );
$$;

create or replace function private.complete_inventory_checkout_session_payment(
  p_checkout_id uuid,
  p_ws_id uuid,
  p_polar_order_id text,
  p_now timestamptz default now()
) returns uuid
language sql
volatile
security definer
set search_path = private, public, pg_temp
as $$
  select public.complete_inventory_checkout_session_payment(
    p_checkout_id := p_checkout_id,
    p_ws_id := p_ws_id,
    p_polar_order_id := p_polar_order_id,
    p_now := p_now
  );
$$;

revoke all on function public.release_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function public.complete_inventory_checkout_session_payment(
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;
revoke all on function private.release_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;
revoke all on function private.complete_inventory_checkout_session_payment(
  uuid,
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.release_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) to service_role;
grant execute on function public.complete_inventory_checkout_session_payment(
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;
grant execute on function private.release_inventory_checkout_session(
  uuid,
  uuid,
  timestamptz
) to service_role;
grant execute on function private.complete_inventory_checkout_session_payment(
  uuid,
  uuid,
  text,
  timestamptz
) to service_role;

notify pgrst, 'reload schema';
