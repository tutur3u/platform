-- Explicit civil tuition months are authoritative for new invoices. NULL keeps
-- legacy high-water-mark semantics; historical months are never guessed.
alter table public.finance_invoices add column subscription_months date[];

create function private.valid_subscription_months(months date[])
returns boolean language sql immutable set search_path = '' as $$
  select months is null or (
    cardinality(months) between 1 and 12
    and array_ndims(months) = 1
    and not exists (select 1 from unnest(months) month where month is null or extract(day from month) <> 1)
    and cardinality(months) = (select count(distinct month) from unnest(months) month)
  );
$$;
alter table public.finance_invoices add constraint finance_invoices_subscription_months_check
  check (private.valid_subscription_months(subscription_months));

comment on column public.finance_invoices.subscription_months is
  'Authoritative tuition months (first day of each month). NULL is legacy coverage known only through valid_until. Explicit months may contain gaps.';

create function private.sync_invoice_legacy_coverage_end()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.subscription_months is not null then
    new.valid_until := ((select max(month) from unnest(new.subscription_months) month) + interval '1 month') at time zone 'UTC';
  end if;
  return new;
end;
$$;
create trigger sync_invoice_legacy_coverage_end before insert or update of subscription_months, valid_until
  on public.finance_invoices for each row execute function private.sync_invoice_legacy_coverage_end();

create index finance_invoices_subscription_months_idx on public.finance_invoices using gin(subscription_months)
  where subscription_months is not null;
create index finance_invoices_subscription_legacy_end_idx on public.finance_invoices(ws_id, valid_until, id)
  where completed_at is not null and subscription_months is null;

create or replace function public.get_pending_invoices_base_guarded(
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

  if coalesce(auth.role(), '') <> 'service_role'
    and (
      auth.uid() is null
      or not public.has_workspace_permission(
        p_ws_id,
        auth.uid(),
        'view_invoices'
      )
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
      and fi.subscription_months is null
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
    left join latest_invoices li
      on li.customer_id = ug.user_id
      and li.user_group_id = ug.group_id
    cross join lateral generate_series(
      coalesce(
        date_trunc('month', li.valid_until),
        date_trunc('month', coalesce(ug.starting_date, current_date))
      ),
      date_trunc(
        'month',
        least(coalesce(ug.ending_date, current_date), current_date)
      ),
      '1 month'::interval
    ) as month_date
    where month_date <= date_trunc('month', current_date)
      and (
        li.valid_until is null
        or month_date >= date_trunc('month', li.valid_until)
      )
      and not exists (
        select 1 from public.finance_invoices paid
        join public.finance_invoice_user_groups paid_group on paid_group.invoice_id = paid.id
        where paid.ws_id = p_ws_id and paid.customer_id = ug.user_id
          and paid_group.user_group_id = ug.group_id and paid.completed_at is not null
          and paid.subscription_months @> array[month_date::date]
      )
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

notify pgrst, 'reload schema';
