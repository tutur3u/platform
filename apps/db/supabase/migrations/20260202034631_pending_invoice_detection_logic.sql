-- Modify get_pending_invoices_base to conditionally check attendance based on config
-- When INVOICE_USE_ATTENDANCE_BASED_CALCULATION is false, check billable_days instead of attendance_days

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
  perform set_config('statement_timeout', '5s', true);
  -- Verify caller has access to the workspace
  if not is_org_member(auth.uid(), p_ws_id) then
    raise exception 'Unauthorized: User does not have access to workspace %', p_ws_id;
  end if;

  return query
  with user_groups as (
    -- Get all active user groups with students (exclude archived users)
    select distinct
      wugu.user_id,
      wu.full_name as user_name,
      wu.avatar_url as user_avatar_url,
      wug.id as group_id,
      wug.name as group_name,
      wug.sessions,
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
  latest_invoices as (
    -- Get the latest subscription invoice for each user-group combination
    select distinct on (fi.customer_id, fig.user_group_id)
      fi.customer_id,
      fig.user_group_id,
      fi.valid_until
    from finance_invoices fi
    join finance_invoice_user_groups fig on fig.invoice_id = fi.id
    where fi.ws_id = p_ws_id
      and fig.user_group_id is not null
      and fi.valid_until is not null
    order by fi.customer_id, fig.user_group_id, fi.created_at desc
  ),
  pending_months as (
    -- Generate months between valid_until and now that need invoices
    -- If valid_until is 2025-11-01, we start looking from 2025-11-01 onwards
    -- This means the October invoice (valid until Nov 1) is considered paid for October
    select
      ug.user_id,
      ug.user_name,
      ug.user_avatar_url,
      ug.group_id,
      ug.group_name,
      ug.sessions,
      to_char(month_date, 'YYYY-MM') as month,
      month_date
    from user_groups ug
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
    -- Count total sessions for each user-group-month combination
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
    -- Count attendance for each user-group-month combination
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
