create policy "allow delete access for creator workspace"
on "public"."workspace_subscription"
as permissive
for delete
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))));



