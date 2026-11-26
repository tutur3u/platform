-- Mail domains are platform-managed. Provision only the root-owned reviewer
-- and staff domain pair for cross-domain catch-all.
alter table private.mail_domains
  add column catch_all_domain_id uuid references private.mail_domains(id) on delete restrict;

update private.mail_domains as ingress
set catch_all_domain_id = destination.id
from private.mail_domains as destination
where ingress.domain = 'tutur3u.com'
  and destination.domain = 'tuturuuu.com';

create table private.mail_catch_all_audit (
  id bigint generated always as identity primary key,
  domain_id uuid not null,
  actor_id uuid not null,
  previous_settings jsonb not null,
  new_settings jsonb not null,
  created_at timestamptz not null default now()
);

alter table private.mail_catch_all_audit enable row level security;
revoke all on private.mail_catch_all_audit from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create or replace function private.enforce_mail_domain_catch_all_target()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid;
  previous_settings jsonb;
  new_settings jsonb;
  database_maintenance boolean :=
    pg_has_role(session_user, 'postgres', 'MEMBER')
    and coalesce(nullif(current_setting('role', true), 'none'), session_user::text)
      not in ('service_role', 'authenticated', 'anon', 'authenticator');
begin
  if tg_op = 'UPDATE' and new.catch_all_domain_id is distinct from old.catch_all_domain_id
     and not database_maintenance then
    raise exception 'Catch-all destination domains are managed through migrations' using errcode = '42501';
  end if;

  if new.catch_all_domain_id is not null and (
    new.domain <> 'tutur3u.com' or not exists (
      select 1 from private.mail_domains
      where id = new.catch_all_domain_id and domain = 'tuturuuu.com'
    )
  ) then
    raise exception 'catch-all destination domain is not authorized' using errcode = '23514';
  end if;

  if new.catch_all_mailbox_id is not null and not exists (
    select 1 from private.mail_mailboxes as mailbox
    where mailbox.id = new.catch_all_mailbox_id
      and mailbox.status = 'active'
      and (
        mailbox.domain_id = coalesce(new.canonical_domain_id, new.id)
        or mailbox.domain_id = new.catch_all_domain_id
      )
    for share
  ) then
    raise exception 'catch-all mailbox must be active and belong to the authorized destination domain'
      using errcode = '23514';
  end if;

  new_settings := jsonb_build_object(
    'enabled', new.catch_all_enabled,
    'target_mailbox_id', new.catch_all_mailbox_id,
    'auto_draft_enabled', new.catch_all_auto_draft_enabled
  );
  if tg_op = 'UPDATE' then
    previous_settings := jsonb_build_object(
      'enabled', old.catch_all_enabled,
      'target_mailbox_id', old.catch_all_mailbox_id,
      'auto_draft_enabled', old.catch_all_auto_draft_enabled
    );
  else
    previous_settings := '{"enabled":false,"target_mailbox_id":null,"auto_draft_enabled":false}'::jsonb;
  end if;
  if new_settings = previous_settings then
    return new;
  end if;

  -- Allow database-owner maintenance and migrations outside PostgREST.
  if database_maintenance then
    return new;
  end if;

  actor_id := nullif(current_setting('tuturuuu.mail_catch_all_actor', true), '')::uuid;
  if actor_id is null or not exists (
    select 1 from public.workspace_members
    where ws_id = '00000000-0000-0000-0000-000000000000'
      and user_id = actor_id and type = 'MEMBER'
    for share
  ) then
    raise exception 'Root workspace admin required' using errcode = '42501';
  end if;
  insert into private.mail_catch_all_audit (domain_id, actor_id, previous_settings, new_settings)
  values (new.id, actor_id, previous_settings, new_settings);

  return new;
end;
$$;

revoke all on function private.enforce_mail_domain_catch_all_target() from public, anon, authenticated, service_role;

drop trigger enforce_mail_domain_catch_all_target on private.mail_domains;
create trigger enforce_mail_domain_catch_all_target
  before insert or update of domain, catch_all_enabled, catch_all_mailbox_id,
    catch_all_auto_draft_enabled, canonical_domain_id, catch_all_domain_id
  on private.mail_domains
  for each row execute function private.enforce_mail_domain_catch_all_target();

create function private.set_mail_domain_catch_all(
  p_actor_id uuid, p_domain_id uuid, p_enabled boolean,
  p_target_mailbox_id uuid, p_auto_draft_enabled boolean
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  updated boolean;
begin
  if not exists (
    select 1 from public.workspace_members
    where ws_id = '00000000-0000-0000-0000-000000000000'
      and user_id = p_actor_id and type = 'MEMBER'
  ) then
    raise exception 'Root workspace admin required' using errcode = '42501';
  end if;
  perform set_config('tuturuuu.mail_catch_all_actor', p_actor_id::text, true);
  update private.mail_domains
  set catch_all_enabled = p_enabled,
      catch_all_mailbox_id = p_target_mailbox_id,
      catch_all_auto_draft_enabled = p_auto_draft_enabled
  where id = p_domain_id;
  updated := found;
  perform set_config('tuturuuu.mail_catch_all_actor', '', true);
  return updated;
end;
$$;

revoke all on function private.set_mail_domain_catch_all(uuid, uuid, boolean, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.set_mail_domain_catch_all(uuid, uuid, boolean, uuid, boolean)
  to service_role;
