-- Run only in an admitted disposable database with the full migration chain.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'private.chat_reaction_operations'::regclass),
  'operation storage enables and forces RLS');
select is((select count(*)::integer from pg_policy
  where polrelid = 'private.chat_reaction_operations'::regclass), 0,
  'operation storage has no client RLS policies');
select ok(not exists (
  select 1 from aclexplode((select relacl from pg_class
    where oid = 'private.chat_reaction_operations'::regclass)) where grantee = 0
), 'PUBLIC has no operation storage grants');
select ok(not exists (
  select 1 from aclexplode((select proacl from pg_proc where oid =
    'private.chat_set_reaction(uuid,uuid,uuid,uuid,text,boolean,uuid)'::regprocedure))
  where grantee = 0
), 'PUBLIC cannot execute the desired-state RPC');
select ok(not has_table_privilege('anon', 'private.chat_reaction_operations',
  'SELECT,INSERT,UPDATE,DELETE'), 'anonymous operation storage access is revoked');
select ok(not has_table_privilege('authenticated', 'private.chat_reaction_operations',
  'SELECT,INSERT,UPDATE,DELETE'), 'authenticated operation storage access is revoked');
select ok(not has_function_privilege('anon',
  'private.chat_set_reaction(uuid,uuid,uuid,uuid,text,boolean,uuid)', 'EXECUTE'),
  'anonymous RPC execution is revoked');
select ok(not has_function_privilege('authenticated',
  'private.chat_set_reaction(uuid,uuid,uuid,uuid,text,boolean,uuid)', 'EXECUTE'),
  'authenticated RPC execution is revoked');
select ok(has_function_privilege('service_role',
  'private.chat_set_reaction(uuid,uuid,uuid,uuid,text,boolean,uuid)', 'EXECUTE'),
  'service role can execute the desired-state RPC');
select ok((select prosecdef and proconfig @> array[
  'search_path=private, public, pg_temp', 'lock_timeout=5s'
] from pg_proc where oid =
  'private.chat_set_reaction(uuid,uuid,uuid,uuid,text,boolean,uuid)'::regprocedure),
  'RPC pins its definer path and bounds lock waiting');

create function pg_temp.reaction_fixture_id(p_suffix integer)
returns uuid language sql immutable as $$
  select ('c9287000-0000-4000-8000-' || lpad(p_suffix::text, 12, '0'))::uuid
$$;

select set_config('request.jwt.claims', '{}', true);
insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data)
select pg_temp.reaction_fixture_id(n), 'reaction-operation-' || n || '@example.test',
  now(), '{}'::jsonb from generate_series(1, 4) n;
insert into public.users(id)
select pg_temp.reaction_fixture_id(n) from generate_series(1, 4) n
on conflict do nothing;
insert into public.workspaces(id, name, personal, creator_id) values
  (pg_temp.reaction_fixture_id(11), 'Reaction operation fixture', false,
    pg_temp.reaction_fixture_id(1)),
  (pg_temp.reaction_fixture_id(12), 'Other reaction workspace', false,
    pg_temp.reaction_fixture_id(1));
-- The creator membership is trigger-created; do not insert it again.
insert into public.workspace_members(ws_id, user_id, type) values
  (pg_temp.reaction_fixture_id(11), pg_temp.reaction_fixture_id(2), 'MEMBER'),
  (pg_temp.reaction_fixture_id(11), pg_temp.reaction_fixture_id(3), 'MEMBER');
insert into public.workspace_default_permissions(ws_id, permission, member_type, enabled) values
  (pg_temp.reaction_fixture_id(11), 'view_chat', 'MEMBER', true),
  (pg_temp.reaction_fixture_id(11), 'admin', 'MEMBER', false)
on conflict(ws_id, permission, member_type) do update set enabled = excluded.enabled;

insert into private.chat_conversations(id, ws_id, type, title, created_by)
select pg_temp.reaction_fixture_id(n), pg_temp.reaction_fixture_id(11), 'group',
  'Reaction fixture group', pg_temp.reaction_fixture_id(1)
from generate_series(21, 22) n;
insert into private.chat_conversation_members(conversation_id, user_id, role) values
  (pg_temp.reaction_fixture_id(21), pg_temp.reaction_fixture_id(1), 'owner'),
  (pg_temp.reaction_fixture_id(21), pg_temp.reaction_fixture_id(2), 'member'),
  (pg_temp.reaction_fixture_id(22), pg_temp.reaction_fixture_id(1), 'owner');
insert into private.chat_messages(id, conversation_id, sender_id, content, deleted_at)
select pg_temp.reaction_fixture_id(n),
  pg_temp.reaction_fixture_id(case when n = 32 then 22 else 21 end),
  pg_temp.reaction_fixture_id(1), 'Reaction fixture message',
  case when n = 33 then now() else null end
from generate_series(31, 34) n;

select is((select count(*)::integer from public.workspace_members
  where ws_id = pg_temp.reaction_fixture_id(11)), 3,
  'fixture uses creator membership and two explicit target-workspace members');
select ok(not exists(select 1 from public.workspace_members
  where ws_id = pg_temp.reaction_fixture_id(11)
    and user_id = pg_temp.reaction_fixture_id(4)), 'outsider has no target membership');
select ok(public.has_workspace_permission(pg_temp.reaction_fixture_id(11),
  pg_temp.reaction_fixture_id(2), 'view_chat'), 'participant has explicit view permission');

create function pg_temp.set_reaction(
  p_actor integer, p_op integer, p_present boolean,
  p_emoji text default 'heart', p_message integer default 31,
  p_conversation integer default 21
) returns jsonb language sql as $$
  select private.chat_set_reaction(
    pg_temp.reaction_fixture_id(11), pg_temp.reaction_fixture_id(p_conversation),
    pg_temp.reaction_fixture_id(p_message), pg_temp.reaction_fixture_id(p_actor),
    p_emoji, p_present, pg_temp.reaction_fixture_id(p_op)
  )
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c9287000-0000-4000-8000-000000000001"}', true);
select throws_ok($$select private.chat_set_reaction(
  'c9287000-0000-4000-8000-000000000011', 'c9287000-0000-4000-8000-000000000021',
  'c9287000-0000-4000-8000-000000000031', 'c9287000-0000-4000-8000-000000000001',
  'heart', true, 'c9287000-0000-4000-8000-000000000100')$$,
  '42501', null, 'authenticated member cannot execute the RPC directly');
select throws_ok($$select * from private.chat_reaction_operations$$,
  '42501', null, 'authenticated member cannot read receipts');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select private.chat_set_reaction(
  'c9287000-0000-4000-8000-000000000011', 'c9287000-0000-4000-8000-000000000021',
  'c9287000-0000-4000-8000-000000000031', 'c9287000-0000-4000-8000-000000000001',
  'heart', true, 'c9287000-0000-4000-8000-000000000100')$$,
  '42501', null, 'anonymous caller cannot execute the RPC directly');
select throws_ok($$select * from private.chat_reaction_operations$$,
  '42501', null, 'anonymous caller cannot read receipts');
reset role;
select throws_ok($$select pg_temp.set_reaction(1, 100, true)$$,
  '42501', 'chat_service_role_required', 'definer also rejects non-service JWT context');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$select private.chat_set_reaction(
  'c9287000-0000-4000-8000-000000000011', 'c9287000-0000-4000-8000-000000000021',
  'c9287000-0000-4000-8000-000000000031', 'c9287000-0000-4000-8000-000000000001',
  'heart', false, 'c9287000-0000-4000-8000-000000000100')$$,
  'actual service role can execute with an explicitly admitted actor');
reset role;

create temporary table reaction_results(kind text primary key, result jsonb);
insert into reaction_results values ('add', pg_temp.set_reaction(1, 101, true));
select is((select result->'operation' from reaction_results where kind = 'add'),
  jsonb_build_object('id', pg_temp.reaction_fixture_id(101), 'emoji', 'heart', 'present', true),
  'add returns the persisted intent receipt');
select is((select result->'message'->>'id' from reaction_results where kind = 'add'),
  pg_temp.reaction_fixture_id(31)::text, 'response uses the existing message serializer');
select is((select result->'message'->'reactions'->0->>'count'
  from reaction_results where kind = 'add'), '1', 'response sees the committed reaction');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(31)), 1, 'add writes exactly one reaction');
select lives_ok($$select pg_temp.set_reaction(1, 101, true)$$, 'same operation retry succeeds');
select is((select count(*)::integer from private.chat_reaction_operations
  where actor_user_id = pg_temp.reaction_fixture_id(1)
    and op_id = pg_temp.reaction_fixture_id(101)), 1, 'same operation creates one receipt');

select lives_ok($$select pg_temp.set_reaction(1, 102, false)$$, 'later operation removes own reaction');
insert into reaction_results values ('retry-add', pg_temp.set_reaction(1, 101, true));
select is((select result->'operation' from reaction_results where kind = 'retry-add'),
  (select result->'operation' from reaction_results where kind = 'add'),
  'old add retry acknowledges its original intent');
select is((select result->'message'->'reactions' from reaction_results where kind = 'retry-add'),
  '[]'::jsonb, 'old add retry returns current state without restoring the reaction');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(31)), 0, 'old add never reapplies after removal');

select lives_ok($$select pg_temp.set_reaction(1, 103, true)$$, 'later add restores own reaction');
select lives_ok($$select pg_temp.set_reaction(1, 102, false)$$, 'old remove retry succeeds');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(31)), 1, 'old remove never deletes a later add');
select lives_ok($$select pg_temp.set_reaction(1, 104, true)$$, 'new desired add is already present');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(31)), 1, 'desired add is not a toggle');

select lives_ok($$select pg_temp.set_reaction(2, 101, true)$$, 'another actor can reuse the op UUID');
select is((select count(*)::integer from private.chat_reaction_operations
  where op_id = pg_temp.reaction_fixture_id(101)), 2, 'receipts are keyed by actor and operation');
select lives_ok($$select pg_temp.set_reaction(1, 105, false)$$, 'actor can remove only their reaction');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(31)
    and user_id = pg_temp.reaction_fixture_id(1)), 0, 'own reaction is removed');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(31)
    and user_id = pg_temp.reaction_fixture_id(2)), 1, 'other actor reaction survives');
select lives_ok($$select pg_temp.set_reaction(1, 106, false)$$, 'new remove is already absent');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(31)), 1, 'desired remove is not a toggle');

create temporary table reaction_before_denials as
select (select count(*) from private.chat_reaction_operations) as receipts,
  (select count(*) from private.chat_message_reactions) as reactions;
select throws_ok($$select pg_temp.set_reaction(1, 101, false)$$,
  '22023', 'chat_reaction_operation_mismatch', 'op UUID cannot change desired presence');
select throws_ok($$select pg_temp.set_reaction(1, 101, true, 'other')$$,
  '22023', 'chat_reaction_operation_mismatch', 'op UUID cannot change emoji');
select throws_ok($$select pg_temp.set_reaction(1, 101, true, 'heart', 34)$$,
  '22023', 'chat_reaction_operation_mismatch', 'op UUID cannot change message');
select throws_ok($$select pg_temp.set_reaction(1, 101, true, 'heart', 32, 22)$$,
  '22023', 'chat_reaction_operation_mismatch', 'op UUID cannot change conversation');
select throws_ok($$select pg_temp.set_reaction(1, 201, true, 'heart', 32)$$,
  '22023', 'chat_message_not_found', 'message in another conversation is rejected');
select throws_ok($$select pg_temp.set_reaction(1, 202, true, 'heart', 33)$$,
  '22023', 'chat_message_not_found', 'deleted message is rejected');
select throws_ok($$select pg_temp.set_reaction(1, 203, true, 'heart', 99)$$,
  '22023', 'chat_message_not_found', 'unknown message is rejected');
select throws_ok($$select pg_temp.set_reaction(1, 204, true, 'heart', 31, 99)$$,
  '22023', 'chat_conversation_not_found', 'unknown conversation is rejected');
select throws_ok($$select pg_temp.set_reaction(3, 205, true)$$,
  '42501', 'chat_conversation_forbidden', 'workspace member outside private group is rejected');
select throws_ok($$select pg_temp.set_reaction(4, 206, true)$$,
  '42501', 'chat_workspace_membership_required', 'outsider is rejected before message lookup');
select throws_ok($$select pg_temp.set_reaction(null, 207, true)$$,
  '42501', 'chat_invalid_actor_context', 'missing actor is rejected');
select throws_ok($$select pg_temp.set_reaction(1, null, true)$$,
  '22023', 'chat_invalid_reaction_operation', 'missing operation UUID is rejected');
select throws_ok($$select pg_temp.set_reaction(1, 208, null)$$,
  '22023', 'chat_invalid_reaction_operation', 'null desired presence is rejected');
select throws_ok($$select pg_temp.set_reaction(1, 209, true, ' ')$$,
  '22023', 'chat_invalid_reaction_operation', 'blank emoji is rejected');
select throws_ok($$select pg_temp.set_reaction(1, 210, true, repeat('x', 65))$$,
  '22023', 'chat_invalid_reaction_operation', 'oversized emoji is rejected');
select is((select count(*) from private.chat_reaction_operations),
  (select receipts from reaction_before_denials), 'rejections create no receipt');
select is((select count(*) from private.chat_message_reactions),
  (select reactions from reaction_before_denials), 'rejections change no reaction');

update public.workspace_default_permissions set enabled = false
where ws_id = pg_temp.reaction_fixture_id(11)
  and permission = 'view_chat' and member_type = 'MEMBER';
select throws_ok($$select pg_temp.set_reaction(2, 211, true)$$,
  '42501', 'chat_permission_required:view_chat', 'participant without view permission is rejected');
update public.workspace_default_permissions set enabled = true
where ws_id = pg_temp.reaction_fixture_id(11)
  and permission = 'view_chat' and member_type = 'MEMBER';

update private.chat_messages set deleted_at = now() where id = pg_temp.reaction_fixture_id(31);
select throws_ok($$select pg_temp.set_reaction(2, 101, true)$$,
  '22023', 'chat_message_not_found', 'even duplicate operations recheck message deletion');
update private.chat_messages set deleted_at = null where id = pg_temp.reaction_fixture_id(31);

create function pg_temp.reject_reaction_fixture() returns trigger language plpgsql as $$
begin
  if new.message_id = pg_temp.reaction_fixture_id(31) and new.emoji = 'reject' then
    raise exception 'synthetic_reaction_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger reaction_fixture_failure before insert on private.chat_message_reactions
for each row execute function pg_temp.reject_reaction_fixture();
select throws_ok($$select pg_temp.set_reaction(1, 301, true, 'reject')$$,
  'P0001', 'synthetic_reaction_failure', 'reaction failure rolls back its receipt');
select ok(not exists(select 1 from private.chat_reaction_operations
  where actor_user_id = pg_temp.reaction_fixture_id(1)
    and op_id = pg_temp.reaction_fixture_id(301)), 'failed mutation leaves no receipt');
drop trigger reaction_fixture_failure on private.chat_message_reactions;
select lives_ok($$select pg_temp.set_reaction(1, 301, true, 'reject')$$,
  'rolled-back operation can safely succeed after the failure is removed');
select is((select count(*)::integer from private.chat_reaction_operations
  where actor_user_id = pg_temp.reaction_fixture_id(1)
    and op_id = pg_temp.reaction_fixture_id(301)), 1, 'successful retry persists exactly one receipt');

select ok(not has_function_privilege('anon',
  'private.chat_get_reaction_message(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'anonymous exact-message RPC execution is revoked');
select ok(not has_function_privilege('authenticated',
  'private.chat_get_reaction_message(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'authenticated exact-message RPC execution is revoked');
select ok(has_function_privilege('service_role',
  'private.chat_get_reaction_message(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'service role can execute the exact-message RPC');
select ok(not exists (
  select 1 from aclexplode((select proacl from pg_proc where oid =
    'private.chat_get_reaction_message(uuid,uuid,uuid,uuid)'::regprocedure)) where grantee = 0
), 'PUBLIC cannot execute the exact-message RPC');
select ok((select prosecdef and proconfig @> array['search_path=private, public, pg_temp']
  from pg_proc where oid = 'private.chat_get_reaction_message(uuid,uuid,uuid,uuid)'::regprocedure),
  'exact-message RPC pins its definer path');

create function pg_temp.get_reaction_message(
  p_actor integer, p_message integer default 31,
  p_conversation integer default 21, p_ws integer default 11
) returns jsonb language sql as $$
  select private.chat_get_reaction_message(
    pg_temp.reaction_fixture_id(p_ws), pg_temp.reaction_fixture_id(p_conversation),
    pg_temp.reaction_fixture_id(p_message), pg_temp.reaction_fixture_id(p_actor)
  )
$$;

update private.chat_messages set created_at = now() - interval '1 day'
where id = pg_temp.reaction_fixture_id(31);
insert into private.chat_messages(id, conversation_id, sender_id, content)
select pg_temp.reaction_fixture_id(n), pg_temp.reaction_fixture_id(21),
  pg_temp.reaction_fixture_id(1), 'Newer reaction fixture message'
from generate_series(1001, 1101) n;
select ok((select count(*) > 100 from private.chat_messages
  where conversation_id = pg_temp.reaction_fixture_id(21)
    and created_at > now() - interval '1 day'), 'target has more than 100 newer messages');
select is(pg_temp.get_reaction_message(1),
  (select private.chat_message_json(m) from private.chat_messages m
    where m.id = pg_temp.reaction_fixture_id(31)),
  'exact target returns full existing serialization beyond the latest page');
select is((select r->>'count' from jsonb_array_elements(
  pg_temp.get_reaction_message(1)->'reactions') r where r->>'emoji' = 'heart'),
  '1', 'exact read includes other actors in the full reaction summary');
select is((select r->'userIds' from jsonb_array_elements(
  pg_temp.get_reaction_message(1)->'reactions') r where r->>'emoji' = 'heart'),
  jsonb_build_array(pg_temp.reaction_fixture_id(2)), 'exact summary retains the reacting actor IDs');
select is(pg_temp.get_reaction_message(1, 99), null::jsonb, 'absent target returns no message');
select is(pg_temp.get_reaction_message(1, 33), null::jsonb, 'deleted target returns no message');
select is(pg_temp.get_reaction_message(1, 32), null::jsonb, 'cross-conversation target returns no message');
select is(pg_temp.get_reaction_message(1, 31, 99), null::jsonb, 'absent conversation returns no message');
select ok(exists(select 1 from public.workspace_members
  where ws_id = pg_temp.reaction_fixture_id(12)
    and user_id = pg_temp.reaction_fixture_id(1)), 'actor belongs to the other shared workspace');
select is(pg_temp.get_reaction_message(1, 31, 21, 12), null::jsonb,
  'membership in another shared workspace cannot address this conversation');
select throws_ok($$select pg_temp.get_reaction_message(3)$$,
  '42501', 'chat_conversation_forbidden', 'exact read rejects a workspace member outside the group');
select throws_ok($$select pg_temp.get_reaction_message(4)$$,
  '42501', 'chat_workspace_membership_required', 'exact read rejects a workspace outsider');
select throws_ok($$select pg_temp.get_reaction_message(null)$$,
  '42501', 'chat_invalid_actor_context', 'exact read rejects a missing actor');
select throws_ok($$select pg_temp.get_reaction_message(1, 31, 21, 99)$$,
  '42501', 'chat_workspace_membership_required', 'exact read validates the requested workspace');
update public.workspace_default_permissions set enabled = false
where ws_id = pg_temp.reaction_fixture_id(11)
  and permission = 'view_chat' and member_type = 'MEMBER';
select throws_ok($$select pg_temp.get_reaction_message(2)$$,
  '42501', 'chat_permission_required:view_chat', 'exact read rechecks participant permission');
update public.workspace_default_permissions set enabled = true
where ws_id = pg_temp.reaction_fixture_id(11)
  and permission = 'view_chat' and member_type = 'MEMBER';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c9287000-0000-4000-8000-000000000001"}', true);
select throws_ok($$select private.chat_get_reaction_message(
  'c9287000-0000-4000-8000-000000000011', 'c9287000-0000-4000-8000-000000000021',
  'c9287000-0000-4000-8000-000000000031', 'c9287000-0000-4000-8000-000000000001')$$,
  '42501', null, 'authenticated actor cannot execute exact-message RPC directly');
reset role;
select throws_ok($$select pg_temp.get_reaction_message(1)$$,
  '42501', 'chat_service_role_required', 'exact-message definer rejects a non-service JWT context');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select private.chat_get_reaction_message(
  'c9287000-0000-4000-8000-000000000011', 'c9287000-0000-4000-8000-000000000021',
  'c9287000-0000-4000-8000-000000000031', 'c9287000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anonymous caller cannot execute exact-message RPC directly');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(private.chat_get_reaction_message(
  'c9287000-0000-4000-8000-000000000011', 'c9287000-0000-4000-8000-000000000021',
  'c9287000-0000-4000-8000-000000000031', 'c9287000-0000-4000-8000-000000000001')->>'id',
  'c9287000-0000-4000-8000-000000000031', 'actual service role can read the admitted exact target');
reset role;

select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'private.chat_retired_reaction_operations'::regclass),
  'retirement storage enables and forces RLS');
select is((select count(*)::integer from pg_policy
  where polrelid = 'private.chat_retired_reaction_operations'::regclass), 0,
  'retirement storage has no client policies');
select is((select array_agg(attname::text order by attnum) from pg_attribute
  where attrelid = 'private.chat_retired_reaction_operations'::regclass
    and attnum > 0 and not attisdropped), array['actor_user_id', 'op_id'],
  'retirement storage retains only actor and operation identity');
select ok(not exists (
  select 1 from aclexplode((select relacl from pg_class
    where oid = 'private.chat_retired_reaction_operations'::regclass)) where grantee = 0
), 'PUBLIC has no retirement storage grants');
select ok(not has_table_privilege('anon', 'private.chat_retired_reaction_operations',
  'SELECT,INSERT,UPDATE,DELETE'), 'anonymous retirement storage access is revoked');
select ok(not has_table_privilege('authenticated', 'private.chat_retired_reaction_operations',
  'SELECT,INSERT,UPDATE,DELETE'), 'authenticated retirement storage access is revoked');
select ok(not has_function_privilege('anon',
  'private.chat_retire_reaction_operations(uuid,uuid[])', 'EXECUTE'),
  'anonymous retirement RPC execution is revoked');
select ok(not has_function_privilege('authenticated',
  'private.chat_retire_reaction_operations(uuid,uuid[])', 'EXECUTE'),
  'authenticated retirement RPC execution is revoked');
select ok(has_function_privilege('service_role',
  'private.chat_retire_reaction_operations(uuid,uuid[])', 'EXECUTE'),
  'service role can execute retirement');
select ok(not exists (
  select 1 from aclexplode((select proacl from pg_proc where oid =
    'private.chat_retire_reaction_operations(uuid,uuid[])'::regprocedure)) where grantee = 0
), 'PUBLIC cannot execute retirement');
select ok((select prosecdef and proconfig @> array[
  'search_path=private, public, pg_temp', 'lock_timeout=5s'
] from pg_proc where oid = 'private.chat_retire_reaction_operations(uuid,uuid[])'::regprocedure),
  'retirement definer pins its path and bounds lock waiting');

create function pg_temp.retire_reactions(p_actor integer, p_ops integer[])
returns jsonb language sql as $$
  select private.chat_retire_reaction_operations(pg_temp.reaction_fixture_id(p_actor),
    array(select pg_temp.reaction_fixture_id(n) from unnest(p_ops) as ids(n)))
$$;
create function pg_temp.reaction_operation_lock_held(p_actor integer, p_op integer)
returns boolean language sql as $$
  select exists (
    select 1 from pg_locks l
    cross join lateral (select hashtextextended('chat-reaction-operation:' ||
      pg_temp.reaction_fixture_id(p_actor)::text || ':' ||
      pg_temp.reaction_fixture_id(p_op)::text, 0) as key) expected
    where l.pid = pg_backend_pid() and l.locktype = 'advisory'
      and l.mode = 'ExclusiveLock' and l.granted and l.objsubid = 1
      and l.classid::bigint = ((expected.key >> 32) & 4294967295::bigint)
      and l.objid::bigint = (expected.key & 4294967295::bigint)
  )
$$;

insert into reaction_results values ('retired-first', pg_temp.retire_reactions(1, array[401]));
select is((select result from reaction_results where kind = 'retired-first'),
  jsonb_build_object('retiredOpIds', jsonb_build_array(pg_temp.reaction_fixture_id(401))),
  'retirement acknowledges the persisted exact operation ID');
select ok(pg_temp.reaction_operation_lock_held(1, 401),
  'retirement holds the deterministic actor-operation transaction lock');
select ok(not exists(select 1 from private.chat_reaction_operations
  where actor_user_id = pg_temp.reaction_fixture_id(1) and op_id = pg_temp.reaction_fixture_id(401)),
  'retirement needs no message or prior operation receipt');
select lives_ok($$select pg_temp.set_reaction(1, 402, true, 'retired', 34)$$,
  'successor add can run after retirement acknowledgment');
select ok(pg_temp.reaction_operation_lock_held(1, 402),
  'desired-state mutation holds the same deterministic lock namespace');
select lives_ok($$select pg_temp.set_reaction(1, 403, false, 'retired', 34)$$,
  'successor remove can run after the add');
insert into reaction_results values ('delayed-retired',
  pg_temp.set_reaction(1, 401, true, 'retired', 34));
select is((select result->'operation' from reaction_results where kind = 'delayed-retired'),
  jsonb_build_object('id', pg_temp.reaction_fixture_id(401), 'emoji', 'retired', 'present', true),
  'delayed retired intent can bind and acknowledge its original operation');
select is((select result->'message'->'reactions' from reaction_results where kind = 'delayed-retired'),
  '[]'::jsonb, 'retired delayed add returns current state after successor add and remove');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(34)), 0,
  'retired delayed original cannot restore the removed reaction');
select lives_ok($$select pg_temp.set_reaction(1, 401, true, 'retired', 34)$$,
  'same retired operation replay is idempotent');
select is((select count(*)::integer from private.chat_reaction_operations
  where actor_user_id = pg_temp.reaction_fixture_id(1) and op_id = pg_temp.reaction_fixture_id(401)),
  1, 'retired replay binds only one receipt');
select throws_ok($$select pg_temp.set_reaction(1, 401, false, 'retired', 34)$$,
  '22023', 'chat_reaction_operation_mismatch', 'retired receipt still rejects changed presence');
select throws_ok($$select pg_temp.set_reaction(1, 401, true, 'changed', 34)$$,
  '22023', 'chat_reaction_operation_mismatch', 'retired receipt still rejects changed emoji');
select is(pg_temp.retire_reactions(1, array[401, 401]),
  (select result from reaction_results where kind = 'retired-first'),
  'repeated retirement and duplicate IDs preserve the same acknowledgment');
select is((select count(*)::integer from private.chat_retired_reaction_operations
  where actor_user_id = pg_temp.reaction_fixture_id(1) and op_id = pg_temp.reaction_fixture_id(401)),
  1, 'retirement replay persists one fence');

select lives_ok($$select pg_temp.set_reaction(2, 401, true, 'retired', 34)$$,
  'another actor using the same operation UUID remains independent');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(34)
    and user_id = pg_temp.reaction_fixture_id(2)), 1,
  'one actor retirement never suppresses another actor mutation');
select lives_ok($$select pg_temp.retire_reactions(2, array[401])$$,
  'operation that already committed can be retired afterward');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(34)
    and user_id = pg_temp.reaction_fixture_id(2)), 1,
  'retirement does not compensate or delete an already committed reaction');
select lives_ok($$select pg_temp.set_reaction(2, 404, false, 'retired', 34)$$,
  'successor can remove a mutation committed before retirement');
select lives_ok($$select pg_temp.set_reaction(2, 401, true, 'retired', 34)$$,
  'replay of an operation committed before retirement remains idempotent');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(34)), 0,
  'already-committed retired replay does not restore a successor removal');

select lives_ok($$select pg_temp.retire_reactions(1, array[405])$$,
  'an unknown removal can also be retired');
select lives_ok($$select pg_temp.set_reaction(1, 406, true, 'retired', 34)$$,
  'new add follows retirement of an unknown removal');
select lives_ok($$select pg_temp.set_reaction(1, 405, false, 'retired', 34)$$,
  'delayed retired removal can acknowledge without applying');
select is((select count(*)::integer from private.chat_message_reactions
  where message_id = pg_temp.reaction_fixture_id(34)
    and user_id = pg_temp.reaction_fixture_id(1)), 1,
  'retired delayed removal preserves the successor addition');

create temporary table retirement_before_denials as
select count(*) as n from private.chat_retired_reaction_operations;
select throws_ok($$select private.chat_retire_reaction_operations(
  pg_temp.reaction_fixture_id(1), null)$$,
  '22023', 'chat_invalid_reaction_retirement', 'null retirement array is rejected');
select throws_ok($$select private.chat_retire_reaction_operations(
  pg_temp.reaction_fixture_id(1), array[]::uuid[])$$,
  '22023', 'chat_invalid_reaction_retirement', 'empty retirement array is rejected');
select throws_ok($$select private.chat_retire_reaction_operations(
  pg_temp.reaction_fixture_id(1), array[null]::uuid[])$$,
  '22023', 'chat_invalid_reaction_retirement', 'null retirement element is rejected');
select throws_ok($$select private.chat_retire_reaction_operations(
  pg_temp.reaction_fixture_id(1), array_fill(pg_temp.reaction_fixture_id(499), array[101]))$$,
  '22023', 'chat_invalid_reaction_retirement', 'raw array size above 100 is rejected');
select throws_ok($$select private.chat_retire_reaction_operations(
  pg_temp.reaction_fixture_id(1), array[[pg_temp.reaction_fixture_id(498)],
    [pg_temp.reaction_fixture_id(499)]])$$,
  '22023', 'chat_invalid_reaction_retirement', 'multidimensional retirement input is rejected');
select throws_ok($$select pg_temp.retire_reactions(null, array[499])$$,
  '42501', 'chat_invalid_actor_context', 'retirement rejects a missing actor');
select throws_ok($$select pg_temp.retire_reactions(999, array[499])$$,
  '42501', 'chat_invalid_actor_context', 'retirement rejects an unknown actor');
select is((select count(*) from private.chat_retired_reaction_operations),
  (select n from retirement_before_denials), 'invalid batches create no retirement fences');

create function pg_temp.reject_retirement_fixture() returns trigger language plpgsql as $$
begin
  if new.op_id = pg_temp.reaction_fixture_id(490) then
    raise exception 'synthetic_retirement_failure' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger retirement_fixture_failure before insert on private.chat_retired_reaction_operations
for each row execute function pg_temp.reject_retirement_fixture();
select throws_ok($$select pg_temp.retire_reactions(1, array[489, 490])$$,
  'P0001', 'synthetic_retirement_failure', 'late batch failure rolls back all retirement fences');
select ok(not exists(select 1 from private.chat_retired_reaction_operations
  where actor_user_id = pg_temp.reaction_fixture_id(1)
    and op_id in (pg_temp.reaction_fixture_id(489), pg_temp.reaction_fixture_id(490))),
  'failed batch leaves no partial acknowledged retirement');
drop trigger retirement_fixture_failure on private.chat_retired_reaction_operations;
select is(jsonb_array_length(private.chat_retire_reaction_operations(
  pg_temp.reaction_fixture_id(1), array(select pg_temp.reaction_fixture_id(n)
    from generate_series(500, 599) n)) -> 'retiredOpIds'), 100,
  'maximum retirement batch acknowledges 100 exact IDs');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"c9287000-0000-4000-8000-000000000001"}', true);
select throws_ok($$select private.chat_retire_reaction_operations(
  'c9287000-0000-4000-8000-000000000001',
  array['c9287000-0000-4000-8000-000000000499']::uuid[])$$,
  '42501', null, 'authenticated actor cannot execute retirement directly');
select throws_ok($$select * from private.chat_retired_reaction_operations$$,
  '42501', null, 'authenticated actor cannot read retirement storage');
reset role;
select throws_ok($$select pg_temp.retire_reactions(1, array[499])$$,
  '42501', 'chat_service_role_required', 'retirement definer rejects non-service JWT context');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select private.chat_retire_reaction_operations(
  'c9287000-0000-4000-8000-000000000001',
  array['c9287000-0000-4000-8000-000000000499']::uuid[])$$,
  '42501', null, 'anonymous caller cannot execute retirement');
select throws_ok($$select * from private.chat_retired_reaction_operations$$,
  '42501', null, 'anonymous caller cannot read retirement storage');
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(private.chat_retire_reaction_operations(
  'c9287000-0000-4000-8000-000000000001',
  array['c9287000-0000-4000-8000-000000000499']::uuid[]),
  '{"retiredOpIds":["c9287000-0000-4000-8000-000000000499"]}'::jsonb,
  'actual service role can persist and acknowledge a retirement fence');
reset role;

select * from finish();
rollback;
