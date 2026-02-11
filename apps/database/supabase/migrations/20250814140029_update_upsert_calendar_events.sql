create or replace function public.upsert_calendar_events_and_count(events jsonb)
returns jsonb
language sql
as $$
  with upserted as (
    insert into public.workspace_calendar_events (
      ws_id,
      google_event_id,
      title,
      description,
      start_at,
      end_at,
      location,
      color,
      priority,
      locked,
      task_id
    )
    select
      (event->>'ws_id')::uuid,
      event->>'google_event_id',
      coalesce(event->>'title', ''),
      coalesce(event->>'description', ''),
      (event->>'start_at')::timestamptz,
      (event->>'end_at')::timestamptz,
      event->>'location',
      event->>'color',
      case 
        when (event->>'priority') ~ '^-?\d+$' then (event->>'priority')::int 
        else null 
      end,
      case 
        when event ? 'locked' 
          and lower(event->>'locked') in ('true','false','t','f','1','0') 
        then (event->>'locked')::boolean 
        else true
      end,
      case 
        when event->>'task_id' is not null and event->>'task_id' != '' 
        then (event->>'task_id')::uuid 
        else null 
      end
    from jsonb_array_elements(coalesce(events, '[]'::jsonb)) as event
    where event->>'ws_id' is not null 
      and event->>'google_event_id' is not null
      and event->>'start_at' is not null
      and event->>'end_at' is not null
      and (event->>'ws_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and length(event->>'google_event_id') > 0
      and (event->>'start_at')::timestamptz < (event->>'end_at')::timestamptz
    on conflict (ws_id, google_event_id)
    do update set
      title = excluded.title,
      description = excluded.description,
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      location = excluded.location,
      color = excluded.color,
      priority = excluded.priority,
      locked = excluded.locked,
      task_id = excluded.task_id
    returning xmax
  )
  select jsonb_build_object(
    'inserted', count(*) filter (where xmax = 0),
    'updated', count(*) filter (where xmax != 0)
  )
  from upserted;
$$;
