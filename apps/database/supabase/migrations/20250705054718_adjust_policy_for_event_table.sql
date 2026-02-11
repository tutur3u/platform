drop policy "Enable all access for workspace users" on "public"."workspace_calendar_events";

create policy "Enable all access for workspace users"
on "public"."workspace_calendar_events"
as permissive
for all
to authenticated
using ((EXISTS ( SELECT 1
   FROM workspaces w,
    workspace_members wm
  WHERE ((w.id = workspace_calendar_events.ws_id) AND (wm.user_id = auth.uid()) AND (wm.ws_id = w.id)))))
with check ((EXISTS ( SELECT 1
   FROM workspaces w,
    workspace_members wm
  WHERE ((w.id = workspace_calendar_events.ws_id) AND (wm.user_id = auth.uid()) AND (wm.ws_id = w.id)))));



