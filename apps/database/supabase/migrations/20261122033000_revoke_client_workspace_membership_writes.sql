set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy "Allow workspace managers to update members" on public.workspace_members;
drop policy "Allow workspace managers to delete members" on public.workspace_members;

-- Keep the read predicates available to role managers.
drop policy "Allow role managers to manage role members" on public.workspace_role_members;
create policy "Allow role managers to read role members"
  on public.workspace_role_members as permissive for select to authenticated
  using (public.has_workspace_permission(
    (select wr.ws_id from public.workspace_roles wr where wr.id = workspace_role_members.role_id),
    (select auth.uid()), 'manage_workspace_roles'::text
  ));

drop policy "Allow role managers to manage permissions" on public.workspace_role_permissions;
create policy "Allow role managers to read permissions"
  on public.workspace_role_permissions as permissive for select to authenticated
  using (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text));

drop policy "Allow role managers to manage roles" on public.workspace_roles;
create policy "Allow role managers to read roles"
  on public.workspace_roles as permissive for select to authenticated
  using (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text));

drop policy "Allow role managers to manage default permissions" on public.workspace_default_permissions;
create policy "Allow role managers to read default permissions"
  on public.workspace_default_permissions as permissive for select to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text)
    or exists (
      select wss.id from public.workspaces wss
      where wss.id = workspace_default_permissions.ws_id
        and wss.creator_id = (select auth.uid())
    )
  );

revoke insert, update, delete, truncate, trigger, references
  on table public.workspace_role_members, public.workspace_role_permissions,
    public.workspace_roles, public.workspace_default_permissions
  from public, anon, authenticated;

revoke update, delete, truncate, trigger, references
  on table public.workspace_members from public, anon, authenticated;
revoke insert on table public.workspace_members from public, anon;

revoke insert, update, delete, truncate, trigger, references
  on table public.workspace_invites, public.workspace_email_invites from public, anon;
revoke truncate, trigger, references
  on table public.workspace_invites, public.workspace_email_invites from authenticated;

-- tuturuuu: reviewed(dynamic-sql-review): apps/database/verification/workspace-client-membership-writes-rollback-roundtrip.sql
do $$
declare
  relation_name text;
  client_role text;
  operation text;
  operations text[];
  removed_policy text;
  replacement_policy text;
begin
  foreach relation_name in array array[
    'workspace_members', 'workspace_role_members', 'workspace_role_permissions',
    'workspace_roles', 'workspace_default_permissions',
    'workspace_invites', 'workspace_email_invites'
  ] loop
    foreach client_role in array array['anon', 'authenticated'] loop
      operations := case
        when client_role = 'authenticated' and relation_name = 'workspace_members'
          then array['UPDATE', 'DELETE', 'TRUNCATE']
        when client_role = 'authenticated' and relation_name in ('workspace_invites', 'workspace_email_invites')
          then array['TRUNCATE']
        else array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
      end;

      foreach operation in array operations loop
        if pg_catalog.has_table_privilege(client_role, pg_catalog.format('public.%I', relation_name), operation) then
          raise exception '% still has % on public.%', client_role, operation, relation_name
            using errcode = '42501';
        end if;
        if operation in ('INSERT', 'UPDATE') and
          pg_catalog.has_any_column_privilege(client_role, pg_catalog.format('public.%I', relation_name), operation) then
          raise exception '% still has column-level % on public.%', client_role, operation, relation_name
            using errcode = '42501';
        end if;
      end loop;
    end loop;
  end loop;

  for relation_name, removed_policy, replacement_policy in
    values
      ('workspace_members', 'Allow workspace managers to update members', null),
      ('workspace_members', 'Allow workspace managers to delete members', null),
      ('workspace_role_members', 'Allow role managers to manage role members', 'Allow role managers to read role members'),
      ('workspace_role_permissions', 'Allow role managers to manage permissions', 'Allow role managers to read permissions'),
      ('workspace_roles', 'Allow role managers to manage roles', 'Allow role managers to read roles'),
      ('workspace_default_permissions', 'Allow role managers to manage default permissions', 'Allow role managers to read default permissions')
  loop
    if exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = relation_name and policyname = removed_policy
    ) then
      raise exception 'Write policy "%" still exists on public.%', removed_policy, relation_name;
    end if;

    if replacement_policy is not null and not exists (
      select 1 from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = relation_name and policyname = replacement_policy
        and cmd = 'SELECT' and permissive = 'PERMISSIVE' and roles = array['authenticated']::name[]
    ) then
      raise exception 'SELECT policy "%" is missing for authenticated on public.%', replacement_policy, relation_name;
    end if;
  end loop;
end;
$$;
