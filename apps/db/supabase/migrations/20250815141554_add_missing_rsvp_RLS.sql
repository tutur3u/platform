create policy "Event creators can delete attendees"
on "public"."event_attendees"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM workspace_scheduled_events
  WHERE ((workspace_scheduled_events.id = event_attendees.event_id) AND (workspace_scheduled_events.creator_id = auth.uid())))));


create policy "Event creators can insert attendees"
on "public"."event_attendees"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM workspace_scheduled_events
  WHERE ((workspace_scheduled_events.id = event_attendees.event_id) AND (workspace_scheduled_events.creator_id = auth.uid())))));



