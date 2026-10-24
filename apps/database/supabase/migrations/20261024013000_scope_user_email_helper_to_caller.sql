-- Scope the email lookup used by notification access checks to the caller.
--
-- public.get_user_email(uuid) read any account's email with definer rights and
-- was executable by every API role. Replace it with a zero-argument helper that
-- only resolves the current session's own email, repoint every policy and
-- function that used the old helper, and drop the old helper.
--
-- The helper stays in public because RLS policies run as the querying role and
-- the private schema is intentionally not usable by API roles.

create or replace function public.get_current_user_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from auth.users as u
  where u.id = (select auth.uid());
$$;

comment on function public.get_current_user_email() is
  'Returns the email of the current authenticated session only. Used by notification RLS policies.';

revoke all on function public.get_current_user_email()
  from public, anon, authenticated;

grant execute on function public.get_current_user_email()
  to authenticated, service_role;

-- Notification policies: same row semantics as before, now resolved through the
-- caller-scoped helper and limited to authenticated sessions (anon never
-- matched a row because it has no user id or email).

drop policy if exists notifications_select_policy on public.notifications;

create policy notifications_select_policy on public.notifications
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      email is not null
      and email = (select public.get_current_user_email())
    )
  );

comment on policy notifications_select_policy on public.notifications is
  'Users can only view notifications assigned to them by user id or by their own email.';

drop policy if exists notifications_update_policy on public.notifications;

create policy notifications_update_policy on public.notifications
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      email is not null
      and email = (select public.get_current_user_email())
    )
  )
  with check (
    user_id = (select auth.uid())
    or (
      email is not null
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
      email is not null
      and email = (select public.get_current_user_email())
    )
  );

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
    where email = v_email
      and (user_id is null or user_id <> v_user_id)
    returning id
  )
  select count(*)::integer into v_count from updated;

  return query select v_count;
end;
$$;

revoke all on function public.sync_my_notifications()
  from public, anon, authenticated;

grant execute on function public.sync_my_notifications()
  to authenticated, service_role;

-- Nothing references the old helper any more. DROP without CASCADE fails if a
-- policy or function still depends on it, which fences a missed reference.
revoke all on function public.get_user_email(uuid)
  from public, anon, authenticated;

drop function public.get_user_email(uuid);
