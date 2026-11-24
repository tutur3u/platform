-- Product analytics consent: the stored preference behind the cookie banner's
-- "Analytics" category, and the daily rollup honouring it.
--
-- USER decision (2026-11-24): allow product analytics in the cookie banner,
-- default everything on, review and revise carefully. Review result (see
-- apps/docs/platform/data-protection-standard.mdx, "Product analytics
-- consent"): Vietnam's 2025 Personal Data Protection Law and the EU (Planet49)
-- do not accept silence, inactivity or a pre-ticked box as consent, so the
-- server counts a signed-in person only after an affirmative choice that
-- includes analytics ('consent' basis). The banner pre-selects Analytics where
-- that is lawful and leaves it off for EU/EEA/UK/CH and Vietnam visitors.
-- The legal owner can move the basis to 'opt_out' (count everyone except
-- withdrawals) with one reviewed UPDATE of the control row if a non-consent
-- lawful basis is recorded.
--
-- Shape:
--   * private.user_product_analytics_consent        current decision per user
--   * private.user_product_analytics_consent_events append-only audit
--   * private.product_analytics_consent_control     singleton basis switch
--   * private.product_analytics_counted(uuid, bool)  the rollup's filter
--   * private.record_product_analytics_consent      write, service_role only,
--                                                   for the Web API route
--   * public.set_product_analytics_consent          write RPC, auth.uid() only
--   * public.get_product_analytics_consent          read own decision
--   * private.rollup_product_analytics_daily        redefined: every person-
--                                                   derived metric is filtered
--
-- Withdrawal stops future counting at the next 30-minute slot: the rollup
-- recomputes today and yesterday, so a withdrawn person also drops out of
-- those two days' event-derived cells. Older aggregates are already
-- small-cohort suppressed and are not person-level data.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table private.product_analytics_consent_control (
  id boolean primary key default true check (id),
  basis text not null default 'consent' check (basis in ('consent', 'opt_out')),
  updated_at timestamptz not null default now()
);

insert into private.product_analytics_consent_control (id, basis)
values (true, 'consent');

alter table private.product_analytics_consent_control enable row level security;
revoke all on table private.product_analytics_consent_control
  from public, anon, authenticated, service_role;
grant select on table private.product_analytics_consent_control to service_role;
create policy product_analytics_consent_control_service_read
  on private.product_analytics_consent_control
  for select to service_role using (true);

create table private.user_product_analytics_consent (
  user_id uuid primary key references public.users(id) on delete cascade,
  granted boolean not null default false,
  source text not null check (
    source in ('web_banner', 'workspace_banner', 'marketing_banner',
               'web_settings', 'mobile_settings')
  ),
  policy_version text not null check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_product_analytics_consent_granted_at check (
    not granted or granted_at is not null
  )
);

create table private.user_product_analytics_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  granted boolean not null,
  source text not null check (
    source in ('web_banner', 'workspace_banner', 'marketing_banner',
               'web_settings', 'mobile_settings')
  ),
  policy_version text not null check (
    policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  created_at timestamptz not null default now()
);

create index user_product_analytics_consent_events_user_idx
  on private.user_product_analytics_consent_events (user_id, created_at desc, id desc);

alter table private.user_product_analytics_consent enable row level security;
alter table private.user_product_analytics_consent_events enable row level security;

revoke all on table private.user_product_analytics_consent
  from public, anon, authenticated, service_role;
revoke all on table private.user_product_analytics_consent_events
  from public, anon, authenticated, service_role;
revoke all on sequence private.user_product_analytics_consent_events_id_seq
  from public, anon, authenticated, service_role;

grant select on table private.user_product_analytics_consent to service_role;
grant select on table private.user_product_analytics_consent_events to service_role;

create policy user_product_analytics_consent_service_read
  on private.user_product_analytics_consent
  for select to service_role using (true);
create policy user_product_analytics_consent_events_service_read
  on private.user_product_analytics_consent_events
  for select to service_role using (true);

-- Append-only evidence; only the account-erasure cascade may delete rows.
create function private.guard_product_analytics_consent_event_change()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'DELETE'
    and pg_trigger_depth() > 1
    and not exists (select 1 from public.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'Product analytics consent evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.guard_product_analytics_consent_event_change()
  from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger guard_product_analytics_consent_event_change
  before update or delete on private.user_product_analytics_consent_events
  for each row execute function private.guard_product_analytics_consent_event_change();

create function private.reject_product_analytics_consent_event_truncate()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  raise exception 'Product analytics consent evidence is append-only'
    using errcode = '55000';
end;
$$;

revoke all on function private.reject_product_analytics_consent_event_truncate()
  from public, anon, authenticated, service_role;
-- tuturuuu: no-grant (trigger)

create trigger reject_product_analytics_consent_event_truncate
  before truncate on private.user_product_analytics_consent_events
  for each statement execute function private.reject_product_analytics_consent_event_truncate();

-- The rollup's only person filter. A null person (guest or deleted account)
-- is counted only under the 'opt_out' basis, because no decision can be
-- checked for it.
create function private.product_analytics_counted(
  p_user_id uuid,
  p_opt_out boolean
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_user_id is null then coalesce(p_opt_out, false)
    when coalesce(p_opt_out, false) then not exists (
      select 1 from private.user_product_analytics_consent c
       where c.user_id = p_user_id and not c.granted)
    else exists (
      select 1 from private.user_product_analytics_consent c
       where c.user_id = p_user_id and c.granted)
  end;
$$;

revoke all on function private.product_analytics_counted(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.product_analytics_counted(uuid, boolean)
  to service_role;

create function private.record_product_analytics_consent(
  p_user_id uuid,
  p_granted boolean,
  p_source text,
  p_policy_version text
)
returns table (
  granted boolean,
  source text,
  policy_version text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := p_user_id;
  v_old_granted boolean;
  v_old_version text;
begin
  if v_uid is null then
    raise exception 'user is required' using errcode = '22023';
  end if;
  if p_granted is null then
    raise exception 'consent decision is required' using errcode = '22023';
  end if;
  if p_source is null or p_source not in (
    'web_banner', 'workspace_banner', 'marketing_banner',
    'web_settings', 'mobile_settings'
  ) then
    raise exception 'invalid consent source' using errcode = '22023';
  end if;
  if p_policy_version is null
    or p_policy_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$' then
    raise exception 'invalid policy version' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('private.user_product_analytics_consent:' || v_uid::text, 0)
  );

  select c.granted, c.policy_version
    into v_old_granted, v_old_version
  from private.user_product_analytics_consent c
  where c.user_id = v_uid;

  if not found
    or v_old_granted is distinct from p_granted
    or v_old_version is distinct from p_policy_version then
    insert into private.user_product_analytics_consent_events
      (user_id, granted, source, policy_version)
    values (v_uid, p_granted, p_source, p_policy_version);

    insert into private.user_product_analytics_consent as c
      (user_id, granted, source, policy_version, granted_at, withdrawn_at, updated_at)
    values (
      v_uid, p_granted, p_source, p_policy_version,
      case when p_granted then now() end, null, now()
    )
    on conflict (user_id) do update set
      granted = excluded.granted,
      source = excluded.source,
      policy_version = excluded.policy_version,
      granted_at = case when excluded.granted then excluded.granted_at else c.granted_at end,
      withdrawn_at = case
        when excluded.granted then null
        when c.granted then now()
        else c.withdrawn_at
      end,
      updated_at = excluded.updated_at;
  end if;

  return query
    select c.granted, c.source, c.policy_version, c.granted_at,
      c.withdrawn_at, c.updated_at
    from private.user_product_analytics_consent c
    where c.user_id = v_uid;
end;
$$;

-- The trusted Web route calls this with the verified session user's id
-- (browser session or satellite app session); clients never reach it.
revoke all on function private.record_product_analytics_consent(uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.record_product_analytics_consent(uuid, boolean, text, text)
  to service_role;

create function public.set_product_analytics_consent(
  p_granted boolean,
  p_source text,
  p_policy_version text
)
returns table (
  granted boolean,
  source text,
  policy_version text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  return query
    select r.granted, r.source, r.policy_version, r.granted_at,
      r.withdrawn_at, r.updated_at
    from private.record_product_analytics_consent(
      v_uid, p_granted, p_source, p_policy_version) r;
end;
$$;

revoke all on function public.set_product_analytics_consent(boolean, text, text)
  from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.set_product_analytics_consent(boolean,text,text) review=user-2026-11-24-product-analytics-consent-caller-bound
grant execute on function public.set_product_analytics_consent(boolean, text, text)
  to authenticated;

create function public.get_product_analytics_consent()
returns table (
  granted boolean,
  source text,
  policy_version text,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
    select c.granted, c.source, c.policy_version, c.granted_at,
      c.withdrawn_at, c.updated_at
    from private.user_product_analytics_consent c
    where c.user_id = v_uid;
  -- No row: the user has not chosen; under the 'consent' basis they are not
  -- counted, so report false.
  if not found then
    return query
      select false, null::text, null::text, null::timestamptz,
        null::timestamptz, null::timestamptz;
  end if;
end;
$$;

revoke all on function public.get_product_analytics_consent()
  from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.get_product_analytics_consent() review=user-2026-11-24-product-analytics-consent-caller-bound
grant execute on function public.get_product_analytics_consent() to authenticated;

-- The rollup from 20261121111910, with private.product_analytics_counted
-- applied to every person-derived input (sessions, signups, workspace
-- creators, Meet attendance and AI usage). Nothing else changes.
create or replace function private.rollup_product_analytics_daily(p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := transaction_timestamp();
  v_today date := (v_now at time zone 'utc')::date;
  v_features integer := least(greatest(coalesce(p_limit, 0), 1), 50);
  v_day date;
  v_start timestamptz;
  v_end timestamptz;
  v_rows integer := 0;
  v_count integer;
  -- 'consent' (default): only people whose current decision is a grant.
  -- 'opt_out': everyone except people who withdrew, plus guests.
  v_opt_out boolean := coalesce((
    select c.basis = 'opt_out'
      from private.product_analytics_consent_control c
     where c.id), false);
begin
  -- Session-based counts: current day, highest value kept.
  with counts as (
    select 'dau'::text as metric, count(distinct s.user_id) as people
      from auth.sessions s
     where s.updated_at >= (v_today::timestamp at time zone 'utc')
       and private.product_analytics_counted(s.user_id, v_opt_out)
    union all
    select 'wau', count(distinct s.user_id)
      from auth.sessions s
     where s.updated_at >= ((v_today - 7)::timestamp at time zone 'utc')
       and private.product_analytics_counted(s.user_id, v_opt_out)
  )
  insert into private.product_analytics_daily as t (
    day, app, metric, dimension, value, suppressed, computed_at)
  select v_today, 'platform', c.metric, '',
         case when private.product_analytics_suppressed(c.people)
              then null else c.people::double precision end,
         private.product_analytics_suppressed(c.people), v_now
    from counts c
  on conflict (day, app, metric, dimension) do update set
    value = case when excluded.suppressed then t.value
                 else greatest(coalesce(t.value, 0), excluded.value) end,
    suppressed = t.suppressed and excluded.suppressed,
    computed_at = excluded.computed_at;
  get diagnostics v_count = row_count;
  v_rows := v_rows + v_count;

  foreach v_day in array array[v_today - 1, v_today] loop
    v_start := v_day::timestamp at time zone 'utc';
    v_end := (v_day + 1)::timestamp at time zone 'utc';

    -- Signups and workspaces created.
    with counts as (
      select 'signups'::text as metric, count(*) as n
        from auth.users u
       where u.created_at >= v_start and u.created_at < v_end
         and private.product_analytics_counted(u.id, v_opt_out)
      union all
      select 'workspaces_created', count(*)
        from public.workspaces w
       where w.created_at >= v_start and w.created_at < v_end
         and private.product_analytics_counted(w.creator_id, v_opt_out)
    )
    insert into private.product_analytics_daily as t (
      day, app, metric, dimension, value, suppressed, computed_at)
    select v_day, 'platform', c.metric, '',
           case when private.product_analytics_suppressed(c.n)
                then null else c.n::double precision end,
           private.product_analytics_suppressed(c.n), v_now
      from counts c
    on conflict (day, app, metric, dimension) do update set
      value = excluded.value, suppressed = excluded.suppressed,
      computed_at = excluded.computed_at;
    get diagnostics v_count = row_count;
    v_rows := v_rows + v_count;

    -- Meet: intervals clipped to the day; open intervals count until now.
    with clipped as (
      select a.meeting_id,
             coalesce(a.user_id, a.guest_id) as person,
             greatest(a.joined_at, v_start) as from_at,
             least(coalesce(a.left_at, v_now), v_end) as to_at
        from private.meet_attendance_sessions a
       where a.joined_at < v_end
         and coalesce(a.left_at, v_now) > v_start
         and private.product_analytics_counted(a.user_id, v_opt_out)
    ),
    totals as (
      select count(distinct person) as people,
             count(distinct meeting_id) as meetings,
             coalesce(sum(extract(epoch from (to_at - from_at))) / 60, 0)
               as minutes
        from clipped
       where to_at > from_at
    ),
    metrics as (
      select 'meet_participants'::text as metric,
             people::double precision as value, people from totals
      union all
      select 'meet_meetings', meetings::double precision, people from totals
      union all
      select 'meet_minutes', round(minutes::numeric, 1)::double precision,
             people from totals
    )
    insert into private.product_analytics_daily as t (
      day, app, metric, dimension, value, suppressed, computed_at)
    select v_day, 'meet', m.metric, '',
           case when private.product_analytics_suppressed(m.people)
                then null else m.value end,
           private.product_analytics_suppressed(m.people), v_now
      from metrics m
    on conflict (day, app, metric, dimension) do update set
      value = excluded.value, suppressed = excluded.suppressed,
      computed_at = excluded.computed_at;
    get diagnostics v_count = row_count;
    v_rows := v_rows + v_count;

    -- The day's AI cells are replaced whole, so a feature folded into
    -- 'other' leaves no earlier row behind.
    delete from private.product_analytics_daily
     where day = v_day and app = 'platform'
       and metric in ('ai_requests', 'ai_tokens', 'ai_credits', 'ai_users');

    -- AI usage per feature. Features with fewer than 10 people, and those
    -- past the top-N cut, merge into 'other'. When 'other' is itself a small
    -- cohort, it and the all-feature total are suppressed together, so no
    -- small cell can be derived by subtraction. Feature names are code
    -- identifiers, normalized to the dimension pattern.
    with usage as (
      select case
               when f ~ '^[a-z0-9][a-z0-9_.-]{0,63}$' and f <> 'other' then f
               else 'other'
             end as feature,
             t.user_id,
             coalesce(t.input_tokens, 0) + coalesce(t.output_tokens, 0)
               + coalesce(t.reasoning_tokens, 0) as tokens,
             abs(t.amount) as credits
        from public.ai_credit_transactions t
        cross join lateral (
          select left(regexp_replace(lower(coalesce(t.feature, 'other')),
                                     '[^a-z0-9_.-]+', '_', 'g'), 64) as f
        ) n
       where t.transaction_type = 'deduction'
         and t.created_at >= v_start and t.created_at < v_end
         and private.product_analytics_counted(t.user_id, v_opt_out)
    ),
    ranked as (
      select feature, count(distinct user_id) as people,
             row_number() over (order by count(*) desc, feature) as position
        from usage
       where feature <> 'other'
       group by feature
    ),
    kept as (
      select feature from ranked
       where people >= 10 and position <= v_features
    ),
    folded as (
      select case when k.feature is null then 'other' else u.feature end
               as dimension,
             u.user_id, u.tokens, u.credits
        from usage u
        left join kept k on k.feature = u.feature
    ),
    cells as (
      select dimension, count(*) as requests, sum(tokens) as tokens,
             sum(credits) as credits, count(distinct user_id) as people
        from folded
       group by dimension
    ),
    other_small as (
      select coalesce(bool_or(dimension = 'other'
                              and private.product_analytics_hidden(requests, people)),
                      false) as small
        from cells
    ),
    groups as (
      select c.dimension, c.requests, c.tokens, c.credits, c.people,
             private.product_analytics_hidden(c.requests, c.people) as hidden
        from cells c
      union all
      select '', count(*), coalesce(sum(tokens), 0), coalesce(sum(credits), 0),
             count(distinct user_id),
             private.product_analytics_hidden(count(*), count(distinct user_id))
               or (select small from other_small)
        from folded
    ),
    metrics as (
      select dimension, 'ai_requests'::text as metric,
             requests::double precision as value, hidden from groups
      union all
      select dimension, 'ai_tokens', tokens::double precision, hidden from groups
      union all
      select dimension, 'ai_credits', round(credits, 4)::double precision,
             hidden from groups
      union all
      select dimension, 'ai_users', people::double precision, hidden from groups
    )
    insert into private.product_analytics_daily as t (
      day, app, metric, dimension, value, suppressed, computed_at)
    select v_day, 'platform', m.metric, m.dimension,
           case when m.hidden then null else m.value end,
           m.hidden, v_now
      from metrics m
    on conflict (day, app, metric, dimension) do update set
      value = excluded.value, suppressed = excluded.suppressed,
      computed_at = excluded.computed_at;
    get diagnostics v_count = row_count;
    v_rows := v_rows + v_count;
  end loop;

  return jsonb_build_object('days', 2, 'rows', least(v_rows, 1000));
end;
$$;

revoke all on function private.rollup_product_analytics_daily(integer)
  from public, anon, authenticated;
grant execute on function private.rollup_product_analytics_daily(integer)
  to service_role;

commit;
