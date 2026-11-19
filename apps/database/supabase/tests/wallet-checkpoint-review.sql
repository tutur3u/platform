begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

insert into public.users (id) values
 ('78600000-0000-4000-8000-000000000001'),
 ('78600000-0000-4000-8000-000000000002'),
 ('78600000-0000-4000-8000-000000000003');
insert into public.workspaces (id, name, personal, creator_id) values
 ('78600000-0000-4000-8000-000000000010', 'Review scope A', false, '78600000-0000-4000-8000-000000000001'),
 ('78600000-0000-4000-8000-000000000020', 'Review scope B', false, '78600000-0000-4000-8000-000000000003');
insert into public.workspace_members (ws_id, user_id, type) values
 ('78600000-0000-4000-8000-000000000010', '78600000-0000-4000-8000-000000000002', 'MEMBER')
 on conflict (ws_id, user_id) do nothing;
delete from public.workspace_default_permissions where ws_id = '78600000-0000-4000-8000-000000000010';

select ok((select relrowsecurity from pg_class where oid = 'private.workspace_wallet_checkpoints'::regclass),
 'review data inherits the private checkpoint RLS');
select ok(not has_table_privilege('authenticated','private.workspace_wallet_checkpoints','SELECT,UPDATE'),
 'signed-in clients cannot directly read or set review state');
select ok(not has_function_privilege('anon','private.set_wallet_checkpoint_review(uuid,uuid,uuid,uuid,timestamptz,boolean)','execute')
 and not has_function_privilege('authenticated','private.set_wallet_checkpoint_review(uuid,uuid,uuid,uuid,timestamptz,boolean)','execute'),
 'review mutation accepts only the server-verified actor');

set local role service_role;
insert into private.workspace_wallets (id, ws_id, name, type, currency) values
 ('78600000-0000-4000-8000-000000000011', '78600000-0000-4000-8000-000000000010', 'A', 'STANDARD', 'USD'),
 ('78600000-0000-4000-8000-000000000021', '78600000-0000-4000-8000-000000000020', 'B', 'STANDARD', 'USD');
insert into private.workspace_wallet_checkpoints
 (id, wallet_id, actual_balance, ledger_balance, currency, updated_at) values
 ('78600000-0000-4000-8000-000000000012', '78600000-0000-4000-8000-000000000011', 25, 20, 'USD', '2026-11-01T12:00:00.123456Z'),
 ('78600000-0000-4000-8000-000000000022', '78600000-0000-4000-8000-000000000021', 900, 700, 'USD', '2026-11-01T12:00:00.123456Z');

select is(private.set_wallet_checkpoint_review(
 '78600000-0000-4000-8000-000000000010', '78600000-0000-4000-8000-000000000011',
 '78600000-0000-4000-8000-000000000012', '78600000-0000-4000-8000-000000000002',
 '2026-11-01T12:00:00.123456Z', true), null::jsonb, 'ordinary membership does not authorize a review');
select is(private.set_wallet_checkpoint_review(
 '78600000-0000-4000-8000-000000000010', '78600000-0000-4000-8000-000000000011',
 '78600000-0000-4000-8000-000000000012', '78600000-0000-4000-8000-000000000003',
 '2026-11-01T12:00:00.123456Z', true), null::jsonb, 'an owner of another workspace cannot review');
select is(private.set_wallet_checkpoint_review(
 '78600000-0000-4000-8000-000000000010', '78600000-0000-4000-8000-000000000021',
 '78600000-0000-4000-8000-000000000022', '78600000-0000-4000-8000-000000000001',
 '2026-11-01T12:00:00.123456Z', true), null::jsonb, 'a forged wallet and checkpoint pair cannot cross workspaces');
select ok(private.set_wallet_checkpoint_review(
 '78600000-0000-4000-8000-000000000010', '78600000-0000-4000-8000-000000000011',
 '78600000-0000-4000-8000-000000000012', '78600000-0000-4000-8000-000000000001',
 '2026-11-01T12:00:00.123456Z', true)->>'reviewed_at' is not null, 'the wallet editor can mark its checkpoint reviewed');
select is((select reviewed_by from private.workspace_wallet_checkpoints where id = '78600000-0000-4000-8000-000000000012'),
 '78600000-0000-4000-8000-000000000001'::uuid, 'the server records the actor');
select throws_ok($$select private.set_wallet_checkpoint_review(
 '78600000-0000-4000-8000-000000000010', '78600000-0000-4000-8000-000000000011',
 '78600000-0000-4000-8000-000000000012', '78600000-0000-4000-8000-000000000001',
 '2026-11-01T12:00:00.123456Z', false)$$, 'PT409', 'Checkpoint changed', 'stale review versions cannot overwrite review decisions');
update private.workspace_wallet_checkpoints set note = 'Audit note' where id = '78600000-0000-4000-8000-000000000012';
select ok((select reviewed_at is not null from private.workspace_wallet_checkpoints where id = '78600000-0000-4000-8000-000000000012'),
 'editing a note preserves the review');
update private.workspace_wallet_checkpoints set actual_balance = 27 where id = '78600000-0000-4000-8000-000000000012';
select ok((select reviewed_at is null and reviewed_by is null from private.workspace_wallet_checkpoints
 where id = '78600000-0000-4000-8000-000000000012'), 'changing the observed balance clears the review');

select * from finish();
rollback;
