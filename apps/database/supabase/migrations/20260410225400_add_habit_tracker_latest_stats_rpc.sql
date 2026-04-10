create or replace function public.habit_tracker_entry_numeric_value(
  p_aggregation_strategy text,
  p_primary_metric_key text,
  p_primary_value numeric,
  p_values jsonb
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_aggregation_strategy = 'count_entries' then 1
    when p_aggregation_strategy = 'boolean_any' then
      case
        when jsonb_typeof(coalesce(p_values -> p_primary_metric_key, to_jsonb(p_primary_value))) = 'boolean' then
          case
            when trim(both '"' from coalesce((coalesce(p_values -> p_primary_metric_key, to_jsonb(p_primary_value)))::text, 'false')) = 'true' then 1
            else 0
          end
        when jsonb_typeof(coalesce(p_values -> p_primary_metric_key, to_jsonb(p_primary_value))) = 'number' then
          case
            when coalesce(trim(both '"' from (coalesce(p_values -> p_primary_metric_key, to_jsonb(p_primary_value)))::text), '0')::numeric > 0 then 1
            else 0
          end
        when jsonb_typeof(coalesce(p_values -> p_primary_metric_key, to_jsonb(p_primary_value))) = 'string' then
          case
            when nullif(trim(both '"' from (coalesce(p_values -> p_primary_metric_key, to_jsonb(p_primary_value)))::text), '') is not null then 1
            else 0
          end
        else
          case
            when coalesce(p_primary_value, 0) > 0 then 1
            else 0
          end
      end
    when p_primary_value is not null then p_primary_value
    when jsonb_typeof(p_values -> p_primary_metric_key) = 'number' then
      (p_values ->> p_primary_metric_key)::numeric
    else 0
  end;
$$;

comment on function public.habit_tracker_entry_numeric_value(text, text, numeric, jsonb) is
  'Normalizes a habit tracker entry into a numeric value that matches the tracker aggregation strategy.';

create or replace function public.get_workspace_habit_tracker_latest_stats(
  p_ws_id uuid,
  p_user_id uuid,
  p_tracker_ids uuid[] default null
)
returns table (
  tracker_id uuid,
  user_id uuid,
  latest_entry_id uuid,
  latest_entry_date date,
  latest_occurred_at timestamptz,
  latest_primary_value numeric,
  latest_values jsonb,
  current_period_total numeric,
  total_entries bigint,
  total_value numeric
)
language sql
security definer
set search_path = public
as $$
  with authorized as (
    select 1
    where coalesce(auth.role(), '') = 'service_role'
      or exists(
        select 1
        from public.workspace_members wm
        where wm.ws_id = p_ws_id
          and wm.user_id = auth.uid()
      )
  ),
  relevant_trackers as (
    select
      t.id,
      t.target_period,
      t.aggregation_strategy,
      t.primary_metric_key
    from public.workspace_habit_trackers t
    inner join authorized a
      on true
    where t.ws_id = p_ws_id
      and t.archived_at is null
      and (
        p_tracker_ids is null
        or t.id = any(p_tracker_ids)
      )
  ),
  normalized_entries as (
    select
      e.id,
      e.tracker_id,
      e.user_id,
      e.entry_date,
      e.occurred_at,
      e.created_at,
      e.primary_value,
      e.values,
      public.habit_tracker_entry_numeric_value(
        t.aggregation_strategy,
        t.primary_metric_key,
        e.primary_value,
        e.values
      ) as entry_numeric_value
    from public.workspace_habit_tracker_entries e
    inner join relevant_trackers t
      on t.id = e.tracker_id
    where e.ws_id = p_ws_id
      and e.user_id = p_user_id
  ),
  latest_entries as (
    select distinct on (ne.tracker_id)
      ne.tracker_id,
      ne.user_id,
      ne.id as latest_entry_id,
      ne.entry_date as latest_entry_date,
      ne.occurred_at as latest_occurred_at,
      ne.primary_value as latest_primary_value,
      ne.values as latest_values
    from normalized_entries ne
    order by ne.tracker_id, ne.occurred_at desc, ne.created_at desc, ne.id desc
  ),
  overall_totals as (
    select
      t.id as tracker_id,
      count(ne.id) as total_entries,
      case t.aggregation_strategy
        when 'max' then coalesce(max(ne.entry_numeric_value), 0)
        when 'count_entries' then count(ne.id)::numeric
        when 'boolean_any' then coalesce(max(ne.entry_numeric_value), 0)
        else coalesce(sum(ne.entry_numeric_value), 0)
      end as total_value
    from relevant_trackers t
    left join normalized_entries ne
      on ne.tracker_id = t.id
    group by t.id, t.aggregation_strategy
  ),
  current_period_entries as (
    select
      ne.*,
      t.aggregation_strategy
    from normalized_entries ne
    inner join relevant_trackers t
      on t.id = ne.tracker_id
    where (
      t.target_period = 'daily'
      and ne.entry_date = current_date
    ) or (
      t.target_period = 'weekly'
      and ne.entry_date >= date_trunc('week', current_date::timestamp)::date
      and ne.entry_date < (
        date_trunc('week', current_date::timestamp)::date + 7
      )
    )
  ),
  current_period_totals as (
    select
      t.id as tracker_id,
      case t.aggregation_strategy
        when 'max' then coalesce(max(cpe.entry_numeric_value), 0)
        when 'count_entries' then count(cpe.id)::numeric
        when 'boolean_any' then coalesce(max(cpe.entry_numeric_value), 0)
        else coalesce(sum(cpe.entry_numeric_value), 0)
      end as current_period_total
    from relevant_trackers t
    left join current_period_entries cpe
      on cpe.tracker_id = t.id
    group by t.id, t.aggregation_strategy
  )
  select
    t.id as tracker_id,
    p_user_id as user_id,
    le.latest_entry_id,
    le.latest_entry_date,
    le.latest_occurred_at,
    le.latest_primary_value,
    le.latest_values,
    coalesce(cpt.current_period_total, 0) as current_period_total,
    coalesce(ot.total_entries, 0) as total_entries,
    coalesce(ot.total_value, 0) as total_value
  from relevant_trackers t
  left join latest_entries le
    on le.tracker_id = t.id
  left join current_period_totals cpt
    on cpt.tracker_id = t.id
  left join overall_totals ot
    on ot.tracker_id = t.id;
$$;

grant execute on function public.get_workspace_habit_tracker_latest_stats(uuid, uuid, uuid[]) to authenticated;

comment on function public.get_workspace_habit_tracker_latest_stats(uuid, uuid, uuid[]) is
  'Returns the latest entry snapshot plus current-period and lifetime totals for a user across workspace habit trackers.';
