create policy "allow select for users that are in the workspace"
on "public"."workspace_subscription"
as permissive
for select
to authenticated
using ((auth.uid() = ( SELECT workspaces.creator_id
   FROM workspaces
  WHERE (workspaces.id = workspace_subscription.ws_id))));


create policy "only allow owner of the user to buy subscription"
on "public"."workspace_subscription"
as permissive
for select
to public
using ((auth.uid() = ( SELECT workspaces.creator_id
   FROM workspaces
  WHERE (workspaces.id = workspace_subscription.ws_id))));



