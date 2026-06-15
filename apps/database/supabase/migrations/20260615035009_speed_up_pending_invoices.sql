-- Speed up the pending-invoices RPC and stop it timing out intermittently.
--
-- get_pending_invoices_base scans finance_invoices by ws_id and joins
-- finance_invoice_user_groups on invoice_id (the latest_invoices CTE), but
-- neither column was indexed. On a cold cache / under load the query exceeded
-- the 5s statement_timeout and Postgres cancelled it, so the unpaid-invoices
-- tab intermittently failed to load. Add the supporting indexes and give the
-- function more headroom.
--
-- NOTE: these indexes are created in-transaction (plain CREATE INDEX). For very
-- large invoice tables, build them out-of-band first with
-- CREATE INDEX CONCURRENTLY before applying this migration, then this file is a
-- no-op (IF NOT EXISTS).

-- Serves latest_invoices: filters finance_invoices by ws_id, valid_until is not
-- null, completed_at is not null, then DISTINCT ON (customer_id, user_group_id)
-- ordered by valid_until desc.
create index if not exists "finance_invoices_ws_id_customer_id_valid_until_idx"
  on "public"."finance_invoices" ("ws_id", "customer_id", "valid_until" desc)
  where "valid_until" is not null and "completed_at" is not null;

-- Serves the join finance_invoice_user_groups.invoice_id = finance_invoices.id.
-- The existing (user_group_id, invoice_id) index cannot satisfy a lookup by
-- invoice_id alone.
create index if not exists "finance_invoice_user_groups_invoice_id_idx"
  on "public"."finance_invoice_user_groups" ("invoice_id", "user_group_id");

-- Recreate get_pending_invoices_base verbatim from
-- 20260608085024_subscription_invoice_valid_until_coverage.sql, changing only
-- the statement_timeout from 5s to 20s. All wrapper RPCs call this function, so
-- this is the single place the timeout is set.
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

notify pgrst, 'reload schema';
