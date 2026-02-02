-- Fix: Make attendance check conditional on config mode in all pending invoice functions
-- When INVOICE_USE_ATTENDANCE_BASED_CALCULATION is false (session-based mode),
-- we should check total_billable_days > 0 instead of total_attendance_days > 0

-- Fix 1: get_pending_invoices function
create or replace function public.get_pending_invoices(
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
	-- Safe split-and-filter: validate each token is a valid UUID before casting
	select
		case
			when value is null or trim(value) = '' then null
			else (
				select array_agg(v::uuid)
				from unnest(string_to_array(replace(value, ' ', ''), ',')) as t(v)
				where trim(v) != ''
					and trim(v) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
			)
		end
	into v_blocked_pending_group_ids
	from workspace_configs
	where ws_id = p_ws_id
		and id = 'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING';

	v_escaped_query := replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_');

	return query
	with base_data as (
		select * from get_pending_invoices_base(p_ws_id, v_use_attendance_based)
	),
	filtered_base as (
		select * from base_data bd
		where (p_user_ids is null or bd.user_id = any(p_user_ids))
			and (p_query is null or (
				bd.user_name ilike '%' || v_escaped_query || '%' escape '\\' or 
				bd.group_name ilike '%' || v_escaped_query || '%' escape '\\'
			))
			and (
				v_blocked_pending_group_ids is null
				or (
					not (bd.group_id = any(v_blocked_pending_group_ids))
					and not exists (
						select 1
						from workspace_user_groups_users wugu
						join workspace_user_groups wug on wug.id = wugu.group_id
						where wugu.user_id = bd.user_id
							and wugu.group_id = any(v_blocked_pending_group_ids)
							and wug.ws_id = p_ws_id
					)
				)
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
	-- BUG FIX: Conditional check based on config mode
	-- Attendance mode: check attendance_days > 0
	-- Session mode: check billable_days > 0 (which equals total_sessions in session mode)
	where case
		when v_use_attendance_based then cp.total_attendance_days > 0
		else cp.total_billable_days > 0
	end
	order by cp.user_name asc, cp.group_name asc, cp.user_id asc, cp.group_id asc
	limit p_limit
	offset p_offset;
end;
$$;

-- Fix 2: get_pending_invoices_count function
create or replace function public.get_pending_invoices_count(
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
	-- Safe split-and-filter: validate each token is a valid UUID before casting
	select
		case
			when value is null or trim(value) = '' then null
			else (
				select array_agg(v::uuid)
				from unnest(string_to_array(replace(value, ' ', ''), ',')) as t(v)
				where trim(v) != ''
					and trim(v) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
			)
		end
	into v_blocked_pending_group_ids
	from workspace_configs
	where ws_id = p_ws_id
		and id = 'INVOICE_BLOCKED_GROUP_IDS_FOR_PENDING';

	v_escaped_query := case 
		when p_query is null then null
		else replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_')
	end;

	with base_data as (
		select * from get_pending_invoices_base(p_ws_id, v_use_attendance_based)
	),
	filtered_base as (
		select * from base_data bd
		where (p_user_ids is null or bd.user_id = any(p_user_ids))
			and (p_query is null or (
				bd.user_name ilike '%' || v_escaped_query || '%' escape '\\' or 
				bd.group_name ilike '%' || v_escaped_query || '%' escape '\\'
			))
			and (
				v_blocked_pending_group_ids is null
				or (
					not (bd.group_id = any(v_blocked_pending_group_ids))
					and not exists (
						select 1
						from workspace_user_groups_users wugu
						join workspace_user_groups wug on wug.id = wugu.group_id
						where wugu.user_id = bd.user_id
							and wugu.group_id = any(v_blocked_pending_group_ids)
							and wug.ws_id = p_ws_id
					)
				)
			)
	),
	combined_pending as (
		select
			fb.user_id,
			fb.group_id,
			sum(fb.attendance_days)::integer as total_attendance_days,
			sum(fb.billable_days)::integer as total_billable_days
		from filtered_base fb
		group by fb.user_id, fb.group_id
	)
	select count(*)
	into result_count
	from combined_pending
	-- BUG FIX: Conditional check based on config mode
	where case
		when v_use_attendance_based then total_attendance_days > 0
		else total_billable_days > 0
	end;
  
	return result_count;
end;
$$;

-- Fix 3: get_pending_invoices_grouped_by_user function
create or replace function public.get_pending_invoices_grouped_by_user(
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
  group_ids uuid[],
  group_names text[],
  months_owed text[],
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
  perform set_config('statement_timeout', '5000ms', true);
  select
    use_attendance_based,
    blocked_pending_group_ids
  into
    v_use_attendance_based,
    v_blocked_pending_group_ids
  from public.fetch_workspace_invoice_configs(p_ws_id);

  v_escaped_query := replace(replace(replace(coalesce(p_query, ''), '\\', '\\\\'), '%', '\\%'), '_', '\\_');

  return query
  with base_data as (
    select * from get_pending_invoices_base(p_ws_id, v_use_attendance_based)
  ),
  filtered_base as (
    select * from base_data bd
    where (p_user_ids is null or bd.user_id = any(p_user_ids))
      and (
        p_query is null
        or bd.user_name ilike '%' || v_escaped_query || '%' escape '\\'
        or bd.group_name ilike '%' || v_escaped_query || '%' escape '\\'
      )
      and (
        v_blocked_pending_group_ids is null
        or (
          not (bd.group_id = any(v_blocked_pending_group_ids))
          and not exists (
            select 1
            from workspace_user_groups_users wugu
            join workspace_user_groups wug on wug.id = wugu.group_id
            where wugu.user_id = bd.user_id
              and wugu.group_id = any(v_blocked_pending_group_ids)
              and wug.ws_id = p_ws_id
          )
        )
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
      sum(fb.attendance_days)::integer as total_attendance_days,
      sum(fb.billable_days)::integer as total_billable_days,
      sum(coalesce(sc.total_sessions, 0))::integer as total_sessions
    from filtered_base fb
    left join session_counts sc
      on sc.user_id = fb.user_id
      and sc.group_id = fb.group_id
      and sc.month = fb.month
    group by fb.user_id, fb.user_name, fb.user_avatar_url, fb.group_id, fb.group_name
  ),
  group_potential_totals as (
    select
      cp.*,
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
    -- BUG FIX: Conditional check based on config mode
    where case
      when v_use_attendance_based then cp.total_attendance_days > 0
      else cp.total_billable_days > 0
    end
  ),
  months_per_user as (
    select
      fb.user_id,
      array_agg(distinct fb.month order by fb.month) as months_owed
    from filtered_base fb
    group by fb.user_id
  )
  select
    gpt.user_id::uuid,
    max(gpt.user_name)::text as user_name,
    max(gpt.user_avatar_url)::text as user_avatar_url,
    array_agg(distinct gpt.group_id order by gpt.group_id) as group_ids,
    array_agg(distinct gpt.group_name order by gpt.group_name) as group_names,
    mpu.months_owed::text[] as months_owed,
    sum(gpt.total_attendance_days)::integer as attendance_days,
    sum(gpt.total_sessions)::integer as total_sessions,
    sum(gpt.potential_total)::numeric as potential_total
  from group_potential_totals gpt
  join months_per_user mpu on mpu.user_id = gpt.user_id
  group by gpt.user_id, mpu.months_owed
  order by max(gpt.user_name) asc, gpt.user_id asc
  limit p_limit
  offset p_offset;
end;
$$;

-- Fix 4: get_pending_invoices_grouped_by_user_count function
create or replace function public.get_pending_invoices_grouped_by_user_count(
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
  select
    use_attendance_based,
    blocked_pending_group_ids
  into
    v_use_attendance_based,
    v_blocked_pending_group_ids
  from public.fetch_workspace_invoice_configs(p_ws_id);

  v_escaped_query := case
    when p_query is null then null
    else replace(replace(replace(p_query, '\\', '\\\\'), '%', '\\%'), '_', '\\_')
  end;

  with base_data as (
    select * from get_pending_invoices_base(p_ws_id, v_use_attendance_based)
  ),
  filtered_base as (
    select * from base_data bd
    where (p_user_ids is null or bd.user_id = any(p_user_ids))
      and (p_query is null or (
        bd.user_name ilike '%' || v_escaped_query || '%' escape '\\' or
        bd.group_name ilike '%' || v_escaped_query || '%' escape '\\'
      ))
      and (
        v_blocked_pending_group_ids is null
        or (
          not (bd.group_id = any(v_blocked_pending_group_ids))
          and not exists (
            select 1
            from workspace_user_groups_users wugu
            join workspace_user_groups wug on wug.id = wugu.group_id
            where wugu.user_id = bd.user_id
              and wugu.group_id = any(v_blocked_pending_group_ids)
              and wug.ws_id = p_ws_id
          )
        )
      )
  ),
  combined_pending as (
    select
      fb.user_id,
      fb.group_id,
      sum(fb.attendance_days)::integer as total_attendance_days,
      sum(fb.billable_days)::integer as total_billable_days
    from filtered_base fb
    group by fb.user_id, fb.group_id
  ),
  grouped_pending as (
    select
      user_id,
      sum(total_attendance_days)::integer as total_attendance_days,
      sum(total_billable_days)::integer as total_billable_days
    from combined_pending
    group by user_id
  )
  select count(*)
  into result_count
  from grouped_pending
  -- BUG FIX: Conditional check based on config mode
  where case
    when v_use_attendance_based then total_attendance_days > 0
    else total_billable_days > 0
  end;

  return result_count;
end;
$$;
