-- Operator-selected Finance destinations. An empty mapping posts nothing.
create table private.usage_finance_destinations (
  provider text not null,
  account_id text not null,
  app_id text not null,
  primary key (provider, account_id),
  wallet_id uuid not null references private.workspace_wallets,
  category_id uuid not null references public.transaction_categories
);
create table private.usage_invoice_postings (
  ws_id uuid not null,
  app_id text not null,
  provider text not null,
  account_id text not null,
  reference text not null,
  transaction_id uuid not null unique references public.wallet_transactions,
  primary key (ws_id,app_id,provider,account_id,reference),
  foreign key (ws_id,app_id,provider,account_id,reference)
    references private.external_provider_invoices
);
alter table private.usage_finance_destinations enable row level security;
alter table private.usage_invoice_postings enable row level security;
revoke all on private.usage_finance_destinations, private.usage_invoice_postings
  from public, anon, authenticated, service_role;

create function private.post_usage_provider_invoice(p_app text,p_provider text,p_account text,p_reference text)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  root_id constant uuid := '00000000-0000-0000-0000-000000000000';
  receipt private.external_provider_invoices;
  destination private.usage_finance_destinations;
  transaction_id uuid;
begin
  select * into strict receipt from private.external_provider_invoices
    where ws_id = root_id and app_id = p_app and provider = p_provider and account_id = p_account
      and reference = p_reference for update;
  select posting.transaction_id into transaction_id from private.usage_invoice_postings posting
    where ws_id = root_id and app_id = p_app and provider = p_provider and account_id = p_account and reference = p_reference;
  if found then return transaction_id; end if;
  select d.* into destination from private.usage_finance_destinations d
    join private.workspace_wallets w on w.id = d.wallet_id
    join public.transaction_categories c on c.id = d.category_id
    where d.provider = p_provider and d.account_id = p_account and d.app_id = p_app and w.ws_id = root_id and upper(w.currency) = 'USD'
      and c.ws_id = root_id and c.is_expense for share of d,w,c;
  if not found then return null; end if;
  insert into public.wallet_transactions(wallet_id,category_id,amount,taken_at,description)
    values (destination.wallet_id,destination.category_id,-receipt.amount_usd,
      receipt.issued_on::timestamp at time zone 'UTC',format('%s · %s',p_provider,p_reference))
    returning id into transaction_id;
  insert into private.usage_invoice_postings values (root_id,p_app,p_provider,p_account,p_reference,transaction_id);
  return transaction_id;
end $$;
revoke all on function private.post_usage_provider_invoice(text,text,text,text) from public,anon,authenticated;
grant execute on function private.post_usage_provider_invoice(text,text,text,text) to service_role;

create function private.post_new_usage_invoice() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform private.post_usage_provider_invoice(new.app_id,new.provider,new.account_id,new.reference);
  return new;
end $$;
revoke all on function private.post_new_usage_invoice() from public,anon,authenticated,service_role;
create trigger post_new_usage_invoice after insert on private.external_provider_invoices
for each row when (new.ws_id = '00000000-0000-0000-0000-000000000000')
execute function private.post_new_usage_invoice();
