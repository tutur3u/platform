-- Drop existing constraint that uses the index
ALTER TABLE public.workspace_calendar_events DROP CONSTRAINT IF EXISTS workspace_calendar_events_google_event_id_key;

-- Drop existing unique index on google_event_id (now safe to drop after constraint removal)
DROP INDEX IF EXISTS workspace_calendar_events_google_event_id_key;

-- Add unique index on workspace_calendar_events for ws_id and google_event_id
-- Requires running outside a transaction block
CREATE UNIQUE INDEX workspace_calendar_events_google_event_id_key
ON public.workspace_calendar_events (ws_id, google_event_id);

-- Add the constraint back using the new index
ALTER TABLE public.workspace_calendar_events 
ADD CONSTRAINT workspace_calendar_events_google_event_id_key 
UNIQUE USING INDEX workspace_calendar_events_google_event_id_key; 