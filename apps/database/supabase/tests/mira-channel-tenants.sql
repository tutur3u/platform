begin;
select plan(40);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('ac000000-0000-4000-8000-000000000001', 'mira-owner@example.com', now(), '{}', '{}');
insert into public.workspaces (id, name, personal, creator_id) values
  ('ac000000-0000-4000-8000-0000000000a1', 'Mira tenant A', false, 'ac000000-0000-4000-8000-000000000001'),
  ('ac000000-0000-4000-8000-0000000000b1', 'Mira tenant B', false, 'ac000000-0000-4000-8000-000000000001');

-- Ids captured as the owner, because service_role has no table grants.
create temp table mira_ids (name text primary key, id uuid);
grant select, insert on mira_ids to service_role;

-- Tables are reachable only through the RPCs.
select ok(not has_table_privilege('authenticated', 'private.mira_tenants', 'select'), 'authenticated cannot read tenants');
select ok(not has_table_privilege('service_role', 'private.mira_channels', 'select'), 'service_role has no table grant');
select ok(not has_function_privilege('authenticated', 'private.mira_set_stop_reason(uuid, uuid, text, boolean, text, uuid, bigint, text)', 'execute'), 'authenticated cannot call the stop RPC');
select ok(has_function_privilege('service_role', 'private.mira_get_tenant(uuid)', 'execute'), 'service_role can read a tenant');

set local role service_role;

select is(
  (private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000a1',
    'ac000000-0000-4000-8000-000000000001', 'tenant_manager', null,
    '{"enabled": true, "dailyCapMicroUsd": 5000000, "monthlyCapMicroUsd": 50000000}') ->> 'configVersion')::bigint,
  2::bigint, 'first save creates the tenant and versions the change');
select throws_ok(
  $$ select private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000a1',
    'ac000000-0000-4000-8000-000000000001', 'tenant_manager', 1, '{"enabled": false}') $$,
  '40001', null, 'stale config version is rejected');
select throws_ok(
  $$ select private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000a1',
    'ac000000-0000-4000-8000-000000000001', 'tenant_manager', 2, '{"apiKey": "x"}') $$,
  '22023', null, 'unknown settings are rejected');
select throws_ok(
  $$ select private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000a1',
    'ac000000-0000-4000-8000-000000000001', 'tenant_manager', 2, '{"enabled": null}') $$,
  '22023', null, 'explicit null is rejected for non-nullable settings');
select throws_ok(
  $$ select private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000a1',
    'ac000000-0000-4000-8000-000000000001', 'operator', 2, '{}') $$,
  '22023', null, 'settings accept only tenant manager or billing authority');
select private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000b1',
  'ac000000-0000-4000-8000-000000000001', 'tenant_manager', null, '{}');
select throws_ok(
  $$ select private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000b1',
    'ac000000-0000-4000-8000-000000000001', 'billing', 1, '{"enabled": true}') $$,
  '42501', null, 'billing may change caps only');

-- Binding: unique across tenants while bound; personal mode only for root.
insert into mira_ids values ('guild', private.mira_bind_channel('ac000000-0000-4000-8000-0000000000a1',
  'ac000000-0000-4000-8000-000000000001', 'discord', 'shared_bot', 'guild-1', 'Guild'));
select isnt((select id from mira_ids where name = 'guild'), null, 'tenant A binds a guild');
select throws_ok(
  $$ select private.mira_bind_channel('ac000000-0000-4000-8000-0000000000b1',
    'ac000000-0000-4000-8000-000000000001', 'discord', 'shared_bot', 'guild-1', 'Guild') $$,
  '23505', null, 'tenant B cannot bind the same guild');
select throws_ok(
  $$ select private.mira_bind_channel('ac000000-0000-4000-8000-0000000000a1',
    'ac000000-0000-4000-8000-000000000001', 'zalo', 'personal', 'zalo-1', 'Personal') $$,
  '23514', null, 'personal mode is refused outside the root workspace');
select throws_ok(
  $$ select private.mira_bind_channel('ac000000-0000-4000-8000-0000000000a1',
    'ac000000-0000-4000-8000-000000000001', 'discord', 'official', 'guild-2', 'Guild') $$,
  '23514', null, 'invalid kind and mode pairs are refused');

-- Stop reasons: owned by one authority each; a resume clears only its own.
select is(
  (private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'operator', true,
    'operator', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note') ->> 'stopGeneration')::bigint,
  2::bigint, 'operator suspension bumps the generation');
select throws_ok(
  $$ select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'operator',
    false, 'tenant_manager', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note') $$,
  '42501', null, 'tenant manager cannot lift an operator stop');
select throws_ok(
  $$ select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'tenant',
    false, 'operator', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note') $$,
  '42501', null, 'operator cannot clear the tenant kill switch');
select throws_ok(
  $$ select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'tenant',
    true, null, 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note') $$,
  '42501', null, 'a missing authority is refused');
select throws_ok(
  $$ select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'cap',
    false, 'tenant_manager', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note') $$,
  '42501', null, 'tenant manager cannot clear a cap stop directly');
select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'tenant', true,
  'tenant_manager', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note');
select is(
  private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'tenant', false,
    'tenant_manager', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note') -> 'stopReasons',
  '["operator"]'::jsonb, 'clearing the tenant reason leaves the operator stop');
select throws_ok(
  $$ select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000b1',
    (select id from mira_ids where name = 'guild'),
    'tenant', true, 'tenant_manager', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note') $$,
  'P0002', null, 'a channel cannot be stopped through another workspace');

-- Compare-and-swap and notes on stop changes.
select throws_ok(
  $$ select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'tenant',
    true, 'tenant_manager', 'ac000000-0000-4000-8000-000000000001', 1, null) $$,
  '40001', null, 'a stale expected generation is rejected');
select throws_ok(
  $$ select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'operator',
    true, 'operator', 'ac000000-0000-4000-8000-000000000001', null, ' ') $$,
  '22023', null, 'operator stop changes need a note');
select is(
  (select l.note from private.mira_list_audit_events('ac000000-0000-4000-8000-0000000000a1', null, 1) l),
  'pgtap note', 'the latest audit row carries the note');

-- Global fence: readable, compare-and-swap, operator note required.
select is(private.mira_get_global_stop() ->> 'stopped', 'false', 'global fence starts open');
select throws_ok(
  $$ select private.mira_set_global_stop(true, 99, 'ac000000-0000-4000-8000-000000000001', 'drill') $$,
  '40001', null, 'a stale global generation is rejected');
select is(
  private.mira_set_global_stop(true,
    (private.mira_get_global_stop() ->> 'generation')::bigint,
    'ac000000-0000-4000-8000-000000000001', 'drill') ->> 'stopped',
  'true', 'the global fence closes with the current generation');
select throws_ok(
  $$ select private.mira_set_global_stop(false,
    (private.mira_get_global_stop() ->> 'generation')::bigint,
    'ac000000-0000-4000-8000-000000000001', null) $$,
  '22023', null, 'a global stop change needs a note');

-- A raised cap clears the cap stop.
select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1', null, 'cap', true,
  'system', 'ac000000-0000-4000-8000-000000000001', null, 'pgtap note');
select private.mira_update_tenant_settings('ac000000-0000-4000-8000-0000000000a1',
  'ac000000-0000-4000-8000-000000000001', 'tenant_manager',
  (private.mira_get_tenant('ac000000-0000-4000-8000-0000000000a1') ->> 'configVersion')::bigint,
  '{"dailyCapMicroUsd": 9000000}');
select is(
  private.mira_get_tenant('ac000000-0000-4000-8000-0000000000a1') -> 'stopReasons',
  '["operator"]'::jsonb, 'raising a cap clears only the cap stop');

-- Usage: idempotent per receipt and scoped to the channel's workspace.
select ok(private.mira_record_usage('ac000000-0000-4000-8000-0000000000c1',
  'ac000000-0000-4000-8000-0000000000a1', (select id from mira_ids where name = 'guild'),
  'claude-haiku-5-5', current_date, '{"replies": 1, "costMicroUsd": 400}'), 'usage recorded');
select ok(not private.mira_record_usage('ac000000-0000-4000-8000-0000000000c1',
  'ac000000-0000-4000-8000-0000000000a1', (select id from mira_ids where name = 'guild'),
  'claude-haiku-5-5', current_date, '{"replies": 1, "costMicroUsd": 400}'), 'redelivered receipt is ignored');
select throws_ok(
  $$ select private.mira_record_usage('ac000000-0000-4000-8000-0000000000c2',
    'ac000000-0000-4000-8000-0000000000b1', (select id from mira_ids where name = 'guild'),
    'claude-haiku-5-5', current_date, '{"replies": 1}') $$,
  'P0002', null, 'usage cannot be recorded against another workspace channel');
select throws_ok(
  $$ select private.mira_record_usage('ac000000-0000-4000-8000-0000000000c3',
    'ac000000-0000-4000-8000-0000000000a1', (select id from mira_ids where name = 'guild'),
    'claude-haiku-5-5', current_date, '{"replies": -1}') $$,
  '22023', null, 'negative usage is rejected');

-- Unbinding cannot shed an operator stop, and keeps usage history.
select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1',
  (select id from mira_ids where name = 'guild'), 'operator', true, 'operator',
  'ac000000-0000-4000-8000-000000000001', null, 'pgtap note');
select throws_ok(
  $$ select private.mira_unbind_channel('ac000000-0000-4000-8000-0000000000a1',
    (select id from mira_ids where name = 'guild'), 'ac000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'a channel with an operator stop cannot be unbound');
select private.mira_set_stop_reason('ac000000-0000-4000-8000-0000000000a1',
  (select id from mira_ids where name = 'guild'), 'operator', false, 'operator',
  'ac000000-0000-4000-8000-000000000001', null, 'pgtap note');
select ok(private.mira_unbind_channel('ac000000-0000-4000-8000-0000000000a1',
  (select id from mira_ids where name = 'guild'), 'ac000000-0000-4000-8000-000000000001'),
  'the channel unbinds once the operator stop is lifted');
select is(
  (select (o.cost_micro_usd_7d, o.replies_7d, o.channel_count)::text
    from private.mira_operator_overview(null, 10) o
    where o.ws_id = 'ac000000-0000-4000-8000-0000000000a1'),
  '(400,1,0)', 'usage survives unbinding and is counted once');
select isnt(private.mira_bind_channel('ac000000-0000-4000-8000-0000000000b1',
  'ac000000-0000-4000-8000-000000000001', 'discord', 'shared_bot', 'guild-1', 'Guild'),
  null, 'an unbound account can be bound by another tenant');
select is(
  jsonb_array_length(private.mira_get_tenant('ac000000-0000-4000-8000-0000000000a1') -> 'channels'),
  0, 'tenant A no longer lists the unbound channel');

reset role;

select throws_ok(
  $$ update private.mira_channels set ws_id = 'ac000000-0000-4000-8000-0000000000a1'
    where provider_account_id = 'guild-1' and unbound_at is null $$,
  '23514', null, 'a binding cannot move to another tenant');
select throws_ok(
  $$ delete from private.mira_audit_events $$,
  '55000', null, 'audit events are append-only');

select * from finish();
rollback;
