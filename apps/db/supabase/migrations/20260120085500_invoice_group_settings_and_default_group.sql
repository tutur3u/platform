-- Assign newly created workspace users to an optional default group via trigger
-- and add support for excluding specific groups from pending invoice calculations.

-- Function to assign a default group to new workspace_users
create or replace function public.assign_default_workspace_user_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_default_group_id uuid;
begin
  -- Look up configured default group for this workspace
  select nullif(trim(value), '')::uuid
  into v_default_group_id
  from workspace_configs
  where ws_id = new.ws_id
    and id = 'DEFAULT_GROUP_FOR_NEW_WORKSPACE_USERS'
  limit 1;

  -- If no default group is configured, do nothing
  if v_default_group_id is null then
    return new;
  end if;

  -- Ensure the configured group belongs to the same workspace
  if not exists (
    select 1
    from workspace_user_groups g
    where g.id = v_default_group_id
      and g.ws_id = new.ws_id
  ) then
    return new;
  end if;

  -- Assign the new workspace user to the default group as STUDENT
  insert into workspace_user_groups_users (group_id, user_id, role)
  values (v_default_group_id, new.id, 'STUDENT')
  on conflict (group_id, user_id) do nothing;

  return new;
end;
$$;

-- Trigger to automatically assign default group on workspace_users insert
drop trigger if exists assign_default_workspace_user_group on public.workspace_users;

create trigger assign_default_workspace_user_group
after insert on public.workspace_users
for each row
execute function public.assign_default_workspace_user_group();

-- Update get_pending_invoices_count to support excluding specific groups
drop function if exists get_pending_invoices_count(uuid, text, uuid[]);

create or replace function get_pending_invoices_count(
  p_ws_id uuid,
  p_query text default null,
  p_user_ids uuid[] default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result_count bigint;
  v_escaped_query text;
  v_use_attendance_based boolean;
  v_blocked_pending_group_ids uuid[];
begin
  -- Fetch workspace config for attendance-based calculation (default to TRUE for backward compatibility)
  -- workspace_configs stores values as text, so we need to convert "true"/"false" strings to boolean
  select coalesce(
    (select case 
      when lower(value) = 'true' then true
      when lower(value) = 'false' then false
      else true  -- Default to true if value is not recognized
    end from workspace_configs 
     where ws_id = p_ws_id and id = 'INVOICE_USE_ATTENDANCE_BASED_CALCULATION'),
    true
  ) into v_use_attendance_based;

  -- Fetch workspace config for groups that should be excluded from pending invoices
  -- Value is stored as a comma-separated list of UUIDs
  select
    case
      when value is null or trim(value) = '' then null
      else string_to_array(replace(value, ' ', ''), ',')::uuid[]
    end
  into v_blocked_pending_group_ids
  from workspace_configs
  where ws_id = p_ws_id
    and id = 'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING';

  v_escaped_query := case 
    when p_query is null then null
    else replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_')
  end;

  with base_data as (
    select * from get_pending_invoices_base(p_ws_id, v_use_attendance_based)
  ),
  filtered_base as (
    select * from base_data bd
    where (p_user_ids is null or bd.user_id = any(p_user_ids))
      and (p_query is null or (
        bd.user_name ilike '%' || v_escaped_query || '%' escape '\' or 
        bd.group_name ilike '%' || v_escaped_query || '%' escape '\'
      ))
      and (
        v_blocked_pending_group_ids is null
        or not (bd.group_id = any(v_blocked_pending_group_ids))
      )
  ),
  combined_pending as (
    -- Combine all pending months per user-group with aggregated attendance
    select
      fb.user_id,
      fb.group_id,
      sum(fb.attendance_days)::integer as total_attendance_days
    from filtered_base fb
    group by fb.user_id, fb.group_id
  )
  select count(*)
  into result_count
  from combined_pending
  where total_attendance_days > 0;
  
  return result_count;
end;
$$;

-- Update get_pending_invoices to support excluding specific groups
drop function if exists get_pending_invoices(uuid, integer, integer, text, uuid[]);

create or replace function get_pending_invoices(
  p_ws_id uuid,
  p_limit integer default null,
  p_offset integer default 0,
  p_query text default null,
  p_user_ids uuid[] default null
)
returns table (
  user_id uuid,
  user_name text,
  user_avatar_url text,
  group_id uuid,
  group_name text,
  months_owed text,
  attendance_days integer,
  total_sessions integer,
  potential_total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_escaped_query text;
  v_use_attendance_based boolean;
  v_blocked_pending_group_ids uuid[];
begin
  -- Fetch workspace config for attendance-based calculation (default to TRUE for backward compatibility)
  -- workspace_configs stores values as text, so we need to convert "true"/"false" strings to boolean
  select coalesce(
    (select case 
      when lower(value) = 'true' then true
      when lower(value) = 'false' then false
      else true  -- Default to true if value is not recognized
    end from workspace_configs 
     where ws_id = p_ws_id and id = 'INVOICE_USE_ATTENDANCE_BASED_CALCULATION'),
    true
  ) into v_use_attendance_based;

  -- Fetch workspace config for groups that should be excluded from pending invoices
  -- Value is stored as a comma-separated list of UUIDs
  select
    case
      when value is null or trim(value) = '' then null
      else string_to_array(replace(value, ' ', ''), ',')::uuid[]
    end
  into v_blocked_pending_group_ids
  from workspace_configs
  where ws_id = p_ws_id
    and id = 'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING';

  v_escaped_query := replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  with base_data as (
    select * from get_pending_invoices_base(p_ws_id, v_use_attendance_based)
  ),
  filtered_base as (
    select * from base_data bd
    where (p_user_ids is null or bd.user_id = any(p_user_ids))
      and (p_query is null or (
        bd.user_name ilike '%' || v_escaped_query || '%' escape '\' or 
        bd.group_name ilike '%' || v_escaped_query || '%' escape '\'
      ))
      and (
        v_blocked_pending_group_ids is null
        or not (bd.group_id = any(v_blocked_pending_group_ids))
      )
  ),
  session_counts as (
    -- Count total sessions for each user-group-month
    select
      fb.user_id,
      fb.group_id,
      fb.month,
      count(session_date)::integer as total_sessions
    from filtered_base fb
    cross join lateral unnest(fb.sessions) as session_date
    where to_char(session_date::date, 'YYYY-MM') = fb.month
    group by fb.user_id, fb.group_id, fb.month
  ),
  ranked_inventory as (
    -- Rank inventory products by matching priority for each group linked product
    select
      uglp.group_id,
      uglp.product_id,
      uglp.unit_id,
      uglp.warehouse_id as desired_warehouse_id,
      ip.price,
      ip.amount as stock_amount,
      row_number() over (
        partition by uglp.group_id, uglp.product_id, uglp.unit_id, uglp.warehouse_id
        order by
          case
            -- Priority 1: Exact match (unit + warehouse)
            when ip.unit_id = uglp.unit_id and ip.warehouse_id = uglp.warehouse_id then 1
            -- Priority 2: Unit match only, prefer in-stock
            when ip.unit_id = uglp.unit_id then 2
            -- Priority 3: Any product, prefer in-stock
            else 3
          end,
          -- Within same priority, prefer items with stock
          case when ip.amount is null or ip.amount > 0 then 0 else 1 end,
          -- Tie-breaker: warehouse_id for consistent ordering
          ip.warehouse_id
      ) as rank
    from user_group_linked_products uglp
    left join inventory_products ip on ip.product_id = uglp.product_id
  ),
  group_product_prices as (
    -- Select the best inventory match per group linked product
    select
      ri.group_id,
      ri.product_id,
      ri.unit_id,
      ri.desired_warehouse_id as warehouse_id,
      coalesce(ri.price, 0) as price,
      ri.stock_amount
    from ranked_inventory ri
    where ri.rank = 1
  ),
  combined_pending as (
    -- Combine all pending months per user-group with aggregated attendance
    select
      fb.user_id,
      fb.user_name,
      fb.user_avatar_url,
      fb.group_id,
      fb.group_name,
      string_agg(fb.month, ', ' order by fb.month) as months_owed,
      sum(fb.attendance_days)::integer as total_attendance_days,
      sum(fb.billable_days)::integer as total_billable_days,
      sum(coalesce(sc.total_sessions, 0))::integer as total_sessions
    from filtered_base fb
    left join session_counts sc
      on sc.user_id = fb.user_id
      and sc.group_id = fb.group_id
      and sc.month = fb.month
    group by fb.user_id, fb.user_name, fb.user_avatar_url, fb.group_id, fb.group_name
  )
  select
    cp.user_id::uuid,
    cp.user_name::text,
    cp.user_avatar_url::text,
    cp.group_id::uuid,
    cp.group_name::text,
    cp.months_owed::text,
    cp.total_attendance_days::integer as attendance_days,
    cp.total_sessions::integer as total_sessions,
    -- Calculate potential total using billable_days (which respects the config setting)
    -- This allows attendance_days to always show real attendance while billing uses the configured method
    round(
      coalesce(
        (select sum(
          case 
            when gpp.stock_amount is null then cp.total_billable_days * gpp.price
            else least(cp.total_billable_days, gpp.stock_amount) * gpp.price
          end
        )
        from group_product_prices gpp
        where gpp.group_id = cp.group_id),
        0
      )
    )::numeric as potential_total
  from combined_pending cp
  where cp.total_attendance_days > 0  -- Only show users with actual attendance
  order by cp.user_name, cp.group_name
  limit p_limit
  offset p_offset;
end;
$$;

