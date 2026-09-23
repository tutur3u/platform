-- Thread-level preferences belong to the member, never the shared mailbox.
create table private.mail_thread_user_state (
  thread_id uuid not null references private.mail_threads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  mailbox_id uuid not null references private.mail_mailboxes(id) on delete cascade,
  snoozed_until timestamptz,
  muted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index mail_thread_user_state_mailbox_user_idx
  on private.mail_thread_user_state(mailbox_id, user_id);
alter table private.mail_thread_user_state enable row level security;
grant all on private.mail_thread_user_state to service_role;
-- Keep this independent migration compatible with either MFA rollout order.
do $$
begin
  if to_regprocedure('public.account_required_mfa_satisfied()') is not null then
    execute 'create policy account_required_mfa on private.mail_thread_user_state as restrictive for all to authenticated using ((select public.account_required_mfa_satisfied())) with check ((select public.account_required_mfa_satisfied()))';
  end if;
end;
$$;

create or replace function private.mail_thread_push_allowed(p_message_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from private.mail_thread_user_state s
    join private.mail_messages m on m.thread_id = s.thread_id and m.mailbox_id = s.mailbox_id
    where m.id = p_message_id and s.user_id = p_user_id
      and (s.muted_at is not null or s.snoozed_until > now())
  );
$$;
revoke all on function private.mail_thread_push_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function private.mail_thread_push_allowed(uuid, uuid) to service_role;

create or replace function private.set_mail_thread_preference(
  p_mailbox_id uuid, p_user_id uuid, p_thread_ids uuid[], p_action text,
  p_snoozed_until timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('snooze', 'unsnooze', 'mute', 'unmute') then
    raise exception 'Invalid thread preference action';
  end if;
  if p_action = 'snooze' and (p_snoozed_until is null or p_snoozed_until <= now() or p_snoozed_until > now() + interval '1 year') then
    raise exception 'Snooze must end within one year';
  end if;
  if not exists (select 1 from private.mail_mailbox_members where mailbox_id = p_mailbox_id and user_id = p_user_id)
    or exists (select 1 from unnest(p_thread_ids) as requested(thread_id) where not exists (select 1 from private.mail_threads t where t.id = requested.thread_id and t.mailbox_id = p_mailbox_id)) then
    raise exception 'Mailbox access denied';
  end if;
  insert into private.mail_thread_user_state(thread_id, mailbox_id, user_id, snoozed_until, muted_at)
  select distinct requested.thread_id, p_mailbox_id, p_user_id,
    case when p_action = 'snooze' then p_snoozed_until else null end,
    case when p_action = 'mute' then now() else null end
  from unnest(p_thread_ids) as requested(thread_id)
  on conflict (thread_id, user_id) do update set
    snoozed_until = case when p_action in ('snooze', 'unsnooze') then excluded.snoozed_until else mail_thread_user_state.snoozed_until end,
    muted_at = case when p_action in ('mute', 'unmute') then excluded.muted_at else mail_thread_user_state.muted_at end,
    updated_at = now();
  if p_action = 'snooze' then
    update private.mail_message_user_state s set archived_at = null, trashed_at = null
    from private.mail_messages m where s.message_id = m.id and s.user_id = p_user_id
      and s.mailbox_id = p_mailbox_id and m.mailbox_id = p_mailbox_id and m.thread_id = any(p_thread_ids);
  end if;
end;
$$;
revoke all on function private.set_mail_thread_preference(uuid, uuid, uuid[], text, timestamptz) from public, anon, authenticated;
grant execute on function private.set_mail_thread_preference(uuid, uuid, uuid[], text, timestamptz) to service_role;

-- Depends on the earlier incoming Mail push migration. Suppress both creation
-- and delivery; existing receipts still prevent replay after unmuting.
create or replace function private.notify_incoming_mail()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_message private.mail_messages%rowtype;
  v_user uuid;
  v_notification uuid;
  v_batch uuid;
begin
  if not exists (
    select 1 from private.mail_labels l
    where l.id = new.label_id and l.slug = 'inbox' and l.kind = 'system'
  ) then return new; end if;
  select m.* into v_message from private.mail_messages m
  join private.mail_mailboxes b on b.id = m.mailbox_id and b.status = 'active'
  where m.id = new.message_id and m.direction = 'inbound'
    and m.status = 'received' and m.provider in ('ses', 'cloudflare')
    and m.thread_id is not null and m.received_at >= now() - interval '5 minutes'
    and m.created_at >= now() - interval '5 minutes'
    and not (m.metadata ? 'import')
    and not exists (select 1 from private.mail_raw_messages raw
      where raw.id = m.raw_message_id and (raw.status = 'quarantined'
        or upper(coalesce(raw.spam_verdict, '')) = 'FAIL'
        or upper(coalesce(raw.virus_verdict, '')) = 'FAIL'));
  if not found then return new; end if;

  for v_user in
    select distinct members.user_id from private.mail_mailbox_members members
    join auth.users u on u.id = members.user_id
    where members.mailbox_id = v_message.mailbox_id
      and lower(u.email) ~ '^[^@[:space:]]+@tuturuuu\.com$'
      and (u.banned_until is null or u.banned_until < now())
  loop
    insert into private.mail_notification_receipts(message_id, user_id)
    values (v_message.id, v_user) on conflict do nothing;
    if not found then continue; end if;
    if not private.mail_thread_push_allowed(v_message.id, v_user)
      or not public.should_send_notification(v_user, 'mail_received', 'push', 'user', null)
      or not public.should_send_notification(v_user, 'push_notifications', 'push', 'user', null)
      then continue; end if;
    insert into public.notifications (
      user_id, type, code, title, description, data, entity_type, entity_id, scope, priority
    ) values (
      v_user, 'mail_received', 'mail_received',
      left(coalesce(nullif(v_message.from_name, ''), v_message.from_address), 255),
      left(v_message.subject, 1000),
      jsonb_build_object('openTarget', 'mail', 'mailboxId', v_message.mailbox_id,
        'threadId', v_message.thread_id, 'messageId', v_message.id, 'userId', v_user),
      'mail_message', v_message.id, 'user', 'medium'
    ) returning id into v_notification;
    update private.mail_notification_receipts set notification_id = v_notification
    where message_id = v_message.id and user_id = v_user;
    -- Dedicated batches avoid coalescing different mailbox/thread deep links.
    insert into private.notification_batches (
      user_id, channel, status, window_start, window_end, notification_count, delivery_mode
    ) values (v_user, 'push', 'pending', now(), now(), 1, 'immediate')
    returning id into v_batch;
    insert into private.notification_delivery_log(notification_id, channel, status, batch_id)
    values (v_notification, 'push', 'pending', v_batch);
  end loop;
  return new;
end;
$$;

create or replace function private.can_deliver_mail_notification(p_notification_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.notifications n
    join private.mail_notification_receipts r on r.notification_id = n.id and r.user_id = n.user_id
    join private.mail_messages m on m.id = r.message_id and m.id = n.entity_id
    join private.mail_mailboxes b on b.id = m.mailbox_id and b.status = 'active'
    join private.mail_mailbox_members mm on mm.mailbox_id = b.id and mm.user_id = n.user_id
    join auth.users u on u.id = n.user_id
    where n.id = p_notification_id and n.type = 'mail_received' and n.scope = 'user'
      and n.ws_id is null and n.entity_type = 'mail_message'
      and n.data->>'mailboxId' = b.id::text and n.data->>'threadId' = m.thread_id::text
      and n.data->>'messageId' = m.id::text and n.data->>'userId' = n.user_id::text
      and m.status = 'received' and m.direction = 'inbound'
      and lower(u.email) ~ '^[^@[:space:]]+@tuturuuu\.com$'
      and (u.banned_until is null or u.banned_until < now())
      and private.mail_thread_push_allowed(m.id, n.user_id)
      and public.should_send_notification(n.user_id, 'mail_received', 'push', 'user', null)
      and public.should_send_notification(n.user_id, 'push_notifications', 'push', 'user', null)
  );
$$;
