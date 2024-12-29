drop policy "Enable all access for workspace admin and owner" on "public"."workspace_secrets";

drop policy "Enable insert for organization members" on "public"."workspace_invites";

create policy "Enable all access for root workspace admin and owner"
on "public"."workspace_secrets"
as permissive
for all
to authenticated
using ((((get_user_role(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) = 'ADMIN'::text) OR (get_user_role(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) = 'OWNER'::text)) AND is_org_member(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)))
with check ((((get_user_role(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) = 'ADMIN'::text) OR (get_user_role(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) = 'OWNER'::text)) AND is_org_member(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)));


create policy "Enable insert for organization members"
on "public"."workspace_invites"
as permissive
for insert
to authenticated
with check ((is_org_member(auth.uid(), ws_id) AND (NOT is_org_member(user_id, ws_id)) AND (NOT (EXISTS ( SELECT 1
   FROM workspace_secrets wss
  WHERE (wss.name = 'DISABLE_INVITE'::text))))));



