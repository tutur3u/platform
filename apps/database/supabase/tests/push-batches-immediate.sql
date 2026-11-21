-- Disposable local databases only. Rollback prevents pg_net from sending requests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(20);

delete from vault.secrets where name = 'notification_immediate_bearer';
-- A configured bearer makes the trigger queue real pg_net requests, which the
-- rollback discards; the queue rows are the dispatch count.
select vault.create_secret('push-fixture-bearer', 'notification_immediate_bearer');

insert into auth.users(id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('f2100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'push-device@example.invalid', now(), now(), now()),
  ('f2100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'push-nodevice@example.invalid', now(), now(), now());
insert into public.users(id) values
  ('f2100000-0000-0000-0000-000000000001'),
  ('f2100000-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.notification_push_devices(user_id, device_id, token, platform, app_flavor)
values ('f2100000-0000-0000-0000-000000000001', 'device-1', 'token-1', 'ios', 'production');

create temporary table push_requests (seq integer, user_id uuid, channel text, batch_id uuid);
create function pg_temp.request(
  p_seq integer, p_user uuid, p_channel text,
  p_mode public.notification_delivery_mode default 'batched')
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  v_id := public.get_or_create_notification_batch(
    null, p_user, p_channel, 15,
    case when p_channel = 'email' then 'push-device@example.invalid' end,
    p_mode);
  insert into pg_temp.push_requests values (p_seq, p_user, p_channel, v_id);
  return v_id;
end;
$$;
create function pg_temp.mode(p_id uuid) returns text language sql as $$
  select delivery_mode::text from private.notification_batches where id = p_id
$$;
create function pg_temp.dispatches() returns integer language sql as $$
  select count(*)::int from net.http_request_queue q
  join pg_temp.push_requests r
    on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = r.batch_id::text
$$;

select is(pg_temp.mode(pg_temp.request(1, 'f2100000-0000-0000-0000-000000000001', 'push')),
  'immediate', 'a push for a recipient with a device is promoted to immediate');
select ok((select window_end <= now() from private.notification_batches
  where id = (select batch_id from push_requests where seq = 1)),
  'an immediate push batch has no digest window');
select is(pg_temp.mode(pg_temp.request(2, 'f2100000-0000-0000-0000-000000000002', 'push')),
  'batched', 'a recipient without a device keeps the digest path and triggers no transport');

-- Bulk fan-out: ten more events for the same recipient inside one minute.
select pg_temp.request(seq, 'f2100000-0000-0000-0000-000000000001', 'push')
from generate_series(3, 12) as seq;
select is(
  (select count(*)::int from private.notification_batches
   where user_id = 'f2100000-0000-0000-0000-000000000001'
     and channel = 'push' and delivery_mode = 'immediate'),
  6, 'eleven events inside one minute admit exactly the per-user cap of six immediate sends');
select is(pg_temp.dispatches(), 6,
  'eleven events for one recipient queue exactly six transport requests');
select is(
  (select count(distinct batch_id)::int from push_requests
   where user_id = 'f2100000-0000-0000-0000-000000000001'
     and pg_temp.mode(batch_id) = 'batched'),
  1, 'overflow events coalesce into one digest batch');

update private.push_dispatch_control set immediate_enabled = false;
delete from private.notification_batches
where user_id = 'f2100000-0000-0000-0000-000000000001' and delivery_mode = 'immediate';
select is(pg_temp.mode(pg_temp.request(13, 'f2100000-0000-0000-0000-000000000001', 'push')),
  'batched', 'the durable stop fence routes pushes back to the digest path');
select is(pg_temp.mode(pg_temp.request(20, 'f2100000-0000-0000-0000-000000000001', 'push', 'immediate')),
  'immediate', 'the stop fence leaves explicit immediate callers such as Chat unchanged');
update private.push_dispatch_control set immediate_enabled = true;
select is(pg_temp.mode(pg_temp.request(21, 'f2100000-0000-0000-0000-000000000002', 'push', 'immediate')),
  'batched', 'an explicit immediate push for a recipient without a device queues no transport');
select is(
  (select count(*)::int from net.http_request_queue q
   join push_requests r on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = r.batch_id::text
   where r.seq in (13, 21)),
  0, 'stopped and device-less pushes queue no transport requests');
select is(pg_temp.mode(pg_temp.request(14, 'f2100000-0000-0000-0000-000000000001', 'push')),
  'immediate', 'lifting the fence restores immediate promotion');

delete from private.notification_batches
where user_id = 'f2100000-0000-0000-0000-000000000001' and delivery_mode = 'immediate';
insert into public.notification_preferences(user_id, event_type, channel, enabled, scope)
values ('f2100000-0000-0000-0000-000000000001', 'push_notifications', 'push', false, 'user');
select is(pg_temp.mode(pg_temp.request(22, 'f2100000-0000-0000-0000-000000000001', 'push', 'immediate')),
  'batched', 'the account-wide push switch holds at enqueue');
delete from public.notification_preferences
where user_id = 'f2100000-0000-0000-0000-000000000001' and event_type = 'push_notifications';

select is(pg_temp.mode(pg_temp.request(15, null, 'email')),
  'batched', 'email keeps the requested batched mode');
select is(pg_temp.request(16, null, 'email'), (select batch_id from push_requests where seq = 15),
  'email events inside one window share a digest batch');

-- Recovery covers immediate push beyond the root workspace and Mail.
insert into private.notification_batches(id, user_id, channel, status, window_start, window_end, delivery_mode)
values ('f2100000-0000-0000-0000-0000000000b1',
  'f2100000-0000-0000-0000-000000000002', 'push', 'failed', now(), now(), 'immediate');
insert into public.notifications(id, user_id, type, title, scope)
values ('f2100000-0000-0000-0000-0000000000c1',
  'f2100000-0000-0000-0000-000000000002', 'security_alert', 'Alert', 'user');
insert into private.notification_delivery_log(notification_id, channel, status, batch_id, retry_count)
values ('f2100000-0000-0000-0000-0000000000c1', 'push', 'failed', 'f2100000-0000-0000-0000-0000000000b1', 1);
select ok(private.requeue_mail_push_batches() >= 1, 'recovery requeues a failed immediate push outside root and Mail');
select is((select status from private.notification_batches where id = 'f2100000-0000-0000-0000-0000000000b1'),
  'pending', 'the recovered push batch is pending again');

select ok(not has_function_privilege('authenticated',
  'public.get_or_create_notification_batch(uuid, uuid, text, integer, text, public.notification_delivery_mode)', 'execute'),
  'authenticated cannot execute the batch helper');
select ok(not has_function_privilege('authenticated', 'private.push_recipient_reachable(uuid)', 'execute'),
  'authenticated cannot execute the reachability helper');
select ok(not has_function_privilege('authenticated', 'private.push_immediate_admitted(uuid)', 'execute'),
  'authenticated cannot execute the admission helper');
select ok(not has_table_privilege('authenticated', 'private.push_dispatch_control', 'update'),
  'authenticated cannot change the stop fence');

select * from finish();
rollback;
