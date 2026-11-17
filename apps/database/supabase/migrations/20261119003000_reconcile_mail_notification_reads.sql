-- Consumption is monotonic and independent of restored Mail unread state.
alter table private.mail_message_user_state
  add column notification_consumed_at timestamptz;

create function private.stamp_mail_notification_consumption()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
begin
  new.notification_consumed_at := coalesce(
    case when TG_OP = 'UPDATE' then coalesce(
      old.notification_consumed_at, old.read_at, old.archived_at, old.trashed_at) end,
    new.notification_consumed_at, new.read_at, new.archived_at, new.trashed_at);
  return new;
end;
$$;
revoke all on function private.stamp_mail_notification_consumption() from public, anon, authenticated;
create trigger stamp_mail_notification_consumption
before insert or update on private.mail_message_user_state
for each row execute function private.stamp_mail_notification_consumption();

-- Mail read state is authoritative for its user's matching incoming alerts.
create or replace function private.reconcile_mail_read_notifications()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mail-notification-read:' || new.message_id::text || ':' || new.user_id::text, 0));
  update public.notifications n set read_at = new.notification_consumed_at
  where n.user_id = new.user_id and n.entity_id = new.message_id
    and n.type = 'mail_received' and n.entity_type = 'mail_message'
    and n.scope = 'user' and n.ws_id is null and n.read_at is null
    and n.data->>'mailboxId' = new.mailbox_id::text
    and n.data->>'messageId' = new.message_id::text
    and n.data->>'userId' = new.user_id::text;
  return new;
end;
$$;

revoke all on function private.reconcile_mail_read_notifications() from public, anon, authenticated;

drop trigger if exists reconcile_mail_read_notifications on private.mail_message_user_state;
create trigger reconcile_mail_read_notifications
after insert or update of read_at, archived_at, trashed_at, notification_consumed_at on private.mail_message_user_state
for each row when (new.notification_consumed_at is not null)
execute function private.reconcile_mail_read_notifications();

-- Serialize with the read-state trigger so a late notification cannot race it.
create or replace function private.apply_mail_read_state_to_notification()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  message_read_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'mail-notification-read:' || new.entity_id::text || ':' || new.user_id::text, 0));
  select coalesce(s.notification_consumed_at, s.read_at, s.archived_at, s.trashed_at) into message_read_at
  from private.mail_message_user_state s
  where s.message_id = new.entity_id and s.user_id = new.user_id
    and s.mailbox_id::text = new.data->>'mailboxId'
    and new.data->>'messageId' = new.entity_id::text
    and new.data->>'userId' = new.user_id::text;
  if message_read_at is not null then new.read_at = message_read_at; end if;
  return new;
end;
$$;

revoke all on function private.apply_mail_read_state_to_notification() from public, anon, authenticated;

drop trigger if exists apply_mail_read_state_to_notification on public.notifications;
create trigger apply_mail_read_state_to_notification
before insert on public.notifications
for each row when (new.type = 'mail_received' and new.entity_type = 'mail_message'
  and new.scope = 'user' and new.ws_id is null and new.read_at is null)
execute function private.apply_mail_read_state_to_notification();

-- Bound repair from one captured candidate set, including under concurrent writes.
do $$
declare repair_ids uuid[];
begin
  select pg_catalog.array_agg(candidate.id) into repair_ids from (
    select n.id from public.notifications n
    join private.mail_message_user_state s
      on n.user_id = s.user_id and n.entity_id = s.message_id
    where coalesce(s.notification_consumed_at, s.read_at, s.archived_at, s.trashed_at) is not null
      and n.read_at is null and n.type = 'mail_received'
      and n.entity_type = 'mail_message' and n.scope = 'user' and n.ws_id is null
      and n.data->>'mailboxId' = s.mailbox_id::text
      and n.data->>'messageId' = s.message_id::text
      and n.data->>'userId' = s.user_id::text
    order by n.id limit 50001
  ) candidate;
  if pg_catalog.cardinality(repair_ids) > 50000 then
    raise exception 'Mail notification repair exceeds 50000; approved batching required';
  end if;
  update public.notifications n
  set read_at = coalesce(s.notification_consumed_at, s.read_at, s.archived_at, s.trashed_at)
  from private.mail_message_user_state s
  where n.id = any(repair_ids) and n.user_id = s.user_id and n.entity_id = s.message_id
    and n.read_at is null
    and coalesce(s.notification_consumed_at, s.read_at, s.archived_at, s.trashed_at) is not null
    and n.type = 'mail_received' and n.entity_type = 'mail_message'
    and n.scope = 'user' and n.ws_id is null
    and n.data->>'mailboxId' = s.mailbox_id::text
    and n.data->>'messageId' = s.message_id::text
    and n.data->>'userId' = s.user_id::text;
end;
$$;

-- Label movement and the acting user's consumption commit or roll back together.
create function private.move_mail_to_blocked_and_consume_notifications(
  p_mailbox_id uuid, p_user_id uuid, p_label_id uuid, p_message_ids uuid[]
) returns integer language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare
  ids uuid[];
  eligible integer;
begin
  if coalesce(pg_catalog.cardinality(p_message_ids), 0) = 0 then return 0; end if;
  if pg_catalog.cardinality(p_message_ids) > 500 then
    raise exception 'Mail notification movement exceeds 500 messages';
  end if;
  if not exists (
    select 1 from private.mail_mailbox_members m
    where m.mailbox_id = p_mailbox_id and m.user_id = p_user_id
      and m.role::text in ('owner', 'admin')
  ) then raise exception 'Mailbox administrator required'; end if;
  if not exists (
    select 1 from private.mail_labels l where l.id = p_label_id
      and l.mailbox_id = p_mailbox_id and l.kind = 'system' and l.slug = 'blocked'
  ) then raise exception 'Mailbox blocked label required'; end if;
  select pg_catalog.array_agg(id order by id) into ids
  from (select distinct unnest(p_message_ids) as id) requested;
  select count(*) into eligible from private.mail_messages m
  where m.id = any(ids) and m.mailbox_id = p_mailbox_id and m.direction = 'inbound';
  if eligible <> pg_catalog.cardinality(ids) then
    raise exception 'Mailbox messages required';
  end if;
  insert into private.mail_message_user_state
    (message_id, mailbox_id, user_id, notification_consumed_at)
  select id, p_mailbox_id, p_user_id, pg_catalog.statement_timestamp()
  from unnest(ids) id order by id
  on conflict (message_id, user_id) do update
    set notification_consumed_at = coalesce(
      private.mail_message_user_state.notification_consumed_at,
      excluded.notification_consumed_at);
  insert into private.mail_message_labels (message_id, label_id)
  select id, p_label_id from unnest(ids) id order by id
  on conflict (message_id, label_id) do nothing;
  return eligible;
end;
$$;
revoke all on function private.move_mail_to_blocked_and_consume_notifications(uuid, uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function private.move_mail_to_blocked_and_consume_notifications(uuid, uuid, uuid, uuid[])
  to service_role;
