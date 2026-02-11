-- Add google_calendar_id column to track which Google Calendar each event came from
alter table "public"."workspace_calendar_events" add column "google_calendar_id" text;

-- Add index for better query performance when filtering by calendar
create index workspace_calendar_events_google_calendar_id_idx
on public.workspace_calendar_events(google_calendar_id);

-- Add composite index for workspace + calendar queries
create index workspace_calendar_events_ws_id_google_calendar_id_idx
on public.workspace_calendar_events(ws_id, google_calendar_id);
