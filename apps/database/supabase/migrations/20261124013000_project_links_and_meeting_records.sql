-- Workspace Projects link meetings and calendar events, and meetings keep a
-- persistent record (agenda, decisions) plus the tasks they produced.
--
-- task_project_links holds non-task project links. Task membership stays in
-- task_project_tasks, which owns ticket numbers, history triggers and the
-- create_task_with_relationship RPC; task_project_entity_links reads both as
-- one surface (entity_kind 'task' comes from task_project_tasks). Reserved
-- kinds (drive_file, doc, upskii_class, mail_thread) are admitted per product
-- by widening task_project_links_entity_kind_check together with the matching
-- RLS edit-right clause.
--
-- Linking needs manage_projects plus the owning product's edit right:
--   meeting        -> meeting creator or workspace admin
--   calendar_event -> manage_calendar
-- meeting_task_links keeps tasks and their source meeting in one workspace, so
-- a meeting never lists tasks from another workspace. Reads need full
-- (MEMBER) workspace membership; guests see none of these rows.

begin;

alter table public.task_projects
  add constraint task_projects_id_ws_id_key unique (id, ws_id);

create table public.task_project_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  entity_kind text not null,
  entity_id uuid not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint task_project_links_project_fkey foreign key (project_id, ws_id)
    references public.task_projects(id, ws_id) on delete cascade,
  constraint task_project_links_entity_kind_check
    check (entity_kind in ('meeting', 'calendar_event')),
  constraint task_project_links_unique unique (project_id, entity_kind, entity_id)
);

create index task_project_links_entity_idx
  on public.task_project_links (ws_id, entity_kind, entity_id);

create table public.meeting_task_links (
  meeting_id uuid not null references public.workspace_meetings(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  link_kind text not null default 'source',
  carried_from_meeting_id uuid references public.workspace_meetings(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (meeting_id, task_id),
  constraint meeting_task_links_kind_check
    check (link_kind in ('source', 'carried_over')),
  -- A carried-over link names its earlier meeting at insert; the origin
  -- becomes null when that meeting is deleted.
  constraint meeting_task_links_carry_check check (
    (link_kind = 'carried_over' or carried_from_meeting_id is null)
    and carried_from_meeting_id is distinct from meeting_id
  )
);

create index meeting_task_links_task_idx on public.meeting_task_links (task_id);
create index meeting_task_links_ws_idx on public.meeting_task_links (ws_id);
create index meeting_task_links_carried_from_idx
  on public.meeting_task_links (carried_from_meeting_id)
  where carried_from_meeting_id is not null;

create table public.meeting_record_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.workspace_meetings(id) on delete cascade,
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  content text not null,
  position integer not null default 0,
  completed_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_record_items_kind_check check (kind in ('agenda', 'decision')),
  constraint meeting_record_items_content_check
    check (char_length(btrim(content)) between 1 and 2000),
  constraint meeting_record_items_position_check check (position between 0 and 10000)
);

create index meeting_record_items_meeting_idx
  on public.meeting_record_items (meeting_id, kind, position);

-- Integrity holds for every role, including service_role writes from Meet.
create function private.validate_task_project_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Project links are immutable' using errcode = '55000';
  end if;
  if new.entity_kind = 'meeting' and not exists (
    select 1 from public.workspace_meetings m
    where m.id = new.entity_id and m.ws_id = new.ws_id
  ) then
    raise exception 'Meeting is not in the project workspace' using errcode = '23503';
  end if;
  if new.entity_kind = 'calendar_event' and not exists (
    select 1 from public.workspace_calendar_events e
    where e.id = new.entity_id and e.ws_id = new.ws_id
  ) then
    raise exception 'Event is not in the project workspace' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger task_project_links_validate
before insert or update on public.task_project_links
for each row execute function private.validate_task_project_link();

create function private.validate_meeting_task_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Only the carried_from_meeting_id set-null from a deleted origin passes.
    if new.carried_from_meeting_id is null
      and old.carried_from_meeting_id is not null
      and (new.meeting_id, new.task_id, new.ws_id, new.link_kind, new.created_by, new.created_at)
        is not distinct from
        (old.meeting_id, old.task_id, old.ws_id, old.link_kind, old.created_by, old.created_at)
    then
      return new;
    end if;
    raise exception 'Meeting task links are immutable' using errcode = '55000';
  end if;
  if new.link_kind = 'carried_over' and new.carried_from_meeting_id is null then
    raise exception 'A carried-over link names its earlier meeting' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.workspace_meetings m
    where m.id = new.meeting_id and m.ws_id = new.ws_id
  ) or (new.carried_from_meeting_id is not null and not exists (
    select 1 from public.workspace_meetings m
    where m.id = new.carried_from_meeting_id and m.ws_id = new.ws_id
  )) then
    raise exception 'Meeting is not in this workspace' using errcode = '23503';
  end if;
  if not exists (
    select 1
    from public.tasks t
    join public.task_lists tl on tl.id = t.list_id
    join public.workspace_boards wb on wb.id = tl.board_id
    where t.id = new.task_id and wb.ws_id = new.ws_id
  ) then
    raise exception 'Task is not in the meeting workspace' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger meeting_task_links_validate
before insert or update on public.meeting_task_links
for each row execute function private.validate_meeting_task_link();

create function private.validate_meeting_record_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    new.meeting_id is distinct from old.meeting_id
    or new.ws_id is distinct from old.ws_id
    or new.kind is distinct from old.kind
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Meeting record ownership is immutable' using errcode = '55000';
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1 from public.workspace_meetings m
    where m.id = new.meeting_id and m.ws_id = new.ws_id
  ) then
    raise exception 'Meeting is not in this workspace' using errcode = '23503';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger meeting_record_items_validate
before insert or update on public.meeting_record_items
for each row execute function private.validate_meeting_record_item();

-- Polymorphic project links have no foreign key; remove them with the entity.
create function private.delete_project_links_for_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.task_project_links
  where ws_id = old.ws_id and entity_kind = tg_argv[0] and entity_id = old.id;
  return old;
end $$;

create trigger workspace_meetings_delete_project_links
after delete on public.workspace_meetings
for each row execute function private.delete_project_links_for_entity('meeting');

create trigger workspace_calendar_events_delete_project_links
after delete on public.workspace_calendar_events
for each row execute function private.delete_project_links_for_entity('calendar_event');

revoke all on function private.validate_task_project_link() from public, anon, authenticated;
revoke all on function private.validate_meeting_task_link() from public, anon, authenticated;
revoke all on function private.validate_meeting_record_item() from public, anon, authenticated;
revoke all on function private.delete_project_links_for_entity() from public, anon, authenticated;

alter table public.task_project_links enable row level security;
alter table public.meeting_task_links enable row level security;
alter table public.meeting_record_items enable row level security;

revoke all on table public.task_project_links, public.meeting_task_links,
  public.meeting_record_items from public, anon, authenticated;
grant select, insert, delete on table public.task_project_links to authenticated;
grant select, insert, delete on table public.meeting_task_links to authenticated;
grant select, insert, update, delete on table public.meeting_record_items to authenticated;
grant all on table public.task_project_links, public.meeting_task_links,
  public.meeting_record_items to service_role;

-- task_project_links -------------------------------------------------------

create policy task_project_links_select on public.task_project_links
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = task_project_links.ws_id
      and wm.user_id = (select auth.uid())
      and wm.type = 'MEMBER'
  )
  and (
    task_project_links.entity_kind = 'meeting'
    or public.has_workspace_permission(
      task_project_links.ws_id, (select auth.uid()), 'manage_calendar')
  )
);

create policy task_project_links_insert on public.task_project_links
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.has_workspace_permission(
    task_project_links.ws_id, (select auth.uid()), 'manage_projects')
  and (
    (task_project_links.entity_kind = 'meeting' and exists (
      select 1 from public.workspace_meetings m
      where m.id = task_project_links.entity_id
        and m.ws_id = task_project_links.ws_id
        and (m.creator_id = (select auth.uid())
          or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
    ))
    or (task_project_links.entity_kind = 'calendar_event'
      and public.has_workspace_permission(
        task_project_links.ws_id, (select auth.uid()), 'manage_calendar')
      and exists (
        select 1 from public.workspace_calendar_events e
        where e.id = task_project_links.entity_id
          and e.ws_id = task_project_links.ws_id
      ))
  )
);

create policy task_project_links_delete on public.task_project_links
for delete to authenticated
using (
  public.has_workspace_permission(
    task_project_links.ws_id, (select auth.uid()), 'manage_projects')
  and (
    (task_project_links.entity_kind = 'meeting' and exists (
      select 1 from public.workspace_meetings m
      where m.id = task_project_links.entity_id
        and (m.creator_id = (select auth.uid())
          or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
    ))
    or (task_project_links.entity_kind = 'calendar_event'
      and public.has_workspace_permission(
        task_project_links.ws_id, (select auth.uid()), 'manage_calendar'))
  )
);

-- meeting_task_links -------------------------------------------------------

create policy meeting_task_links_select on public.meeting_task_links
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = meeting_task_links.ws_id
      and wm.user_id = (select auth.uid())
      and wm.type = 'MEMBER'
  )
);

-- A member links a task they created to a meeting in the same workspace;
-- carrying an item over to another meeting is a host action.
create policy meeting_task_links_insert on public.meeting_task_links
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = meeting_task_links.ws_id
      and wm.user_id = (select auth.uid())
      and wm.type = 'MEMBER'
  )
  and (
    exists (
      select 1 from public.workspace_meetings m
      where m.id = meeting_task_links.meeting_id
        and m.ws_id = meeting_task_links.ws_id
        and (m.creator_id = (select auth.uid())
          or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
    )
    or (meeting_task_links.link_kind = 'source' and exists (
      select 1 from public.tasks t
      where t.id = meeting_task_links.task_id
        and t.creator_id = (select auth.uid())
    ))
  )
);

create policy meeting_task_links_delete on public.meeting_task_links
for delete to authenticated
using (
  exists (
    select 1 from public.workspace_meetings m
    where m.id = meeting_task_links.meeting_id
      and (m.creator_id = (select auth.uid())
        or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
  )
  or (meeting_task_links.created_by = (select auth.uid()) and exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = meeting_task_links.ws_id
      and wm.user_id = (select auth.uid())
      and wm.type = 'MEMBER'
  ))
);

-- meeting_record_items -----------------------------------------------------

create policy meeting_record_items_select on public.meeting_record_items
for select to authenticated
using (
  exists (
    select 1 from public.workspace_members wm
    where wm.ws_id = meeting_record_items.ws_id
      and wm.user_id = (select auth.uid())
      and wm.type = 'MEMBER'
  )
);

create policy meeting_record_items_insert on public.meeting_record_items
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.workspace_meetings m
    where m.id = meeting_record_items.meeting_id
      and m.ws_id = meeting_record_items.ws_id
      and (m.creator_id = (select auth.uid())
        or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
  )
);

create policy meeting_record_items_update on public.meeting_record_items
for update to authenticated
using (
  exists (
    select 1 from public.workspace_meetings m
    where m.id = meeting_record_items.meeting_id
      and (m.creator_id = (select auth.uid())
        or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
  )
)
with check (
  exists (
    select 1 from public.workspace_meetings m
    where m.id = meeting_record_items.meeting_id
      and m.ws_id = meeting_record_items.ws_id
      and (m.creator_id = (select auth.uid())
        or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
  )
);

create policy meeting_record_items_delete on public.meeting_record_items
for delete to authenticated
using (
  exists (
    select 1 from public.workspace_meetings m
    where m.id = meeting_record_items.meeting_id
      and (m.creator_id = (select auth.uid())
        or public.has_workspace_permission(m.ws_id, (select auth.uid()), 'admin'))
  )
);

-- One read surface over task and non-task project links. security_invoker
-- applies each base table's RLS to the caller.
create view public.task_project_entity_links
with (security_invoker = true)
as
select l.project_id, l.ws_id, l.entity_kind, l.entity_id, l.created_by, l.created_at
from public.task_project_links l
union all
select tpt.project_id, tp.ws_id, 'task'::text, tpt.task_id, null::uuid,
  coalesce(tpt.created_at, tp.created_at)
from public.task_project_tasks tpt
join public.task_projects tp on tp.id = tpt.project_id;

revoke all on table public.task_project_entity_links from public, anon, authenticated;
grant select on table public.task_project_entity_links to authenticated, service_role;

commit;
