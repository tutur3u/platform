-- Rollback for 20261122033000_revoke_client_workspace_membership_writes.sql.
-- Apply as a new forward migration through the gated database workflow.
-- Restore the signed-in row writes and their policies. Anonymous sessions have
-- no write row policy. The Data API exposes no TRUNCATE, TRIGGER, or REFERENCES
-- operations. The SQL grant guard prohibits restoring those grants or anon DML.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create policy "Allow workspace managers to update members"
  on public.workspace_members as permissive for update to authenticated
  using (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text))
  with check (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text));

create policy "Allow workspace managers to delete members"
  on public.workspace_members as permissive for delete to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_members'::text)
    or (select auth.uid()) = user_id
  );

drop policy "Allow role managers to read role members" on public.workspace_role_members;
create policy "Allow role managers to manage role members"
  on public.workspace_role_members as permissive for all to authenticated
  using (public.has_workspace_permission(
    (select wr.ws_id from public.workspace_roles wr where wr.id = workspace_role_members.role_id),
    (select auth.uid()), 'manage_workspace_roles'::text
  ))
  with check (public.has_workspace_permission(
    (select wr.ws_id from public.workspace_roles wr where wr.id = workspace_role_members.role_id),
    (select auth.uid()), 'manage_workspace_roles'::text
  ));

drop policy "Allow role managers to read permissions" on public.workspace_role_permissions;
create policy "Allow role managers to manage permissions"
  on public.workspace_role_permissions as permissive for all to authenticated
  using (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text))
  with check (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text));

drop policy "Allow role managers to read roles" on public.workspace_roles;
create policy "Allow role managers to manage roles"
  on public.workspace_roles as permissive for all to authenticated
  using (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text))
  with check (public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text));

drop policy "Allow role managers to read default permissions" on public.workspace_default_permissions;
create policy "Allow role managers to manage default permissions"
  on public.workspace_default_permissions as permissive for all to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text)
    or exists (
      select wss.id from public.workspaces wss
      where wss.id = workspace_default_permissions.ws_id
        and wss.creator_id = (select auth.uid())
    )
  )
  with check (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'manage_workspace_roles'::text)
    or exists (
      select wss.id from public.workspaces wss
      where wss.id = workspace_default_permissions.ws_id
        and wss.creator_id = (select auth.uid())
    )
  );

grant update, delete on table public.workspace_members to authenticated;
grant insert, update, delete
  on table public.workspace_role_members, public.workspace_role_permissions,
    public.workspace_roles, public.workspace_default_permissions
  to authenticated;
