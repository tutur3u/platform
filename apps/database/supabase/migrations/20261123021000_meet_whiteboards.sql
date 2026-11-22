-- Links a Meet meeting to a workspace whiteboard so the board outlives the call.
--
-- Board content stays in public.workspace_whiteboards.snapshot; this table only
-- records which boards a meeting uses and how far guests may use them.
--   * The table lives in private and is service-only. The Meet API and room
--     call the three actor-bound functions below after resolving the real actor;
--     browsers and meeting guests never touch it.
--   * ws_id must match both the meeting and the whiteboard. A trigger rejects
--     mismatches, and neither parent can change workspace while linked.
--   * whiteboard_id cascades: deleting a board removes only its link. Deleting a
--     meeting removes its links and leaves the boards in the workspace.
--   * Workspace members (type MEMBER) may be shown links by the API. Only the
--     meeting host or a workspace admin creates one, because the default guest
--     access shows the board to every admitted guest. The link creator, the
--     host or an admin can change guest_access or remove the link.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.meet_whiteboards (
  meeting_id uuid not null references public.workspace_meetings (id) on delete cascade,
  whiteboard_id uuid not null references public.workspace_whiteboards (id) on delete cascade,
  ws_id uuid not null references public.workspaces (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  guest_access text not null default 'view',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meet_whiteboards_pkey primary key (meeting_id, whiteboard_id),
  constraint meet_whiteboards_guest_access_check
    check (guest_access in ('none', 'view', 'draw'))
);

comment on table private.meet_whiteboards is
  'Links a Meet meeting to a workspace whiteboard. Content stays in workspace_whiteboards.snapshot; guest_access caps what admitted guests may do with it.';

create index meet_whiteboards_whiteboard_idx
  on private.meet_whiteboards (whiteboard_id);

create index meet_whiteboards_ws_idx
  on private.meet_whiteboards (ws_id);

create index meet_whiteboards_created_by_idx
  on private.meet_whiteboards (created_by)
  where created_by is not null;

alter table private.meet_whiteboards enable row level security;

revoke all on table private.meet_whiteboards from public, anon, authenticated;
grant select, insert, update, delete on table private.meet_whiteboards to service_role;

create policy meet_whiteboards_service on private.meet_whiteboards
  for all to service_role
  using (true)
  with check (true);

-- Locks the meeting, then the whiteboard, in that order so a concurrent
-- workspace move on either parent waits for this write and then sees the link.
-- Runs as the owner so the locks do not depend on the writer's table grants.
-- tuturuuu: no-grant (trigger)
create function private.guard_meet_whiteboard_scope()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_meeting_ws_id uuid;
  v_board_ws_id uuid;
begin
  select m.ws_id into v_meeting_ws_id
  from public.workspace_meetings m
  where m.id = new.meeting_id
  for share;

  if v_meeting_ws_id is distinct from new.ws_id then
    raise exception 'Meeting whiteboard must match its meeting workspace'
      using errcode = '23514';
  end if;

  select w.ws_id into v_board_ws_id
  from public.workspace_whiteboards w
  where w.id = new.whiteboard_id
  for share;

  if v_board_ws_id is distinct from new.ws_id then
    raise exception 'Meeting whiteboard must match its whiteboard workspace'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.now();
  end if;

  return new;
end;
$$;

revoke all on function private.guard_meet_whiteboard_scope()
  from public, anon, authenticated, service_role;

create trigger guard_meet_whiteboard_scope
  before insert or update of meeting_id, whiteboard_id, ws_id
  on private.meet_whiteboards
  for each row
  execute function private.guard_meet_whiteboard_scope();

-- Runs as the owner: clients that update a meeting or board have no access to
-- the private schema, and the guard must still see the links.
-- tuturuuu: no-grant (trigger)
create function private.guard_meet_whiteboard_parent_move()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.ws_id is distinct from old.ws_id then
    -- A snapshot taken before a concurrent link commit would miss that link.
    perform private.require_read_committed();

    if tg_table_name = 'workspace_meetings' then
      if exists (
        select 1 from private.meet_whiteboards l where l.meeting_id = old.id
      ) then
        raise exception 'A meeting linked to Meet whiteboards cannot change workspace'
          using errcode = '23514';
      end if;
    elsif exists (
      select 1 from private.meet_whiteboards l where l.whiteboard_id = old.id
    ) then
      raise exception 'A whiteboard linked to Meet cannot change workspace'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_meet_whiteboard_parent_move()
  from public, anon, authenticated, service_role;

create trigger guard_meet_whiteboard_meeting_move
  before update of ws_id
  on public.workspace_meetings
  for each row
  execute function private.guard_meet_whiteboard_parent_move();

create trigger guard_meet_whiteboard_board_move
  before update of ws_id
  on public.workspace_whiteboards
  for each row
  execute function private.guard_meet_whiteboard_parent_move();

-- True for the meeting host or a workspace admin who is also a MEMBER.
-- tuturuuu: no-grant (internal)
create function private.meet_whiteboard_can_manage(
  p_actor_id uuid,
  p_meeting_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (
      select public.is_org_member(p_actor_id, m.ws_id)
        and (
          m.creator_id = p_actor_id
          or public.has_workspace_permission(m.ws_id, p_actor_id, 'admin')
        )
      from public.workspace_meetings m
      where m.id = p_meeting_id
    ),
    false
  );
$$;

revoke all on function private.meet_whiteboard_can_manage(uuid, uuid)
  from public, anon, authenticated, service_role;

create function private.link_meet_whiteboard(
  p_actor_id uuid,
  p_meeting_id uuid,
  p_whiteboard_id uuid,
  p_guest_access text default 'view'
) returns private.meet_whiteboards
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ws_id uuid;
  v_board_archived_at timestamptz;
  v_board_found boolean;
  v_link private.meet_whiteboards;
begin
  if p_actor_id is null or p_guest_access is null
    or p_guest_access not in ('none', 'view', 'draw') then
    raise exception 'Invalid whiteboard link request' using errcode = '22023';
  end if;

  -- Authorize first: a missing meeting and a meeting the actor cannot manage
  -- are indistinguishable.
  if private.meet_whiteboard_can_manage(p_actor_id, p_meeting_id) is distinct from true then
    raise exception 'Only the meeting host or a workspace admin can link a whiteboard'
      using errcode = '42501';
  end if;

  select m.ws_id into v_ws_id
  from public.workspace_meetings m
  where m.id = p_meeting_id;

  -- A board in another workspace is reported exactly like a missing one.
  select true, w.archived_at into v_board_found, v_board_archived_at
  from public.workspace_whiteboards w
  where w.id = p_whiteboard_id
    and w.ws_id = v_ws_id;

  if v_board_found is distinct from true then
    raise exception 'Whiteboard missing' using errcode = 'P0002';
  end if;

  if v_board_archived_at is not null then
    raise exception 'An archived whiteboard cannot be linked' using errcode = '55000';
  end if;

  insert into private.meet_whiteboards (
    meeting_id, whiteboard_id, ws_id, created_by, guest_access
  ) values (
    p_meeting_id, p_whiteboard_id, v_ws_id, p_actor_id, p_guest_access
  )
  on conflict (meeting_id, whiteboard_id) do nothing;

  select * into v_link
  from private.meet_whiteboards l
  where l.meeting_id = p_meeting_id
    and l.whiteboard_id = p_whiteboard_id;

  return v_link;
end;
$$;

-- Locks the meeting, then the whiteboard, then the link, the same order a
-- parent delete takes when it cascades, so the two cannot deadlock. The scope
-- trigger does not fire for guest_access, so updated_at is set here.
-- Raising access on an archived board is refused; lowering it stays allowed.
create function private.set_meet_whiteboard_guest_access(
  p_actor_id uuid,
  p_meeting_id uuid,
  p_whiteboard_id uuid,
  p_guest_access text
) returns private.meet_whiteboards
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_link private.meet_whiteboards;
  v_archived_at timestamptz;
begin
  if p_actor_id is null or p_guest_access is null
    or p_guest_access not in ('none', 'view', 'draw') then
    raise exception 'Invalid guest access' using errcode = '22023';
  end if;

  perform 1 from public.workspace_meetings m where m.id = p_meeting_id for share;
  select w.archived_at into v_archived_at
  from public.workspace_whiteboards w
  where w.id = p_whiteboard_id
  for share;

  select * into v_link
  from private.meet_whiteboards l
  where l.meeting_id = p_meeting_id
    and l.whiteboard_id = p_whiteboard_id
  for update;

  -- A missing link and a link the actor may not change look the same to
  -- everyone except a meeting manager.
  if (
    (v_link.meeting_id is not null
      and v_link.created_by = p_actor_id
      and public.is_org_member(p_actor_id, v_link.ws_id))
    or private.meet_whiteboard_can_manage(p_actor_id, p_meeting_id)
  ) is distinct from true then
    raise exception 'Not allowed to change this whiteboard link'
      using errcode = '42501';
  end if;

  if v_link.meeting_id is null then
    raise exception 'Whiteboard link missing' using errcode = 'P0002';
  end if;

  if v_archived_at is not null
    and (case p_guest_access when 'none' then 0 when 'view' then 1 else 2 end)
      > (case v_link.guest_access when 'none' then 0 when 'view' then 1 else 2 end) then
    raise exception 'Guest access on an archived whiteboard cannot be raised'
      using errcode = '55000';
  end if;

  update private.meet_whiteboards l
  set guest_access = p_guest_access,
    updated_at = pg_catalog.now()
  where l.meeting_id = p_meeting_id
    and l.whiteboard_id = p_whiteboard_id
  returning * into v_link;

  return v_link;
end;
$$;

create function private.unlink_meet_whiteboard(
  p_actor_id uuid,
  p_meeting_id uuid,
  p_whiteboard_id uuid
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_link private.meet_whiteboards;
begin
  if p_actor_id is null then
    raise exception 'Invalid whiteboard unlink request' using errcode = '22023';
  end if;

  perform 1 from public.workspace_meetings m where m.id = p_meeting_id for share;
  perform 1 from public.workspace_whiteboards w where w.id = p_whiteboard_id for share;

  select * into v_link
  from private.meet_whiteboards l
  where l.meeting_id = p_meeting_id
    and l.whiteboard_id = p_whiteboard_id
  for update;

  if (
    (v_link.meeting_id is not null
      and v_link.created_by = p_actor_id
      and public.is_org_member(p_actor_id, v_link.ws_id))
    or private.meet_whiteboard_can_manage(p_actor_id, p_meeting_id)
  ) is distinct from true then
    raise exception 'Not allowed to remove this whiteboard link'
      using errcode = '42501';
  end if;

  if v_link.meeting_id is null then
    raise exception 'Whiteboard link missing' using errcode = 'P0002';
  end if;

  delete from private.meet_whiteboards l
  where l.meeting_id = p_meeting_id
    and l.whiteboard_id = p_whiteboard_id;

  return true;
end;
$$;

revoke all on function private.link_meet_whiteboard(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function private.link_meet_whiteboard(uuid, uuid, uuid, text)
  to service_role;

revoke all on function private.set_meet_whiteboard_guest_access(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function private.set_meet_whiteboard_guest_access(uuid, uuid, uuid, text)
  to service_role;

revoke all on function private.unlink_meet_whiteboard(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.unlink_meet_whiteboard(uuid, uuid, uuid)
  to service_role;

commit;
