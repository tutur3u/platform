create policy "Enable read access for workspace users"
on "public"."workspace_default_permissions"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));


create policy "Enable read access for workspace users"
on "public"."workspace_role_permissions"
as permissive
for select
to authenticated
using (is_org_member(auth.uid(), ws_id));



