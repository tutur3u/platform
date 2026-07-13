-- Materialize checkout TTL expiry instead of leaving stale `reserved` rows.
-- Availability already ignores reservations after expires_at, but operators and
-- downstream integrations need the checkout + reservation states to converge.

create index if not exists inventory_checkout_sessions_reserved_expiry_idx
  on private.inventory_checkout_sessions (expires_at, ws_id)
  where status = 'reserved';

create or replace function private.expire_inventory_checkout_sessions(
  p_now timestamptz default now(),
  p_limit integer default 500,
  p_ws_id uuid default null
)
returns table (
  checkout_id uuid,
  ws_id uuid
)
language plpgsql
volatile
security definer
set search_path = private, public, pg_temp
as $$
begin
  return query
  with candidates as (
    select checkout.id, checkout.ws_id
    from private.inventory_checkout_sessions checkout
    where checkout.status = 'reserved'
      and checkout.expires_at <= p_now
      and (p_ws_id is null or checkout.ws_id = p_ws_id)
    order by checkout.expires_at asc, checkout.id asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
  ),
  expired_reservations as (
    update private.inventory_reservations reservation
    set
      status = 'expired',
      released_at = coalesce(reservation.released_at, p_now)
    from candidates candidate
    where reservation.checkout_session_id = candidate.id
      and reservation.status = 'reserved'
    returning reservation.checkout_session_id
  )
  update private.inventory_checkout_sessions checkout
  set
    status = 'expired',
    updated_at = p_now
  from candidates candidate
  where checkout.id = candidate.id
    and checkout.ws_id = candidate.ws_id
    and checkout.status = 'reserved'
  returning checkout.id, checkout.ws_id;
end;
$$;

revoke all on function private.expire_inventory_checkout_sessions(
  timestamptz,
  integer,
  uuid
) from public, anon, authenticated;
grant execute on function private.expire_inventory_checkout_sessions(
  timestamptz,
  integer,
  uuid
) to service_role;

create or replace function private.expire_inventory_checkouts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  perform private.expire_inventory_checkout_sessions(
    p_now := coalesce(new.created_at, now()),
    p_limit := 500,
    p_ws_id := new.ws_id
  );
  return new;
end;
$$;

revoke all on function private.expire_inventory_checkouts_before_insert()
  from public, anon, authenticated;
grant execute on function private.expire_inventory_checkouts_before_insert()
  to service_role;

drop trigger if exists expire_inventory_checkouts_before_insert
  on private.inventory_checkout_sessions;
create trigger expire_inventory_checkouts_before_insert
  before insert on private.inventory_checkout_sessions
  for each row
  execute function private.expire_inventory_checkouts_before_insert();

-- Repair any stale rows immediately when the migration is applied.
do $$
begin
  loop
    exit when not exists (
      select 1
      from private.expire_inventory_checkout_sessions(
        p_now := now(),
        p_limit := 5000,
        p_ws_id := null
      )
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
