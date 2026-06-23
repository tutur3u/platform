alter table private.calendar_user_workspace_preferences
  add column if not exists inbound_sync_enabled boolean not null default true,
  add column if not exists outbound_sync_enabled boolean not null default false,
  add column if not exists conflict_policy text not null default 'latest_write_wins',
  add column if not exists default_outbound_calendar_connection_id uuid
    references public.calendar_connections(id)
    on update cascade
    on delete set null;

alter table private.calendar_user_workspace_preferences
  drop constraint if exists calendar_user_workspace_preferences_conflict_policy_check;

alter table private.calendar_user_workspace_preferences
  add constraint calendar_user_workspace_preferences_conflict_policy_check
  check (conflict_policy in ('latest_write_wins'));

create index if not exists calendar_user_workspace_preferences_outbound_connection_idx
  on private.calendar_user_workspace_preferences(default_outbound_calendar_connection_id);

alter table public.calendar_connections
  add column if not exists sync_inbound_enabled boolean not null default true,
  add column if not exists sync_outbound_enabled boolean not null default false,
  add column if not exists sync_delete_enabled boolean not null default true;

alter table public.workspace_calendar_events
  add column if not exists external_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists sync_status text not null default 'local_only',
  add column if not exists sync_error text;

alter table public.workspace_calendar_events
  drop constraint if exists workspace_calendar_events_sync_status_check;

alter table public.workspace_calendar_events
  add constraint workspace_calendar_events_sync_status_check
  check (sync_status in ('idle', 'syncing', 'synced', 'failed', 'conflict', 'local_only'));

create index if not exists workspace_calendar_events_ws_sync_status_idx
  on public.workspace_calendar_events(ws_id, sync_status);

create index if not exists workspace_calendar_events_ws_last_synced_idx
  on public.workspace_calendar_events(ws_id, last_synced_at);

update public.workspace_calendar_events
set
  sync_status = 'synced',
  last_synced_at = coalesce(last_synced_at, created_at, now()),
  sync_error = null
where provider in ('google', 'microsoft')
  and external_event_id is not null
  and sync_status in ('idle', 'local_only');

update public.workspace_calendar_events
set sync_status = 'local_only'
where (provider is null or provider = 'tuturuuu' or external_event_id is null)
  and sync_status = 'idle';

create or replace function public.upsert_calendar_events_and_count(events jsonb)
returns jsonb
language sql
as $$
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
      nullif(event->>'sync_error', '') as sync_error
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
      sync_error
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
      sync_error
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
      sync_error = excluded.sync_error
    returning xmax
  )
  select jsonb_build_object(
    'inserted', count(*) filter (where xmax = 0),
    'updated', count(*) filter (where xmax != 0)
  )
  from upserted;
$$;

notify pgrst, 'reload schema';
