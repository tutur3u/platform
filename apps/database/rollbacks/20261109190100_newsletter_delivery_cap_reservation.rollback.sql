-- Manual rollback for 20261109190100_newsletter_delivery_cap_reservation.sql.
-- Restores the accepted-only cap count and drops the reservation-day column.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.newsletter_reserve_staff_delivery(
  p_ws_id uuid,
  p_actor uuid,
  p_actor_email text,
  p_local_part text,
  p_recipient text,
  p_flag_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $newsletter$
declare
  domain_row private.newsletter_sending_domains%rowtype;
  sender_row private.newsletter_sender_addresses%rowtype;
  accepted_count bigint;
  delivery_id uuid;
begin
  if p_flag_enabled is distinct from true then
    raise exception 'newsletter_flag_disabled' using errcode = '22023';
  end if;
  if p_ws_id is null or p_actor is null then
    raise exception 'newsletter_actor' using errcode = '22023';
  end if;
  if p_local_part is null
    or p_local_part !~ '^[a-z0-9._-]{1,32}$'
    or p_local_part in (
      'postmaster', 'abuse', 'admin', 'root', 'security',
      'hostmaster', 'webmaster', 'support'
    )
  then
    raise exception 'newsletter_local_part' using errcode = '22023';
  end if;
  select * into domain_row
  from private.newsletter_sending_domains
  where ws_id = p_ws_id and approval <> 'removed'
  for update;
  if not found then
    raise exception 'newsletter_not_found' using errcode = 'P0002';
  end if;
  if domain_row.approval = 'suspended' then
    raise exception 'newsletter_domain_suspended' using errcode = '22023';
  end if;
  if domain_row.approval <> 'approved' then
    raise exception 'newsletter_domain_not_approved' using errcode = '22023';
  end if;
  if domain_row.dkim_verified is not true
    or domain_row.mail_from_verified is not true
    or domain_row.txt_verified is not true
  then
    raise exception 'newsletter_domain_unverified' using errcode = '22023';
  end if;
  select * into sender_row
  from private.newsletter_sender_addresses
  where domain_id = domain_row.id
    and ws_id = p_ws_id
    and local_part = p_local_part
    and approval <> 'removed'
  for update;
  if not found then
    raise exception 'newsletter_sender_missing' using errcode = 'P0002';
  end if;
  if sender_row.approval = 'suspended' then
    raise exception 'newsletter_sender_suspended' using errcode = '22023';
  end if;
  if sender_row.approval <> 'approved' then
    raise exception 'newsletter_sender_not_approved' using errcode = '22023';
  end if;
  if p_recipient is null
    or p_actor_email is null
    or pg_catalog.lower(pg_catalog.btrim(p_recipient))
      is distinct from pg_catalog.lower(pg_catalog.btrim(p_actor_email))
    or pg_catalog.strpos(p_recipient, ',') > 0
    or pg_catalog.strpos(p_recipient, ';') > 0
    or p_recipient ~ '[[:cntrl:]]'
    or p_actor_email ~ '[[:cntrl:]]'
  then
    raise exception 'newsletter_recipient' using errcode = '22023';
  end if;
  select count(*) into accepted_count
  from private.newsletter_deliveries
  where ws_id = p_ws_id
    and status = 'accepted'
    and accepted_on = (pg_catalog.timezone('UTC', pg_catalog.now()))::date;
  if accepted_count >= 10 then
    raise exception 'newsletter_daily_cap' using errcode = 'P0001';
  end if;
  insert into private.newsletter_deliveries (
    ws_id, domain_id, actor_id, local_part, recipient, status
  ) values (
    p_ws_id,
    domain_row.id,
    p_actor,
    p_local_part,
    pg_catalog.lower(pg_catalog.btrim(p_recipient)),
    'reserved'
  ) returning id into delivery_id;
  return pg_catalog.jsonb_build_object('id', delivery_id);
end;
$newsletter$;

revoke all on function private.newsletter_reserve_staff_delivery(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function private.newsletter_reserve_staff_delivery(uuid, uuid, text, text, text, boolean)
  to service_role;

drop index if exists private.newsletter_deliveries_cap_day;
alter table private.newsletter_deliveries drop column if exists reserved_on;

commit;
