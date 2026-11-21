-- Reviewed root-workspace provider invoices with the Finance transaction each
-- one posted to, for Admin cost analytics. An unposted invoice has no
-- transaction. The posting table stays closed to direct reads.
create function private.get_root_provider_invoice_postings(p_from date)
returns table (
  provider text, account_id text, app_id text, reference text,
  issued_on date, amount_usd numeric, transaction_id uuid
)
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select i.provider, i.account_id, i.app_id, i.reference, i.issued_on, i.amount_usd,
    p.transaction_id
  from private.external_provider_invoices i
  left join private.usage_invoice_postings p
    on p.ws_id = i.ws_id and p.app_id = i.app_id and p.provider = i.provider
      and p.account_id = i.account_id and p.reference = i.reference
  where i.ws_id = '00000000-0000-0000-0000-000000000000'
    and i.issued_on >= greatest(p_from, current_date - 400)
  order by i.issued_on desc, i.provider, i.app_id, i.account_id, i.reference
  limit 500;
$$;
-- Completed collection days per provider and account in [p_from, p_to), one
-- row per provider and account, so a collected day without charges reads as
-- a measured zero rather than missing data.
create function private.get_provider_cost_complete_days(p_from date, p_to date)
returns table (provider text, account_id text, days date[])
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select d.provider, d.account_id, array_agg(d.usage_date order by d.usage_date)
  from private.provider_cost_collection_days d
  where d.status = 'complete' and d.usage_date >= p_from and d.usage_date < p_to
    and p_to <= p_from + 400
  group by d.provider, d.account_id
  order by d.provider, d.account_id;
$$;

revoke all on function private.get_root_provider_invoice_postings(date) from public, anon, authenticated;
revoke all on function private.get_provider_cost_complete_days(date, date) from public, anon, authenticated;
grant execute on function private.get_provider_cost_complete_days(date, date) to service_role;
grant execute on function private.get_root_provider_invoice_postings(date) to service_role;
