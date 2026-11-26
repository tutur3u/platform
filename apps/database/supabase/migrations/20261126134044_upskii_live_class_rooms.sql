-- Apply off-peak. Foreign keys briefly take SHARE ROW EXCLUSIVE locks on
-- their referenced tables. The 5-second lock timeout bounds the wait.
--
-- The Upskii service attests class authority. An authorized operator can
-- release a mistaken binding with private.release_external_class_room as
-- service_role. It records the actor and reason and preserves the existing Meet room.
-- The next eligible teacher start can establish a new mapping.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.upskii_live_class_grants (
  link_id uuid primary key references private.external_account_links (id) on delete cascade,
  scope text not null default 'meet:rooms:external-class:write'
    check (scope = 'meet:rooms:external-class:write'),
  granted_at timestamptz not null default now()
);

create table private.upskii_live_class_rooms (
  class_id text primary key check (class_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  meeting_id uuid unique references public.workspace_meetings (id) on delete set null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  owner_subject text not null check (char_length(owner_subject) between 1 and 128),
  link_id uuid not null references private.external_account_links (id) on delete cascade
);

create index upskii_live_class_rooms_owner_idx on private.upskii_live_class_rooms (owner_id);
create index upskii_live_class_rooms_link_idx on private.upskii_live_class_rooms (link_id);

create table private.upskii_live_class_releases (
  id uuid primary key default gen_random_uuid(),
  class_id text not null,
  meeting_id uuid,
  actor text not null check (char_length(btrim(actor)) between 1 and 128),
  reason text not null check (char_length(btrim(reason)) between 1 and 240),
  released_at timestamptz not null default now()
);
alter table private.upskii_live_class_releases enable row level security;
revoke all on private.upskii_live_class_releases
from public, anon, authenticated, service_role;
grant select on private.upskii_live_class_releases to service_role;

alter table private.upskii_live_class_grants enable row level security;
alter table private.upskii_live_class_rooms enable row level security;
revoke all on private.upskii_live_class_grants, private.upskii_live_class_rooms
from public, anon, authenticated, service_role;
grant select, insert, update, delete on private.upskii_live_class_grants to service_role;
grant select, insert, update on private.upskii_live_class_rooms to service_role;

create function public.open_upskii_live_class_room(
  p_class_id text,
  p_link_id uuid,
  p_subject text,
  p_owner_id uuid,
  p_ws_id uuid,
  p_name text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  saved private.upskii_live_class_rooms%rowtype;
  room_id uuid;
begin
  -- Hold both revocation fences through the creation transaction.
  perform 1 from private.external_account_links as link
  join private.upskii_live_class_grants as consent on consent.link_id = link.id
  where link.id = p_link_id and link.provider = 'upskii'
    and link.external_subject = p_subject and link.user_id = p_owner_id
    and link.revoked_at is null
  for share of link, consent;
  if not found then
    return jsonb_build_object('kind', 'denied');
  end if;

  perform 1 from public.workspaces as ws
  join public.workspace_members as member on member.ws_id = ws.id
  where ws.id = p_ws_id and ws.creator_id = p_owner_id
    and ws.personal is true and ws.deleted is not true
    and member.user_id = p_owner_id and member.type = 'MEMBER';
  if not found then
    return jsonb_build_object('kind', 'denied');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('upskii-live-class:' || p_class_id, 0));
  select * into saved from private.upskii_live_class_rooms where class_id = p_class_id;
  if found and (saved.owner_id <> p_owner_id or saved.owner_subject <> p_subject) then
    return jsonb_build_object('kind', 'conflict');
  end if;

  room_id := saved.meeting_id;
  if room_id is null then
    insert into public.workspace_meetings (ws_id, creator_id, name, time)
    values (p_ws_id, p_owner_id, p_name, now()) returning id into room_id;
  elsif not exists (
    select 1 from public.workspace_meetings
    where id = room_id and ws_id = p_ws_id and creator_id = p_owner_id
  ) then
    return jsonb_build_object('kind', 'denied');
  end if;

  insert into private.upskii_live_class_rooms (class_id, meeting_id, owner_id, owner_subject, link_id)
  values (p_class_id, room_id, p_owner_id, p_subject, p_link_id)
  on conflict (class_id) do update set meeting_id = excluded.meeting_id, link_id = excluded.link_id;

  return jsonb_build_object('kind', 'room', 'meetingId', room_id);
end;
$$;

revoke all on function public.open_upskii_live_class_room(text, uuid, text, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.open_upskii_live_class_room(text, uuid, text, uuid, uuid, text)
to service_role;

create function private.release_external_class_room(p_class_id text, p_reason text, p_actor text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  room_id uuid;
  actor_text text := btrim(p_actor);
  reason_text text := btrim(p_reason);
begin
  if p_class_id is null or p_class_id !~ '^[A-Za-z0-9_-]{1,128}$'
    or actor_text is null or char_length(actor_text) not between 1 and 128
    or reason_text is null or char_length(reason_text) not between 1 and 240 then
    raise exception 'An exact class ID, release reason and operator ID are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('upskii-live-class:' || p_class_id, 0));
  delete from private.upskii_live_class_rooms
  where class_id = p_class_id
  returning meeting_id into room_id;
  if not found then
    return false;
  end if;

  insert into private.upskii_live_class_releases (class_id, meeting_id, reason, actor)
  values (p_class_id, room_id, reason_text, actor_text);
  return true;
end;
$$;

revoke all on function private.release_external_class_room(text, text, text)
from public, anon, authenticated, service_role;
grant execute on function private.release_external_class_room(text, text, text)
to service_role;

commit;
