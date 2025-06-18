drop policy "only allow owner of the user to buy subscription" on "public"."workspace_subscription";

create policy "only allow owner of the user to buy subscription"
on "public"."workspace_subscription"
as permissive
for insert
to authenticated
with check ((auth.uid() = ( SELECT workspaces.creator_id
   FROM workspaces
  WHERE (workspaces.id = workspace_subscription.ws_id))));



