drop policy "Allow workspace owners to have full permissions" on "public"."workspace_default_permissions";

create policy "Allow workspace owners to have full permissions"
on "public"."workspace_default_permissions"
as permissive
for all
to authenticated
using (((get_user_role(auth.uid(), ws_id) = 'OWNER'::text) OR (EXISTS ( SELECT wss.id,
    wss.name,
    wss.created_at,
    wss.deleted,
    wss.handle,
    wss.avatar_url,
    wss.logo_url,
    wss.creator_id
   FROM workspaces wss
  WHERE ((wss.id = workspace_default_permissions.ws_id) AND (wss.creator_id = auth.uid()))))))
with check (((get_user_role(auth.uid(), ws_id) = 'OWNER'::text) OR (EXISTS ( SELECT wss.id,
    wss.name,
    wss.created_at,
    wss.deleted,
    wss.handle,
    wss.avatar_url,
    wss.logo_url,
    wss.creator_id
   FROM workspaces wss
  WHERE ((wss.id = workspace_default_permissions.ws_id) AND (wss.creator_id = auth.uid()))))));



