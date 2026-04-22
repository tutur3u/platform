create or replace function public.validate_sepay_wallet_link_workspace()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_wallet_ws_id uuid;
begin
  if tg_op = 'UPDATE' and new.ws_id <> old.ws_id then
    raise exception 'SePay wallet link workspace cannot be reassigned';
  end if;

  select ws_id
    into v_wallet_ws_id
    from public.workspace_wallets
   where id = new.wallet_id;

  if v_wallet_ws_id is null then
    raise exception 'SePay wallet link references an unknown wallet';
  end if;

  if v_wallet_ws_id <> new.ws_id then
    raise exception 'SePay wallet link wallet must belong to the same workspace';
  end if;

  return new;
end;
$$;

create or replace function public.validate_sepay_webhook_endpoint_workspace()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_wallet_ws_id uuid;
begin
  if tg_op = 'UPDATE' and new.ws_id <> old.ws_id then
    raise exception 'SePay webhook endpoint workspace cannot be reassigned';
  end if;

  if new.wallet_id is null then
    return new;
  end if;

  select ws_id
    into v_wallet_ws_id
    from public.workspace_wallets
   where id = new.wallet_id;

  if v_wallet_ws_id is null then
    raise exception 'SePay webhook endpoint references an unknown wallet';
  end if;

  if v_wallet_ws_id <> new.ws_id then
    raise exception 'SePay webhook endpoint wallet must belong to the same workspace';
  end if;

  return new;
end;
$$;

create or replace function public.validate_sepay_webhook_event_workspace()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_wallet_ws_id uuid;
  v_endpoint_ws_id uuid;
begin
  if tg_op = 'UPDATE' and new.ws_id <> old.ws_id then
    raise exception 'SePay webhook event workspace cannot be reassigned';
  end if;

  select ws_id
    into v_wallet_ws_id
    from public.workspace_wallets
   where id = new.wallet_id;

  if v_wallet_ws_id is null then
    raise exception 'SePay webhook event references an unknown wallet';
  end if;

  if v_wallet_ws_id <> new.ws_id then
    raise exception 'SePay webhook event wallet must belong to the same workspace';
  end if;

  select ws_id
    into v_endpoint_ws_id
    from public.sepay_webhook_endpoints
   where id = new.endpoint_id;

  if v_endpoint_ws_id is null then
    raise exception 'SePay webhook event references an unknown endpoint';
  end if;

  if v_endpoint_ws_id <> new.ws_id then
    raise exception 'SePay webhook event endpoint must belong to the same workspace';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_sepay_wallet_link_workspace
  on public.sepay_wallet_links;

create trigger validate_sepay_wallet_link_workspace
  before insert or update on public.sepay_wallet_links
  for each row
  execute function public.validate_sepay_wallet_link_workspace();

drop trigger if exists validate_sepay_webhook_endpoint_workspace
  on public.sepay_webhook_endpoints;

create trigger validate_sepay_webhook_endpoint_workspace
  before insert or update on public.sepay_webhook_endpoints
  for each row
  execute function public.validate_sepay_webhook_endpoint_workspace();

drop trigger if exists validate_sepay_webhook_event_workspace
  on public.sepay_webhook_events;

create trigger validate_sepay_webhook_event_workspace
  before insert or update on public.sepay_webhook_events
  for each row
  execute function public.validate_sepay_webhook_event_workspace();

drop function if exists public.disconnect_sepay_integration(uuid, timestamptz);

create or replace function public.disconnect_sepay_integration(
  p_ws_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  update public.sepay_webhook_endpoints
     set active = false,
         deleted_at = p_now,
         rotated_at = p_now
   where ws_id = p_ws_id
     and active = true
     and deleted_at is null;

  update public.sepay_connections
     set status = 'revoked',
         updated_at = p_now
   where ws_id = p_ws_id
     and status <> 'revoked';
end;
$$;

revoke execute on function public.disconnect_sepay_integration(uuid, timestamptz)
from public, anon, authenticated;

grant execute on function public.disconnect_sepay_integration(uuid, timestamptz)
to service_role;
