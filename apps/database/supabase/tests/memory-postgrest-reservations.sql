begin;
create extension if not exists pgtap with schema extensions;
set local search_path = pg_catalog, extensions;
select plan(18);

insert into auth.users (id, email, role, aud) values
  ('a8fa101e-80b4-4b21-8020-a921e8dc0011', 'memory-rpc-pgtap@fixture.invalid', 'memory_rpc', 'authenticated');
insert into memory_storage.principals (subject, caller) values
  ('a8fa101e-80b4-4b21-8020-a921e8dc0011', 'assistant');
grant memory_rpc to postgres with inherit false, set true;
select set_config('request.jwt.claims', jsonb_build_object(
  'role', 'memory_rpc', 'sub', 'a8fa101e-80b4-4b21-8020-a921e8dc0011',
  'memory_caller', 'assistant', 'exp', floor(extract(epoch from clock_timestamp()))::bigint + 55
)::text, true);
update memory_storage.admission set stopped = false, remaining = 20 where caller = 'assistant';

create function pg_temp.memory_rpc_request(
  op text, tags text[], data jsonb default null, reserved uuid default null,
  reserve_id uuid default gen_random_uuid()
) returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  set local role memory_rpc;
  if data is null then
    result := jsonb_build_object('ticket', memory_api.reserve(reserve_id, op, tags));
  else
    result := memory_api.execute(reserved, op, tags, data);
  end if;
  reset role;
  return result;
exception when others then
  return jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm);
end
$$;

select array['tuturuuu.user.fixture.workspace.fixture'] as tags \gset
select is(pg_temp.memory_rpc_request('add', :'tags'::text[]) ->> 'message',
  'memory gateway connection required', 'a SQL SET ROLE session cannot impersonate the gateway');

-- The real PostgREST suite exercises caller identity on its authenticated
-- connection. This transaction supplies identity for the reservation tests.
create or replace function memory_storage.caller() returns text
language sql stable set search_path = pg_catalog, pg_temp as $$ select 'assistant'::text $$;

select gen_random_uuid() as first_request \gset
select (pg_temp.memory_rpc_request('add', :'tags'::text[], reserve_id => :'first_request') ->> 'ticket') as first \gset
select ok(:'first'::uuid is not null, 'issues one scoped reservation');
select is(pg_temp.memory_rpc_request('add', :'tags'::text[], reserve_id => :'first_request') ->> 'ticket',
  :'first', 'an exact pending retry returns the same ticket');
select is(pg_temp.memory_rpc_request('add', :'tags'::text[]) ->> 'sqlstate',
  '55P03', 'a pending ticket blocks overlapping work');
select is(pg_temp.memory_rpc_request('read', :'tags'::text[], '{}', :'first') ->> 'sqlstate',
  '42501', 'the operation cannot change after reserving');
select is(pg_temp.memory_rpc_request('add', array['tuturuuu.user.other.workspace.fixture'],
  '{}', :'first') ->> 'sqlstate', '42501', 'the selected tag cannot change');
select is(pg_temp.memory_rpc_request('add', :'tags'::text[],
  '{"customId":"fixture-invalid","content":"valid text","metadata":{},"embedding":[]}', :'first') ->> 'sqlstate',
  '22023', 'invalid embedding rolls the data operation back');
select is(pg_temp.memory_rpc_request('add', :'tags'::text[], '{}', :'first') ->> 'sqlstate',
  '42501', 'the rolled-back data transaction does not restore the consumed ticket');
select is((select remaining from memory_storage.admission where caller = 'assistant'),
  19, 'one committed reservation pays for one attempt');

select (pg_temp.memory_rpc_request('read', :'tags'::text[]) ->> 'ticket') as expired \gset
select is(pg_temp.memory_rpc_request('add', :'tags'::text[], reserve_id => :'first_request') ->> 'sqlstate',
  '42501', 'interleaving does not let an old request acquire a new ticket');
select is((select remaining from memory_storage.admission where caller = 'assistant'),
  18, 'the interleaved retry does not take another unit of budget');
update memory_storage.admission set expires_at = clock_timestamp() - interval '1 second' where caller = 'assistant';
select is(pg_temp.memory_rpc_request('read', :'tags'::text[], '{}', :'expired') ->> 'sqlstate',
  '42501', 'closed on expired ticket');

select (pg_temp.memory_rpc_request('read', :'tags'::text[]) ->> 'ticket') as old_instance \gset
update memory_storage.admission set instance_started_at = pg_postmaster_start_time() - interval '1 second'
  where caller = 'assistant';
select is(pg_temp.memory_rpc_request('read', :'tags'::text[], '{}', :'old_instance') ->> 'sqlstate',
  '42501', 'ticket from a different server start is closed');

select (pg_temp.memory_rpc_request('read', :'tags'::text[]) ->> 'ticket') as old_epoch \gset
update memory_storage.admission set stopped = true where caller = 'assistant';
update memory_storage.admission set stopped = false where caller = 'assistant';
select is(pg_temp.memory_rpc_request('read', :'tags'::text[], '{}', :'old_epoch') ->> 'sqlstate',
  '42501', 'stop and reopen do not reactivate a reserved ticket');

select is(pg_temp.memory_rpc_request('list',
  array['tuturuuu.people.a8fa101e-80b4-4b21-8020-a921e8dc0011.person.a8fa101e-80b4-4b21-8020-a921e8dc0011'])
  ->> 'sqlstate', '42501', 'assistant is denied People tags');

select jsonb_build_object('customIds', jsonb_build_array('fixture-tombstone'),
  'expectedRevision', '0', 'requestId', 'e54adf89-a2df-40ec-ba6e-970b1c200bed') as purge_body \gset
select (pg_temp.memory_rpc_request('purge', :'tags'::text[]) ->> 'ticket') as purge_one \gset
select pg_temp.memory_rpc_request('purge', :'tags'::text[], :'purge_body', :'purge_one') as purge_result \gset
select is(:'purge_result'::jsonb #>> '{body,revision}', '1', 'purge commits its own revision and receipt');
select (pg_temp.memory_rpc_request('purge', :'tags'::text[]) ->> 'ticket') as purge_two \gset
select is(pg_temp.memory_rpc_request('purge', :'tags'::text[], :'purge_body', :'purge_two'),
  :'purge_result'::jsonb, 'exact purge request replay returns the durable receipt');
select (pg_temp.memory_rpc_request('purge', :'tags'::text[]) ->> 'ticket') as purge_three \gset
select is(pg_temp.memory_rpc_request('purge', :'tags'::text[],
  jsonb_set(:'purge_body'::jsonb, '{customIds}', '["different"]'), :'purge_three') #>> '{body,error}',
  'request_id_conflict', 'one purge receipt cannot authorize different work');

select * from finish();
rollback;
