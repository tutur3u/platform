create schema if not exists private;

grant usage on schema private to service_role;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.meet_stream_live_inputs (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  meeting_id uuid not null references public.workspace_meetings(id) on delete cascade,
  cloudflare_live_input_uid text not null,
  cloudflare_live_input_enabled boolean not null default true,
  whip_url text not null,
  whep_url text not null,
  status text not null default 'ready',
  created_by uuid references public.users(id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_stream_live_inputs_status_check check (
    status in ('ready', 'live', 'ended', 'disabled', 'error')
  ),
  constraint meet_stream_live_inputs_cloudflare_uid_length_check check (
    char_length(cloudflare_live_input_uid) between 1 and 128
  ),
  constraint meet_stream_live_inputs_whip_url_length_check check (
    char_length(whip_url) between 1 and 2048
  ),
  constraint meet_stream_live_inputs_whep_url_length_check check (
    char_length(whep_url) between 1 and 2048
  ),
  unique (meeting_id),
  unique (cloudflare_live_input_uid)
);

create index if not exists meet_stream_live_inputs_ws_status_idx
  on private.meet_stream_live_inputs (ws_id, status, updated_at desc);

create table if not exists private.meet_stream_events (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  meeting_id uuid not null references public.workspace_meetings(id) on delete cascade,
  stream_id uuid references private.meet_stream_live_inputs(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint meet_stream_events_event_type_length_check check (
    char_length(event_type) between 1 and 120
  )
);

create index if not exists meet_stream_events_meeting_created_idx
  on private.meet_stream_events (meeting_id, created_at desc);

create index if not exists meet_stream_events_ws_created_idx
  on private.meet_stream_events (ws_id, created_at desc);

alter table private.meet_stream_live_inputs enable row level security;
alter table private.meet_stream_events enable row level security;

revoke all on table private.meet_stream_live_inputs from public, anon, authenticated;
revoke all on table private.meet_stream_events from public, anon, authenticated;

grant all on table private.meet_stream_live_inputs to service_role;
grant all on table private.meet_stream_events to service_role;

create policy "Service role can manage Meet stream live inputs"
on private.meet_stream_live_inputs
for all
to service_role
using (true)
with check (true);

create policy "Service role can manage Meet stream events"
on private.meet_stream_events
for all
to service_role
using (true)
with check (true);

create or replace function private.meet_stream_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists meet_stream_live_inputs_set_updated_at
  on private.meet_stream_live_inputs;
create trigger meet_stream_live_inputs_set_updated_at
  before update on private.meet_stream_live_inputs
  for each row execute function private.meet_stream_set_updated_at();
