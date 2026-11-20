begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.finance_bill_split_activity (
  id uuid primary key,
  ws_id uuid not null,
  split_id uuid not null,
  actor_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('comment', 'payment_report', 'payment_confirm')),
  comment_text text check (length(btrim(comment_text)) between 1 and 2000),
  from_id uuid,
  to_id uuid,
  amount_minor bigint check (amount_minor between 1 and 9007199254740991),
  report_id uuid,
  unique (ws_id, split_id, id),
  foreign key (ws_id, split_id)
    references private.finance_bill_splits(ws_id, id) on delete cascade,
  foreign key (ws_id, split_id, from_id)
    references private.finance_bill_split_participants(ws_id, split_id, id),
  foreign key (ws_id, split_id, to_id)
    references private.finance_bill_split_participants(ws_id, split_id, id),
  foreign key (ws_id, split_id, report_id)
    references private.finance_bill_split_activity(ws_id, split_id, id),
  check (
    (kind = 'comment' and comment_text is not null and from_id is null
      and to_id is null and amount_minor is null and report_id is null)
    or (kind = 'payment_report' and comment_text is null and from_id is not null
      and to_id is not null and from_id <> to_id and amount_minor is not null and report_id is null)
    or (kind = 'payment_confirm' and comment_text is null and from_id is null
      and to_id is null and amount_minor is null and report_id is not null)
  )
);

create unique index finance_bill_split_activity_confirm_once
  on private.finance_bill_split_activity(ws_id, split_id, report_id)
  where report_id is not null;
create index finance_bill_split_activity_recency
  on private.finance_bill_split_activity(ws_id, split_id, created_at desc, id);
create index finance_bill_split_activity_actor
  on private.finance_bill_split_activity(actor_id)
  where actor_id is not null;
create index finance_bill_split_activity_from
  on private.finance_bill_split_activity(ws_id, split_id, from_id)
  where from_id is not null;
create index finance_bill_split_activity_to
  on private.finance_bill_split_activity(ws_id, split_id, to_id)
  where to_id is not null;

alter table private.finance_bill_split_activity enable row level security;
revoke all on table private.finance_bill_split_activity
  from public, anon, authenticated, service_role;
grant select, insert on table private.finance_bill_split_activity to service_role;

create function private.finance_bill_split_participant_actor(
  p_ws_id uuid,
  p_split_id uuid,
  p_participant_id uuid,
  p_actor_id uuid
) returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from private.finance_bill_split_participants as participant
    where participant.ws_id = p_ws_id
      and participant.split_id = p_split_id
      and participant.id = p_participant_id
      and (
        participant.member_id = p_actor_id
        or exists (
          select 1 from private.finance_verified_contact_accounts(p_ws_id, participant.contact_id) as link
          where link.platform_user_id = p_actor_id
        )
      )
  );
$$;

revoke all on function private.finance_bill_split_participant_actor(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.finance_bill_split_participant_actor(uuid, uuid, uuid, uuid)
  to service_role;

create function private.write_finance_bill_split_activity(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid,
  p_event_id uuid,
  p_kind text,
  p_comment text default null,
  p_from_id uuid default null,
  p_to_id uuid default null,
  p_amount_minor bigint default null,
  p_report_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  split jsonb;
  receiver uuid;
begin
  if p_kind = 'payment_confirm' then
    perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text || '/' || p_split_id::text, 0));
  end if;
  split := private.read_finance_bill_splits(p_ws_id, p_actor_id, p_split_id)->0;
  if split is null then
    raise insufficient_privilege using message = 'Bill split access required';
  end if;

  if p_kind in ('payment_report', 'payment_confirm') and not (split->>'finalized')::boolean then
    raise sqlstate 'PT409' using message = 'Payments require a finalized split';
  end if;

  if p_kind = 'payment_report' and not
    private.finance_bill_split_participant_actor(p_ws_id, p_split_id, p_from_id, p_actor_id) then
    if not exists (
      select 1
      from private.finance_bill_splits as header
      join private.finance_bill_split_participants as participant
        on participant.ws_id = header.ws_id and participant.split_id = header.id
      where header.ws_id = p_ws_id and header.id = p_split_id
        and header.created_by = p_actor_id
        and participant.id = p_from_id
        and participant.member_id is null
        and not exists (
          select 1 from private.finance_verified_contact_accounts(p_ws_id, participant.contact_id)
        )
    ) then
      raise insufficient_privilege using message = 'Only the sender can report this payment';
    end if;
  end if;

  if p_kind = 'payment_confirm' then
    select event.to_id into receiver
    from private.finance_bill_split_activity as event
    where event.ws_id = p_ws_id and event.split_id = p_split_id
      and event.id = p_report_id and event.kind = 'payment_report';
    if receiver is null or not
      private.finance_bill_split_participant_actor(p_ws_id, p_split_id, receiver, p_actor_id) then
      raise insufficient_privilege using message = 'Only the recipient can confirm this payment';
    end if;
    if not exists (
      select 1 from private.finance_bill_split_activity
      where ws_id = p_ws_id and split_id = p_split_id and report_id = p_report_id
    ) and (
      with confirmed as (
        select report.from_id::text as sender, report.to_id::text as recipient,
          sum(report.amount_minor) as amount
        from private.finance_bill_split_activity as report
        where report.ws_id = p_ws_id and report.split_id = p_split_id
          and report.kind = 'payment_report'
          and (report.id = p_report_id or exists (
            select 1 from private.finance_bill_split_activity as confirmation
            where confirmation.ws_id = p_ws_id and confirmation.split_id = p_split_id
              and confirmation.report_id = report.id and confirmation.kind = 'payment_confirm'
          ))
        group by report.from_id, report.to_id
      ), direct as (
        select transfer->>'from' as sender, transfer->>'to' as recipient,
          sum((transfer->>'amountMinor')::numeric) as amount
        from jsonb_array_elements(split->'input'->'direct') as transfer
        group by 1, 2
      ), outstanding_direct as (
        select direct.sender, direct.recipient,
          greatest(direct.amount - coalesce(confirmed.amount, 0), 0) as amount
        from direct left join confirmed using (sender, recipient)
      ), deltas as (
        select balance->>'participantId' as participant,
          (balance->>'amountMinor')::numeric as amount
        from jsonb_array_elements(split->'ledger'->'balances') as balance
        union all
        select sender, amount from confirmed
        union all
        select recipient, -amount from confirmed
        union all
        select sender, amount from outstanding_direct
        union all
        select recipient, -amount from outstanding_direct
      ), residual as (
        select participant, sum(amount) as amount from deltas group by participant
      )
      -- The solver can combine residual flows with direct obligations on one edge.
      select coalesce((select sum(amount) from confirmed), 0) > 9007199254740991
        or exists (select 1 from residual where abs(amount) > 9007199254740991)
        or exists (
          select 1 from outstanding_direct as direct
          join residual as sender on sender.participant = direct.sender
          join residual as recipient on recipient.participant = direct.recipient
          where direct.amount + greatest(least(-sender.amount, recipient.amount), 0)
            > 9007199254740991
        )
        or (select report.amount_minor from private.finance_bill_split_activity as report
          where report.ws_id = p_ws_id and report.split_id = p_split_id and report.id = p_report_id)
          > coalesce((select sum((transfer->>'amountMinor')::numeric)
            from jsonb_array_elements(split->'ledger'->'settlement'->'transfers') as transfer), 0)
    ) then
      raise sqlstate 'PT409' using message = 'Confirmation exceeds the supported settlement bounds';
    end if;
  end if;

  insert into private.finance_bill_split_activity (
    id, ws_id, split_id, actor_id, kind, comment_text, from_id, to_id, amount_minor, report_id
  ) values (
    p_event_id, p_ws_id, p_split_id, p_actor_id, p_kind, p_comment, p_from_id, p_to_id, p_amount_minor, p_report_id
  ) on conflict do nothing;

  if not found then
    if not exists (
      select 1 from private.finance_bill_split_activity as event
      where event.ws_id = p_ws_id and event.split_id = p_split_id and event.actor_id = p_actor_id
        and event.kind = p_kind
        and (event.id = p_event_id or (p_kind = 'payment_confirm' and event.report_id = p_report_id))
        and event.comment_text is not distinct from p_comment
        and event.from_id is not distinct from p_from_id
        and event.to_id is not distinct from p_to_id
        and event.amount_minor is not distinct from p_amount_minor
        and event.report_id is not distinct from p_report_id
    ) then
      raise sqlstate 'PT409' using message = 'Activity conflicts with an existing operation';
    end if;
    if p_kind = 'payment_confirm' then
      return (
        select event.id from private.finance_bill_split_activity as event
        where event.ws_id = p_ws_id and event.split_id = p_split_id and event.report_id = p_report_id
      );
    end if;
  end if;

  return p_event_id;
end;
$$;

revoke all on function private.write_finance_bill_split_activity(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, bigint, uuid
) from public, anon, authenticated;
grant execute on function private.write_finance_bill_split_activity(
  uuid, uuid, uuid, uuid, text, text, uuid, uuid, bigint, uuid
) to service_role;

create function private.read_finance_bill_split_activity(
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
      'amountMinor', event.amount_minor, 'reportId', event.report_id
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

create function private.finance_bill_split_confirmed_payments(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid
) returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'from', payments.from_id, 'to', payments.to_id, 'amountMinor', payments.total
  )), '[]'::jsonb)
  from (
    select report.from_id, report.to_id, sum(report.amount_minor) as total
    from private.finance_bill_split_activity as report
    join private.finance_bill_split_activity as confirmation
      on confirmation.ws_id = report.ws_id and confirmation.split_id = report.split_id
      and confirmation.report_id = report.id and confirmation.kind = 'payment_confirm'
    where report.ws_id = p_ws_id and report.split_id = p_split_id
      and report.kind = 'payment_report'
      and private.read_finance_bill_splits(p_ws_id, p_actor_id, p_split_id) <> '[]'::jsonb
    group by report.from_id, report.to_id
  ) as payments;
$$;

revoke all on function private.finance_bill_split_confirmed_payments(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.finance_bill_split_confirmed_payments(uuid, uuid, uuid)
  to service_role;

commit;
