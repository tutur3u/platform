drop policy if exists "Enable all access for workspace users"
  on public.workspace_calendar_events;

drop policy if exists "Calendar managers can select workspace events"
  on public.workspace_calendar_events;
drop policy if exists "Calendar managers can insert workspace events"
  on public.workspace_calendar_events;
drop policy if exists "Calendar managers can update workspace events"
  on public.workspace_calendar_events;
drop policy if exists "Calendar managers can delete workspace events"
  on public.workspace_calendar_events;

create policy "Calendar managers can select workspace events"
on public.workspace_calendar_events
for select
to authenticated
using (
  public.has_workspace_permission(
    workspace_calendar_events.ws_id,
    (select auth.uid()),
    'manage_calendar'
  )
);

create policy "Calendar managers can insert workspace events"
on public.workspace_calendar_events
for insert
to authenticated
with check (
  public.has_workspace_permission(
    workspace_calendar_events.ws_id,
    (select auth.uid()),
    'manage_calendar'
  )
);

create policy "Calendar managers can update workspace events"
on public.workspace_calendar_events
for update
to authenticated
using (
  public.has_workspace_permission(
    workspace_calendar_events.ws_id,
    (select auth.uid()),
    'manage_calendar'
  )
)
with check (
  public.has_workspace_permission(
    workspace_calendar_events.ws_id,
    (select auth.uid()),
    'manage_calendar'
  )
);

create policy "Calendar managers can delete workspace events"
on public.workspace_calendar_events
for delete
to authenticated
using (
  public.has_workspace_permission(
    workspace_calendar_events.ws_id,
    (select auth.uid()),
    'manage_calendar'
  )
);
