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
set search_path = private, public, pg_temp
as $$
declare
  v_can_view_amount boolean;
begin
  if _actor_id is null
    or not public.has_workspace_permission(_ws_id, _actor_id, 'manage_finance')
  then
    raise exception 'Permission denied';
  end if;

  v_can_view_amount := public.has_workspace_permission(
    _ws_id,
    _actor_id,
    'view_confidential_amount'
  );

  return query
  with tagged_transactions as (
    select
      tt.id as stat_tag_id,
      tt.name as stat_tag_name,
      tt.color as stat_tag_color,
      tt.description as stat_tag_description,
      tt.ws_id as stat_ws_id,
      wt.id as stat_transaction_id,
      wt.amount as stat_amount,
      wt.taken_at as stat_taken_at,
      ww.id is not null as stat_in_workspace,
      ww.id is not null
        and (
          not coalesce(wt.is_amount_confidential, false)
          or v_can_view_amount
        ) as stat_amount_visible
    from public.transaction_tags tt
    left join public.wallet_transaction_tags wtt
      on wtt.tag_id = tt.id
    left join public.wallet_transactions wt
      on wt.id = wtt.transaction_id
    left join private.workspace_wallets ww
      on ww.id = wt.wallet_id
     and ww.ws_id = _ws_id
    where tt.ws_id = _ws_id
  )
  select
    stat_tag_id as tag_id,
    stat_tag_name as tag_name,
    stat_tag_color as tag_color,
    stat_tag_description as tag_description,
    stat_ws_id as ws_id,
    count(stat_transaction_id) filter (
      where stat_in_workspace
    ) as transaction_count,
    count(stat_transaction_id) filter (
      where stat_amount_visible
        and coalesce(stat_amount, 0) > 0
    ) as income_count,
    count(stat_transaction_id) filter (
      where stat_amount_visible
        and coalesce(stat_amount, 0) < 0
    ) as expense_count,
    coalesce(sum(abs(stat_amount)) filter (
      where stat_amount_visible
    ), 0)::double precision as total_amount,
    coalesce(sum(stat_amount) filter (
      where stat_amount_visible
        and coalesce(stat_amount, 0) > 0
    ), 0)::double precision as total_income,
    coalesce(sum(abs(stat_amount)) filter (
      where stat_amount_visible
        and coalesce(stat_amount, 0) < 0
    ), 0)::double precision as total_expense,
    coalesce(sum(stat_amount) filter (
      where stat_amount_visible
    ), 0)::double precision as net_total,
    count(stat_transaction_id) filter (
      where stat_in_workspace
        and stat_taken_at >= now() - interval '30 days'
    ) as recent_transaction_count,
    count(stat_transaction_id) filter (
      where stat_amount_visible
        and stat_taken_at >= now() - interval '30 days'
        and coalesce(stat_amount, 0) > 0
    ) as recent_income_count,
    count(stat_transaction_id) filter (
      where stat_amount_visible
        and stat_taken_at >= now() - interval '30 days'
        and coalesce(stat_amount, 0) < 0
    ) as recent_expense_count,
    coalesce(sum(stat_amount) filter (
      where stat_amount_visible
        and stat_taken_at >= now() - interval '30 days'
        and coalesce(stat_amount, 0) > 0
    ), 0)::double precision as recent_total_income,
    coalesce(sum(abs(stat_amount)) filter (
      where stat_amount_visible
        and stat_taken_at >= now() - interval '30 days'
        and coalesce(stat_amount, 0) < 0
    ), 0)::double precision as recent_total_expense,
    max(stat_taken_at) filter (
      where stat_in_workspace
    ) as last_transaction_at
  from tagged_transactions
  group by
    stat_tag_id,
    stat_tag_name,
    stat_tag_color,
    stat_tag_description,
    stat_ws_id
  order by lower(stat_tag_name), stat_tag_name;
end;
$$;

revoke all on function private.get_transaction_tag_stats(uuid, uuid)
from public, anon, authenticated;

grant usage on schema private to service_role;
grant execute on function private.get_transaction_tag_stats(uuid, uuid)
to service_role;

comment on function private.get_transaction_tag_stats(uuid, uuid) is
  'Server-owned finance helper that returns transaction tag metadata, activity counts, and amount aggregates with confidential amount redaction.';
