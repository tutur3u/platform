create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.workspace_user_group_session_series (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on update cascade on delete cascade,
  title text,
  description text,
  start_date date not null,
  until_date date,
  days_of_week integer[] not null,
  interval_weeks integer not null default 1,
  start_time time without time zone not null,
  end_time time without time zone not null,
  start_timezone text not null default 'Asia/Ho_Chi_Minh',
  end_timezone text not null default 'Asia/Ho_Chi_Minh',
  source text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workspace_user_group_session_series_interval_check
    check (interval_weeks between 1 and 52),
  constraint workspace_user_group_session_series_days_check
    check (
      array_length(days_of_week, 1) is not null
      and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]
    ),
  constraint workspace_user_group_session_series_until_check
    check (until_date is null or until_date >= start_date)
);

create table if not exists private.workspace_user_group_sessions (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  group_id uuid not null references public.workspace_user_groups(id) on update cascade on delete cascade,
  series_id uuid references private.workspace_user_group_session_series(id) on update cascade on delete set null,
  title text,
  description text,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone not null,
  start_timezone text not null default 'Asia/Ho_Chi_Minh',
  end_timezone text not null default 'Asia/Ho_Chi_Minh',
  recurrence_instance_date date,
  status text not null default 'scheduled',
  source text,
  source_legacy_date date,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workspace_user_group_sessions_time_check
    check (ends_at > starts_at),
  constraint workspace_user_group_sessions_status_check
    check (status in ('scheduled', 'cancelled'))
);

create table if not exists private.workspace_user_group_session_tags (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  name text not null,
  color text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workspace_user_group_session_tags_name_check
    check (length(trim(name)) > 0)
);

create table if not exists private.workspace_user_group_session_tag_links (
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  session_id uuid not null references private.workspace_user_group_sessions(id) on update cascade on delete cascade,
  tag_id uuid not null references private.workspace_user_group_session_tags(id) on update cascade on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (session_id, tag_id)
);

create table if not exists private.workspace_user_group_session_files (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on update cascade on delete cascade,
  session_id uuid not null references private.workspace_user_group_sessions(id) on update cascade on delete cascade,
  storage_path text not null,
  name text,
  created_at timestamp with time zone not null default now(),
  constraint workspace_user_group_session_files_path_check
    check (length(trim(storage_path)) > 0)
);

create index if not exists workspace_user_group_session_series_ws_group_idx
  on private.workspace_user_group_session_series (ws_id, group_id, start_date);

create index if not exists workspace_user_group_sessions_ws_group_start_idx
  on private.workspace_user_group_sessions (ws_id, group_id, starts_at);

create index if not exists workspace_user_group_sessions_ws_start_idx
  on private.workspace_user_group_sessions (ws_id, starts_at);

create index if not exists workspace_user_group_sessions_series_idx
  on private.workspace_user_group_sessions (series_id, recurrence_instance_date)
  where series_id is not null;

create unique index if not exists workspace_user_group_sessions_series_instance_key
  on private.workspace_user_group_sessions (series_id, recurrence_instance_date)
  where series_id is not null and recurrence_instance_date is not null;

create unique index if not exists workspace_user_group_sessions_legacy_date_key
  on private.workspace_user_group_sessions (group_id, source, source_legacy_date)
  where source_legacy_date is not null;

create unique index if not exists workspace_user_group_session_tags_ws_name_key
  on private.workspace_user_group_session_tags (ws_id, lower(name));

create index if not exists workspace_user_group_session_tag_links_ws_idx
  on private.workspace_user_group_session_tag_links (ws_id, tag_id);

create unique index if not exists workspace_user_group_session_files_session_path_key
  on private.workspace_user_group_session_files (session_id, storage_path);

alter table private.workspace_user_group_session_series enable row level security;
alter table private.workspace_user_group_sessions enable row level security;
alter table private.workspace_user_group_session_tags enable row level security;
alter table private.workspace_user_group_session_tag_links enable row level security;
alter table private.workspace_user_group_session_files enable row level security;

drop policy if exists "Service role can manage user group session series"
  on private.workspace_user_group_session_series;
create policy "Service role can manage user group session series"
  on private.workspace_user_group_session_series
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage user group sessions"
  on private.workspace_user_group_sessions;
create policy "Service role can manage user group sessions"
  on private.workspace_user_group_sessions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage user group session tags"
  on private.workspace_user_group_session_tags;
create policy "Service role can manage user group session tags"
  on private.workspace_user_group_session_tags
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage user group session tag links"
  on private.workspace_user_group_session_tag_links;
create policy "Service role can manage user group session tag links"
  on private.workspace_user_group_session_tag_links
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role can manage user group session files"
  on private.workspace_user_group_session_files;
create policy "Service role can manage user group session files"
  on private.workspace_user_group_session_files
  for all
  to service_role
  using (true)
  with check (true);

grant all on table private.workspace_user_group_session_series to service_role;
grant all on table private.workspace_user_group_sessions to service_role;
grant all on table private.workspace_user_group_session_tags to service_role;
grant all on table private.workspace_user_group_session_tag_links to service_role;
grant all on table private.workspace_user_group_session_files to service_role;

drop trigger if exists workspace_user_group_session_series_updated_at
  on private.workspace_user_group_session_series;
create trigger workspace_user_group_session_series_updated_at
  before update on private.workspace_user_group_session_series
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists workspace_user_group_sessions_updated_at
  on private.workspace_user_group_sessions;
create trigger workspace_user_group_sessions_updated_at
  before update on private.workspace_user_group_sessions
  for each row
  execute function public.update_updated_at_column();

drop trigger if exists workspace_user_group_session_tags_updated_at
  on private.workspace_user_group_session_tags;
create trigger workspace_user_group_session_tags_updated_at
  before update on private.workspace_user_group_session_tags
  for each row
  execute function public.update_updated_at_column();

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

insert into private.workspace_user_group_sessions (
  ws_id,
  group_id,
  title,
  starts_at,
  ends_at,
  start_timezone,
  end_timezone,
  recurrence_instance_date,
  source,
  source_legacy_date,
  created_at
)
select
  workspace_group.ws_id,
  workspace_group.id,
  workspace_group.name,
  make_timestamptz(
    extract(year from legacy_session.session_date)::integer,
    extract(month from legacy_session.session_date)::integer,
    extract(day from legacy_session.session_date)::integer,
    7,
    0,
    0,
    'Asia/Ho_Chi_Minh'
  ),
  make_timestamptz(
    extract(year from legacy_session.session_date)::integer,
    extract(month from legacy_session.session_date)::integer,
    extract(day from legacy_session.session_date)::integer,
    8,
    0,
    0,
    'Asia/Ho_Chi_Minh'
  ),
  'Asia/Ho_Chi_Minh',
  'Asia/Ho_Chi_Minh',
  legacy_session.session_date,
  'legacy_workspace_user_groups.sessions',
  legacy_session.session_date,
  coalesce(workspace_group.created_at, now())
from public.workspace_user_groups as workspace_group
cross join lateral (
  select distinct legacy_date
  from unnest(coalesce(workspace_group.sessions, array[]::date[]))
    as legacy_date
) as legacy_session(session_date)
on conflict (group_id, source, source_legacy_date)
  where source_legacy_date is not null
do update set
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  start_timezone = excluded.start_timezone,
  end_timezone = excluded.end_timezone,
  recurrence_instance_date = excluded.recurrence_instance_date,
  updated_at = now();

drop trigger if exists trigger_clean_group_sessions_on_date_change
  on public.workspace_user_groups;
drop function if exists public.clean_group_sessions_on_date_change();
drop index if exists public.workspace_user_groups_sessions_gin_idx;

create or replace function private.admin_update_workspace_user_group_with_audit_actor(
  p_ws_id uuid,
  p_group_id uuid,
  p_payload jsonb,
  p_actor_auth_uid uuid default null
)
returns public.workspace_user_groups
language plpgsql
security definer
set search_path = public, audit
as $function$
declare
  updated_row public.workspace_user_groups;
begin
  perform set_config('audit.override_auth_uid', coalesce(p_actor_auth_uid::text, ''), true);

  update public.workspace_user_groups as workspace_group
  set
    name = case
      when p_payload ? 'name' then nullif(p_payload->>'name', '')
      else workspace_group.name
    end,
    is_guest = case
      when p_payload ? 'is_guest' then nullif(p_payload->>'is_guest', '')::boolean
      else workspace_group.is_guest
    end,
    starting_date = case
      when p_payload ? 'starting_date' then nullif(p_payload->>'starting_date', '')::timestamptz
      else workspace_group.starting_date
    end,
    ending_date = case
      when p_payload ? 'ending_date' then nullif(p_payload->>'ending_date', '')::timestamptz
      else workspace_group.ending_date
    end,
    notes = case
      when p_payload ? 'notes' then nullif(p_payload->>'notes', '')
      else workspace_group.notes
    end,
    description = case
      when p_payload ? 'description' then nullif(p_payload->>'description', '')
      else workspace_group.description
    end,
    archived = case
      when p_payload ? 'archived' then coalesce(nullif(p_payload->>'archived', '')::boolean, false)
      else workspace_group.archived
    end,
    is_course_published = case
      when p_payload ? 'is_course_published' then coalesce(nullif(p_payload->>'is_course_published', '')::boolean, false)
      else workspace_group.is_course_published
    end
  where workspace_group.ws_id = p_ws_id
    and workspace_group.id = p_group_id
  returning * into updated_row;

  return updated_row;
end;
$function$;

revoke all on function private.admin_update_workspace_user_group_with_audit_actor(uuid, uuid, jsonb, uuid)
from public, anon, authenticated;
grant execute on function private.admin_update_workspace_user_group_with_audit_actor(uuid, uuid, jsonb, uuid)
to service_role;

create or replace function private.list_workspace_user_groups_for_table(
  p_ws_id uuid,
  p_status text default 'active',
  p_search text default null,
  p_group_ids uuid[] default null,
  p_accessible_group_ids uuid[] default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  ws_id uuid,
  name text,
  starting_date timestamp with time zone,
  ending_date timestamp with time zone,
  archived boolean,
  notes text,
  is_guest boolean,
  amount integer,
  sessions date[],
  created_at timestamp with time zone,
  has_session_today boolean
)
language plpgsql
stable
as $$
declare
  v_status text := coalesce(nullif(trim(lower(p_status)), ''), 'active');
  v_search text := private.normalize_user_group_search_text(p_search);
  v_timezone text := private.resolve_user_groups_table_timezone(p_ws_id);
  v_today date := (current_timestamp at time zone v_timezone)::date;
begin
  return query
  select
    wug.id,
    wug.ws_id,
    wug.name,
    wug.starting_date,
    wug.ending_date,
    wug.archived,
    wug.notes,
    coalesce(wug.is_guest, false) as is_guest,
    count(wugu.*)::integer as amount,
    coalesce(schedule.session_dates, array[]::date[]) as sessions,
    wug.created_at,
    coalesce(schedule.has_session_today, false) as has_session_today
  from public.workspace_user_groups wug
  left join public.workspace_user_groups_users wugu
    on wugu.group_id = wug.id
  left join lateral (
    select
      coalesce(array_agg(session_days.session_date order by session_days.session_date), array[]::date[]) as session_dates,
      coalesce(bool_or(session_days.session_date = v_today), false) as has_session_today
    from (
      select distinct (session.starts_at at time zone v_timezone)::date as session_date
      from private.workspace_user_group_sessions session
      where session.ws_id = p_ws_id
        and session.group_id = wug.id
        and session.status = 'scheduled'
    ) as session_days
  ) as schedule on true
  where wug.ws_id = p_ws_id
    and (
      v_status = 'all'
      or (v_status = 'active' and wug.archived = false)
      or (v_status = 'archived' and wug.archived = true)
    )
    and (p_group_ids is null or wug.id = any(p_group_ids))
    and (p_accessible_group_ids is null or wug.id = any(p_accessible_group_ids))
    and (
      v_search = ''
      or not exists (
        select 1
        from regexp_split_to_table(v_search, '\s+') as search_terms(term)
        where search_terms.term <> ''
          and private.normalize_user_group_search_text(wug.name)
            not like '%' || search_terms.term || '%'
      )
    )
  group by wug.id, schedule.session_dates, schedule.has_session_today
  order by
    coalesce(schedule.has_session_today, false) desc,
    wug.name asc,
    wug.id asc
  limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function private.list_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[],
  integer,
  integer
) from public, anon, authenticated;
grant execute on function private.list_workspace_user_groups_for_table(
  uuid,
  text,
  text,
  uuid[],
  uuid[],
  integer,
  integer
) to service_role;

create or replace function public.get_pending_invoices_base(
  p_ws_id uuid,
  p_use_attendance_based boolean default true
)
returns table (
  user_id uuid,
  user_name text,
  user_avatar_url text,
  group_id uuid,
  group_name text,
  month text,
  sessions date[],
  attendance_days integer,
  billable_days integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform set_config('statement_timeout', '20s', true);

  if auth.uid() is null
    or not public.has_workspace_permission(
      p_ws_id,
      auth.uid(),
      'view_invoices'
    )
  then
    raise exception
      'Unauthorized: User does not have permission to view invoices for workspace %',
      p_ws_id;
  end if;

  return query
  with user_groups as (
    select distinct
      wugu.user_id,
      wu.full_name as user_name,
      wu.avatar_url as user_avatar_url,
      wug.id as group_id,
      wug.name as group_name,
      wug.starting_date,
      wug.ending_date
    from workspace_user_groups_users wugu
    join workspace_users wu on wu.id = wugu.user_id
    join workspace_user_groups wug on wug.id = wugu.group_id
    where wug.ws_id = p_ws_id
      and wugu.role = 'STUDENT'
      and wu.ws_id = p_ws_id
      and wu.archived is not true
  ),
  group_session_dates as (
    select
      session.group_id,
      coalesce(
        array_agg(
          distinct ((session.starts_at at time zone 'Asia/Ho_Chi_Minh')::date)
          order by ((session.starts_at at time zone 'Asia/Ho_Chi_Minh')::date)
        ),
        array[]::date[]
      ) as sessions
    from private.workspace_user_group_sessions session
    where session.ws_id = p_ws_id
      and session.status = 'scheduled'
    group by session.group_id
  ),
  latest_invoices as (
    select distinct on (fi.customer_id, fig.user_group_id)
      fi.customer_id,
      fig.user_group_id,
      fi.valid_until
    from finance_invoices fi
    join finance_invoice_user_groups fig on fig.invoice_id = fi.id
    where fi.ws_id = p_ws_id
      and fig.user_group_id is not null
      and fi.valid_until is not null
      and fi.completed_at is not null
    order by
      fi.customer_id,
      fig.user_group_id,
      fi.valid_until desc,
      fi.created_at desc
  ),
  pending_months as (
    select
      ug.user_id,
      ug.user_name,
      ug.user_avatar_url,
      ug.group_id,
      ug.group_name,
      coalesce(gsd.sessions, array[]::date[]) as sessions,
      to_char(month_date, 'YYYY-MM') as month,
      month_date
    from user_groups ug
    left join group_session_dates gsd on gsd.group_id = ug.group_id
    left join latest_invoices li on li.customer_id = ug.user_id and li.user_group_id = ug.group_id
    cross join lateral generate_series(
      coalesce(
        date_trunc('month', li.valid_until),
        date_trunc('month', coalesce(ug.starting_date, current_date))
      ),
      date_trunc('month', least(coalesce(ug.ending_date, current_date), current_date)),
      '1 month'::interval
    ) as month_date
    where month_date <= date_trunc('month', current_date)
      and (li.valid_until is null or month_date >= date_trunc('month', li.valid_until))
  ),
  session_counts_per_month as (
    select
      pm.user_id,
      pm.group_id,
      pm.month,
      count(session_date)::integer as total_sessions
    from pending_months pm
    cross join lateral unnest(pm.sessions) as session_date
    where to_char(session_date::date, 'YYYY-MM') = pm.month
    group by pm.user_id, pm.group_id, pm.month
  ),
  attendance_counts as (
    select
      pm.user_id,
      pm.group_id,
      pm.month,
      count(uga.date)::integer as attendance_days
    from pending_months pm
    left join user_group_attendance uga
      on uga.user_id = pm.user_id
      and uga.group_id = pm.group_id
      and to_char(uga.date, 'YYYY-MM') = pm.month
      and uga.status in ('PRESENT', 'LATE')
    group by pm.user_id, pm.group_id, pm.month
  )
  select
    pm.user_id,
    pm.user_name,
    pm.user_avatar_url,
    pm.group_id,
    pm.group_name,
    pm.month,
    pm.sessions,
    coalesce(ac.attendance_days, 0)::integer as attendance_days,
    case
      when p_use_attendance_based then coalesce(ac.attendance_days, 0)::integer
      else coalesce(sc.total_sessions, 0)::integer
    end as billable_days
  from pending_months pm
  left join attendance_counts ac
    on ac.user_id = pm.user_id
    and ac.group_id = pm.group_id
    and ac.month = pm.month
  left join session_counts_per_month sc
    on sc.user_id = pm.user_id
    and sc.group_id = pm.group_id
    and sc.month = pm.month
  where case
    when p_use_attendance_based then coalesce(ac.attendance_days, 0) > 0
    else coalesce(sc.total_sessions, 0) > 0
  end;
end;
$$;

revoke all on function public.get_pending_invoices_base(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.get_pending_invoices_base(uuid, boolean)
to authenticated, service_role;

create or replace view public.workspace_user_groups_with_amount
with (security_invoker=on) as
select
  workspace_group.id,
  workspace_group.ws_id,
  workspace_group.name,
  workspace_group.created_at,
  workspace_group.archived,
  workspace_group.ending_date,
  workspace_group.notes,
  coalesce(schedule.session_dates, array[]::date[]) as sessions,
  workspace_group.starting_date,
  count(group_users.*) as amount
from public.workspace_user_groups workspace_group
left join public.workspace_user_groups_users group_users
  on group_users.group_id = workspace_group.id
left join lateral (
  select coalesce(
    array_agg(session_days.session_date order by session_days.session_date),
    array[]::date[]
  ) as session_dates
  from (
    select distinct
      (session.starts_at at time zone 'Asia/Ho_Chi_Minh')::date as session_date
    from private.workspace_user_group_sessions session
    where session.ws_id = workspace_group.ws_id
      and session.group_id = workspace_group.id
      and session.status = 'scheduled'
  ) session_days
) schedule on true
group by
  workspace_group.id,
  schedule.session_dates;

create or replace view public.user_groups_with_tags
with (security_invoker=on) as
select
  workspace_group.id,
  workspace_group.ws_id,
  workspace_group.name,
  workspace_group.created_at,
  workspace_group.archived,
  workspace_group.ending_date,
  workspace_group.notes,
  coalesce(schedule.session_dates, array[]::date[]) as sessions,
  workspace_group.starting_date,
  (
    select json_agg(group_tag.id)
    from public.workspace_user_group_tags group_tag
    join public.workspace_user_group_tag_groups tag_group
      on group_tag.id = tag_group.tag_id
    where tag_group.group_id = workspace_group.id
  ) as tags,
  (
    select count(*)
    from public.workspace_user_group_tags group_tag
    join public.workspace_user_group_tag_groups tag_group
      on group_tag.id = tag_group.tag_id
    where tag_group.group_id = workspace_group.id
  ) as tag_count
from public.workspace_user_groups workspace_group
left join lateral (
  select coalesce(
    array_agg(session_days.session_date order by session_days.session_date),
    array[]::date[]
  ) as session_dates
  from (
    select distinct
      (session.starts_at at time zone 'Asia/Ho_Chi_Minh')::date as session_date
    from private.workspace_user_group_sessions session
    where session.ws_id = workspace_group.ws_id
      and session.group_id = workspace_group.id
      and session.status = 'scheduled'
  ) session_days
) schedule on true;

create or replace view public.workspace_user_groups_with_guest
with (security_invoker=on) as
select
  workspace_user_groups.id,
  workspace_user_groups.ws_id,
  workspace_user_groups.name,
  workspace_user_groups.created_at,
  workspace_user_groups.archived,
  workspace_user_groups.ending_date,
  workspace_user_groups.notes,
  coalesce(schedule.session_dates, array[]::date[]) as sessions,
  workspace_user_groups.starting_date,
  workspace_user_groups.is_guest,
  count(workspace_user_groups_users.*) as amount
from public.workspace_user_groups
left join public.workspace_user_groups_users
  on workspace_user_groups_users.group_id = workspace_user_groups.id
left join lateral (
  select coalesce(
    array_agg(session_days.session_date order by session_days.session_date),
    array[]::date[]
  ) as session_dates
  from (
    select distinct
      (session.starts_at at time zone 'Asia/Ho_Chi_Minh')::date as session_date
    from private.workspace_user_group_sessions session
    where session.ws_id = workspace_user_groups.ws_id
      and session.group_id = workspace_user_groups.id
      and session.status = 'scheduled'
  ) session_days
) schedule on true
group by
  workspace_user_groups.id,
  schedule.session_dates;

alter table public.workspace_user_groups
  drop column if exists sessions;

notify pgrst, 'reload schema';
