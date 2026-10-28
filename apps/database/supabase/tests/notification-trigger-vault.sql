-- Disposable local databases only. Rollback prevents pg_net from sending requests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(17);

delete from vault.secrets where name = 'notification_immediate_bearer';
select vault.create_secret('sr327-vault-fixture', 'notification_immediate_bearer');
select set_config('app.service_role_key', 'sr327-guc-fixture', true);

create temporary table sr327_batches (id uuid primary key, scenario text);
create function pg_temp.sr327_insert(scenario text, mode public.notification_delivery_mode default 'immediate')
returns uuid language plpgsql as $$
declare batch_id uuid := gen_random_uuid();
begin
  insert into pg_temp.sr327_batches values (batch_id, scenario);
  insert into private.notification_batches
    (id, email, channel, window_start, window_end, delivery_mode)
  values (batch_id, 'sr327@example.invalid', 'email', now(), now(), mode);
  return batch_id;
end;
$$;

select ok(exists (
  select 1 from pg_trigger
  where tgrelid = 'private.notification_batches'::regclass
    and tgname = 'trigger_send_immediate_notification'
    and tgfoid = 'public.trigger_immediate_notification_send()'::regprocedure
    and tgenabled = 'O'
), 'the real immediate batch trigger is enabled and uses the protected function');

-- The first assertion below is the SR-327 regression: the old function queues
-- its GUC bearer to attacker.invalid. No outbound request can commit here.
select set_config('app.base_url', 'https://attacker.invalid', true);
select pg_temp.sr327_insert('unexpected host');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where b.scenario = 'unexpected host'
    and q.url <> 'https://tuturuuu.com/api/notifications/send-immediate'),
  0, 'a session cannot send the bearer to an unexpected host');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where b.scenario = 'unexpected host'),
  1, 'a configured Vault bearer still queues one immediate request');
select is((select q.headers->>'Authorization' from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where b.scenario = 'unexpected host'),
  'Bearer sr327-vault-fixture', 'the bearer comes from Vault rather than the GUC');

select set_config('app.base_url', value, true), pg_temp.sr327_insert(value)
from (values
  ('http://127.0.0.1'),
  ('http://169.254.169.254'),
  ('https://tuturuuu.com.attacker.invalid'),
  ('https://tuturuuu.com@attacker.invalid'),
  ('https://tuturuuu.com:444'),
  ('')
) hosts(value);
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where q.url <> 'https://tuturuuu.com/api/notifications/send-immediate'),
  0, 'loopback, metadata, suffix, userinfo, alternate port and empty GUC cannot redirect');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text),
  7, 'every immediate fixture queues exactly one request');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where q.headers->>'Authorization' <> 'Bearer sr327-vault-fixture'),
  0, 'no session bearer is sent');

select set_config('app.service_role_key', '', true);
select pg_temp.sr327_insert('Vault without GUC');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where b.scenario = 'Vault without GUC'),
  1, 'Vault delivery works with no session bearer');
select pg_temp.sr327_insert('batched', 'batched');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where b.scenario = 'batched'), 0, 'batched delivery makes no immediate request');

delete from vault.secrets where name = 'notification_immediate_bearer';
select set_config('app.base_url', 'https://attacker.invalid', true);
select set_config('app.service_role_key', 'sr327-guc-fixture', true);
select pg_temp.sr327_insert('missing Vault secret');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where b.scenario = 'missing Vault secret'),
  0, 'missing Vault secret fails closed even with session credentials');
select vault.create_secret('   ', 'notification_immediate_bearer');
select pg_temp.sr327_insert('blank Vault secret');
select is((select count(*)::int from net.http_request_queue q
  join sr327_batches b on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text
  where b.scenario = 'blank Vault secret'), 0, 'blank Vault secret fails closed');
select is((select count(*)::int from private.notification_batches n
  join sr327_batches b on n.id = b.id
  where b.scenario in ('missing Vault secret', 'blank Vault secret')
    and n.status = 'pending'),
  2, 'transport configuration failures preserve pending batches for recovery');

select ok(not has_function_privilege('anon',
  'public.trigger_immediate_notification_send()', 'execute'),
  'anon cannot execute the trigger function');
select ok(not has_function_privilege('authenticated',
  'public.trigger_immediate_notification_send()', 'execute'),
  'authenticated cannot execute the trigger function');
select ok(not has_table_privilege('anon', 'vault.decrypted_secrets', 'select'),
  'anon cannot read decrypted Vault secrets');
select ok(not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select'),
  'authenticated cannot read decrypted Vault secrets');
select ok((select prosecdef and proconfig @> array['search_path=pg_catalog, pg_temp']
  from pg_proc where oid = 'public.trigger_immediate_notification_send()'::regprocedure),
  'the definer has a fixed trusted search path');

select * from finish();
rollback;
