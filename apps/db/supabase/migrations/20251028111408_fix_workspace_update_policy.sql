drop policy if exists "Enable update respecting personal workspace and roles"
on "public"."workspaces";

create policy "Enable update respecting personal workspace and roles"
on "public"."workspaces"
as permissive
for update
to authenticated
using (
  has_workspace_permission(id, auth.uid(), 'manage_workspace_settings')
  AND ((personal = false) OR (get_workspace_member_count(id) = 1))
)
with check (
  has_workspace_permission(id, auth.uid(), 'manage_workspace_settings')
  AND ((personal = false) OR (get_workspace_member_count(id) = 1))
);