-- Mail-only configured domain authority. This does not verify DNS/provider control.
create or replace function private.mail_push_recipient_allowed(p_user_id uuid, p_mailbox_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from auth.users u
  join private.mail_mailbox_members mm on mm.user_id=u.id and mm.mailbox_id=p_mailbox_id
  join private.mail_mailboxes b on b.id=mm.mailbox_id and b.status='active'
  join private.mail_domains bd on bd.id=b.domain_id and bd.status='active' and bd.verified_at is not null
  join private.mail_domains ud on ud.domain=split_part(lower(u.email),'@',2)
    and ud.status='active' and ud.verified_at is not null
  where u.id=p_user_id and u.email_confirmed_at is not null
   and (u.banned_until is null or u.banned_until < now())
   and lower(u.email) ~ '^[^@[:space:]]+@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*tuturuuu\.com$'
 );
$$;
revoke all on function private.mail_push_recipient_allowed(uuid,uuid) from public,anon,authenticated;

-- These fields are written by the existing verified SES/Cloudflare ingress.
-- Recheck canonical binding; suffix membership alone cannot authorize a message.
create or replace function private.mail_inbound_push_message_allowed(p_message_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from private.mail_messages m
  join private.mail_mailboxes b on b.id=m.mailbox_id and b.status='active'
  join private.mail_domains d on d.id=b.domain_id and d.status='active' and d.verified_at is not null
  join private.mail_domains i on i.id=m.ingress_domain_id and i.status='active' and i.verified_at is not null
  join private.mail_raw_messages r on r.id=m.raw_message_id
  where m.id=p_message_id and m.direction='inbound' and m.status='received'
   and r.status='imported' and r.provider=m.provider and r.provider_message_id=m.provider_message_id
   and d.domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*tuturuuu\.com$'
   and d.inbound_provider=m.provider and i.inbound_provider=m.provider
   and coalesce(i.canonical_domain_id,i.id)=d.id
   and upper(coalesce(r.spam_verdict,''))<>'FAIL' and upper(coalesce(r.virus_verdict,''))<>'FAIL'
   and split_part(lower(m.envelope_to),'@',2)=d.domain
   and split_part(lower(m.observed_recipient),'@',2)=i.domain
   and split_part(lower(m.envelope_to),'@',1)=split_part(lower(m.observed_recipient),'@',1)
   and (
    (m.provider='cloudflare' and r.provider_payload->>'canonicalDomain'=d.domain
     and r.provider_payload->>'ingressDomain'=i.domain
     and r.provider_payload#>>'{envelope,to}'=m.envelope_to
     and coalesce(r.provider_payload#>>'{envelope,observedTo}',r.provider_payload#>>'{envelope,to}')=m.observed_recipient)
    or (m.provider='ses' and i.id=d.id and (
      coalesce(r.provider_payload#>'{receipt,recipients}','[]'::jsonb) ? m.envelope_to
      or coalesce(r.provider_payload#>'{mail,destination}','[]'::jsonb) ? m.envelope_to
    ))
   )
 );
$$;
revoke all on function private.mail_inbound_push_message_allowed(uuid) from public,anon,authenticated;

alter table private.mail_notification_receipts add column event_key text;
-- Reconcile accepted/suppressed legacy decisions without deleting duplicate history
-- or creating notifications. One stable row carries each physical-event claim.
with decisions as (
 select r.message_id,r.user_id,
  coalesce('raw:'||m.raw_message_id::text,'message:'||m.id::text) as event_key,
  row_number() over(partition by r.user_id,coalesce(m.raw_message_id,m.id) order by m.created_at,m.id) as ordinal
 from private.mail_notification_receipts r join private.mail_messages m on m.id=r.message_id
)
update private.mail_notification_receipts r set event_key=d.event_key
from decisions d where r.message_id=d.message_id and r.user_id=d.user_id and d.ordinal=1;
create unique index mail_notification_receipts_event_owner_key
 on private.mail_notification_receipts(user_id,event_key) where event_key is not null;
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
      and l.mailbox_id = (select m.mailbox_id from private.mail_messages m where m.id=new.message_id)
  ) then return new; end if;
  select m.* into v_message from private.mail_messages m
  join private.mail_mailboxes b on b.id = m.mailbox_id and b.status = 'active'
  where m.id = new.message_id and m.direction = 'inbound'
    and m.status = 'received' and m.provider in ('ses', 'cloudflare')
    and m.thread_id is not null and m.received_at >= now() - interval '5 minutes'
    and m.created_at >= now() - interval '5 minutes'
    and not (m.metadata ? 'import')
    and private.mail_inbound_push_message_allowed(m.id)
    and not exists (select 1 from private.mail_raw_messages raw
      where raw.id = m.raw_message_id and (raw.status = 'quarantined'
        or upper(coalesce(raw.spam_verdict, '')) = 'FAIL'
        or upper(coalesce(raw.virus_verdict, '')) = 'FAIL'));
  if not found then return new; end if;

  for v_user in
    select distinct members.user_id from private.mail_mailbox_members members
    where members.mailbox_id = v_message.mailbox_id
      and private.mail_push_recipient_allowed(members.user_id, v_message.mailbox_id)
  loop
    insert into private.mail_notification_receipts(message_id, user_id, event_key)
    values (v_message.id, v_user, 'raw:' || v_message.raw_message_id::text) on conflict do nothing;
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
      and n.read_at is null
      -- Only the reconciled physical-event claim may authorize legacy sending.
      and r.event_key = coalesce('raw:' || m.raw_message_id::text, 'message:' || m.id::text)
      and not exists (
        select 1 from private.mail_message_user_state state
        where state.message_id=m.id and state.mailbox_id=b.id and state.user_id=n.user_id
          and (state.read_at is not null or state.archived_at is not null or state.trashed_at is not null)
      )
      and private.mail_push_recipient_allowed(n.user_id, b.id)
      and private.mail_inbound_push_message_allowed(m.id)
      and private.mail_thread_push_allowed(m.id, n.user_id)
      and public.should_send_notification(n.user_id, 'mail_received', 'push', 'user', null)
      and public.should_send_notification(n.user_id, 'push_notifications', 'push', 'user', null)
  );
$$;
