-- Workspace newsletter staff-test send.
-- Private claims, hashed TXT tokens, sender approval, subscriber unsubscribe
-- hashes, and the free-tier accepted-send counter. The server is the only
-- caller. Audit rows store actor, action, and occurred_at, never a token.
-- Rollback: apps/database/rollbacks/20261109030000_newsletter_domains.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

create table private.newsletter_sending_domains (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  subdomain text not null,
  approval text not null default 'pending',
  dkim_verified boolean not null default false,
  mail_from_verified boolean not null default false,
  txt_verified boolean not null default false,
  ownership_token_hash text not null,
  dns_records jsonb not null,
  mail_from_domain text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint newsletter_sending_domains_ws_id_id_key unique (ws_id, id),
  constraint newsletter_sending_domains_approval_check
    check (approval in ('pending', 'approved', 'suspended', 'removed')),
  constraint newsletter_sending_domains_subdomain_check
    check (
      subdomain = lower(subdomain)
      and length(subdomain) between 1 and 253
      and position('*' in subdomain) = 0
    ),
  constraint newsletter_sending_domains_token_hash_check
    check (ownership_token_hash ~ '^[0-9a-f]{64}$'),
  constraint newsletter_sending_domains_dns_check
    check (
      jsonb_typeof(dns_records) = 'array'
      and jsonb_array_length(dns_records) between 1 and 12
      and position(ownership_token_hash in dns_records::text) = 0
    ),
  constraint newsletter_sending_domains_mail_from_check
    check (
      mail_from_domain is null
      or (
        mail_from_domain = lower(mail_from_domain)
        and right(mail_from_domain, length(subdomain) + 1) = '.' || subdomain
      )
    )
);

create unique index newsletter_sending_domains_subdomain_active
  on private.newsletter_sending_domains (subdomain)
  where approval <> 'removed';

create unique index newsletter_sending_domains_ws_active
  on private.newsletter_sending_domains (ws_id)
  where approval <> 'removed';

alter table private.newsletter_sending_domains enable row level security;
revoke all on table private.newsletter_sending_domains
  from public, anon, authenticated, service_role;

create table private.newsletter_sender_addresses (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  ws_id uuid not null,
  domain_id uuid not null,
  local_part text not null,
  approval text not null default 'pending',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint newsletter_sender_addresses_domain_fk
    foreign key (ws_id, domain_id)
    references private.newsletter_sending_domains (ws_id, id)
    on delete cascade,
  constraint newsletter_sender_addresses_domain_local_key
    unique (domain_id, local_part),
  constraint newsletter_sender_addresses_approval_check
    check (approval in ('pending', 'approved', 'suspended', 'removed')),
  constraint newsletter_sender_addresses_local_part_check
    check (
      local_part ~ '^[a-z0-9._-]{1,32}$'
      and local_part not in (
        'postmaster', 'abuse', 'admin', 'root', 'security',
        'hostmaster', 'webmaster', 'support'
      )
    )
);

alter table private.newsletter_sender_addresses enable row level security;
revoke all on table private.newsletter_sender_addresses
  from public, anon, authenticated, service_role;

create table private.newsletter_subscribers (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  unsubscribe_token_hash text not null,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint newsletter_subscribers_ws_email_key unique (ws_id, email),
  constraint newsletter_subscribers_token_hash_key unique (unsubscribe_token_hash),
  constraint newsletter_subscribers_email_check
    check (
      email = lower(email)
      and length(email) between 3 and 320
      and length(email) - length(replace(email, '@', '')) = 1
      and email !~ '[[:space:][:cntrl:]]'
    ),
  constraint newsletter_subscribers_token_hash_check
    check (unsubscribe_token_hash ~ '^[0-9a-f]{64}$')
);

alter table private.newsletter_subscribers enable row level security;
revoke all on table private.newsletter_subscribers
  from public, anon, authenticated, service_role;

create table private.newsletter_deliveries (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  ws_id uuid not null,
  domain_id uuid not null,
  actor_id uuid not null,
  local_part text not null,
  recipient text not null,
  status text not null,
  accepted_on date,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint newsletter_deliveries_domain_fk
    foreign key (ws_id, domain_id)
    references private.newsletter_sending_domains (ws_id, id)
    on delete cascade,
  constraint newsletter_deliveries_status_check
    check (
      status in ('reserved', 'accepted', 'rejected')
      and (
        (status = 'accepted' and accepted_on is not null)
        or (status <> 'accepted' and accepted_on is null)
      )
    ),
  constraint newsletter_deliveries_recipient_check
    check (
      recipient = lower(recipient)
      and position(',' in recipient) = 0
      and recipient !~ '[[:cntrl:]]'
      and length(recipient) between 3 and 320
    ),
  constraint newsletter_deliveries_local_part_check
    check (local_part ~ '^[a-z0-9._-]{1,32}$')
);

create index newsletter_deliveries_accepted_day
  on private.newsletter_deliveries (ws_id, accepted_on)
  where status = 'accepted';

alter table private.newsletter_deliveries enable row level security;
revoke all on table private.newsletter_deliveries
  from public, anon, authenticated, service_role;

create table private.newsletter_domain_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  domain_id uuid references private.newsletter_sending_domains (id) on delete cascade,
  actor uuid not null,
  action text not null,
  subject text not null,
  occurred_at timestamptz not null default pg_catalog.now(),
  constraint newsletter_domain_audit_action_check
    check (action in ('add', 'verify', 'approve', 'suspend', 'remove')),
  constraint newsletter_domain_audit_subject_check
    check (subject in ('domain', 'sender'))
);

comment on table private.newsletter_domain_audit is
  'Domain and sender lifecycle with actor, action, and occurred_at. No verification token is stored.';

alter table private.newsletter_domain_audit enable row level security;
revoke all on table private.newsletter_domain_audit
  from public, anon, authenticated, service_role;

create function private.newsletter_insert_domain(
  p_ws_id uuid,
  p_actor uuid,
  p_subdomain text,
  p_token_hash text,
  p_dns jsonb,
  p_dkim_verified boolean,
  p_mail_from_verified boolean,
  p_txt_verified boolean,
  p_mail_from_domain text,
  p_write_verify boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $newsletter$
declare
  suffixes text[] := array[
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'net.uk',
    'com.au', 'net.au', 'org.au', 'edu.au',
    'co.jp', 'ne.jp', 'or.jp', 'ac.jp',
    'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.sg', 'com.hk', 'com.tw', 'com.cn',
    'com.vn', 'net.vn', 'org.vn', 'edu.vn', 'gov.vn',
    'co.nz', 'co.za', 'co.in', 'co.kr', 'com.co', 'com.my', 'com.ph', 'com.pk', 'com.ng',
    'co.id', 'com.ua', 'com.pl',
    'github.io', 'blogspot.com', 'vercel.app', 'netlify.app', 'pages.dev', 'workers.dev',
    'cloudfront.net', 'amazonaws.com', 'herokuapp.com', 'appspot.com', 'firebaseapp.com',
    'web.app', 'azurewebsites.net', 'github.dev', 'gitlab.io', 'readthedocs.io',
    'notion.site', 'wixsite.com', 'square.site', 'myshopify.com', 'fly.dev'
  ];
  suffix text;
  label text;
  best_length integer := 0;
  best_labels integer := 1;
  name_labels integer;
  inserted private.newsletter_sending_domains%rowtype;
begin
  if p_ws_id is null or p_actor is null or p_write_verify is null then
    raise exception 'newsletter_actor' using errcode = '22023';
  end if;
  if p_subdomain is null
    or p_subdomain <> pg_catalog.lower(p_subdomain)
    or pg_catalog.length(p_subdomain) < 1
    or pg_catalog.length(p_subdomain) > 253
    or pg_catalog.position('*' in p_subdomain) > 0
    or p_subdomain ~ '[^a-z0-9.-]'
    or p_subdomain ~ '^[0-9]+([.][0-9]+){3}$'
    or p_subdomain = 'localhost'
    or pg_catalog.right(p_subdomain, 10) = '.localhost'
    or p_subdomain = 'tuturuuu.com'
    or pg_catalog.right(p_subdomain, 13) = '.tuturuuu.com'
  then
    raise exception 'newsletter_invalid_domain' using errcode = '22023';
  end if;
  foreach label in array pg_catalog.string_to_array(p_subdomain, '.') loop
    if label !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      or pg_catalog.left(label, 4) = 'xn--'
    then
      raise exception 'newsletter_invalid_domain' using errcode = '22023';
    end if;
  end loop;
  foreach suffix in array suffixes loop
    if p_subdomain = suffix
      or pg_catalog.right(p_subdomain, pg_catalog.length(suffix) + 1) = '.' || suffix
    then
      if pg_catalog.length(suffix) > best_length then
        best_length := pg_catalog.length(suffix);
        best_labels := pg_catalog.array_length(pg_catalog.string_to_array(suffix, '.'), 1);
      end if;
    end if;
  end loop;
  name_labels := pg_catalog.array_length(pg_catalog.string_to_array(p_subdomain, '.'), 1);
  if name_labels is null or name_labels <= best_labels + 1 then
    raise exception 'newsletter_invalid_domain' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'newsletter_token_hash' using errcode = '22023';
  end if;
  if p_dkim_verified is null or p_mail_from_verified is null or p_txt_verified is null then
    raise exception 'newsletter_dns' using errcode = '22023';
  end if;
  if p_dns is null or pg_catalog.jsonb_typeof(p_dns) is distinct from 'array' then
    raise exception 'newsletter_dns' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_dns) < 1
    or pg_catalog.jsonb_array_length(p_dns) > 12
    or pg_catalog.position(p_token_hash in p_dns::text) > 0
  then
    raise exception 'newsletter_dns' using errcode = '22023';
  end if;
  if p_mail_from_domain is not null and (
    p_mail_from_domain <> pg_catalog.lower(p_mail_from_domain)
    or pg_catalog.right(p_mail_from_domain, pg_catalog.length(p_subdomain) + 1)
      is distinct from '.' || p_subdomain
  ) then
    raise exception 'newsletter_dns' using errcode = '22023';
  end if;
  insert into private.newsletter_sending_domains (
    ws_id, subdomain, ownership_token_hash, dns_records,
    dkim_verified, mail_from_verified, txt_verified, mail_from_domain
  ) values (
    p_ws_id, p_subdomain, p_token_hash, p_dns,
    p_dkim_verified, p_mail_from_verified, p_txt_verified, p_mail_from_domain
  ) returning * into inserted;
  insert into private.newsletter_domain_audit (ws_id, domain_id, actor, action, subject)
  values (p_ws_id, inserted.id, p_actor, 'add', 'domain');
  if p_write_verify then
    insert into private.newsletter_domain_audit (ws_id, domain_id, actor, action, subject)
    values (p_ws_id, inserted.id, p_actor, 'verify', 'domain');
  end if;
  return pg_catalog.jsonb_build_object(
    'id', inserted.id,
    'subdomain', inserted.subdomain,
    'approval', inserted.approval,
    'dkimVerified', inserted.dkim_verified,
    'mailFromVerified', inserted.mail_from_verified,
    'txtVerified', inserted.txt_verified,
    'dnsRecords', inserted.dns_records,
    'mailFromDomain', inserted.mail_from_domain
  );
end;
$newsletter$;

revoke all on function private.newsletter_insert_domain(uuid, uuid, text, text, jsonb, boolean, boolean, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function private.newsletter_insert_domain(uuid, uuid, text, text, jsonb, boolean, boolean, boolean, text, boolean)
  to service_role;

create function private.newsletter_read_claim(p_ws_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $newsletter$
declare
  domain_row private.newsletter_sending_domains%rowtype;
  sender_rows jsonb;
begin
  if p_ws_id is null then
    raise exception 'newsletter_not_found' using errcode = 'P0002';
  end if;
  select * into domain_row
  from private.newsletter_sending_domains
  where ws_id = p_ws_id and approval <> 'removed';
  if not found then
    return pg_catalog.jsonb_build_object('claim', null);
  end if;
  select pg_catalog.coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'localPart', sender.local_part,
        'approval', sender.approval
      )
    ),
    '[]'::jsonb
  )
  into sender_rows
  from private.newsletter_sender_addresses sender
  where sender.domain_id = domain_row.id
    and sender.ws_id = domain_row.ws_id
    and sender.approval <> 'removed';
  return pg_catalog.jsonb_build_object(
    'claim', pg_catalog.jsonb_build_object(
      'id', domain_row.id,
      'subdomain', domain_row.subdomain,
      'approval', domain_row.approval,
      'dkimVerified', domain_row.dkim_verified,
      'mailFromVerified', domain_row.mail_from_verified,
      'txtVerified', domain_row.txt_verified,
      'dnsRecords', domain_row.dns_records,
      'mailFromDomain', domain_row.mail_from_domain,
      'senders', sender_rows
    )
  );
end;
$newsletter$;

revoke all on function private.newsletter_read_claim(uuid)
  from public, anon, authenticated;
grant execute on function private.newsletter_read_claim(uuid) to service_role;

create function private.newsletter_set_approval(
  p_ws_id uuid,
  p_actor uuid,
  p_action text,
  p_local_part text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $newsletter$
declare
  domain_row private.newsletter_sending_domains%rowtype;
  sender_id uuid;
  next_approval text;
begin
  if p_ws_id is null or p_actor is null then
    raise exception 'newsletter_actor' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('approve', 'suspend', 'remove') then
    raise exception 'newsletter_invalid_action' using errcode = '22023';
  end if;
  select * into domain_row
  from private.newsletter_sending_domains
  where ws_id = p_ws_id and approval <> 'removed'
  for update;
  if not found then
    raise exception 'newsletter_not_found' using errcode = 'P0002';
  end if;
  next_approval := case p_action
    when 'approve' then 'approved'
    when 'suspend' then 'suspended'
    else 'removed'
  end;
  if p_local_part is null then
    update private.newsletter_sending_domains
      set approval = next_approval,
          updated_at = pg_catalog.now()
      where id = domain_row.id and ws_id = p_ws_id;
    insert into private.newsletter_domain_audit (ws_id, domain_id, actor, action, subject)
    values (p_ws_id, domain_row.id, p_actor, p_action, 'domain');
    return pg_catalog.jsonb_build_object(
      'approval', next_approval,
      'localPart', null,
      'subdomain', domain_row.subdomain
    );
  end if;
  if p_local_part !~ '^[a-z0-9._-]{1,32}$'
    or p_local_part in (
      'postmaster', 'abuse', 'admin', 'root', 'security',
      'hostmaster', 'webmaster', 'support'
    )
  then
    raise exception 'newsletter_local_part' using errcode = '22023';
  end if;
  if p_action = 'approve' then
    insert into private.newsletter_sender_addresses (
      ws_id, domain_id, local_part, approval
    ) values (
      p_ws_id, domain_row.id, p_local_part, 'approved'
    )
    on conflict (domain_id, local_part) do update
      set approval = 'approved',
          updated_at = pg_catalog.now()
      returning id into sender_id;
  else
    update private.newsletter_sender_addresses
      set approval = next_approval,
          updated_at = pg_catalog.now()
      where domain_id = domain_row.id
        and ws_id = p_ws_id
        and local_part = p_local_part
        and approval <> 'removed'
      returning id into sender_id;
    if not found then
      raise exception 'newsletter_not_found' using errcode = 'P0002';
    end if;
  end if;
  insert into private.newsletter_domain_audit (ws_id, domain_id, actor, action, subject)
  values (p_ws_id, domain_row.id, p_actor, p_action, 'sender');
  return pg_catalog.jsonb_build_object(
    'approval', next_approval,
    'localPart', p_local_part,
    'subdomain', domain_row.subdomain
  );
end;
$newsletter$;

revoke all on function private.newsletter_set_approval(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.newsletter_set_approval(uuid, uuid, text, text)
  to service_role;

create function private.newsletter_insert_subscriber(
  p_ws_id uuid,
  p_email text,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $newsletter$
declare
  new_id uuid;
begin
  if p_ws_id is null then
    raise exception 'newsletter_not_found' using errcode = 'P0002';
  end if;
  if p_email is null
    or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email))
    or pg_catalog.length(p_email) < 3
    or pg_catalog.length(p_email) > 320
    or pg_catalog.length(p_email) - pg_catalog.length(pg_catalog.replace(p_email, '@', '')) <> 1
    or p_email ~ '[[:space:][:cntrl:]]'
  then
    raise exception 'newsletter_invalid_email' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'newsletter_token_hash' using errcode = '22023';
  end if;
  insert into private.newsletter_subscribers (ws_id, email, unsubscribe_token_hash)
  values (p_ws_id, p_email, p_token_hash)
  on conflict (ws_id, email) do nothing
  returning id into new_id;
  if new_id is null then
    return pg_catalog.jsonb_build_object('created', false);
  end if;
  return pg_catalog.jsonb_build_object('created', true);
end;
$newsletter$;

revoke all on function private.newsletter_insert_subscriber(uuid, text, text)
  from public, anon, authenticated;
grant execute on function private.newsletter_insert_subscriber(uuid, text, text)
  to service_role;

create function private.newsletter_unsubscribe(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $newsletter$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'newsletter_token_hash' using errcode = '22023';
  end if;
  update private.newsletter_subscribers
    set unsubscribed_at = pg_catalog.coalesce(unsubscribed_at, pg_catalog.now())
    where unsubscribe_token_hash = p_token_hash;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$newsletter$;

revoke all on function private.newsletter_unsubscribe(text)
  from public, anon, authenticated;
grant execute on function private.newsletter_unsubscribe(text) to service_role;

create function private.newsletter_reserve_staff_delivery(
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
    or pg_catalog.position(',' in p_recipient) > 0
    or pg_catalog.position(';' in p_recipient) > 0
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

create function private.newsletter_finish_staff_delivery(
  p_ws_id uuid,
  p_delivery_id uuid,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
set lock_timeout = '5s'
as $newsletter$
declare
  delivery_row private.newsletter_deliveries%rowtype;
begin
  if p_ws_id is null or p_delivery_id is null
    or p_status is null
    or p_status not in ('accepted', 'rejected')
  then
    raise exception 'newsletter_delivery_state' using errcode = '22023';
  end if;
  select * into delivery_row
  from private.newsletter_deliveries
  where id = p_delivery_id and ws_id = p_ws_id
  for update;
  if not found then
    raise exception 'newsletter_delivery_state' using errcode = '22023';
  end if;
  if delivery_row.status = p_status then
    return pg_catalog.jsonb_build_object('id', delivery_row.id, 'status', delivery_row.status);
  end if;
  if delivery_row.status <> 'reserved' then
    raise exception 'newsletter_delivery_state' using errcode = '22023';
  end if;
  if p_status = 'accepted' then
    update private.newsletter_deliveries
      set status = 'accepted',
          accepted_on = (pg_catalog.timezone('UTC', pg_catalog.now()))::date,
          updated_at = pg_catalog.now()
      where id = delivery_row.id and status = 'reserved';
  else
    update private.newsletter_deliveries
      set status = 'rejected',
          updated_at = pg_catalog.now()
      where id = delivery_row.id and status = 'reserved';
  end if;
  return pg_catalog.jsonb_build_object('id', delivery_row.id, 'status', p_status);
end;
$newsletter$;

revoke all on function private.newsletter_finish_staff_delivery(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function private.newsletter_finish_staff_delivery(uuid, uuid, text)
  to service_role;
