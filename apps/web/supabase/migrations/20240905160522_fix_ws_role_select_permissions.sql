drop policy "Enable read access for workspace users" on "public"."workspace_role_permissions";

create policy "Enable read access for workspace users"
on "public"."workspace_role_permissions"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_roles wr
  WHERE (wr.id = workspace_role_permissions.role_id))));



