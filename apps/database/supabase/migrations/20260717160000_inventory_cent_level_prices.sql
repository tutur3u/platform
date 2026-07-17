-- Legacy inventory and invoice prices are stored in major currency units.
-- Preserve those values while allowing exact sub-unit prices (for example,
-- USD 8.10 and BHD 1.234). Commerce listing, bundle, checkout, and promotion
-- amounts already use integer minor units and intentionally remain bigint.

drop function if exists public.get_inventory_products(uuid[], uuid, uuid[], boolean);
drop function if exists public.search_finance_invoices(
  uuid,
  text,
  timestamptz,
  timestamptz,
  uuid[],
  uuid[],
  integer,
  integer
);
drop function if exists public.get_finance_invoice_products_by_workspace(
  uuid,
  integer,
  integer
);

-- PostgreSQL records UPDATE OF column dependencies on triggers. Recreate this
-- unchanged trigger around the compatible numeric type conversion.
drop trigger if exists update_wallet_transaction_amount
  on public.finance_invoices;

alter table private.inventory_products
  alter column price type numeric(30, 6) using price::numeric;

alter table private.inventory_batches
  alter column price type numeric(30, 6) using price::numeric,
  alter column total_diff type numeric(30, 6) using total_diff::numeric;

alter table private.inventory_batch_products
  alter column price type numeric(30, 6) using price::numeric;

alter table public.finance_invoice_products
  alter column price type numeric(30, 6) using price::numeric,
  alter column total_diff type numeric(30, 6) using total_diff::numeric;

alter table public.finance_invoices
  alter column price type numeric(30, 6) using price::numeric,
  alter column total_diff type numeric(30, 6) using total_diff::numeric,
  alter column paid_amount type numeric(30, 6) using paid_amount::numeric;

create trigger update_wallet_transaction_amount
after update of price, total_diff on public.finance_invoices
for each row execute function update_wallet_transaction_amount();

create function public.get_inventory_products(
  _category_ids uuid[] default null::uuid[],
  _ws_id uuid default null::uuid,
  _warehouse_ids uuid[] default null::uuid[],
  _has_unit boolean default null::boolean
)
returns table(
  id uuid,
  name text,
  manufacturer text,
  unit text,
  unit_id uuid,
  category text,
  price numeric,
  amount bigint,
  ws_id uuid,
  created_at timestamp with time zone
)
language plpgsql
as $function$
begin
  return query
  select
    p.id,
    p.name,
    im.name as manufacturer,
    iu.name as unit,
    ip.unit_id,
    pc.name as category,
    ip.price,
    coalesce(ip.amount, 0) as amount,
    p.ws_id,
    p.created_at
  from public.workspace_products p
    left join private.inventory_products ip
      on ip.product_id = p.id
      and (
        _warehouse_ids is null
        or ip.warehouse_id = any(_warehouse_ids)
      )
      and (
        _has_unit is null
        or ip.unit_id is not null
        or _has_unit is false
      )
    left join private.inventory_units iu on ip.unit_id = iu.id
    left join public.product_categories pc on p.category_id = pc.id
    left join private.inventory_manufacturers im on p.manufacturer_id = im.id
  where (
      _category_ids is null
      or p.category_id = any(_category_ids)
    )
    and (
      _ws_id is null
      or p.ws_id = _ws_id
    )
    and (
      _has_unit is null
      or ip.unit_id is not null
    )
  order by p.name asc;
end;
$function$;

revoke all on function public.get_inventory_products(
  uuid[],
  uuid,
  uuid[],
  boolean
) from public;
grant execute on function public.get_inventory_products(
  uuid[],
  uuid,
  uuid[],
  boolean
) to service_role;

create function public.search_finance_invoices(
  p_ws_id uuid,
  p_search_query text,
  p_start_date timestamptz default null,
  p_end_date timestamptz default null,
  p_user_ids uuid[] default null,
  p_wallet_ids uuid[] default null,
  p_limit int default 10,
  p_offset int default 0
)
returns table (
  id uuid,
  ws_id uuid,
  customer_id uuid,
  notice text,
  note text,
  price numeric,
  total_diff numeric,
  created_at timestamptz,
  creator_id uuid,
  platform_creator_id uuid,
  transaction_id uuid,
  customer_full_name text,
  customer_avatar_url text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total_count bigint;
  v_escaped_query text;
begin
  v_escaped_query := replace(replace(replace(p_search_query, '\', '\\'), '%', '\%'), '_', '\_');

  with filtered_invoices as (
    select distinct
      fi.id,
      fi.ws_id,
      fi.customer_id,
      fi.notice,
      fi.note,
      fi.price,
      fi.total_diff,
      fi.created_at,
      fi.creator_id,
      fi.platform_creator_id,
      fi.transaction_id,
      wu.full_name as customer_full_name,
      wu.avatar_url as customer_avatar_url
    from public.finance_invoices fi
    left join public.workspace_users wu
      on fi.customer_id = wu.id
      and fi.ws_id = wu.ws_id
    left join public.wallet_transactions wt on fi.transaction_id = wt.id
    where fi.ws_id = p_ws_id
      and (
        p_search_query is null or p_search_query = '' or
        fi.notice ilike '%' || v_escaped_query || '%' escape '\' or
        fi.note ilike '%' || v_escaped_query || '%' escape '\' or
        wu.full_name ilike '%' || v_escaped_query || '%' escape '\'
      )
      and (p_start_date is null or fi.created_at >= p_start_date)
      and (p_end_date is null or fi.created_at <= p_end_date)
      and (p_user_ids is null or fi.creator_id = any(p_user_ids))
      and (p_wallet_ids is null or wt.wallet_id = any(p_wallet_ids))
  )
  select count(*) into v_total_count from filtered_invoices;

  return query
  with filtered_invoices as (
    select distinct
      fi.id,
      fi.ws_id,
      fi.customer_id,
      fi.notice,
      fi.note,
      fi.price,
      fi.total_diff,
      fi.created_at,
      fi.creator_id,
      fi.platform_creator_id,
      fi.transaction_id,
      wu.full_name as customer_full_name,
      wu.avatar_url as customer_avatar_url
    from public.finance_invoices fi
    left join public.workspace_users wu
      on fi.customer_id = wu.id
      and fi.ws_id = wu.ws_id
    left join public.wallet_transactions wt on fi.transaction_id = wt.id
    where fi.ws_id = p_ws_id
      and (
        p_search_query is null or p_search_query = '' or
        fi.notice ilike '%' || v_escaped_query || '%' escape '\' or
        fi.note ilike '%' || v_escaped_query || '%' escape '\' or
        wu.full_name ilike '%' || v_escaped_query || '%' escape '\'
      )
      and (p_start_date is null or fi.created_at >= p_start_date)
      and (p_end_date is null or fi.created_at <= p_end_date)
      and (p_user_ids is null or fi.creator_id = any(p_user_ids))
      and (p_wallet_ids is null or wt.wallet_id = any(p_wallet_ids))
  )
  select
    fi_results.id,
    fi_results.ws_id,
    fi_results.customer_id,
    fi_results.notice,
    fi_results.note,
    fi_results.price,
    fi_results.total_diff,
    fi_results.created_at,
    fi_results.creator_id,
    fi_results.platform_creator_id,
    fi_results.transaction_id,
    fi_results.customer_full_name,
    fi_results.customer_avatar_url,
    v_total_count as total_count
  from filtered_invoices fi_results
  order by fi_results.created_at desc
  limit p_limit
  offset p_offset;
end;
$$;

create function public.get_finance_invoice_products_by_workspace(
  p_ws_id uuid,
  p_offset integer default 0,
  p_limit integer default 500
)
returns table (
  invoice_id uuid,
  product_id uuid,
  unit_id uuid,
  warehouse_id uuid,
  amount bigint,
  price numeric,
  total_diff numeric,
  product_name text,
  product_unit text,
  warehouse text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total bigint;
begin
  select count(*) into v_total
  from finance_invoice_products fiprod
  inner join finance_invoices fi on fi.id = fiprod.invoice_id
  where fi.ws_id = p_ws_id;

  return query
  select
    fiprod.invoice_id,
    fiprod.product_id,
    fiprod.unit_id,
    fiprod.warehouse_id,
    fiprod.amount,
    fiprod.price,
    fiprod.total_diff,
    fiprod.product_name,
    fiprod.product_unit,
    fiprod.warehouse,
    fiprod.created_at,
    v_total as total_count
  from finance_invoice_products fiprod
  inner join finance_invoices fi on fi.id = fiprod.invoice_id
  where fi.ws_id = p_ws_id
  order by fiprod.created_at
  offset p_offset
  limit p_limit;
end;
$$;

grant execute on function public.get_finance_invoice_products_by_workspace(
  uuid,
  integer,
  integer
) to authenticated;
