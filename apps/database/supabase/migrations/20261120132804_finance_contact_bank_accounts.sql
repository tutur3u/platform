begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.finance_contact_bank_accounts (
  ws_id uuid not null,
  contact_id uuid not null,
  consent_actor_id uuid references public.users(id) on delete cascade not null,
  consent_revision uuid not null unique default gen_random_uuid(),
  consented_at timestamptz not null default now(),
  bank_name text not null check (length(btrim(bank_name)) between 1 and 120),
  bank_bin text not null check (bank_bin ~ '^[0-9]{6}$'),
  last_four text not null check (last_four ~ '^[0-9A-Za-z]{4}$'),
  encrypted_details text not null check (length(encrypted_details) between 30 and 2048),
  primary key (ws_id, contact_id),
  foreign key (ws_id, contact_id)
    references public.workspace_users(ws_id, id) on delete cascade
);

create index finance_contact_bank_accounts_consenter
  on private.finance_contact_bank_accounts(consent_actor_id);

create table private.finance_contact_bank_audit (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid,
  actor_id uuid references public.users(id) on delete set null,
  action text not null check (action in ('consent', 'masked_read', 'qr', 'revoke', 'public_qr')),
  created_at timestamptz not null default now()
);

create index finance_contact_bank_audit_contact on private.finance_contact_bank_audit(ws_id, contact_id, created_at);
create index finance_contact_bank_audit_actor on private.finance_contact_bank_audit(actor_id);

alter table private.finance_contact_bank_accounts enable row level security;
alter table private.finance_contact_bank_audit enable row level security;
revoke all on table private.finance_contact_bank_accounts, private.finance_contact_bank_audit
  from public, anon, authenticated, service_role;
grant select, insert, delete on table private.finance_contact_bank_accounts to service_role;
grant update (consent_actor_id, consent_revision, consented_at, bank_name, bank_bin, last_four, encrypted_details)
  on table private.finance_contact_bank_accounts to service_role;
grant insert on table private.finance_contact_bank_audit to service_role;

create function private.finance_contact_bank_command(
  p_ws_id uuid,
  p_actor_id uuid,
  p_contact_id uuid,
  p_action text,
  p_bank_name text default null,
  p_bank_bin text default null,
  p_last_four text default null,
  p_encrypted_details text default null,
  p_consent_revision uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  account private.finance_contact_bank_accounts%rowtype;
  owns_contact boolean;
begin
  if not exists (
    select 1 from public.workspace_members
    where ws_id = p_ws_id and user_id = p_actor_id and type = 'MEMBER'
  ) then
    raise insufficient_privilege using message = 'Workspace access required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('finance-bank/' || p_ws_id::text || '/' || p_contact_id::text, 0));
  owns_contact := exists (
    select 1 from private.finance_verified_contact_accounts(p_ws_id, p_contact_id) as link
    where link.platform_user_id = p_actor_id
  );

  if p_action = 'consent' and not owns_contact then
    raise insufficient_privilege using message = 'Account holder consent required';
  end if;

  if p_action in ('consent', 'revoke') then
    update private.finance_bill_split_status_links as link
    set revoked_at = clock_timestamp()
    from private.finance_contact_bank_accounts as stored
    where stored.ws_id = p_ws_id and stored.contact_id = p_contact_id
      and (p_action = 'consent' or stored.consent_actor_id = p_actor_id)
      and link.ws_id = stored.ws_id and link.receiving_consent_revision = stored.consent_revision
      and link.revoked_at is null;
  end if;

  if p_action = 'consent' then

    insert into private.finance_contact_bank_accounts (
      ws_id, contact_id, consent_actor_id, bank_name, bank_bin, last_four, encrypted_details
    ) values (
      p_ws_id, p_contact_id, p_actor_id, p_bank_name, p_bank_bin, p_last_four, p_encrypted_details
    ) on conflict (ws_id, contact_id) do update set
      consent_actor_id = excluded.consent_actor_id,
      consent_revision = excluded.consent_revision,
      consented_at = excluded.consented_at,
      bank_name = excluded.bank_name,
      bank_bin = excluded.bank_bin,
      last_four = excluded.last_four,
      encrypted_details = excluded.encrypted_details;
  elsif p_action = 'revoke' then
    delete from private.finance_contact_bank_accounts
    where ws_id = p_ws_id and contact_id = p_contact_id and consent_actor_id = p_actor_id;
    if not found then return jsonb_build_object('deleted', true); end if;
  elsif p_action in ('masked_read', 'qr', 'public_qr', 'grant_qr') then
    if p_action in ('public_qr', 'grant_qr') and not owns_contact then return null; end if;
    select stored.* into account
    from private.finance_contact_bank_accounts as stored
    join public.workspace_users as contact
      on contact.ws_id = stored.ws_id and contact.id = stored.contact_id
    join lateral private.finance_verified_contact_accounts(stored.ws_id, stored.contact_id) as link
      on link.platform_user_id = stored.consent_actor_id
    join public.workspace_members as holder
      on holder.ws_id = stored.ws_id and holder.user_id = stored.consent_actor_id
    where stored.ws_id = p_ws_id and stored.contact_id = p_contact_id
      and not contact.archived and holder.type = 'MEMBER'
      and (p_action not in ('public_qr', 'grant_qr') or stored.consent_actor_id = p_actor_id)
      and (p_action <> 'public_qr' or stored.consent_revision = p_consent_revision);
    if not found then return null; end if;
  else
    raise invalid_parameter_value using message = 'Invalid bank account operation';
  end if;

  if p_action = 'grant_qr' then
    return jsonb_build_object('consentRevision', account.consent_revision);
  end if;

  insert into private.finance_contact_bank_audit (ws_id, contact_id, actor_id, action)
    values (p_ws_id, p_contact_id, p_actor_id, p_action);

  case p_action
    when 'consent' then return jsonb_build_object('saved', true);
    when 'revoke' then return jsonb_build_object('deleted', true);
    when 'masked_read' then return jsonb_build_object(
      'bankName', account.bank_name, 'lastFour', account.last_four
    );
    else return jsonb_build_object(
      'bankBin', account.bank_bin, 'encryptedDetails', account.encrypted_details
    );
  end case;
end;
$$;

revoke all on function private.finance_contact_bank_command(uuid, uuid, uuid, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function private.finance_contact_bank_command(uuid, uuid, uuid, text, text, text, text, text, uuid)
  to service_role;

commit;
