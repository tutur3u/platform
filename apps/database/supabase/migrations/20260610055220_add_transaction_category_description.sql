alter table public.transaction_categories
add column if not exists description text;

drop function if exists public.get_transaction_categories_with_amount_by_workspace(uuid);

create or replace function public.get_transaction_categories_with_amount_by_workspace(p_ws_id uuid)
returns table (
    id uuid,
    name text,
    description text,
    is_expense boolean,
    ws_id uuid,
    created_at timestamp with time zone,
    icon text,
    color text,
    amount numeric,
    transaction_count bigint
) as $$
select
    tc.id,
    tc.name,
    tc.description,
    tc.is_expense,
    tc.ws_id,
    tc.created_at,
    tc.icon,
    tc.color,
    coalesce(sum(abs(wt.amount)), 0) as amount,
    count(wt.id) as transaction_count
from public.transaction_categories tc
left join public.wallet_transactions wt on wt.category_id = tc.id
where tc.ws_id = p_ws_id
group by
    tc.id,
    tc.name,
    tc.description,
    tc.is_expense,
    tc.ws_id,
    tc.created_at,
    tc.icon,
    tc.color
order by tc.name asc
$$ language sql stable;
