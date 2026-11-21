-- Disposable local databases only. Rollback prevents pg_net from sending requests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

delete from vault.secrets where name = 'notification_immediate_bearer';

insert into private.notification_batches(id, email, channel, status, window_start, window_end, delivery_mode)
values
  ('f3100000-0000-0000-0000-0000000000a1', 'latency-fixture@example.invalid', 'push', 'sent', now(), now(), 'immediate'),
  ('f3100000-0000-0000-0000-0000000000a2', 'latency-fixture@example.invalid', 'push', 'sent', now(), now(), 'batched');

insert into public.notifications (id, type, title, email, scope, created_at)
values
  ('f3100000-0000-0000-0000-0000000000b1', 'security_alert', 'Fast', 'latency-fixture@example.invalid', 'user', now() - interval '10 seconds'),
  ('f3100000-0000-0000-0000-0000000000b2', 'account_update', 'Slow', 'latency-fixture@example.invalid', 'user', now() - interval '30 seconds'),
  ('f3100000-0000-0000-0000-0000000000b3', 'security_alert', 'Stale', 'latency-fixture@example.invalid', 'user', now() - interval '10 days'),
  ('f3100000-0000-0000-0000-0000000000b4', 'security_alert', 'Skipped', 'latency-fixture@example.invalid', 'user', now() - interval '20 seconds'),
  ('f3100000-0000-0000-0000-0000000000b5', 'security_alert', 'Digest', 'latency-fixture@example.invalid', 'user', now() - interval '20 seconds');

insert into private.notification_delivery_log (notification_id, batch_id, channel, status, sent_at, error_message)
select n.id,
  case when n.title = 'Digest' then 'f3100000-0000-0000-0000-0000000000a2'::uuid
       else 'f3100000-0000-0000-0000-0000000000a1'::uuid end,
  'push', 'sent',
  n.created_at + case n.title when 'Slow' then interval '19 seconds' else interval '1 second' end,
  case when n.title = 'Skipped' then 'no_registered_push_devices' end
from public.notifications n
where n.id::text like 'f3100000-%';

insert into private.notification_delivery_log (notification_id, batch_id, channel, status, sent_at)
values ('f3100000-0000-0000-0000-0000000000b1', null, 'email', 'sent', now());

create temporary table latency_result as
select * from private.push_delivery_latency_summary(now() - interval '1 day');

select is((select count(*)::int from latency_result), 1,
  'returns one row per product channel');
select is((select channel from latency_result), 'account',
  'maps security and account types to the account channel');
select is((select sent_count from latency_result), 2::bigint,
  'counts accepted immediate sends only, excluding skips, digests, email and old rows');
select is((select max_ms from latency_result), 19000::double precision,
  'computes percentiles over the channel samples');
select is(
  (select sent_count from private.push_delivery_latency_summary(now() - interval '30 days')),
  2::bigint,
  'the window is bounded to seven days even for an older p_since');

select ok(
  not has_function_privilege('authenticated',
    'private.push_delivery_latency_summary(timestamptz)', 'execute'),
  'authenticated cannot read push latency');
select ok(
  has_function_privilege('service_role',
    'private.push_delivery_latency_summary(timestamptz)', 'execute'),
  'service role can read push latency');

select * from finish();
rollback;
