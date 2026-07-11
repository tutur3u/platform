-- Platform-managed catch-all delivery. The provider route remains disabled
-- until an operator selects a valid mailbox and activates the external route.

alter table private.mail_domains
  add column catch_all_enabled boolean not null default false,
  add column catch_all_mailbox_id uuid
    references private.mail_mailboxes(id) on delete restrict,
  add column catch_all_auto_draft_enabled boolean not null default false,
  add constraint mail_domains_catch_all_requires_mailbox
    check (not catch_all_enabled or catch_all_mailbox_id is not null),
  add constraint mail_domains_catch_all_auto_draft_requires_route
    check (not catch_all_auto_draft_enabled or catch_all_enabled);

create index mail_domains_catch_all_mailbox_idx
  on private.mail_domains (catch_all_mailbox_id)
  where catch_all_mailbox_id is not null;

create or replace function private.enforce_mail_domain_catch_all_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_domain_id uuid;
  target_status text;
  expected_domain_id uuid;
begin
  if new.catch_all_mailbox_id is null then
    return new;
  end if;

  select domain_id, status
  into target_domain_id, target_status
  from private.mail_mailboxes
  where id = new.catch_all_mailbox_id;

  if target_domain_id is null then
    raise exception 'catch-all mailbox does not exist';
  end if;

  expected_domain_id := coalesce(new.canonical_domain_id, new.id);
  if target_domain_id <> expected_domain_id then
    raise exception 'catch-all mailbox must belong to the canonical domain';
  end if;

  if target_status <> 'active' then
    raise exception 'catch-all mailbox must be active';
  end if;

  return new;
end;
$$;

create trigger enforce_mail_domain_catch_all_target
  before insert or update of
    catch_all_enabled,
    catch_all_mailbox_id,
    canonical_domain_id
  on private.mail_domains
  for each row execute function private.enforce_mail_domain_catch_all_target();

create or replace function private.prevent_active_catch_all_mailbox_disable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status <> 'active' and exists (
    select 1
    from private.mail_domains
    where catch_all_enabled
      and catch_all_mailbox_id = old.id
  ) then
    raise exception 'disable the catch-all route before disabling its mailbox';
  end if;

  return new;
end;
$$;

create trigger prevent_active_catch_all_mailbox_disable
  before update of status on private.mail_mailboxes
  for each row execute function private.prevent_active_catch_all_mailbox_disable();

alter table private.mail_messages
  add column delivery_route text
    check (delivery_route in ('exact', 'catch_all')),
  add column envelope_from text,
  add column envelope_to text,
  add column observed_recipient text,
  add column ingress_domain_id uuid
    references private.mail_domains(id) on delete set null;

create index mail_messages_mailbox_delivery_route_idx
  on private.mail_messages (mailbox_id, delivery_route, received_at desc)
  where direction = 'inbound';

create index mail_messages_observed_recipient_idx
  on private.mail_messages (lower(observed_recipient))
  where observed_recipient is not null;

-- Preselect the pilot destination when the mailbox already exists, but leave
-- catch-all disabled so applying this migration cannot change live delivery.
update private.mail_domains as ingress
set catch_all_mailbox_id = mailbox.id
from private.mail_mailboxes as mailbox,
     private.mail_domains as canonical
where ingress.domain = 'ingest.tutur3u.com'
  and canonical.id = ingress.canonical_domain_id
  and canonical.domain = 'tuturuuu.com'
  and mailbox.domain_id = canonical.id
  and mailbox.address = 'phucvo@tuturuuu.com'
  and mailbox.status = 'active';

comment on column private.mail_domains.catch_all_mailbox_id is
  'Platform-managed active mailbox that receives unmatched recipients for this inbound domain.';
comment on column private.mail_domains.catch_all_auto_draft_enabled is
  'Separate opt-in for automatic draft jobs created from catch-all deliveries.';
comment on column private.mail_messages.observed_recipient is
  'Original transport recipient before canonical shadow-domain mapping.';
