-- Drop all existing RLS policies on workspace_subscription
drop policy "allow select for users that are in the workspace" on "public"."workspace_subscription";
drop policy "only allow owner of the user to buy subscription" on "public"."workspace_subscription";
drop policy "allow delete access for creator workspace" on "public"."workspace_subscription";

-- Allow workspace members to view subscriptions (SELECT)
create policy "allow workspace members to view subscriptions"
on "public"."workspace_subscription"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.user_id = auth.uid()) AND (wm.ws_id = workspace_subscription.ws_id)))));

-- Allow workspace owner to create subscriptions (INSERT)
create policy "allow workspace owner to create subscriptions"
on "public"."workspace_subscription"
as permissive
for insert
to authenticated
with check ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))));

-- Allow workspace owner to edit subscriptions (UPDATE)
create policy "allow workspace owner to edit subscriptions"
on "public"."workspace_subscription"
as permissive
for update
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))));

-- Allow workspace owner to delete subscriptions (DELETE)
create policy "allow workspace owner to delete subscriptions"
on "public"."workspace_subscription"
as permissive
for delete
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))));
