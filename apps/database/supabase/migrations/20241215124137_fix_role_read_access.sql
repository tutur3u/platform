drop policy "Enable read access for workspace users" on "public"."workspace_role_permissions";

create policy "Allow role members to view"
on "public"."workspace_role_members"
as permissive
for select
to authenticated
using ((user_id = auth.uid()));


create policy "Allow role member to view"
on "public"."workspace_roles"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspaces wss
  WHERE (wss.id = workspace_roles.ws_id))));


create policy "Enable read access for workspace users"
on "public"."workspace_role_permissions"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_role_members wrm
  WHERE (wrm.role_id = workspace_role_permissions.role_id))));



