alter table private.workspace_user_group_session_series
  add column if not exists description_json jsonb;

alter table private.workspace_user_group_sessions
  add column if not exists description_json jsonb;

alter table public.user_group_attendance
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists session_id uuid;

update public.user_group_attendance
set id = gen_random_uuid()
where id is null;

alter table public.user_group_attendance
  alter column id set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'user_group_attendance_pkey'
      and conrelid = 'public.user_group_attendance'::regclass
  ) then
    alter table public.user_group_attendance
      drop constraint user_group_attendance_pkey;
  end if;
end;
$$;

drop index if exists public.user_group_attendance_pkey;

alter table public.user_group_attendance
  add constraint user_group_attendance_pkey primary key (id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_group_attendance_session_id_fkey'
      and conrelid = 'public.user_group_attendance'::regclass
  ) then
    alter table public.user_group_attendance
      add constraint user_group_attendance_session_id_fkey
      foreign key (session_id)
      references private.workspace_user_group_sessions(id)
      on update cascade
      on delete cascade
      not valid;
  end if;
end;
$$;

alter table public.user_group_attendance
  validate constraint user_group_attendance_session_id_fkey;

create unique index if not exists user_group_attendance_session_key
  on public.user_group_attendance (group_id, user_id, session_id)
  where session_id is not null;

create unique index if not exists user_group_attendance_legacy_date_key
  on public.user_group_attendance (group_id, user_id, date)
  where session_id is null;

create index if not exists user_group_attendance_group_session_idx
  on public.user_group_attendance (group_id, session_id)
  where session_id is not null;

with session_dates as (
  select
    session.group_id,
    (session.starts_at at time zone session.start_timezone)::date as session_date,
    count(*)::integer as session_count,
    (array_agg(session.id order by session.starts_at))[1] as session_id
  from private.workspace_user_group_sessions session
  where session.status = 'scheduled'
  group by
    session.group_id,
    (session.starts_at at time zone session.start_timezone)::date
),
unambiguous_sessions as (
  select group_id, session_date, session_id
  from session_dates
  where session_count = 1
)
update public.user_group_attendance attendance
set session_id = unambiguous_sessions.session_id
from unambiguous_sessions
where attendance.session_id is null
  and attendance.group_id = unambiguous_sessions.group_id
  and attendance.date = unambiguous_sessions.session_date
  -- Skip orphan attendance rows whose (user_id, group_id) no longer exists in
  -- workspace_user_groups_users. user_group_attendance_member_fkey was added
  -- NOT VALID (20260603095000), so such pre-existing orphans are tolerated but
  -- must not be touched here — updating them would re-check the FK and abort the
  -- whole migration (SQLSTATE 23503).
  and exists (
    select 1
    from public.workspace_user_groups_users member
    where member.user_id = attendance.user_id
      and member.group_id = attendance.group_id
  );

create or replace function private.assert_user_group_attendance_session_scope()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.session_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from private.workspace_user_group_sessions session
    where session.id = new.session_id
      and session.group_id = new.group_id
      and session.status = 'scheduled'
      and (session.starts_at at time zone session.start_timezone)::date = new.date
  ) then
    raise exception 'invalid_attendance_session' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists user_group_attendance_session_scope
  on public.user_group_attendance;
create trigger user_group_attendance_session_scope
  before insert or update of group_id, date, session_id
  on public.user_group_attendance
  for each row
  execute function private.assert_user_group_attendance_session_scope();

revoke all on function private.assert_user_group_attendance_session_scope()
from public, anon, authenticated;

create or replace function private.materialize_workspace_user_group_session_series(
  p_series_id uuid,
  p_until date default null
)
returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_series private.workspace_user_group_session_series;
  v_date date;
  v_default_until date;
  v_materialize_until date;
  v_end_date date;
  v_starts_at timestamp with time zone;
  v_ends_at timestamp with time zone;
  v_count integer := 0;
begin
  select *
  into v_series
  from private.workspace_user_group_session_series
  where id = p_series_id;

  if not found then
    raise exception 'session_series_not_found' using errcode = 'P0002';
  end if;

  v_default_until := (v_series.start_date + interval '12 months')::date;
  v_materialize_until := least(
    coalesce(v_series.until_date, v_default_until),
    coalesce(p_until, v_default_until)
  );

  for v_date in
    select generated_date::date
    from generate_series(
      v_series.start_date,
      v_materialize_until,
      interval '1 day'
    ) as generated_date
    where extract(dow from generated_date)::integer = any(v_series.days_of_week)
      and (
        ((generated_date::date - v_series.start_date)::integer / 7)
        % greatest(v_series.interval_weeks, 1)
      ) = 0
    order by generated_date
  loop
    v_end_date := case
      when v_series.end_time <= v_series.start_time then v_date + 1
      else v_date
    end;

    v_starts_at := make_timestamptz(
      extract(year from v_date)::integer,
      extract(month from v_date)::integer,
      extract(day from v_date)::integer,
      extract(hour from v_series.start_time)::integer,
      extract(minute from v_series.start_time)::integer,
      extract(second from v_series.start_time)::double precision,
      v_series.start_timezone
    );

    v_ends_at := make_timestamptz(
      extract(year from v_end_date)::integer,
      extract(month from v_end_date)::integer,
      extract(day from v_end_date)::integer,
      extract(hour from v_series.end_time)::integer,
      extract(minute from v_series.end_time)::integer,
      extract(second from v_series.end_time)::double precision,
      v_series.end_timezone
    );

    insert into private.workspace_user_group_sessions (
      ws_id,
      group_id,
      series_id,
      title,
      description,
      description_json,
      starts_at,
      ends_at,
      start_timezone,
      end_timezone,
      recurrence_instance_date,
      source
    )
    values (
      v_series.ws_id,
      v_series.group_id,
      v_series.id,
      v_series.title,
      v_series.description,
      v_series.description_json,
      v_starts_at,
      v_ends_at,
      v_series.start_timezone,
      v_series.end_timezone,
      v_date,
      coalesce(v_series.source, 'series')
    )
    on conflict (series_id, recurrence_instance_date)
      where series_id is not null and recurrence_instance_date is not null
    do update set
      ws_id = excluded.ws_id,
      group_id = excluded.group_id,
      title = excluded.title,
      description = excluded.description,
      description_json = excluded.description_json,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      start_timezone = excluded.start_timezone,
      end_timezone = excluded.end_timezone,
      source = excluded.source,
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function private.materialize_workspace_user_group_session_series(uuid, date)
from public, anon, authenticated;
grant execute on function private.materialize_workspace_user_group_session_series(uuid, date)
to service_role;

create or replace function "private"."admin_save_user_group_attendance_with_audit_actor"(
  p_ws_id uuid,
  p_group_id uuid,
  p_date date,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, audit, private
as $function$
declare
  input_count integer;
  valid_user_count integer;
  invalid_session_count integer;
begin
  if not exists (
    select 1
    from "public"."workspace_user_groups" workspace_group
    where workspace_group."id" = p_group_id
      and workspace_group."ws_id" = p_ws_id
  ) then
    raise exception 'user_group_not_found' using errcode = 'P0002';
  end if;

  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "status" text,
      "date" date,
      "notes" text,
      "session_id" uuid
    )
  )
  select count(distinct input_values."user_id")::integer
  into input_count
  from input_values;

  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "status" text,
      "date" date,
      "notes" text,
      "session_id" uuid
    )
  )
  select count(distinct group_member."user_id")::integer
  into valid_user_count
  from input_values
  join "public"."workspace_users" workspace_user
    on workspace_user."id" = input_values."user_id"
   and workspace_user."ws_id" = p_ws_id
  join "public"."workspace_user_groups_users" group_member
    on group_member."user_id" = workspace_user."id"
   and group_member."group_id" = p_group_id;

  if valid_user_count <> input_count then
    raise exception 'invalid_attendance_group_member' using errcode = '22023';
  end if;

  with input_values as (
    select *
    from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as value_row(
      "user_id" uuid,
      "status" text,
      "date" date,
      "notes" text,
      "session_id" uuid
    )
    where value_row."session_id" is not null
  )
  select count(*)::integer
  into invalid_session_count
  from input_values
  left join private.workspace_user_group_sessions session
    on session.id = input_values."session_id"
   and session.ws_id = p_ws_id
   and session.group_id = p_group_id
   and session.status = 'scheduled'
   and (session.starts_at at time zone session.start_timezone)::date = p_date
  where session.id is null;

  if invalid_session_count > 0 then
    raise exception 'invalid_attendance_session' using errcode = '22023';
  end if;

  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  delete from "public"."user_group_attendance" attendance
  using (
    select distinct
      input_values."user_id",
      input_values."session_id"
    from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as input_values(
      "user_id" uuid,
      "status" text,
      "date" date,
      "notes" text,
      "session_id" uuid
    )
    where input_values."status" = 'NONE'
  ) as delete_values
  where attendance."group_id" = p_group_id
    and attendance."date" = p_date
    and attendance."user_id" = delete_values."user_id"
    and (
      (delete_values."session_id" is null and attendance."session_id" is null)
      or attendance."session_id" = delete_values."session_id"
    );

  insert into "public"."user_group_attendance" (
    "group_id",
    "date",
    "session_id",
    "user_id",
    "status",
    "notes"
  )
  select
    p_group_id,
    p_date,
    null,
    input_values."user_id",
    input_values."status",
    coalesce(input_values."notes", '')
  from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as input_values(
    "user_id" uuid,
    "status" text,
    "date" date,
    "notes" text,
    "session_id" uuid
  )
  where input_values."status" <> 'NONE'
    and input_values."session_id" is null
  on conflict ("group_id", "user_id", "date")
    where "session_id" is null
  do update set
    "status" = excluded."status",
    "notes" = excluded."notes";

  insert into "public"."user_group_attendance" (
    "group_id",
    "date",
    "session_id",
    "user_id",
    "status",
    "notes"
  )
  select
    p_group_id,
    p_date,
    input_values."session_id",
    input_values."user_id",
    input_values."status",
    coalesce(input_values."notes", '')
  from jsonb_to_recordset(coalesce(p_payload, '[]'::jsonb)) as input_values(
    "user_id" uuid,
    "status" text,
    "date" date,
    "notes" text,
    "session_id" uuid
  )
  where input_values."status" <> 'NONE'
    and input_values."session_id" is not null
  on conflict ("group_id", "user_id", "session_id")
    where "session_id" is not null
  do update set
    "date" = excluded."date",
    "status" = excluded."status",
    "notes" = excluded."notes";
end;
$function$;

revoke all on function "private"."admin_save_user_group_attendance_with_audit_actor"(uuid, uuid, date, jsonb, uuid) from public, anon, authenticated;
grant execute on function "private"."admin_save_user_group_attendance_with_audit_actor"(uuid, uuid, date, jsonb, uuid) to service_role;
