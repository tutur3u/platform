-- Any workspace member could insert, change or delete course and group rows
-- and roster rows, so a learner could enrol themselves or edit a course.
-- Reads stay member-wide. Writes now need the group permission the server
-- routes already check:
--   workspace_user_groups: insert create_user_groups, update
--     update_user_groups, delete delete_user_groups or update_user_groups
--     (the Teach course DELETE route checks update_user_groups).
--   workspace_user_groups_users: update_user_groups. Roster changes in the
--     apps go through the audited service-role RPCs after that check.
-- The creator TEACHER assignment trigger is SECURITY DEFINER and is not
-- affected.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop policy if exists "Enable all access for organization members"
  on public.workspace_user_groups;
drop policy if exists workspace_user_groups_select_members
  on public.workspace_user_groups;
drop policy if exists workspace_user_groups_insert_group_creators
  on public.workspace_user_groups;
drop policy if exists workspace_user_groups_update_group_managers
  on public.workspace_user_groups;
drop policy if exists workspace_user_groups_delete_group_managers
  on public.workspace_user_groups;

create policy workspace_user_groups_select_members
  on public.workspace_user_groups
  for select
  to authenticated
  using (public.is_org_member((select auth.uid()), ws_id));

create policy workspace_user_groups_insert_group_creators
  on public.workspace_user_groups
  for insert
  to authenticated
  with check (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'create_user_groups')
  );

create policy workspace_user_groups_update_group_managers
  on public.workspace_user_groups
  for update
  to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  )
  with check (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  );

create policy workspace_user_groups_delete_group_managers
  on public.workspace_user_groups
  for delete
  to authenticated
  using (
    public.has_workspace_permission(ws_id, (select auth.uid()), 'delete_user_groups')
    or public.has_workspace_permission(ws_id, (select auth.uid()), 'update_user_groups')
  );

drop policy if exists "Enable all access for organization members"
  on public.workspace_user_groups_users;
drop policy if exists workspace_user_groups_users_select_members
  on public.workspace_user_groups_users;
drop policy if exists workspace_user_groups_users_insert_group_managers
  on public.workspace_user_groups_users;
drop policy if exists workspace_user_groups_users_update_group_managers
  on public.workspace_user_groups_users;
drop policy if exists workspace_user_groups_users_delete_group_managers
  on public.workspace_user_groups_users;

create policy workspace_user_groups_users_select_members
  on public.workspace_user_groups_users
  for select
  to authenticated
  using (
    public.is_org_member(
      (select auth.uid()),
      (
        select grp.ws_id
        from public.workspace_user_groups as grp
        where grp.id = workspace_user_groups_users.group_id
      )
    )
  );

create policy workspace_user_groups_users_insert_group_managers
  on public.workspace_user_groups_users
  for insert
  to authenticated
  with check (
    public.has_workspace_permission(
      (
        select grp.ws_id
        from public.workspace_user_groups as grp
        where grp.id = workspace_user_groups_users.group_id
      ),
      (select auth.uid()),
      'update_user_groups'
    )
  );

create policy workspace_user_groups_users_update_group_managers
  on public.workspace_user_groups_users
  for update
  to authenticated
  using (
    public.has_workspace_permission(
      (
        select grp.ws_id
        from public.workspace_user_groups as grp
        where grp.id = workspace_user_groups_users.group_id
      ),
      (select auth.uid()),
      'update_user_groups'
    )
  )
  with check (
    public.has_workspace_permission(
      (
        select grp.ws_id
        from public.workspace_user_groups as grp
        where grp.id = workspace_user_groups_users.group_id
      ),
      (select auth.uid()),
      'update_user_groups'
    )
  );

create policy workspace_user_groups_users_delete_group_managers
  on public.workspace_user_groups_users
  for delete
  to authenticated
  using (
    public.has_workspace_permission(
      (
        select grp.ws_id
        from public.workspace_user_groups as grp
        where grp.id = workspace_user_groups_users.group_id
      ),
      (select auth.uid()),
      'update_user_groups'
    )
  );

revoke truncate on table public.workspace_user_groups from authenticated;
revoke truncate on table public.workspace_user_groups_users from authenticated;
