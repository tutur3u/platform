-- Contract for 20261026180000_storage_access_audit_events.sql: deny-all RLS,
-- service-role-only writes and reads, bounded columns, and bounded 90-day
-- retention.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(24);

select ok((select relrowsecurity from pg_class
  where oid = 'private.storage_access_events'::regclass),
  'audit table has RLS enabled');
select is((select count(*)::int from pg_policies
  where schemaname = 'private' and tablename = 'storage_access_events'), 0,
  'audit table has no policies (deny-all for client roles)');
select ok(not has_table_privilege('anon', 'private.storage_access_events', 'SELECT')
  and not has_table_privilege('anon', 'private.storage_access_events', 'INSERT'),
  'anon cannot read or write the audit table');
select ok(not has_table_privilege('authenticated', 'private.storage_access_events', 'SELECT')
  and not has_table_privilege('authenticated', 'private.storage_access_events', 'INSERT'),
  'authenticated cannot read or write the audit table');
select ok(has_table_privilege('service_role', 'private.storage_access_events', 'INSERT')
  and has_table_privilege('service_role', 'private.storage_access_events', 'SELECT'),
  'service_role can insert and select');
select ok(not has_table_privilege('service_role', 'private.storage_access_events', 'UPDATE')
  and not has_table_privilege('service_role', 'private.storage_access_events', 'DELETE'),
  'service_role cannot rewrite or delete audit rows directly');
select ok(not has_function_privilege('authenticated',
    'private.prune_storage_access_events(integer)', 'EXECUTE')
  and not has_function_privilege('anon',
    'private.prune_storage_access_events(integer)', 'EXECUTE')
  and has_function_privilege('service_role',
    'private.prune_storage_access_events(integer)', 'EXECUTE'),
  'only service_role runs retention');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"5707a6e0-0000-4000-8000-00000000d001","role":"authenticated"}', true);
select throws_ok($$insert into private.storage_access_events (action, route, outcome)
  values ('sign', '/api/ai/chat/signed-read-url', 'allowed')$$,
  '42501', null, 'authenticated inserts are denied');
reset role;

set local role service_role;
select lives_ok($$insert into private.storage_access_events
  (actor_id, ws_id, path_root, object_hash, action, route, outcome, item_count)
  values ('5707a6e0-0000-4000-8000-00000000d001',
    '5707a6e0-0000-4000-8000-00000000d011', 'chats',
    repeat('a', 64), 'sign', '/api/ai/chat/signed-read-url', 'allowed', 1)$$,
  'service_role records an event');
select lives_ok($$insert into private.storage_access_events
  (ws_id, path_root, object_id, action, route, outcome)
  values ('5707a6e0-0000-4000-8000-00000000d011', 'docs',
    '5707a6e0-0000-4000-8000-00000000d021', 'share',
    '/api/v1/workspaces/[wsId]/storage/share', 'denied')$$,
  'route templates with brackets are accepted');
select throws_ok($$insert into private.storage_access_events (action, route, outcome)
  values ('read', '/api/x', 'allowed')$$, '23514', null, 'unknown actions are rejected');
select throws_ok($$insert into private.storage_access_events
  (actor_kind, action, route, outcome)
  values ('admin', 'sign', '/api/x', 'allowed')$$,
  '23514', null, 'unknown actor kinds are rejected');
select throws_ok($$insert into private.storage_access_events (action, route, outcome)
  values ('sign', '/api/x', 'maybe')$$, '23514', null, 'unknown outcomes are rejected');
select throws_ok($$insert into private.storage_access_events (action, route, outcome)
  values ('sign', 'https://evil.test/api/x?file=secret.pdf', 'allowed')$$,
  '23514', null, 'routes must be API path templates');
select throws_ok($$insert into private.storage_access_events (action, route, outcome)
  values ('sign', '/api/x?path=report.pdf', 'allowed')$$,
  '23514', null, 'routes cannot carry query strings');
select throws_ok($$insert into private.storage_access_events
  (object_hash, action, route, outcome)
  values ('report.pdf', 'sign', '/api/x', 'allowed')$$,
  '23514', null, 'object_hash must be a 64-character HMAC-SHA256 hex digest');
select throws_ok($$insert into private.storage_access_events
  (path_root, action, route, outcome)
  values (repeat('r', 65), 'sign', '/api/x', 'allowed')$$,
  '23514', null, 'path_root is bounded');
select throws_ok($$insert into private.storage_access_events
  (item_count, action, route, outcome)
  values (1001, 'list', '/api/x', 'allowed')$$,
  '23514', null, 'item_count is bounded');
select is((select count(*)::int from private.storage_access_events
  where ws_id = '5707a6e0-0000-4000-8000-00000000d011'), 2,
  'service_role reads its events');
reset role;

-- Retention: three expired rows, one recent row.
insert into private.storage_access_events (occurred_at, ws_id, action, route, outcome)
select now() - interval '91 days', '5707a6e0-0000-4000-8000-00000000d012',
  'list', '/api/x', 'allowed'
from generate_series(1, 3);
insert into private.storage_access_events (occurred_at, ws_id, action, route, outcome)
values (now() - interval '89 days', '5707a6e0-0000-4000-8000-00000000d012',
  'list', '/api/x', 'allowed');

set local role service_role;
select is(private.prune_storage_access_events(2), '{"deleted": 2}'::jsonb,
  'retention deletes at most p_limit expired rows');
select ok((private.prune_storage_access_events(1000) ->> 'deleted')::int >= 1,
  'a second call deletes the remaining expired rows');
-- Separate statement: the prune's deletes are visible to later snapshots.
select ok(not exists (select 1 from private.storage_access_events
    where ws_id = '5707a6e0-0000-4000-8000-00000000d012'
      and occurred_at < now() - interval '90 days'),
  'no expired rows remain');
select is((select count(*)::int from private.storage_access_events
  where ws_id = '5707a6e0-0000-4000-8000-00000000d012'), 1,
  'rows inside the 90-day window are kept');
select throws_ok($$select private.prune_storage_access_events(0)$$,
  '22023', null, 'retention rejects an unbounded or invalid limit');
reset role;

select * from finish();
rollback;
