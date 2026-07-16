create table private.inventory_sales_periods (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (
    description is null or char_length(description) <= 500
  ),
  starts_at date,
  ends_at date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_sales_periods_date_range_check check (
    starts_at is null or ends_at is null or starts_at <= ends_at
  ),
  constraint inventory_sales_periods_id_ws_unique unique (id, ws_id)
);

create unique index inventory_sales_periods_ws_name_unique
  on private.inventory_sales_periods (ws_id, lower(btrim(name)));

create index inventory_sales_periods_ws_status_dates_idx
  on private.inventory_sales_periods (
    ws_id,
    status,
    starts_at desc nulls last,
    ends_at desc nulls last
  );

create table private.inventory_sales_period_assignments (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  period_id uuid not null,
  sale_source text not null check (
    sale_source in ('checkout_session', 'finance_invoice')
  ),
  sale_id uuid not null,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (ws_id, sale_source, sale_id),
  constraint inventory_sales_period_assignments_period_fkey
    foreign key (period_id, ws_id)
    references private.inventory_sales_periods(id, ws_id)
    on delete cascade
);

create index inventory_sales_period_assignments_period_idx
  on private.inventory_sales_period_assignments (
    ws_id,
    period_id,
    assigned_at desc
  );

alter table private.inventory_sales_periods enable row level security;
alter table private.inventory_sales_period_assignments enable row level security;

create policy "Service role can manage inventory sales periods"
  on private.inventory_sales_periods
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage inventory sales period assignments"
  on private.inventory_sales_period_assignments
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table private.inventory_sales_periods
  from public, anon, authenticated;
revoke all on table private.inventory_sales_period_assignments
  from public, anon, authenticated;
grant all on table private.inventory_sales_periods to service_role;
grant all on table private.inventory_sales_period_assignments to service_role;

create trigger inventory_sales_periods_updated_at
before update on private.inventory_sales_periods
for each row execute function public.update_updated_at_column();

create or replace function private.list_inventory_sales_for_period(
  p_ws_id uuid,
  p_period_id uuid,
  p_offset integer default 0,
  p_limit integer default 50
)
returns table (
  total_count integer,
  sale jsonb
)
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  with assigned as (
    select assignment.sale_source, assignment.sale_id
    from private.inventory_sales_period_assignments assignment
    join private.inventory_sales_periods period
      on period.id = assignment.period_id
     and period.ws_id = assignment.ws_id
    where assignment.ws_id = p_ws_id
      and assignment.period_id = p_period_id
  ),
  finance_sales as (
    select
      invoice.id,
      'finance_invoice'::text as source,
      invoice.notice,
      invoice.note,
      invoice.paid_amount,
      null::text as currency,
      invoice.created_at,
      invoice.completed_at,
      wallet.name as wallet_name,
      invoice_category.name as category_name,
      customer.full_name as customer_name,
      coalesce(creator.full_name, platform_creator.display_name) as creator_name,
      null::text as public_token,
      null::text as polar_order_id,
      null::text as square_order_id,
      coalesce(line_summary.items_count, 0) as items_count,
      coalesce(line_summary.total_quantity, 0) as total_quantity,
      coalesce(line_summary.owners, array[]::text[]) as owners
    from assigned
    join public.finance_invoices invoice
      on assigned.sale_source = 'finance_invoice'
     and invoice.id = assigned.sale_id
     and invoice.ws_id = p_ws_id
    left join private.workspace_wallets wallet on wallet.id = invoice.wallet_id
    left join public.transaction_categories invoice_category
      on invoice_category.id = invoice.category_id
    left join public.workspace_users customer on customer.id = invoice.customer_id
    left join public.workspace_users creator on creator.id = invoice.creator_id
    left join public.users platform_creator
      on platform_creator.id = invoice.platform_creator_id
    left join lateral (
      select
        count(*)::integer as items_count,
        coalesce(sum(coalesce(line.amount, 0)), 0) as total_quantity,
        array_agg(
          distinct coalesce(nullif(line.owner_name, ''), 'Unassigned')
        ) as owners
      from public.finance_invoice_products line
      where line.invoice_id = invoice.id
    ) line_summary on true
    where exists (
      select 1
      from public.finance_invoice_products line
      where line.invoice_id = invoice.id
    )
  ),
  checkout_sales as (
    select
      checkout.id,
      'checkout_session'::text as source,
      checkout.public_token as notice,
      checkout.note,
      checkout.total_amount::numeric as paid_amount,
      checkout.currency,
      checkout.created_at,
      checkout.completed_at,
      null::text as wallet_name,
      null::text as category_name,
      coalesce(
        nullif(checkout.customer_name, ''),
        nullif(checkout.customer_email, ''),
        checkout.public_token
      ) as customer_name,
      null::text as creator_name,
      checkout.public_token,
      checkout.polar_order_id,
      checkout.square_order_id,
      coalesce(line_summary.items_count, 0) as items_count,
      coalesce(line_summary.total_quantity, 0) as total_quantity,
      array[]::text[] as owners
    from assigned
    join private.inventory_checkout_sessions checkout
      on assigned.sale_source = 'checkout_session'
     and checkout.id = assigned.sale_id
     and checkout.ws_id = p_ws_id
     and checkout.status = 'completed'
    left join lateral (
      select
        count(*)::integer as items_count,
        coalesce(sum(line.quantity), 0) as total_quantity
      from private.inventory_checkout_lines line
      where line.checkout_session_id = checkout.id
    ) line_summary on true
  ),
  combined as (
    select * from finance_sales
    union all
    select * from checkout_sales
  ),
  counted as (
    select count(*)::integer as total_count from combined
  ),
  paged as (
    select *
    from combined
    order by coalesce(completed_at, created_at) desc nulls last, id asc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    counted.total_count,
    case
      when paged.id is null then null
      else jsonb_build_object(
        'id', paged.id,
        'source', paged.source,
        'notice', paged.notice,
        'note', paged.note,
        'paid_amount', paged.paid_amount,
        'currency', paged.currency,
        'created_at', paged.created_at,
        'completed_at', paged.completed_at,
        'wallet_name', paged.wallet_name,
        'category_name', paged.category_name,
        'customer_name', paged.customer_name,
        'creator_name', paged.creator_name,
        'public_token', paged.public_token,
        'polar_order_id', paged.polar_order_id,
        'square_order_id', paged.square_order_id,
        'items_count', paged.items_count,
        'total_quantity', paged.total_quantity,
        'owners', to_jsonb(paged.owners)
      )
    end as sale
  from counted
  left join paged on true;
$$;

revoke all on function private.list_inventory_sales_for_period(
  uuid,
  uuid,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function private.list_inventory_sales_for_period(
  uuid,
  uuid,
  integer,
  integer
) to service_role;
