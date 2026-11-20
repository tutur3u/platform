begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table private.finance_bill_split_reminders (
  id uuid primary key default gen_random_uuid(),
  ws_id uuid not null,
  split_id uuid not null,
  participant_id uuid not null,
  actor_id uuid not null references public.users(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  state text not null default 'pending' check (state in ('pending', 'delivered', 'canceled')),
  payment_fence bigint not null check (payment_fence >= 0),
  foreign key (ws_id, split_id, participant_id)
    references private.finance_bill_split_participants(ws_id, split_id, id) on delete cascade,
  unique (ws_id, split_id, participant_id, payment_fence)
);

create index finance_bill_split_reminders_due
  on private.finance_bill_split_reminders(due_at, id) where state = 'pending';
create index finance_bill_split_reminders_participant on
  private.finance_bill_split_reminders(ws_id, split_id, participant_id);
create index finance_bill_split_reminders_actor on private.finance_bill_split_reminders(actor_id, created_at);
create index finance_bill_split_reminders_recipient on private.finance_bill_split_reminders(recipient_id, created_at);

alter table private.finance_bill_split_reminders enable row level security;
revoke all on table private.finance_bill_split_reminders from public, anon, authenticated, service_role;
grant select, insert on table private.finance_bill_split_reminders to service_role;
grant update (state, completed_at) on table private.finance_bill_split_reminders to service_role;

create function private.schedule_finance_bill_split_reminder(
  p_ws_id uuid,
  p_actor_id uuid,
  p_split_id uuid,
  p_participant_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  split jsonb;
  recipient uuid;
  fence bigint;
  reminder_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ws_id::text || '/' || p_split_id::text, 0));
  split := private.read_finance_bill_splits(p_ws_id, p_actor_id, p_split_id)->0;
  if not coalesce((split->>'canManage')::boolean and (split->>'finalized')::boolean, false) then
    raise insufficient_privilege using message = 'Finalized split owner access required';
  end if;

  select member.user_id into recipient
  from private.finance_bill_split_participants as participant
  join public.workspace_members as member on member.ws_id = participant.ws_id
  where participant.ws_id = p_ws_id and participant.split_id = p_split_id and participant.id = p_participant_id
    and member.type = 'MEMBER'
    and (member.user_id = participant.member_id or exists (
      select 1 from private.finance_verified_contact_accounts(p_ws_id, participant.contact_id) as link
      where link.platform_user_id = member.user_id
    ))
  order by member.user_id
  limit 1;

  if recipient is null or recipient = p_actor_id or not exists (
    select 1 from jsonb_array_elements(split->'ledger'->'settlement'->'transfers') as payment
    where payment->>'from' = p_participant_id::text
  ) then
    raise invalid_parameter_value using message = 'Participant does not have a reminder destination';
  end if;

  select count(*) into fence from private.finance_bill_split_activity as activity
  where activity.ws_id = p_ws_id and activity.split_id = p_split_id and activity.kind = 'payment_confirm';
  if fence > 0 then
    raise sqlstate 'PT409' using message = 'Settlement changed; reminder is unavailable';
  end if;

  select reminder.id into reminder_id
  from private.finance_bill_split_reminders as reminder
  where reminder.ws_id = p_ws_id and reminder.split_id = p_split_id
    and reminder.participant_id = p_participant_id and reminder.payment_fence = fence;
  if reminder_id is not null then return reminder_id; end if;

  perform pg_advisory_xact_lock(hashtextextended('finance-reminder-sender/' || p_actor_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('finance-reminder-recipient/' || recipient::text, 0));
  if (select count(*) from private.finance_bill_split_reminders
        where actor_id = p_actor_id and created_at > clock_timestamp() - interval '24 hours') >= 10
    or (select count(*) from private.finance_bill_split_reminders
        where recipient_id = recipient and created_at > clock_timestamp() - interval '24 hours') >= 3 then
    raise sqlstate 'PT429' using message = 'Reminder quota reached';
  end if;

  insert into private.finance_bill_split_reminders (
    ws_id, split_id, participant_id, actor_id, recipient_id, due_at, payment_fence, created_at
  ) values (p_ws_id, p_split_id, p_participant_id, p_actor_id, recipient, clock_timestamp() + interval '24 hours', fence, clock_timestamp())
  on conflict (ws_id, split_id, participant_id, payment_fence) do nothing
  returning id into reminder_id;
  return coalesce(reminder_id, (
    select reminder.id from private.finance_bill_split_reminders as reminder
    where reminder.ws_id = p_ws_id and reminder.split_id = p_split_id
      and reminder.participant_id = p_participant_id and reminder.payment_fence = fence
  ));
end;
$$;

revoke all on function private.schedule_finance_bill_split_reminder(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.schedule_finance_bill_split_reminder(uuid, uuid, uuid, uuid)
  to service_role;

create function private.dispatch_finance_bill_split_reminders(p_limit integer default 20)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  job private.finance_bill_split_reminders%rowtype;
  state_value text;
  delivered integer := 0;
  canceled integer := 0;
begin
  for job in
    select reminder.*
    from private.finance_bill_split_reminders as reminder
    where reminder.state = 'pending' and reminder.due_at <= now()
    order by reminder.due_at, reminder.id
    limit least(greatest(coalesce(p_limit, 20), 0), 20)
    for update skip locked
  loop
    continue when not pg_try_advisory_xact_lock(hashtextextended(job.ws_id::text || '/' || job.split_id::text, 0));
    state_value := 'canceled';

    if now() <= job.due_at + interval '24 hours'
      and private.read_finance_bill_splits(job.ws_id, job.actor_id, job.split_id) <> '[]'::jsonb
      and private.read_finance_bill_splits(job.ws_id, job.recipient_id, job.split_id) <> '[]'::jsonb
      and private.finance_bill_split_participant_actor(job.ws_id, job.split_id, job.participant_id, job.recipient_id)
      and (select count(*) from private.finance_bill_split_activity as activity
        where activity.ws_id = job.ws_id and activity.split_id = job.split_id
          and activity.kind = 'payment_confirm') = job.payment_fence
      and public.has_workspace_permission(job.ws_id, job.actor_id, 'create_transactions')
      and public.has_workspace_permission(job.ws_id, job.recipient_id, 'view_transactions')
      and public.should_send_notification(job.recipient_id, 'system_announcement', 'web', 'workspace', job.ws_id) then

      insert into public.notifications (
        id, ws_id, user_id, type, title, data, entity_type, entity_id, created_by, scope, action_url
      ) select job.id, job.ws_id, job.recipient_id, 'system_announcement', split.title,
        jsonb_build_object('openTarget', 'finance', 'wsId', job.ws_id, 'splitId', job.split_id),
        'bill_split', job.split_id, job.actor_id, 'workspace',
        '/' || job.ws_id::text || '/finance/bill-splits/' || job.split_id::text || '/settlement'
      from private.finance_bill_splits as split
      where split.ws_id = job.ws_id and split.id = job.split_id
      on conflict (id) do nothing;
      state_value := 'delivered';
      delivered := delivered + 1;
    else
      canceled := canceled + 1;
    end if;

    update private.finance_bill_split_reminders
    set state = state_value, completed_at = now()
    where id = job.id;
  end loop;

  return jsonb_build_object('delivered', delivered, 'canceled', canceled);
end;
$$;

revoke all on function private.dispatch_finance_bill_split_reminders(integer)
  from public, anon, authenticated;
grant execute on function private.dispatch_finance_bill_split_reminders(integer)
  to service_role;

commit;
