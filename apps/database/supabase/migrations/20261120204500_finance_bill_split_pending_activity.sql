begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function private.read_finance_bill_split_activity(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  with recent as materialized (
    select event.id
    from private.finance_bill_split_activity as event
    where event.ws_id = p_ws_id and event.split_id = p_split_id
    order by event.created_at desc, event.id
    limit 100
  ),
  visible as (
    select id from recent
    union
    select report.id
    from private.finance_bill_split_activity as report
    where report.ws_id = p_ws_id and report.split_id = p_split_id
      and report.kind = 'payment_report'
      and not exists (
        select 1 from private.finance_bill_split_activity as confirmation
        where confirmation.ws_id = p_ws_id and confirmation.split_id = p_split_id
          and confirmation.report_id = report.id
      )
    union
    select confirmation.id
    from recent
    join private.finance_bill_split_activity as confirmation
      on confirmation.ws_id = p_ws_id and confirmation.split_id = p_split_id
      and confirmation.report_id = recent.id
  )
  select coalesce(jsonb_agg(activity.item order by activity.created_at desc, activity.id), '[]'::jsonb)
  from (
    select event.id, event.created_at, jsonb_strip_nulls(jsonb_build_object(
      'id', event.id, 'createdAt', event.created_at, 'kind', event.kind,
      'comment', event.comment_text, 'from', event.from_id, 'to', event.to_id,
      'amountMinor', event.amount_minor, 'reportId', event.report_id,
      'hasProof', case when event.kind = 'payment_report'
        and (event.actor_id = p_actor_id
          or private.finance_bill_split_participant_actor(p_ws_id, p_split_id, event.from_id, p_actor_id)
          or private.finance_bill_split_participant_actor(p_ws_id, p_split_id, event.to_id, p_actor_id))
        then exists (
          select 1 from private.finance_bill_split_proof as proof
          where proof.ws_id = p_ws_id and proof.split_id = p_split_id and proof.report_id = event.id
        ) end
    )) as item
    from visible
    join private.finance_bill_split_activity as event
      on event.ws_id = p_ws_id and event.split_id = p_split_id and event.id = visible.id
    where private.read_finance_bill_splits(p_ws_id, p_actor_id, p_split_id) <> '[]'::jsonb
  ) as activity;
$$;

revoke all on function private.read_finance_bill_split_activity(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.read_finance_bill_split_activity(uuid, uuid, uuid)
  to service_role;

commit;
