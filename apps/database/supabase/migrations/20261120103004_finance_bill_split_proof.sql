begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.finance_bill_split_proof (
  ws_id uuid not null,
  split_id uuid not null,
  report_id uuid not null,
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  contents bytea not null check (octet_length(contents) between 1 and 262144),
  primary key (ws_id, split_id, report_id),
  foreign key (ws_id, split_id, report_id)
    references private.finance_bill_split_activity(ws_id, split_id, id) on delete cascade
);

alter table private.finance_bill_split_proof enable row level security;
revoke all on table private.finance_bill_split_proof from public, anon, authenticated, service_role;
grant select, insert on table private.finance_bill_split_proof to service_role;

create function private.report_finance_bill_split_with_proof(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid,
  p_event_id uuid,
  p_from_id uuid,
  p_to_id uuid,
  p_amount_minor bigint,
  p_content_type text,
  p_proof_base64 text
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  report uuid;
  proof_bytes bytea;
begin
  if p_proof_base64 is null or length(p_proof_base64) > 349528 then
    raise invalid_parameter_value using message = 'Proof exceeds the supported size';
  end if;
  proof_bytes := decode(p_proof_base64, 'base64');

  report := private.write_finance_bill_split_activity(
    p_ws_id, p_actor_id, p_split_id, p_event_id, 'payment_report',
    p_from_id => p_from_id, p_to_id => p_to_id, p_amount_minor => p_amount_minor
  );

  insert into private.finance_bill_split_proof (ws_id, split_id, report_id, content_type, contents)
    values (p_ws_id, p_split_id, report, p_content_type, proof_bytes)
    on conflict (ws_id, split_id, report_id) do nothing;
  if not found and not exists (
    select 1 from private.finance_bill_split_proof
    where ws_id = p_ws_id and split_id = p_split_id and report_id = report
      and content_type = p_content_type and contents = proof_bytes
  ) then
    raise sqlstate 'PT409' using message = 'Payment proof conflicts with an existing report';
  end if;
  return report;
end;
$$;

revoke all on function private.report_finance_bill_split_with_proof(uuid, uuid, uuid, uuid, uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function private.report_finance_bill_split_with_proof(uuid, uuid, uuid, uuid, uuid, uuid, bigint, text, text)
  to service_role;

create function private.read_finance_bill_split_proof(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid,
  p_report_id uuid
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'contentType', proof.content_type,
    'base64', encode(proof.contents, 'base64')
  )
  from private.finance_bill_split_proof as proof
  join private.finance_bill_split_activity as report
    on report.ws_id = proof.ws_id and report.split_id = proof.split_id and report.id = proof.report_id
  where proof.ws_id = p_ws_id and proof.split_id = p_split_id and proof.report_id = p_report_id
    and report.kind = 'payment_report'
    and private.read_finance_bill_splits(p_ws_id, p_actor_id, p_split_id) <> '[]'::jsonb
    and (
      report.actor_id = p_actor_id
      or private.finance_bill_split_participant_actor(p_ws_id, p_split_id, report.from_id, p_actor_id)
      or private.finance_bill_split_participant_actor(p_ws_id, p_split_id, report.to_id, p_actor_id)
    );
$$;

revoke all on function private.read_finance_bill_split_proof(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.read_finance_bill_split_proof(uuid, uuid, uuid, uuid)
  to service_role;

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
    from private.finance_bill_split_activity as event
    where event.ws_id = p_ws_id and event.split_id = p_split_id
      and private.read_finance_bill_splits(p_ws_id, p_actor_id, p_split_id) <> '[]'::jsonb
    order by event.created_at desc, event.id
    limit 100
  ) as activity;
$$;

revoke all on function private.read_finance_bill_split_activity(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.read_finance_bill_split_activity(uuid, uuid, uuid)
  to service_role;

commit;
