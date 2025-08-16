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


ALTER TABLE public.workspace_scheduled_events
  DROP CONSTRAINT IF EXISTS workspace_scheduled_events_color_fkey;

ALTER TABLE public.workspace_scheduled_events
  ADD CONSTRAINT workspace_scheduled_events_color_fkey
  FOREIGN KEY (color)
  REFERENCES public.calendar_event_colors(value)
  ON UPDATE CASCADE
  ON DELETE SET DEFAULT;



