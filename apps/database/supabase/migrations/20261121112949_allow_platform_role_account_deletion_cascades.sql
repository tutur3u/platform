-- tuturuuu: no-grant (trigger)
create or replace function private.guard_platform_user_role_write()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  caller_role text := coalesce(nullif(pg_catalog.current_setting('role'), 'none'), session_user::text);
  actor_id uuid;
  writes_manager boolean := tg_op <> 'DELETE' and coalesce(new.enabled and new.allow_role_management, false);
  had_manager boolean := tg_op <> 'INSERT' and coalesce(old.enabled and old.allow_role_management, false);
begin
  -- The immediate user foreign key keeps the parent present for standalone role deletes.
  if tg_op = 'DELETE'
    and caller_role in ('service_role', 'postgres', 'supabase_auth_admin')
    and not exists (select from public.users where id = old.user_id)
  then
    -- Serialize removal of an enabled manager with other role writes.
    if had_manager then
      update private.platform_role_write_lock set singleton = true where singleton;
    end if;
    return null;
  end if;

  actor_id := private.require_platform_role_write_actor();
  if actor_id is null and (writes_manager or had_manager) then
    update private.platform_role_write_lock set singleton = true where singleton;
  end if;

  if (tg_op <> 'INSERT' and old.user_id = actor_id)
    or (tg_op <> 'DELETE' and new.user_id = actor_id) then
    raise exception using errcode = '42501', message = 'Cannot change your own platform roles';
  end if;

  if had_manager and not writes_manager and not exists (
    select from public.platform_user_roles where enabled and allow_role_management
  ) then
    raise exception using errcode = 'PT409', message = 'Cannot remove the last enabled platform role manager';
  end if;

  return null;
end;
$$;
revoke all on function private.guard_platform_user_role_write() from public, anon, authenticated, service_role;
