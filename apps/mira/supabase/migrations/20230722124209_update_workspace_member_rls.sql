drop policy "Allow update for workspace members" on "public"."workspace_members";

create policy "Allow update for workspace members"
on "public"."workspace_members"
as permissive
for update
to authenticated
using ((((((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) AND (role <> 'OWNER'::text)) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)) AND is_org_member(auth.uid(), ws_id)) OR ((user_id = auth.uid()) AND (get_user_role(auth.uid(), ws_id) = role))))
with check ((((((get_user_role(auth.uid(), ws_id) = 'ADMIN'::text) AND (role <> 'OWNER'::text)) OR (get_user_role(auth.uid(), ws_id) = 'OWNER'::text)) AND is_org_member(auth.uid(), ws_id)) OR ((user_id = auth.uid()) AND (get_user_role(auth.uid(), ws_id) = role))));



