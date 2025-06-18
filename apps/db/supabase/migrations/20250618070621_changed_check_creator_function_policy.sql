set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_ws_creator(ws_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$BEGIN
  RETURN (
    (
      SELECT creator_id FROM public.workspaces WHERE id = check_ws_creator.ws_id
    ) = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_subscription
      WHERE public.workspace_subscription.ws_id = check_ws_creator.ws_id
    )
  );
END;$function$
;

drop policy "only allow owner of the user to buy subscription" on "public"."workspace_subscription";

create policy "only allow owner of the user to buy subscription"
on "public"."workspace_subscription"
as permissive
for insert
to authenticated
with check ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))));

drop policy "allow select for users that are in the workspace" on "public"."workspace_subscription";

create policy "allow select for users that are in the workspace"
on "public"."workspace_subscription"
as permissive
for select
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspace_members wm
  WHERE ((wm.user_id = auth.uid()) AND (wm.ws_id = workspace_subscription.ws_id)))));

create policy "allow delete access for creator workspace"
on "public"."workspace_subscription"
as permissive
for delete
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_subscription.ws_id) AND (workspaces.creator_id = auth.uid())))));