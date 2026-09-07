-- Invoice snapshots are evidence of payment, not incremental metered usage.
-- Keep them separate from provider costs and never debit AI credits.
create table private.external_provider_invoices (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null check (length(app_id) between 1 and 128),
  provider text not null check (provider ~ '^[a-z0-9_-]{1,64}$'),
  account_id text not null check (account_id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  reference text not null check (reference ~ '^[a-zA-Z0-9_-]{1,100}$'),
  issued_on date not null,
  reviewed_on date not null check (reviewed_on >= issued_on),
  amount_usd numeric(24,12) not null check (amount_usd >= 0 and amount_usd < 1000000000),
  currency text not null default 'USD' check (currency = 'USD'),
  status text not null default 'paid' check (status = 'paid'),
  source text not null default 'reviewed_provider_invoice' check (source = 'reviewed_provider_invoice'),
  actor_id uuid not null,
  synced_at timestamptz not null default now(),
  primary key (ws_id, app_id, provider, account_id, reference)
);
alter table private.external_provider_invoices enable row level security;
revoke all on private.external_provider_invoices from public, anon, authenticated;
grant select, insert on private.external_provider_invoices to service_role;

create function private.record_external_provider_invoice(
  p_ws_id uuid, p_app_id text, p_actor_id uuid, p_provider text,
  p_account_id text, p_reference text, p_issued_on date,
  p_reviewed_on date, p_amount_usd numeric
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  insert into private.external_provider_invoices
    (ws_id, app_id, actor_id, provider, account_id, reference, issued_on, reviewed_on, amount_usd)
  values (p_ws_id, p_app_id, p_actor_id, p_provider, p_account_id, p_reference, p_issued_on, p_reviewed_on, p_amount_usd)
  on conflict do nothing;
  -- Immutable receipts: replay succeeds; conflicting evidence is rejected.
  if not exists (
    select 1 from private.external_provider_invoices
    where ws_id = p_ws_id and app_id = p_app_id and provider = p_provider
      and account_id = p_account_id and reference = p_reference
      and issued_on = p_issued_on and reviewed_on = p_reviewed_on and amount_usd = p_amount_usd
  ) then
    raise exception 'Invoice snapshot conflicts with existing receipt' using errcode = '23505';
  end if;
end;
$$;

create function private.get_external_provider_invoices(p_ws_id uuid)
returns setof private.external_provider_invoices
language sql stable security invoker set search_path = '' as $$
  select * from private.external_provider_invoices where ws_id = p_ws_id
  order by issued_on desc, app_id, provider, account_id, reference;
$$;
revoke all on function private.record_external_provider_invoice(uuid,text,uuid,text,text,text,date,date,numeric) from public, anon, authenticated;
revoke all on function private.get_external_provider_invoices(uuid) from public, anon, authenticated;
grant execute on function private.record_external_provider_invoice(uuid,text,uuid,text,text,text,date,date,numeric) to service_role;
grant execute on function private.get_external_provider_invoices(uuid) to service_role;
