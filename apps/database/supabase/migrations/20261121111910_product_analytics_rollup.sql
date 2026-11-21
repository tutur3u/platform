-- Daily product analytics rollup for the Cron Control job
-- `observability-product-analytics` (every 30 minutes). Writes anonymous
-- aggregates into private.product_analytics_daily for the current and
-- previous UTC day. No person, guest, workspace or meeting identifier leaves
-- this function. A cohort of 1 to 9 people is stored suppressed, together
-- with every metric in its cell and any complement that would reveal it.
--
-- Session-based counts (dau, wau) read auth.sessions, whose rows move forward
-- or disappear, so they are computed for the current day only and keep the
-- highest value seen that day. Meet, AI and signup counts derive from
-- immutable timestamps and are recomputed for both days.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

create or replace function private.product_analytics_suppressed(p_people bigint)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select p_people between 1 and 9;
$$;

-- A cell with activity is hidden unless at least 10 identified people are in
-- it. Activity whose person is unknown (for example a deleted account) never
-- counts toward the threshold.
create or replace function private.product_analytics_hidden(
  p_events bigint,
  p_people bigint
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select p_events > 0 and p_people < 10;
$$;

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
begin
  -- Session-based counts: current day, highest value kept.
  with counts as (
    select 'dau'::text as metric, count(distinct s.user_id) as people
      from auth.sessions s
     where s.updated_at >= (v_today::timestamp at time zone 'utc')
    union all
    select 'wau', count(distinct s.user_id)
      from auth.sessions s
     where s.updated_at >= ((v_today - 7)::timestamp at time zone 'utc')
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
      union all
      select 'workspaces_created', count(*)
        from public.workspaces w
       where w.created_at >= v_start and w.created_at < v_end
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

revoke all on function private.product_analytics_suppressed(bigint)
  from public, anon, authenticated;
revoke all on function private.rollup_product_analytics_daily(integer)
  from public, anon, authenticated;
revoke all on function private.product_analytics_hidden(bigint, bigint)
  from public, anon, authenticated;
grant execute on function private.product_analytics_hidden(bigint, bigint)
  to service_role;
grant execute on function private.product_analytics_suppressed(bigint)
  to service_role;
grant execute on function private.rollup_product_analytics_daily(integer)
  to service_role;

COMMIT;
