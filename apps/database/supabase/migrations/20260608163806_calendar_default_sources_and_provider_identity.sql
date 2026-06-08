-- Calendar source preferences and provider-scoped event identity.
--
-- This keeps inbound sync rows unique by the provider account/calendar/event
-- tuple instead of the legacy Google event id alone. It also stores each
-- user's default writable source per workspace.

alter table public.calendar_connections
  add column if not exists access_role text;

update public.calendar_connections
set access_role = coalesce(access_role, 'writer')
where access_role is null;

alter table public.calendar_connections
  alter column access_role set default 'writer';

alter table public.workspace_calendar_events
  drop constraint if exists workspace_calendar_events_google_event_id_key;

drop index if exists public.workspace_calendar_events_google_event_id_key;

update public.workspace_calendar_events
set
  provider = coalesce(provider, 'google'::public.calendar_provider),
  external_calendar_id = coalesce(external_calendar_id, google_calendar_id, 'primary'),
  external_event_id = coalesce(external_event_id, google_event_id)
where google_event_id is not null;

update public.workspace_calendar_events
set provider = coalesce(provider, 'tuturuuu'::public.calendar_provider)
where google_event_id is null
  and external_event_id is null;

with ranked as (
  select
    id,
    row_number() over (
      partition by ws_id, provider, external_calendar_id, external_event_id
      order by created_at desc nulls last, id desc
    ) as row_number
  from public.workspace_calendar_events
  where external_event_id is not null
)
delete from public.workspace_calendar_events event
using ranked
where event.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists workspace_calendar_events_provider_external_key
  on public.workspace_calendar_events (
    ws_id,
    provider,
    external_calendar_id,
    external_event_id
  );

alter table public.calendar_connections
  drop constraint if exists calendar_connections_ws_id_calendar_id_key;

drop index if exists public.calendar_connections_ws_id_calendar_id_key;

create unique index if not exists calendar_connections_ws_provider_token_calendar_key
  on public.calendar_connections (ws_id, provider, auth_token_id, calendar_id)
  where auth_token_id is not null;

create unique index if not exists calendar_connections_ws_provider_calendar_legacy_key
  on public.calendar_connections (ws_id, provider, calendar_id)
  where auth_token_id is null;

create table if not exists private.calendar_user_workspace_preferences (
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  default_provider public.calendar_provider not null default 'tuturuuu',
  default_workspace_calendar_id uuid references private.workspace_calendars(id) on update cascade on delete cascade,
  default_calendar_connection_id uuid references public.calendar_connections(id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ws_id),
  constraint calendar_user_workspace_preferences_source_check check (
    (
      default_provider = 'tuturuuu'
      and default_workspace_calendar_id is not null
      and default_calendar_connection_id is null
    )
    or
    (
      default_provider in ('google', 'microsoft')
      and default_workspace_calendar_id is null
      and default_calendar_connection_id is not null
    )
  )
);

alter table private.calendar_user_workspace_preferences enable row level security;

revoke all on private.calendar_user_workspace_preferences from public, anon, authenticated;
grant all on private.calendar_user_workspace_preferences to service_role;

drop policy if exists "calendar preferences are service-role managed" on private.calendar_user_workspace_preferences;
create policy "calendar preferences are service-role managed"
  on private.calendar_user_workspace_preferences
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

drop trigger if exists calendar_user_workspace_preferences_updated_at
  on private.calendar_user_workspace_preferences;

create trigger calendar_user_workspace_preferences_updated_at
  before update on private.calendar_user_workspace_preferences
  for each row
  execute function public.update_updated_at_column();

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
      coalesce((event->>'is_encrypted')::boolean, false) as is_encrypted
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
      is_encrypted
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
      is_encrypted
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
      end
    returning xmax
  )
  select jsonb_build_object(
    'inserted', count(*) filter (where xmax = 0),
    'updated', count(*) filter (where xmax != 0)
  )
  from upserted;
$$;

notify pgrst, 'reload schema';
