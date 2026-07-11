-- Retire the unused legacy calendar participant model from the client-facing
-- Data API. Current application code has no callers for these tables or their
-- union view; service-role workflows retain historical access.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.calendar_event_participant_groups set schema private;
alter table public.calendar_event_platform_participants set schema private;
alter table public.calendar_event_virtual_participants set schema private;
alter view public.calendar_event_participants set schema private;

revoke all on table
  private.calendar_event_participant_groups,
  private.calendar_event_platform_participants,
  private.calendar_event_virtual_participants
from public, anon, authenticated;

grant all on table
  private.calendar_event_participant_groups,
  private.calendar_event_platform_participants,
  private.calendar_event_virtual_participants
to service_role;

revoke all on table private.calendar_event_participants
from public, anon, authenticated;
grant select on table private.calendar_event_participants to service_role;

alter table private.calendar_event_participant_groups enable row level security;
alter table private.calendar_event_platform_participants enable row level security;
alter table private.calendar_event_virtual_participants enable row level security;

drop policy if exists "Allow select for workspace users and the participant"
  on private.calendar_event_participant_groups;
drop policy if exists "Allow delete for workspace users and the participant"
  on private.calendar_event_platform_participants;
drop policy if exists "Allow insert for workspace users"
  on private.calendar_event_platform_participants;
drop policy if exists "Allow select for workspace users and the participant"
  on private.calendar_event_platform_participants;
drop policy if exists "Allow update for workspace users and the participant"
  on private.calendar_event_platform_participants;
drop policy if exists "Allow access for workspace users"
  on private.calendar_event_virtual_participants;

create policy "Service role can manage private calendar participant groups"
  on private.calendar_event_participant_groups
  for all to service_role
  using (true)
  with check (true);

create policy "Service role can manage private platform calendar participants"
  on private.calendar_event_platform_participants
  for all to service_role
  using (true)
  with check (true);

create policy "Service role can manage private virtual calendar participants"
  on private.calendar_event_virtual_participants
  for all to service_role
  using (true)
  with check (true);

comment on table private.calendar_event_participant_groups is
  'Private legacy links between calendar events and participant groups, retained for historical compatibility.';
comment on table private.calendar_event_platform_participants is
  'Private legacy platform-user calendar participants, retained for historical compatibility.';
comment on table private.calendar_event_virtual_participants is
  'Private legacy workspace-user calendar participants, retained for historical compatibility.';
comment on view private.calendar_event_participants is
  'Private service-role projection over the legacy calendar participant tables.';
