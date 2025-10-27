alter policy "Enable update respecting personal workspace and roles"
on "public"."workspaces"
as permissive
for update
to authenticated
using ((((get_user_role(auth.uid(), id) = 'OWNER'::text) OR (get_user_role(auth.uid(), id) = 'ADMIN'::text)) AND ((personal = false) OR (get_workspace_member_count(id) = 1))))
with check ((((get_user_role(auth.uid(), id) = 'OWNER'::text) OR (get_user_role(auth.uid(), id) = 'ADMIN'::text)) AND ((personal = false) OR (get_workspace_member_count(id) = 1))));