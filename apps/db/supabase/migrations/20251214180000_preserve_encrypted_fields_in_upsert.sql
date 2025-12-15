-- Update upsert function to preserve encrypted fields
-- For encrypted events, never overwrite with plaintext from Google
-- For is_encrypted flag, preserve existing TRUE value (never downgrade from encrypted to unencrypted)
create or replace function public.upsert_calendar_events_and_count(events jsonb)
returns jsonb
language sql
as $$
  with upserted as (
    insert into public.workspace_calendar_events (
      ws_id,
      google_event_id,
      google_calendar_id,
      title,
      description,
      start_at,
      end_at,
      location,
      color,
      locked,
      task_id,
      is_encrypted
    )
    select
      (event->>'ws_id')::uuid,
      event->>'google_event_id',
      event->>'google_calendar_id',
      coalesce(event->>'title', ''),
      coalesce(event->>'description', ''),
      (event->>'start_at')::timestamptz,
      (event->>'end_at')::timestamptz,
      event->>'location',
      event->>'color',
      coalesce((event->>'locked')::boolean, false),
      case
        when event->>'task_id' is not null and event->>'task_id' != ''
        then (event->>'task_id')::uuid
        else null
      end,
      coalesce((event->>'is_encrypted')::boolean, false)
    from jsonb_array_elements(events) as event
    where event->>'ws_id' is not null
      and event->>'google_event_id' is not null
      and event->>'start_at' is not null
      and event->>'end_at' is not null
      and (event->>'ws_id')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and length(event->>'google_event_id') > 0
      and (event->>'start_at')::timestamptz < (event->>'end_at')::timestamptz
    on conflict (ws_id, google_event_id)
    do update set
      google_calendar_id = excluded.google_calendar_id,
      -- For encrypted events: preserve encrypted fields, only update non-sensitive data
      -- For non-encrypted events: update all fields normally
      -- CASE: If existing event is encrypted AND incoming is_encrypted is false (default/plaintext from Google),
      --       preserve the existing encrypted title/description/location
      title = case 
        when workspace_calendar_events.is_encrypted = true and excluded.is_encrypted = false 
        then workspace_calendar_events.title 
        else excluded.title 
      end,
      description = case 
        when workspace_calendar_events.is_encrypted = true and excluded.is_encrypted = false 
        then workspace_calendar_events.description 
        else excluded.description 
      end,
      location = case 
        when workspace_calendar_events.is_encrypted = true and excluded.is_encrypted = false 
        then workspace_calendar_events.location 
        else excluded.location 
      end,
      -- Always update time/color/locked (not encrypted)
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      color = excluded.color,
      locked = excluded.locked,
      task_id = excluded.task_id,
      -- NEVER downgrade from encrypted to unencrypted
      -- Only upgrade to encrypted if incoming explicitly says so
      is_encrypted = case
        when workspace_calendar_events.is_encrypted = true then true
        else excluded.is_encrypted
      end
    returning xmax
  )
  select jsonb_build_object(
    'inserted', count(*) filter (where xmax = 0),
    'updated', count(*) filter (where xmax != 0)
  )
  from upserted;
$$;
