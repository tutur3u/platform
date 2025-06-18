drop policy "only allow owner of the user to buy subscription" on "public"."workspace_subscription";

create policy "only allow owner of the user to buy subscription"
on "public"."workspace_subscription"
as permissive
for insert
to authenticated
with check ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))));



