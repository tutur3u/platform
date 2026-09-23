-- Add durable incoming Mail notifications for personal mobile push deep links.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'task_assigned',
    'task_updated',
    'task_mention',
    'task_label_added',
    'task_label_removed',
    'task_title_changed',
    'task_description_changed',
    'task_priority_changed',
    'task_due_date_changed',
    'task_start_date_changed',
    'task_estimation_changed',
    'task_assignee_added',
    'task_assignee_removed',
    'task_project_linked',
    'task_project_unlinked',
    'task_moved',
    'task_completed',
    'task_reopened',
    'task_deleted',
    'task_restored',
    'deadline_reminder',
    'workspace_invite',
    'system_announcement',
    'account_update',
    'security_alert',
    'report_approved',
    'report_rejected',
    'post_approved',
    'post_rejected',
    'time_tracking_request_submitted',
    'time_tracking_request_resubmitted',
    'time_tracking_request_approved',
    'time_tracking_request_rejected',
    'time_tracking_request_needs_info',
    'chat_message',
    'mail_received'
  ));

comment on constraint notifications_type_check on public.notifications is
  'Validates notification types for task activity, workspace/system notices, approvals, time tracking request workflows, chat messages, and incoming Mail.';

-- Persist the recipient decision even when preferences suppress delivery, or the
-- user deletes the notification. Re-labeling/replaying mail cannot push again.
create table private.mail_notification_receipts (
  message_id uuid not null references private.mail_messages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete set null,
  primary key (message_id, user_id)
);
alter table private.mail_notification_receipts enable row level security;
grant all on private.mail_notification_receipts to service_role;

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
    if not public.should_send_notification(v_user, 'mail_received', 'push', 'user', null)
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
revoke all on function private.notify_incoming_mail() from public, anon, authenticated;
create trigger notify_incoming_mail after insert on private.mail_message_labels
for each row execute function private.notify_incoming_mail();

-- Recheck access and preferences at send time; queued payloads must not outlive
-- revoked membership or internal-account access. Only the service role calls this.
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
      and public.should_send_notification(n.user_id, 'mail_received', 'push', 'user', null)
      and public.should_send_notification(n.user_id, 'push_notifications', 'push', 'user', null)
  );
$$;
revoke all on function private.can_deliver_mail_notification(uuid) from public, anon, authenticated;
grant execute on function private.can_deliver_mail_notification(uuid) to service_role;

create or replace function private.requeue_mail_push_batches()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_batch record;
  v_count integer := 0;
begin
  for v_batch in
    select b.id, b.status from private.notification_batches b
    where b.channel = 'push' and b.delivery_mode = 'immediate'
      and b.ws_id is null
      and (b.status = 'failed' or (b.status = 'processing' and b.updated_at < now() - interval '10 minutes'))
      and b.created_at > now() - interval '1 day'
      and exists (select 1 from private.notification_delivery_log l
        join private.mail_notification_receipts r on r.notification_id = l.notification_id
        where l.batch_id = b.id and l.status <> 'sent' and coalesce(l.retry_count, 0) < 3)
    for update skip locked
  loop
    update private.notification_delivery_log set status = 'pending', updated_at = now(),
      retry_count = coalesce(retry_count, 0) + case when v_batch.status = 'processing' then 1 else 0 end
    where batch_id = v_batch.id and status <> 'sent' and coalesce(retry_count, 0) < 3;
    update private.notification_batches set status = 'pending', updated_at = now(), error_message = null
    where id = v_batch.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.requeue_mail_push_batches() from public, anon, authenticated;
grant execute on function private.requeue_mail_push_batches() to service_role;
