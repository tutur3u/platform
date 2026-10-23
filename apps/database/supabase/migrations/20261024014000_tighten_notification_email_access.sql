-- Tighten email-based notification access.
--
-- Email-addressed notification rows exist so a workspace invitation can reach
-- someone before they have an account. This migration:
--   * limits email matching to unclaimed invitation rows;
--   * claims those rows only for a confirmed address, at confirmation time;
--   * stops keeping an address copy on rows that already have a recipient;
--   * removes a deleted account's notifications with the account;
--   * stores addresses trimmed and lowercased;
--   * removes direct table access for API roles. Every notification read and
--     write goes through server routes using the service role.
-- See apps/docs/platform/features/notification-access.mdx.

-- 1. The caller-scoped helper resolves only a confirmed, normalized address.
create or replace function public.get_current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(lower(btrim(u.email::text)), '')
  from auth.users as u
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null;
$$;

comment on function public.get_current_user_email() is
  'Returns the confirmed, lowercased email of the current authenticated session only.';

-- 2. Normalize addresses on every write path. Rows addressed to an account do
--    not keep an address copy; only unclaimed rows are addressed by email.
create or replace function private.normalize_notification_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is not null then
    new.email := null;
  else
    new.email := nullif(lower(btrim(new.email)), '');
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_notification_email()
  from public, anon, authenticated;

drop trigger if exists normalize_notification_email on public.notifications;

create trigger normalize_notification_email
  before insert or update of email, user_id on public.notifications
  for each row
  execute function private.normalize_notification_email();

-- 3. Existing rows.
-- Rows whose recipient account was deleted lost their user id through the old
-- ON DELETE SET NULL action. Only unclaimed invitations are meant to be
-- addressed by email, so remove the other orphaned rows.
delete from public.notifications
where user_id is null
  and type is distinct from 'workspace_invite';

update public.notifications
set email = null
where user_id is not null
  and email is not null;

update public.notifications
set email = nullif(lower(btrim(email)), '')
where user_id is null
  and email is not null
  and email is distinct from nullif(lower(btrim(email)), '');

-- 4. Deleting an account deletes its notifications instead of orphaning them.
alter table public.notifications
  drop constraint if exists notifications_user_id_fkey;

alter table public.notifications
  add constraint notifications_user_id_fkey
  foreign key (user_id) references public.users(id)
  on delete cascade
  not valid;

alter table public.notifications
  validate constraint notifications_user_id_fkey;

-- 5. Claim unclaimed invitations only for a confirmed address. The previous
--    triggers ran on account creation, before confirmation, and one of them
--    also reassigned rows that belonged to other accounts. Their trigger
--    functions are replaced in place (the migration role owns them but not
--    auth.users), and a trigger is added for confirmation and address changes.
create or replace function private.claim_email_invite_notifications_for(
  p_user_id uuid,
  p_email text,
  p_email_confirmed_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(p_email)), '');
begin
  if p_user_id is null or p_email_confirmed_at is null or v_email is null then
    return;
  end if;

  update public.notifications
  set user_id = p_user_id
  where user_id is null
    and type = 'workspace_invite'
    and email = v_email;
end;
$$;

revoke all on function private.claim_email_invite_notifications_for(uuid, text, timestamptz)
  from public, anon, authenticated;

create or replace function private.claim_email_invite_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.claim_email_invite_notifications_for(
    new.id,
    new.email::text,
    new.email_confirmed_at
  );
  return new;
end;
$$;

revoke all on function private.claim_email_invite_notifications()
  from public, anon, authenticated;

-- Existing AFTER INSERT triggers on auth.users keep their names and now claim
-- only for an address that is already confirmed at creation.
create or replace function public.migrate_email_notifications_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.claim_email_invite_notifications_for(
    new.id,
    new.email::text,
    new.email_confirmed_at
  );
  return new;
end;
$$;

create or replace function public.migrate_email_notifications_on_login()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.claim_email_invite_notifications_for(
    new.id,
    new.email::text,
    new.email_confirmed_at
  );
  return new;
end;
$$;

revoke all on function public.migrate_email_notifications_on_signup()
  from public, anon, authenticated;

revoke all on function public.migrate_email_notifications_on_login()
  from public, anon, authenticated;

-- The trigger name sorts after create_user_profile, so the public.users row
-- that the notification foreign key needs exists before this fires.
create trigger trigger_claim_email_invite_notifications_on_confirm
  after update of email, email_confirmed_at on auth.users
  for each row
  when (
    new.email_confirmed_at is not null
    and (
      old.email_confirmed_at is null
      or old.email is distinct from new.email
    )
  )
  execute function private.claim_email_invite_notifications();

create or replace function public.sync_my_notifications()
returns table(updated_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := public.get_current_user_email();
  v_count integer;
begin
  if v_user_id is null or v_email is null then
    return query select 0;
    return;
  end if;

  with updated as (
    update public.notifications
    set user_id = v_user_id
    where user_id is null
      and type = 'workspace_invite'
      and email = v_email
    returning id
  )
  select count(*)::integer into v_count from updated;

  return query select v_count;
end;
$$;

comment on function public.sync_my_notifications() is
  'Claims unclaimed workspace invitation notifications addressed to the caller''s confirmed email.';

-- 6. Policies: email matching only for unclaimed invitations. Kept as defence
--    in depth; API roles no longer hold table privileges (step 7).
drop policy if exists notifications_select_policy on public.notifications;

create policy notifications_select_policy on public.notifications
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      user_id is null
      and type = 'workspace_invite'
      and email = (select public.get_current_user_email())
    )
  );

comment on policy notifications_select_policy on public.notifications is
  'Users see notifications assigned to them and unclaimed workspace invitations addressed to their confirmed email.';

drop policy if exists notifications_update_policy on public.notifications;

create policy notifications_update_policy on public.notifications
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      user_id is null
      and type = 'workspace_invite'
      and email = (select public.get_current_user_email())
    )
  )
  with check (
    user_id = (select auth.uid())
    or (
      user_id is null
      and type = 'workspace_invite'
      and email = (select public.get_current_user_email())
    )
  );

drop policy if exists notifications_delete_policy on public.notifications;

create policy notifications_delete_policy on public.notifications
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      user_id is null
      and type = 'workspace_invite'
      and email = (select public.get_current_user_email())
    )
  );

-- 7. Notifications are server-owned: routes use the service role.
revoke all on table public.notifications from public, anon, authenticated;
grant all on table public.notifications to service_role;

comment on table public.notifications is
  'Server-owned notification records. Read and written through service-role API routes only. Email addressing is limited to unclaimed workspace invitations; see apps/docs/platform/features/notification-access.mdx.';
