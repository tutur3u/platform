-- Add unique index on workspace_calendar_events for ws_id and google_event_id
CREATE UNIQUE INDEX workspace_calendar_events_google_event_id_key 
ON public.workspace_calendar_events 
USING btree (ws_id, google_event_id); 