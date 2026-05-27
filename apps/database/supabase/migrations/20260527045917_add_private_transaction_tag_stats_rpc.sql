create schema if not exists private;

drop function if exists private.get_transaction_tag_stats(uuid, uuid);

create or replace function private.get_transaction_tag_stats(
  _ws_id uuid,
  _actor_id uuid
)
returns table(
  tag_id uuid,
  tag_name text,
  tag_color text,
  tag_description text,
  ws_id uuid,
  transaction_count bigint,
  income_count bigint,
  expense_count bigint,
  total_amount double precision,
  total_income double precision,
  total_expense double precision,
  net_total double precision,
  recent_transaction_count bigint,
  recent_income_count bigint,
  recent_expense_count bigint,
  recent_total_income double precision,
  recent_total_expense double precision,
  last_transaction_at timestamp with time zone
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance')
  then
    raise exception 'Permission denied';
  end if;

  return query
  select
    tt.id as tag_id,
    tt.name as tag_name,
    tt.color as tag_color,
    tt.description as tag_description,
    tt.ws_id,
    count(wt.id) filter (
      where ww.id is not null
    ) as transaction_count,
    count(wt.id) filter (
      where ww.id is not null
        and coalesce(wt.amount, 0) > 0
    ) as income_count,
    count(wt.id) filter (
      where ww.id is not null
        and coalesce(wt.amount, 0) < 0
    ) as expense_count,
    coalesce(sum(abs(wt.amount)) filter (
      where ww.id is not null
    ), 0)::double precision as total_amount,
    coalesce(sum(wt.amount) filter (
      where ww.id is not null
        and coalesce(wt.amount, 0) > 0
    ), 0)::double precision as total_income,
    coalesce(sum(abs(wt.amount)) filter (
      where ww.id is not null
        and coalesce(wt.amount, 0) < 0
    ), 0)::double precision as total_expense,
    coalesce(sum(wt.amount) filter (
      where ww.id is not null
    ), 0)::double precision as net_total,
    count(wt.id) filter (
      where ww.id is not null
        and wt.taken_at >= now() - interval '30 days'
    ) as recent_transaction_count,
    count(wt.id) filter (
      where ww.id is not null
        and wt.taken_at >= now() - interval '30 days'
        and coalesce(wt.amount, 0) > 0
    ) as recent_income_count,
    count(wt.id) filter (
      where ww.id is not null
        and wt.taken_at >= now() - interval '30 days'
        and coalesce(wt.amount, 0) < 0
    ) as recent_expense_count,
    coalesce(sum(wt.amount) filter (
      where ww.id is not null
        and wt.taken_at >= now() - interval '30 days'
        and coalesce(wt.amount, 0) > 0
    ), 0)::double precision as recent_total_income,
    coalesce(sum(abs(wt.amount)) filter (
      where ww.id is not null
        and wt.taken_at >= now() - interval '30 days'
        and coalesce(wt.amount, 0) < 0
    ), 0)::double precision as recent_total_expense,
    max(wt.taken_at) filter (
      where ww.id is not null
    ) as last_transaction_at
  from public.transaction_tags tt
  left join public.wallet_transaction_tags wtt
    on wtt.tag_id = tt.id
  left join public.wallet_transactions wt
    on wt.id = wtt.transaction_id
  left join public.workspace_wallets ww
    on ww.id = wt.wallet_id
   and ww.ws_id = _ws_id
  where tt.ws_id = _ws_id
  group by tt.id, tt.name, tt.color, tt.description, tt.ws_id
  order by lower(tt.name), tt.name;
end;
$$;

revoke all on function private.get_transaction_tag_stats(uuid, uuid)
from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_transaction_tag_stats(uuid, uuid)
to service_role;

comment on function private.get_transaction_tag_stats(uuid, uuid) is
  'Server-owned finance helper that returns transaction tag metadata, counts, income, expense, net totals, recent 30-day pace, and last activity.';
