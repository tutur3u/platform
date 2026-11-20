begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function private.consume_finance_bank_withdrawal_quota(p_actor_id uuid)
returns boolean
language sql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select quota.allowed from private.try_consume_rate_limit_bucket(
      'finance-bank-withdrawal:' || p_actor_id::text, interval '1 minute', 20
    ) as quota
  ), false);
$$;

revoke all on function private.consume_finance_bank_withdrawal_quota(uuid)
  from public, anon, authenticated;
grant execute on function private.consume_finance_bank_withdrawal_quota(uuid)
  to service_role;

create or replace function private.withdraw_finance_contact_bank_account(
  p_ws_id uuid,
  p_actor_id uuid,
  p_contact_id uuid
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  withdrawn_revision uuid;
begin
  if not private.consume_finance_bank_withdrawal_quota(p_actor_id) then
    raise sqlstate 'PT429' using message = 'Too many bank consent withdrawals';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('finance-bank/' || p_ws_id::text || '/' || p_contact_id::text, 0));

  delete from private.finance_contact_bank_accounts
  where ws_id = p_ws_id and contact_id = p_contact_id and consent_actor_id = p_actor_id
  returning consent_revision into withdrawn_revision;
  if not found then return; end if;

  update private.finance_bill_split_status_links
  set revoked_at = clock_timestamp()
  where ws_id = p_ws_id and receiving_consent_revision = withdrawn_revision
    and revoked_at is null;

  insert into private.finance_contact_bank_audit (ws_id, contact_id, actor_id, action)
  values (p_ws_id, p_contact_id, p_actor_id, 'revoke');
end;
$$;

revoke all on function private.withdraw_finance_contact_bank_account(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.withdraw_finance_contact_bank_account(uuid, uuid, uuid)
  to service_role;

commit;
