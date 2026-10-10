-- Inert teacher-hours storage: no current tutoring API/Create consumer.
create table private.workspace_tutoring_hours_anchors (
  ws_id uuid primary key references public.workspaces(id) on delete cascade
);
create table private.workspace_tutoring_hours_defaults (
  ws_id uuid primary key references private.workspace_tutoring_hours_anchors(ws_id) on delete cascade,
  time_zone text not null,
  week jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references public.users(id),
  updated_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table private.workspace_tutoring_hours_overrides (
  ws_id uuid not null references private.workspace_tutoring_hours_anchors(ws_id) on delete cascade,
  teacher_id uuid not null references public.workspace_users(id) on delete cascade,
  week jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  created_by uuid not null references public.users(id),
  updated_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ws_id, teacher_id)
);
alter table private.workspace_tutoring_hours_anchors enable row level security;
alter table private.workspace_tutoring_hours_defaults enable row level security;
alter table private.workspace_tutoring_hours_overrides enable row level security;
-- All callers including service_role must use the scoped definer boundary.
revoke all on private.workspace_tutoring_hours_anchors,
  private.workspace_tutoring_hours_defaults, private.workspace_tutoring_hours_overrides
  from public, anon, authenticated, service_role;

create function private.valid_tutoring_hours_week(p_week jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare d record; block jsonb; start_min integer; end_min integer; previous_end integer;
begin
  if p_week is null or jsonb_typeof(p_week) <> 'object' then return false; end if;
  for d in select * from jsonb_each(p_week) loop
    if d.key !~ '^[1-7]$' or jsonb_typeof(d.value) <> 'array' then return false; end if;
    if jsonb_array_length(d.value) > 24 then return false; end if;
    previous_end := -1;
    for block in select * from jsonb_array_elements(d.value) loop
      if jsonb_typeof(block) <> 'object' then return false; end if;
      if (select count(*) from jsonb_object_keys(block)) <> 2
        or jsonb_typeof(block->'start') is distinct from 'string'
        or jsonb_typeof(block->'end') is distinct from 'string' then return false; end if;
      if block->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or (block->>'end' <> '24:00' and block->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false; end if;
      start_min := split_part(block->>'start',':',1)::integer*60+split_part(block->>'start',':',2)::integer;
      end_min := split_part(block->>'end',':',1)::integer*60+split_part(block->>'end',':',2)::integer;
      if end_min <= start_min or start_min < previous_end then return false; end if;
      previous_end := end_min;
    end loop;
  end loop;
  return true;
end;
$$;
create function private.valid_tutoring_hours_timezone(p_zone text) returns boolean
language sql stable set search_path='' as $$
  select p_zone is not null and p_zone <> 'auto' and p_zone !~ '^[+-]'
    and p_zone !~ '^(posix|right)/'
    and exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone);
$$;
-- Full-precision decimal text is the wire receipt; no JSON numeric revision.
create function private.valid_tutoring_hours_revision(p_revision text) returns boolean
language sql immutable set search_path='' as $$
  select case when p_revision is null then true
    when p_revision ~ '^[1-9][0-9]{0,18}$' then p_revision::numeric <= 9223372036854775807::numeric
    else false end;
$$;
alter table private.workspace_tutoring_hours_defaults add constraint tutoring_default_week_valid
  check (private.valid_tutoring_hours_week(week));
alter table private.workspace_tutoring_hours_overrides add constraint tutoring_override_week_valid
  check (private.valid_tutoring_hours_week(week));

create function private.assert_tutoring_hours_actor(p_ws uuid,p_actor uuid,p_write boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.workspace_members where ws_id=p_ws and user_id=p_actor and type='MEMBER' for share;
  if not found or public.has_workspace_permission(p_ws,p_actor,
    case when p_write then 'manage_workspace_settings' else 'view_user_groups' end) is not true then
    raise exception 'Tutoring hours forbidden' using errcode='42501';
  end if;
end;
$$;
create function private.lock_tutoring_hours_teacher(p_ws uuid,p_teacher uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- Sorted row locks retain a CURRENT same-workspace TEACHER role until commit.
  -- This is not a historical membership remove/readd epoch.
  perform u.id from public.workspace_users u
    join public.workspace_user_groups_users m on m.user_id=u.id
    join public.workspace_user_groups g on g.id=m.group_id
    where u.id=p_teacher and u.ws_id=p_ws and m.role='TEACHER' and g.ws_id=p_ws
    order by g.id for share of u,m,g;
  if not found then raise exception 'Tutoring teacher unavailable' using errcode='P0002'; end if;
end;
$$;
create function private.audit_tutoring_hours_revision(
  p_ws uuid,p_actor uuid,p_teacher uuid,p_before text,p_after text,p_reset boolean
) returns void language plpgsql security definer set search_path='' as $$
declare rel regclass; rid uuid; old_receipt jsonb; receipt jsonb;
begin
  rel := case when p_teacher is null then 'private.workspace_tutoring_hours_defaults'::regclass
    else 'private.workspace_tutoring_hours_overrides'::regclass end;
  receipt := jsonb_strip_nulls(jsonb_build_object('ws_id',p_ws,'teacher_id',p_teacher,
    'revision',p_after,'action',case when p_reset then 'teacher_hours.reset'
      when p_teacher is null then 'teacher_hours.default_saved' else 'teacher_hours.override_saved' end));
  rid := audit.to_record_id(rel::oid,case when p_teacher is null then array['ws_id'] else array['ws_id','teacher_id'] end,receipt);
  if p_before is not null then old_receipt := jsonb_strip_nulls(jsonb_build_object(
    'ws_id',p_ws,'teacher_id',p_teacher,'revision',p_before)); end if;
  insert into audit.record_version(record_id,old_record_id,op,table_oid,table_schema,table_name,record,old_record,auth_uid)
  values(rid,case when p_before is null then null else rid end,
    case when p_before is null then 'INSERT'::audit.operation else 'UPDATE'::audit.operation end,
    rel::oid,'private',case when p_teacher is null then 'workspace_tutoring_hours_defaults'
      else 'workspace_tutoring_hours_overrides' end,receipt,old_receipt,p_actor);
end;
$$;

create function private.read_tutoring_teacher_hours(p_ws uuid,p_actor uuid,p_teacher uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.assert_tutoring_hours_actor(p_ws,p_actor,false);
  if p_teacher is not null then perform private.lock_tutoring_hours_teacher(p_ws,p_teacher); end if;
  -- One expression/statement snapshot keeps default and override receipts coherent.
  return jsonb_build_object('default',
    (select jsonb_build_object('revision',revision::text,'frame',jsonb_build_object('timeZone',time_zone,'confirmed',true),'week',week)
      from private.workspace_tutoring_hours_defaults where ws_id=p_ws),
    'override',(select jsonb_build_object('revision',revision::text,'week',week)
      from private.workspace_tutoring_hours_overrides where ws_id=p_ws and teacher_id=p_teacher));
end;
$$;

create function private.save_tutoring_hours_default(
  p_ws uuid,p_actor uuid,p_expected text,p_zone text,p_confirmed boolean,p_week jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row private.workspace_tutoring_hours_defaults; previous text;
begin
  perform private.assert_tutoring_hours_actor(p_ws,p_actor,true);
  if p_confirmed is not true or private.valid_tutoring_hours_timezone(p_zone) is not true
    or not private.valid_tutoring_hours_week(p_week) or not private.valid_tutoring_hours_revision(p_expected) then
    raise exception 'Invalid tutoring hours' using errcode='22023';
  end if;
  insert into private.workspace_tutoring_hours_anchors(ws_id) values(p_ws) on conflict do nothing;
  perform 1 from private.workspace_tutoring_hours_anchors where ws_id=p_ws for update;
  select * into current_row from private.workspace_tutoring_hours_defaults where ws_id=p_ws for update;
  previous := current_row.revision::text;
  if previous is distinct from p_expected then
    raise exception 'Tutoring hours revision conflict' using errcode='40001';
  end if;
  if previous is null then
    insert into private.workspace_tutoring_hours_defaults(ws_id,time_zone,week,created_by,updated_by)
      values(p_ws,p_zone,p_week,p_actor,p_actor) returning * into current_row;
  else
    update private.workspace_tutoring_hours_defaults set time_zone=p_zone,week=p_week,
      revision=revision+1,updated_by=p_actor,updated_at=clock_timestamp()
      where ws_id=p_ws returning * into current_row;
  end if;
  perform private.audit_tutoring_hours_revision(p_ws,p_actor,null,previous,current_row.revision::text,false);
  -- Writer may lack read permission; return confirmed scoped write receipt directly.
  return jsonb_build_object('revision',current_row.revision::text,
    'frame',jsonb_build_object('timeZone',current_row.time_zone,'confirmed',true),'week',current_row.week);
end;
$$;

create function private.save_tutoring_hours_override(
  p_ws uuid,p_actor uuid,p_teacher uuid,p_expected_default text,p_expected_override text,p_week jsonb,p_reset boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare base private.workspace_tutoring_hours_defaults; custom private.workspace_tutoring_hours_overrides; previous text;
begin
  perform private.assert_tutoring_hours_actor(p_ws,p_actor,true);
  if p_teacher is null or p_reset is null or not private.valid_tutoring_hours_week(p_week)
    or not private.valid_tutoring_hours_revision(p_expected_default)
    or not private.valid_tutoring_hours_revision(p_expected_override)
    or (p_reset and p_week <> '{}'::jsonb) then
    raise exception 'Invalid tutoring hours' using errcode='22023';
  end if;
  insert into private.workspace_tutoring_hours_anchors(ws_id) values(p_ws) on conflict do nothing;
  perform 1 from private.workspace_tutoring_hours_anchors where ws_id=p_ws for update;
  select * into base from private.workspace_tutoring_hours_defaults where ws_id=p_ws for update;
  if base.revision is null then raise exception 'Tutoring hours frame unavailable' using errcode='P0002'; end if;
  if base.revision::text is distinct from p_expected_default then
    raise exception 'Tutoring hours revision conflict' using errcode='40001';
  end if;
  select * into custom from private.workspace_tutoring_hours_overrides where ws_id=p_ws and teacher_id=p_teacher for update;
  previous := custom.revision::text;
  if previous is distinct from p_expected_override then
    raise exception 'Tutoring hours revision conflict' using errcode='40001';
  end if;
  perform private.lock_tutoring_hours_teacher(p_ws,p_teacher);
  if previous is null then
    insert into private.workspace_tutoring_hours_overrides(ws_id,teacher_id,week,created_by,updated_by)
      values(p_ws,p_teacher,p_week,p_actor,p_actor) returning * into custom;
  else
    update private.workspace_tutoring_hours_overrides set week=p_week,revision=revision+1,
      updated_by=p_actor,updated_at=clock_timestamp() where ws_id=p_ws and teacher_id=p_teacher returning * into custom;
  end if;
  perform private.audit_tutoring_hours_revision(p_ws,p_actor,p_teacher,previous,custom.revision::text,p_reset);
  return jsonb_build_object('defaultRevision',base.revision::text,'revision',custom.revision::text,'week',custom.week);
end;
$$;
-- Validators and child helpers are not independently invocable server capabilities.
revoke all on function private.valid_tutoring_hours_week(jsonb),private.valid_tutoring_hours_timezone(text),
  private.valid_tutoring_hours_revision(text),private.assert_tutoring_hours_actor(uuid,uuid,boolean),
  private.lock_tutoring_hours_teacher(uuid,uuid),private.audit_tutoring_hours_revision(uuid,uuid,uuid,text,text,boolean),
  private.read_tutoring_teacher_hours(uuid,uuid,uuid),private.save_tutoring_hours_default(uuid,uuid,text,text,boolean,jsonb),
  private.save_tutoring_hours_override(uuid,uuid,uuid,text,text,jsonb,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.read_tutoring_teacher_hours(uuid,uuid,uuid),
  private.save_tutoring_hours_default(uuid,uuid,text,text,boolean,jsonb),
  private.save_tutoring_hours_override(uuid,uuid,uuid,text,text,jsonb,boolean) to service_role;
notify pgrst, 'reload schema';
