-- Calendar imports carry a complete snapshot of the finite Google-owned keys.
-- Omission/JSON null preserves metadata; objects replace those snapshot keys
-- while retaining unrelated metadata. Other providers only merge object keys.
-- Preserve the existing signature, invoker/RLS behavior and encrypted fields.
create or replace function public.upsert_calendar_events_and_count(events jsonb)
returns jsonb
language plpgsql
security invoker
as $$
declare
  result jsonb;
begin
  if exists (
    select 1 from jsonb_array_elements(events) event
    where event ? 'scheduling_metadata'
      and jsonb_typeof(event->'scheduling_metadata') not in ('object', 'null')
  ) then
    raise exception using
      errcode = '22023',
      message = 'Calendar scheduling_metadata must be an object or null';
  end if;

  with normalized_events as (
    select
      (event->>'ws_id')::uuid as ws_id,
      nullif(event->>'google_event_id', '') as google_event_id,
      nullif(event->>'google_calendar_id', '') as google_calendar_id,
      coalesce(nullif(event->>'external_calendar_id', ''), nullif(event->>'google_calendar_id', ''), 'primary') as external_calendar_id,
      coalesce(nullif(event->>'external_event_id', ''), nullif(event->>'google_event_id', '')) as external_event_id,
      coalesce(nullif(event->>'provider', '')::public.calendar_provider, 'google'::public.calendar_provider) as provider,
      case
        when event->>'source_calendar_id' is not null and event->>'source_calendar_id' != ''
        then (event->>'source_calendar_id')::uuid
        else null
      end as source_calendar_id,
      coalesce(event->>'title', '') as title,
      coalesce(event->>'description', '') as description,
      (event->>'start_at')::timestamptz as start_at,
      (event->>'end_at')::timestamptz as end_at,
      event->>'location' as location,
      event->>'color' as color,
      coalesce((event->>'locked')::boolean, false) as locked,
      case
        when event->>'task_id' is not null and event->>'task_id' != ''
        then (event->>'task_id')::uuid
        else null
      end as task_id,
      coalesce((event->>'is_encrypted')::boolean, false) as is_encrypted,
      case
        when event->>'external_updated_at' is not null and event->>'external_updated_at' != ''
        then (event->>'external_updated_at')::timestamptz
        else null
      end as external_updated_at,
      coalesce(
        case
          when event->>'last_synced_at' is not null and event->>'last_synced_at' != ''
          then (event->>'last_synced_at')::timestamptz
          else null
        end,
        now()
      ) as last_synced_at,
      case
        when event->>'sync_status' in ('idle', 'syncing', 'synced', 'failed', 'conflict', 'local_only')
        then event->>'sync_status'
        else 'synced'
      end as sync_status,
      nullif(event->>'sync_error', '') as sync_error,
      case when jsonb_typeof(event->'scheduling_metadata') = 'object'
        then event->'scheduling_metadata' else null
      end as scheduling_metadata
    from jsonb_array_elements(events) as event
    where event->>'ws_id' is not null
      and coalesce(nullif(event->>'external_event_id', ''), nullif(event->>'google_event_id', '')) is not null
      and event->>'start_at' is not null
      and event->>'end_at' is not null
      and (event->>'ws_id')::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (event->>'start_at')::timestamptz < (event->>'end_at')::timestamptz
  ),
  upserted as (
    insert into public.workspace_calendar_events (
      ws_id,
      google_event_id,
      google_calendar_id,
      external_calendar_id,
      external_event_id,
      provider,
      source_calendar_id,
      title,
      description,
      start_at,
      end_at,
      location,
      color,
      locked,
      task_id,
      is_encrypted,
      external_updated_at,
      last_synced_at,
      sync_status,
      sync_error,
      scheduling_metadata
    )
    select
      ws_id,
      google_event_id,
      google_calendar_id,
      external_calendar_id,
      external_event_id,
      provider,
      source_calendar_id,
      title,
      description,
      start_at,
      end_at,
      location,
      color,
      locked,
      task_id,
      is_encrypted,
      external_updated_at,
      last_synced_at,
      sync_status,
      sync_error,
      scheduling_metadata
    from normalized_events
    on conflict (ws_id, provider, external_calendar_id, external_event_id)
    do update set
      google_event_id = excluded.google_event_id,
      google_calendar_id = excluded.google_calendar_id,
      external_calendar_id = excluded.external_calendar_id,
      external_event_id = excluded.external_event_id,
      provider = excluded.provider,
      source_calendar_id = coalesce(excluded.source_calendar_id, workspace_calendar_events.source_calendar_id),
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
      start_at = excluded.start_at,
      end_at = excluded.end_at,
      color = excluded.color,
      locked = excluded.locked,
      task_id = excluded.task_id,
      is_encrypted = case
        when workspace_calendar_events.is_encrypted = true then true
        else excluded.is_encrypted
      end,
      external_updated_at = excluded.external_updated_at,
      last_synced_at = excluded.last_synced_at,
      sync_status = excluded.sync_status,
      sync_error = excluded.sync_error,
      scheduling_metadata = case
        -- An omitted field or legacy JSON null is not a destructive clear.
        when excluded.scheduling_metadata is null
          then workspace_calendar_events.scheduling_metadata
        else (
          case when excluded.provider = 'google'::public.calendar_provider
            then coalesce(workspace_calendar_events.scheduling_metadata, '{}'::jsonb)
              - array['google_color', 'google_recurrence', 'google_event_type',
                      'google_working_location_type', 'google_working_location_label']::text[]
            else coalesce(workspace_calendar_events.scheduling_metadata, '{}'::jsonb)
          end
        ) || excluded.scheduling_metadata
      end
    returning xmax
  )
  select jsonb_build_object(
    'inserted', count(*) filter (where xmax = 0),
    'updated', count(*) filter (where xmax != 0)
  ) into result
  from upserted;

  return result;
end;
$$;

notify pgrst, 'reload schema';
