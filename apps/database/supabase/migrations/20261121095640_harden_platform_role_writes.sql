drop policy "Admin users can manage platform user roles" on public.platform_user_roles;
drop policy "Admin users can manage platform email roles" on public.platform_email_roles;
drop policy if exists "Enable all access for role manager" on public.platform_email_roles;

revoke insert, update, delete, truncate
  on public.platform_user_roles, public.platform_email_roles
  from public, anon, authenticated;
revoke truncate on public.platform_user_roles, public.platform_email_roles from service_role;

create or replace function public.is_nova_role_manager()
returns boolean
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select from public.platform_user_roles
    where user_id = (select auth.uid()) and enabled and allow_role_management
  );
$$;
revoke all on function public.is_nova_role_manager() from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.is_nova_role_manager() review=platform-role-manager-read-policy
grant execute on function public.is_nova_role_manager() to authenticated, service_role;

create policy "Role managers can read platform user roles"
  on public.platform_user_roles for select to authenticated
  using ((select public.is_nova_role_manager()));
create policy "Role managers can read platform email roles"
  on public.platform_email_roles for select to authenticated
  using ((select public.is_nova_role_manager()));

create table private.platform_role_write_lock (
  singleton boolean primary key check (singleton)
);
alter table private.platform_role_write_lock enable row level security;
revoke all on private.platform_role_write_lock from public, anon, authenticated, service_role;
insert into private.platform_role_write_lock values (true);

-- tuturuuu: no-grant (internal)
create function private.require_platform_role_write_actor()
returns uuid
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  -- The transaction role survives SECURITY DEFINER calls, including whitelist redirects.
  caller_role text := coalesce(nullif(pg_catalog.current_setting('role'), 'none'), session_user::text);
  actor_id uuid;
begin
  if caller_role in ('postgres', 'supabase_auth_admin') then
    return null;
  end if;
  if caller_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Platform role writes require a server role';
  end if;

  -- Updating a common row serializes authority checks and prevents write skew at repeatable read.
  update private.platform_role_write_lock set singleton = true where singleton;
  actor_id := (
    nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb
    ->> 'x-ttr-audit-actor-id'
  )::uuid;
  if not exists (
    select from public.platform_user_roles
    where user_id = actor_id and enabled and allow_role_management
  ) then
    raise exception using errcode = '42501', message = 'Enabled platform role manager required';
  end if;
  return actor_id;
end;
$$;
revoke all on function private.require_platform_role_write_actor() from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
create function private.guard_platform_user_role_write()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  actor_id uuid := private.require_platform_role_write_actor();
  writes_manager boolean := tg_op <> 'DELETE' and coalesce(new.enabled and new.allow_role_management, false);
  had_manager boolean := tg_op <> 'INSERT' and coalesce(old.enabled and old.allow_role_management, false);
begin
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

-- tuturuuu: no-grant (trigger)
create function private.guard_platform_email_role_write()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.require_platform_role_write_actor();
  return null;
end;
$$;
revoke all on function private.guard_platform_email_role_write() from public, anon, authenticated, service_role;

create trigger guard_platform_user_role_write
  after insert or update or delete on public.platform_user_roles
  for each row execute function private.guard_platform_user_role_write();

create trigger guard_platform_email_role_write
  after insert or update or delete on public.platform_email_roles
  for each row execute function private.guard_platform_email_role_write();
