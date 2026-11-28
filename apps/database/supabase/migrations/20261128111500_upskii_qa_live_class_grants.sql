begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.upskii_qa_live_class_grants (
  operation_id uuid primary key,
  class_id uuid not null,
  link_id uuid not null references private.external_account_links(id) on delete cascade,
  expires_at timestamptz not null
);
create index upskii_qa_live_class_grants_lookup
on private.upskii_qa_live_class_grants (link_id, class_id, expires_at);
alter table private.upskii_qa_live_class_grants enable row level security;
revoke all on private.upskii_qa_live_class_grants from public, anon, authenticated, service_role;
grant select, insert on private.upskii_qa_live_class_grants to service_role;
grant update (expires_at) on private.upskii_qa_live_class_grants to service_role;

-- Keep the admission binding when the account link or class mapping is removed.
create table private.upskii_qa_live_class_meetings (
  meeting_id uuid primary key references public.workspace_meetings(id) on delete cascade,
  class_id text not null,
  link_id uuid not null,
  owner_id uuid not null,
  owner_subject text not null
);
alter table private.upskii_qa_live_class_meetings enable row level security;
revoke all on private.upskii_qa_live_class_meetings from public, anon, authenticated, service_role;
grant select on private.upskii_qa_live_class_meetings to service_role;

-- Capture legacy room opens before the join guard is enabled.
-- tuturuuu: no-grant (trigger)
create function private.capture_upskii_qa_live_class_meeting()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.meeting_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.meeting_id is not distinct from old.meeting_id then return new; end if;
  end if;

  insert into private.upskii_qa_live_class_meetings (
    meeting_id, class_id, link_id, owner_id, owner_subject
  )
  select new.meeting_id, new.class_id, new.link_id, new.owner_id, new.owner_subject
  from auth.users as identity
  where identity.id = new.owner_id and (
    identity.raw_app_meta_data->'qa_test' = 'true'::jsonb
    or private.is_qa_test_address(identity.email)
    or exists (select 1 from private.qa_test_users where user_id = new.owner_id)
  )
  on conflict (meeting_id) do nothing;

  return new;
end;
$$;
revoke all on function private.capture_upskii_qa_live_class_meeting()
from public, anon, authenticated, service_role;

create trigger capture_upskii_qa_live_class_meeting
after insert or update of meeting_id on private.upskii_live_class_rooms
for each row execute function private.capture_upskii_qa_live_class_meeting();

-- Preserve classification independently of link and class mapping lifetime.
insert into private.upskii_qa_live_class_meetings (
  meeting_id, class_id, link_id, owner_id, owner_subject
)
select room.meeting_id, room.class_id, room.link_id, room.owner_id, room.owner_subject
from private.upskii_live_class_rooms as room
join auth.users as identity on identity.id = room.owner_id
where room.meeting_id is not null
  and (
    identity.raw_app_meta_data->'qa_test' = 'true'::jsonb
    or private.is_qa_test_address(identity.email)
    or exists (select 1 from private.qa_test_users where user_id = room.owner_id)
  );

create function private.upskii_live_class_authorized(
  p_class_id text, p_link_id uuid, p_subject text, p_owner_id uuid,
  p_require_qa boolean default false
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  identity auth.users%rowtype;
begin
  perform 1 from private.external_account_links as link
  where link.id = p_link_id and link.provider = 'upskii'
    and link.external_subject = p_subject and link.user_id = p_owner_id
    and link.revoked_at is null
  for share;
  if not found then return false; end if;

  select * into identity from auth.users where id = p_owner_id for share;
  if not found then return false; end if;

  if identity.raw_app_meta_data->'qa_test' = 'true'::jsonb then
    if identity.raw_app_meta_data->'qa_staff' is distinct from 'true'::jsonb
      or identity.email_confirmed_at is null
      or identity.banned_until > clock_timestamp() then
      return false;
    end if;
    perform 1
    from private.upskii_qa_live_class_grants as consent
    join private.qa_test_users as qa on qa.user_id = p_owner_id
    join private.qa_test_runs as run on run.id = qa.run_id
    where consent.link_id = p_link_id and consent.class_id::text = p_class_id
      and consent.expires_at > clock_timestamp()
      and qa.state = 'active' and qa.staff
      and run.id = identity.raw_app_meta_data->>'qa_run'
      and run.purpose = 'upskii-e2e' and run.expires_at > clock_timestamp()
    for share of consent, qa, run;
  else
    if p_require_qa or private.is_qa_test_address(identity.email) then return false; end if;
    perform 1 from private.qa_test_users where user_id = p_owner_id for share;
    if found then return false; end if;

    perform 1 from private.upskii_live_class_grants as consent
    where consent.link_id = p_link_id
    for share;
  end if;
  return found;
end;
$$;
revoke all on function private.upskii_live_class_authorized(text, uuid, text, uuid, boolean)
from public, anon, authenticated;
grant execute on function private.upskii_live_class_authorized(text, uuid, text, uuid, boolean)
to service_role;

create function public.can_open_upskii_live_class(
  p_class_id text, p_link_id uuid, p_subject text, p_owner_id uuid
) returns boolean
language sql
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select private.upskii_live_class_authorized(p_class_id, p_link_id, p_subject, p_owner_id);
$$;
revoke all on function public.can_open_upskii_live_class(text, uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.can_open_upskii_live_class(text, uuid, text, uuid)
to service_role;

create function public.can_join_upskii_qa_live_class(p_meeting_id uuid)
returns boolean
language sql
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select coalesce((
    select private.upskii_live_class_authorized(
      binding.class_id, binding.link_id, binding.owner_subject, binding.owner_id, true
    )
    from private.upskii_qa_live_class_meetings as binding
    where binding.meeting_id = p_meeting_id
  ), true);
$$;
revoke all on function public.can_join_upskii_qa_live_class(uuid)
from public, anon, authenticated;
grant execute on function public.can_join_upskii_qa_live_class(uuid) to service_role;

create function private.bind_upskii_qa_live_class_meeting(
  p_meeting_id uuid, p_class_id text, p_link_id uuid, p_owner_id uuid, p_subject text
) returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  insert into private.upskii_qa_live_class_meetings (
    meeting_id, class_id, link_id, owner_id, owner_subject
  )
  select p_meeting_id, p_class_id, p_link_id, p_owner_id, p_subject
  from auth.users as identity
  join private.upskii_live_class_rooms as room on room.meeting_id = p_meeting_id
    and room.owner_id = identity.id and room.owner_subject = p_subject
    and room.class_id = p_class_id and room.link_id = p_link_id
  where identity.id = p_owner_id and identity.raw_app_meta_data->'qa_test' = 'true'::jsonb
  on conflict (meeting_id) do update set link_id = excluded.link_id
  where upskii_qa_live_class_meetings.class_id = excluded.class_id
    and upskii_qa_live_class_meetings.owner_id = excluded.owner_id
    and upskii_qa_live_class_meetings.owner_subject = excluded.owner_subject
    and private.upskii_live_class_authorized(
      excluded.class_id, excluded.link_id, excluded.owner_subject, excluded.owner_id, true
    );
$$;
revoke all on function private.bind_upskii_qa_live_class_meeting(uuid,text,uuid,uuid,text)
from public, anon, authenticated;
grant execute on function private.bind_upskii_qa_live_class_meeting(uuid,text,uuid,uuid,text)
to service_role;

create function public.open_upskii_live_class_room_with_qa_grant(
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
  if not private.upskii_live_class_authorized(
    p_class_id, p_link_id, p_subject, p_owner_id
  ) then
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

  perform private.bind_upskii_qa_live_class_meeting(
    room_id, p_class_id, p_link_id, p_owner_id, p_subject
  );

  return jsonb_build_object('kind', 'room', 'meetingId', room_id);
end;
$$;

revoke all on function public.open_upskii_live_class_room_with_qa_grant(text, uuid, text, uuid, uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.open_upskii_live_class_room_with_qa_grant(text, uuid, text, uuid, uuid, text)
to service_role;

commit;
