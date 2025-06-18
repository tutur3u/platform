drop policy "allow select for users that are in the workspace" on "public"."workspace_subscription";

create policy "allow select for users that are in the workspace"
on "public"."workspace_subscription"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.user_id = auth.uid()) AND (wm.ws_id = workspace_subscription.ws_id)))));



