create schema if not exists private;

alter table if exists public.topic_announcement_contacts
  set schema private;

alter table if exists public.topic_announcement_contact_verifications
  set schema private;

alter table if exists public.topic_announcement_batches
  set schema private;

alter table if exists public.topic_announcements
  set schema private;

alter table if exists public.topic_announcement_recipients
  set schema private;

alter table if exists public.topic_announcement_attachments
  set schema private;

alter table if exists public.topic_announcement_templates
  set schema private;

drop trigger if exists topic_announcement_contacts_updated_at
  on private.topic_announcement_contacts;
drop trigger if exists topic_announcement_contact_verifications_updated_at
  on private.topic_announcement_contact_verifications;
drop trigger if exists topic_announcements_updated_at
  on private.topic_announcements;
drop trigger if exists topic_announcement_templates_updated_at
  on private.topic_announcement_templates;
drop trigger if exists topic_announcement_contacts_scope_guard
  on private.topic_announcement_contacts;
drop trigger if exists topic_announcement_contact_verifications_scope_guard
  on private.topic_announcement_contact_verifications;
drop trigger if exists topic_announcements_scope_guard
  on private.topic_announcements;
drop trigger if exists topic_announcement_recipients_scope_guard
  on private.topic_announcement_recipients;
drop trigger if exists topic_announcement_attachments_scope_guard
  on private.topic_announcement_attachments;

drop function if exists public.enforce_topic_announcement_contact_scope();
drop function if exists public.enforce_topic_announcement_verification_scope();
drop function if exists public.enforce_topic_announcement_scope();
drop function if exists public.enforce_topic_announcement_recipient_scope();
drop function if exists public.enforce_topic_announcement_attachment_scope();
drop function if exists public.topic_announcement_contact_has_linked_verified_email(uuid);

create or replace function private.enforce_topic_announcement_contact_scope()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  new.email := lower(btrim(new.email));
  new.name := btrim(new.name);

  if new.workspace_user_id is not null and not exists (
    select 1
    from public.workspace_users workspace_user
    where workspace_user.id = new.workspace_user_id
      and workspace_user.ws_id = new.ws_id
  ) then
    raise exception 'workspace_user_id does not belong to ws_id';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_topic_announcement_verification_scope()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  new.email := lower(btrim(new.email));

  if not exists (
    select 1
    from private.topic_announcement_contacts contact
    where contact.id = new.contact_id
      and contact.ws_id = new.ws_id
      and lower(contact.email) = new.email
  ) then
    raise exception 'contact_id/email does not belong to ws_id';
  end if;

  if new.status = 'verified' and new.verified_at is null then
    new.verified_at := now();
  end if;

  return new;
end;
$$;

create or replace function private.enforce_topic_announcement_scope()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  new.title := btrim(new.title);
  new.topic := btrim(new.topic);

  if new.batch_id is not null and not exists (
    select 1
    from private.topic_announcement_batches batch
    where batch.id = new.batch_id
      and batch.ws_id = new.ws_id
  ) then
    raise exception 'batch_id does not belong to ws_id';
  end if;

  if new.group_id is not null and not exists (
    select 1
    from public.workspace_user_groups user_group
    where user_group.id = new.group_id
      and user_group.ws_id = new.ws_id
  ) then
    raise exception 'group_id does not belong to ws_id';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_topic_announcement_recipient_scope()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  announcement_ws_id uuid;
begin
  select announcement.ws_id
    into announcement_ws_id
  from private.topic_announcements announcement
  where announcement.id = new.announcement_id;

  if announcement_ws_id is null then
    raise exception 'announcement_id does not exist';
  end if;

  if not exists (
    select 1
    from private.topic_announcement_contacts contact
    where contact.id = new.contact_id
      and contact.ws_id = announcement_ws_id
      and contact.archived = false
  ) then
    raise exception 'contact_id does not belong to announcement ws_id';
  end if;

  return new;
end;
$$;

create or replace function private.enforce_topic_announcement_attachment_scope()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
declare
  attachment_count integer;
  attachment_total bigint;
begin
  new.storage_path := btrim(new.storage_path);
  new.file_name := btrim(new.file_name);
  new.content_type := lower(btrim(new.content_type));
  new.storage_provider := lower(btrim(new.storage_provider));

  if not exists (
    select 1
    from private.topic_announcements announcement
    where announcement.id = new.announcement_id
      and announcement.ws_id = new.ws_id
  ) then
    raise exception 'announcement_id does not belong to ws_id';
  end if;

  select count(*)::integer, coalesce(sum(size_bytes), 0)::bigint
    into attachment_count, attachment_total
  from private.topic_announcement_attachments attachment
  where attachment.announcement_id = new.announcement_id
    and attachment.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if attachment_count >= 5 then
    raise exception 'topic announcement attachments cannot exceed 5 files';
  end if;

  if attachment_total + new.size_bytes > 10485760 then
    raise exception 'topic announcement attachments cannot exceed 10 MB total';
  end if;

  return new;
end;
$$;

create or replace function private.topic_announcement_contact_has_linked_verified_email(
  p_contact_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private, auth, pg_temp
as $$
  select exists (
    select 1
    from private.topic_announcement_contacts contact
    join public.workspace_user_linked_users linked_user
      on linked_user.virtual_user_id = contact.workspace_user_id
      and linked_user.ws_id = contact.ws_id
    join public.workspace_members workspace_member
      on workspace_member.ws_id = contact.ws_id
      and workspace_member.user_id = linked_user.platform_user_id
    join auth.users auth_user
      on auth_user.id = linked_user.platform_user_id
    where contact.id = p_contact_id
      and contact.workspace_user_id is not null
      and lower(auth_user.email) = lower(contact.email)
      and auth_user.email_confirmed_at is not null
  );
$$;

create trigger topic_announcement_contacts_updated_at
  before update on private.topic_announcement_contacts
  for each row
  execute function public.update_updated_at_column();

create trigger topic_announcement_contact_verifications_updated_at
  before update on private.topic_announcement_contact_verifications
  for each row
  execute function public.update_updated_at_column();

create trigger topic_announcements_updated_at
  before update on private.topic_announcements
  for each row
  execute function public.update_updated_at_column();

create trigger topic_announcement_templates_updated_at
  before update on private.topic_announcement_templates
  for each row
  execute function public.update_updated_at_column();

create trigger topic_announcement_contacts_scope_guard
  before insert or update on private.topic_announcement_contacts
  for each row
  execute function private.enforce_topic_announcement_contact_scope();

create trigger topic_announcement_contact_verifications_scope_guard
  before insert or update on private.topic_announcement_contact_verifications
  for each row
  execute function private.enforce_topic_announcement_verification_scope();

create trigger topic_announcements_scope_guard
  before insert or update on private.topic_announcements
  for each row
  execute function private.enforce_topic_announcement_scope();

create trigger topic_announcement_recipients_scope_guard
  before insert or update on private.topic_announcement_recipients
  for each row
  execute function private.enforce_topic_announcement_recipient_scope();

create trigger topic_announcement_attachments_scope_guard
  before insert or update on private.topic_announcement_attachments
  for each row
  execute function private.enforce_topic_announcement_attachment_scope();

alter table private.topic_announcement_contacts enable row level security;
alter table private.topic_announcement_contact_verifications enable row level security;
alter table private.topic_announcement_batches enable row level security;
alter table private.topic_announcements enable row level security;
alter table private.topic_announcement_recipients enable row level security;
alter table private.topic_announcement_attachments enable row level security;
alter table private.topic_announcement_templates enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'private'
      and tablename in (
        'topic_announcement_contacts',
        'topic_announcement_contact_verifications',
        'topic_announcement_batches',
        'topic_announcements',
        'topic_announcement_recipients',
        'topic_announcement_attachments',
        'topic_announcement_templates'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end;
$$;

create policy "Allow service role to manage topic announcement contacts"
  on private.topic_announcement_contacts
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy "Allow service role to manage topic announcement contact verifications"
  on private.topic_announcement_contact_verifications
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy "Allow service role to manage topic announcement batches"
  on private.topic_announcement_batches
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy "Allow service role to manage topic announcements"
  on private.topic_announcements
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy "Allow service role to manage topic announcement recipients"
  on private.topic_announcement_recipients
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy "Allow service role to manage topic announcement attachments"
  on private.topic_announcement_attachments
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

create policy "Allow service role to manage topic announcement templates"
  on private.topic_announcement_templates
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

revoke all privileges on table private.topic_announcement_contacts
from public, anon, authenticated;
revoke all privileges on table private.topic_announcement_contact_verifications
from public, anon, authenticated;
revoke all privileges on table private.topic_announcement_batches
from public, anon, authenticated;
revoke all privileges on table private.topic_announcements
from public, anon, authenticated;
revoke all privileges on table private.topic_announcement_recipients
from public, anon, authenticated;
revoke all privileges on table private.topic_announcement_attachments
from public, anon, authenticated;
revoke all privileges on table private.topic_announcement_templates
from public, anon, authenticated;

grant all privileges on table private.topic_announcement_contacts to service_role;
grant all privileges on table private.topic_announcement_contact_verifications to service_role;
grant all privileges on table private.topic_announcement_batches to service_role;
grant all privileges on table private.topic_announcements to service_role;
grant all privileges on table private.topic_announcement_recipients to service_role;
grant all privileges on table private.topic_announcement_attachments to service_role;
grant all privileges on table private.topic_announcement_templates to service_role;

revoke execute on function private.enforce_topic_announcement_contact_scope()
from public, anon, authenticated;
revoke execute on function private.enforce_topic_announcement_verification_scope()
from public, anon, authenticated;
revoke execute on function private.enforce_topic_announcement_scope()
from public, anon, authenticated;
revoke execute on function private.enforce_topic_announcement_recipient_scope()
from public, anon, authenticated;
revoke execute on function private.enforce_topic_announcement_attachment_scope()
from public, anon, authenticated;
revoke execute on function private.topic_announcement_contact_has_linked_verified_email(uuid)
from public, anon, authenticated;

grant execute on function private.enforce_topic_announcement_contact_scope()
to service_role;
grant execute on function private.enforce_topic_announcement_verification_scope()
to service_role;
grant execute on function private.enforce_topic_announcement_scope()
to service_role;
grant execute on function private.enforce_topic_announcement_recipient_scope()
to service_role;
grant execute on function private.enforce_topic_announcement_attachment_scope()
to service_role;
grant execute on function private.topic_announcement_contact_has_linked_verified_email(uuid)
to service_role;
