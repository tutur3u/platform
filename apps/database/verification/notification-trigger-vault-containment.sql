-- Run only after the containment rollback in a disposable local Supabase.
-- All fixtures roll back, so even a broken rollback cannot commit HTTP.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

select ok((select prosecdef from pg_proc
  where oid = 'public.trigger_immediate_notification_send()'::regprocedure),
  'containment preserves SECURITY DEFINER');
select is((select pg_get_userbyid(proowner)::text from pg_proc
  where oid = 'public.trigger_immediate_notification_send()'::regprocedure),
  'postgres', 'containment preserves the postgres owner');
select ok((select proconfig @> array['search_path=pg_catalog, pg_temp']
  from pg_proc where oid = 'public.trigger_immediate_notification_send()'::regprocedure),
  'containment preserves the trusted search path');
select ok(not exists (
  select 1 from pg_proc p,
    lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where p.oid = 'public.trigger_immediate_notification_send()'::regprocedure
    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
), 'PUBLIC cannot execute the contained trigger function');
select ok(not has_function_privilege('anon',
  'public.trigger_immediate_notification_send()', 'execute'),
  'anon cannot execute the contained trigger function');
select ok(not has_function_privilege('authenticated',
  'public.trigger_immediate_notification_send()', 'execute'),
  'authenticated cannot execute the contained trigger function');
select ok(has_function_privilege('service_role',
  'public.trigger_immediate_notification_send()', 'execute'),
  'service_role retains execution');
select ok(exists (
  select 1 from pg_trigger
  where tgrelid = 'private.notification_batches'::regclass
    and tgname = 'trigger_send_immediate_notification'
    and tgfoid = 'public.trigger_immediate_notification_send()'::regprocedure
    and tgenabled = 'O'
), 'the real immediate batch trigger remains enabled');
select ok((select prosrc !~* 'net[.]http|current_setting|vault[.]|app[.]'
  from pg_proc where oid = 'public.trigger_immediate_notification_send()'::regprocedure),
  'the contained body has no HTTP call or credential/configuration lookup');

delete from vault.secrets where name = 'notification_immediate_bearer';
select vault.create_secret('sr327-containment-fixture', 'notification_immediate_bearer');
select set_config('app.base_url', 'https://attacker.invalid', true);
select set_config('app.service_role_key', 'sr327-guc-fixture', true);
create temporary table sr327_containment_batches (id uuid primary key, mode text);
insert into sr327_containment_batches
  select gen_random_uuid(), mode from (values ('immediate'), ('batched')) m(mode);
insert into private.notification_batches
  (id, email, channel, window_start, window_end, delivery_mode)
select id, 'sr327-containment@example.invalid', 'email', now(), now(),
  mode::public.notification_delivery_mode from sr327_containment_batches;
select is((select count(*)::int from net.http_request_queue q
  join sr327_containment_batches b
    on convert_from(q.body, 'UTF8')::jsonb->>'batch_id' = b.id::text),
  0, 'neither delivery mode queues HTTP even with valid Vault and hostile GUCs');
select is((select count(*)::int from private.notification_batches n
  join sr327_containment_batches b on n.id = b.id where n.status = 'pending'),
  2, 'both real batch inserts succeed and remain pending for cron-control');
select ok(not has_table_privilege('anon', 'private.notification_batches', 'insert'),
  'anon cannot insert batches directly');
select ok(not has_table_privilege('authenticated', 'private.notification_batches', 'insert'),
  'authenticated cannot insert batches directly');
select ok(not has_table_privilege('anon', 'vault.decrypted_secrets', 'select'),
  'anon cannot read the Vault bearer');
select ok(not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'select'),
  'authenticated cannot read the Vault bearer');

select * from finish();
rollback;
