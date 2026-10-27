begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(56);

-- Disposable seed identities; these fixtures are never run against a hosted DB.
-- User 1: flag holder and creator of A and D. User 3: A member without the flag.
-- User 4: flag holder and MEMBER of A and E without manage_workspace_integrations.
-- User 5: flag holder and GUEST of A.
insert into public.workspaces(id, name, creator_id) values
 ('91000000-0000-4000-8000-000000000001', 'Guild boundary A', '00000000-0000-0000-0000-000000000001'),
 ('91000000-0000-4000-8000-000000000002', 'Guild boundary B', '00000000-0000-0000-0000-000000000002'),
 ('91000000-0000-4000-8000-000000000003', 'Guild boundary C', '00000000-0000-0000-0000-000000000002'),
 ('91000000-0000-4000-8000-000000000004', 'Guild boundary D', '00000000-0000-0000-0000-000000000001'),
 ('91000000-0000-4000-8000-000000000005', 'Guild boundary E', '00000000-0000-0000-0000-000000000002');
insert into public.workspace_members(ws_id, user_id, type) values
 ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001', 'MEMBER'),
 ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000003', 'MEMBER'),
 ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000004', 'MEMBER'),
 ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000005', 'GUEST'),
 ('91000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000001', 'MEMBER'),
 ('91000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000004', 'MEMBER') on conflict do nothing;
update public.workspace_default_permissions set enabled = false
 where ws_id in ('91000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000005') and member_type = 'MEMBER';
insert into public.platform_user_roles(user_id, allow_discord_integrations) values
 ('00000000-0000-0000-0000-000000000001', true),
 ('00000000-0000-0000-0000-000000000003', false),
 ('00000000-0000-0000-0000-000000000004', true),
 ('00000000-0000-0000-0000-000000000005', true)
 on conflict(user_id) do update set allow_discord_integrations = excluded.allow_discord_integrations;
insert into public.discord_integrations(discord_guild_id, ws_id, creator_id) values
 ('fixture-guild-a', '91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001'),
 ('fixture-guild-b', '91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000001');
insert into public.discord_guild_members(id, discord_guild_id, discord_user_id, platform_user_id) values
 ('92000000-0000-4000-8000-000000000001', 'fixture-guild-a', 'discord-a', '00000000-0000-0000-0000-000000000001'),
 ('92000000-0000-4000-8000-000000000002', 'fixture-guild-b', 'discord-b', '00000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-a'), 1::bigint, 'member can read own guild mappings');
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-b'), 0::bigint, 'member cannot read another guild mappings');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-b','unrelated','00000000-0000-0000-0000-000000000001')$$, '42501', null, 'cross-guild insert denied');
select throws_ok($$update public.discord_guild_members set discord_guild_id='fixture-guild-b' where id='92000000-0000-4000-8000-000000000001'$$, '42501', null, 'cannot move owned mapping into another guild');
with changed as (update public.discord_guild_members set discord_user_id='changed' where id='92000000-0000-4000-8000-000000000002' returning id) select is(count(*), 0::bigint, 'cross-guild update cannot touch row') from changed;
with removed as (delete from public.discord_guild_members where id='92000000-0000-4000-8000-000000000002' returning id) select is(count(*), 0::bigint, 'cross-guild delete cannot touch row') from removed;
select lives_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','new-own','00000000-0000-0000-0000-000000000001')$$, 'owned guild insert remains supported');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','foreign-member','00000000-0000-0000-0000-000000000002')$$, '42501', null, 'mapped user must belong to guild workspace');
select throws_ok($$update public.discord_guild_members set platform_user_id='00000000-0000-0000-0000-000000000002' where discord_guild_id='fixture-guild-a'$$, '42501', null, 'cannot retarget mapping to a foreign workspace user');
select lives_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','teammate','00000000-0000-0000-0000-000000000003')$$, 'flag holder can map another member of the same workspace');

-- Integration rows: a flag holder in A cannot see, change or rebind B.
select is((select count(*) from public.discord_integrations where discord_guild_id = 'fixture-guild-a'), 1::bigint, 'flag holder reads own workspace integration');
select is((select count(*) from public.discord_integrations where discord_guild_id = 'fixture-guild-b'), 0::bigint, 'flag holder cannot read another workspace integration');
with changed as (update public.discord_integrations set ws_id='91000000-0000-4000-8000-000000000001' where discord_guild_id='fixture-guild-b' returning id) select is(count(*), 0::bigint, 'cannot rebind another workspace integration to own workspace') from changed;
with changed as (update public.discord_integrations set discord_guild_id='fixture-guild-hijack' where discord_guild_id='fixture-guild-b' returning id) select is(count(*), 0::bigint, 'cannot change another workspace guild id') from changed;
with removed as (delete from public.discord_integrations where discord_guild_id='fixture-guild-b' returning id) select is(count(*), 0::bigint, 'cannot delete another workspace integration') from removed;
select throws_ok($$insert into public.discord_integrations(discord_guild_id,ws_id,creator_id) values ('fixture-guild-c','91000000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000001')$$, '42501', null, 'cannot connect a workspace the actor does not belong to');
select throws_ok($$update public.discord_integrations set ws_id='91000000-0000-4000-8000-000000000004' where discord_guild_id='fixture-guild-a'$$, '42501', 'Discord integration guild, workspace and creator are immutable', 'own integration workspace is immutable');
select throws_ok($$update public.discord_integrations set discord_guild_id='fixture-guild-moved' where discord_guild_id='fixture-guild-a'$$, '42501', 'Discord integration guild, workspace and creator are immutable', 'own integration guild is immutable');
select throws_ok($$insert into public.discord_integrations(discord_guild_id,ws_id,creator_id) values ('fixture-guild-d','91000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000003')$$, '42501', null, 'creator cannot be forged on connect');
select throws_ok($$update public.discord_integrations set creator_id='00000000-0000-0000-0000-000000000003' where discord_guild_id='fixture-guild-a'$$, '42501', 'Discord integration guild, workspace and creator are immutable', 'own integration creator is immutable');
select lives_ok($$insert into public.discord_integrations(discord_guild_id,ws_id,creator_id) values ('fixture-guild-d','91000000-0000-4000-8000-000000000004','00000000-0000-0000-0000-000000000001')$$, 'same-workspace setup still connects');
select lives_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-d','discord-d','00000000-0000-0000-0000-000000000001')$$, 'manager maps a member of the new guild');
with removed as (delete from public.discord_integrations where discord_guild_id='fixture-guild-d' returning id) select is(count(*), 1::bigint, 'same-workspace disconnect still works') from removed;
reset role;
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-d'), 0::bigint, 'manager disconnect removes the guild mappings');

-- Flag holder without manage_workspace_integrations: read-only.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.discord_integrations where discord_guild_id = 'fixture-guild-a'), 1::bigint, 'flag member without manage permission can read');
with removed as (delete from public.discord_integrations where discord_guild_id='fixture-guild-a' returning id) select is(count(*), 0::bigint, 'flag member without manage permission cannot disconnect') from removed;
with changed as (update public.discord_integrations set created_at=now() where discord_guild_id='fixture-guild-a' returning id) select is(count(*), 0::bigint, 'flag member without manage permission cannot update integration') from changed;
select throws_ok($$insert into public.discord_integrations(discord_guild_id,ws_id,creator_id) values ('fixture-guild-e','91000000-0000-4000-8000-000000000005','00000000-0000-0000-0000-000000000004')$$, '42501', null, 'flag member without manage permission cannot connect');
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-a'), 3::bigint, 'flag member without manage permission can read mappings');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','forged-admin','00000000-0000-0000-0000-000000000001')$$, '42501', null, 'flag member without manage permission cannot map a coworker');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','self-mapped','00000000-0000-0000-0000-000000000004')$$, '42501', null, 'flag member without manage permission cannot map self');
with changed as (update public.discord_guild_members set discord_user_id='forged' where discord_guild_id='fixture-guild-a' returning id) select is(count(*), 0::bigint, 'flag member without manage permission cannot update mappings') from changed;
with removed as (delete from public.discord_guild_members where discord_guild_id='fixture-guild-a' returning id) select is(count(*), 0::bigint, 'flag member without manage permission cannot delete mappings') from removed;
reset role;
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-a'), 3::bigint, 'filtered non-manager deletes leave the guild mappings');

-- GUEST flag holder of the bound workspace.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-a'), 0::bigint, 'guest flag holder cannot read mappings');
select is((select count(*) from public.discord_integrations where discord_guild_id = 'fixture-guild-a'), 0::bigint, 'guest flag holder cannot read integration');
reset role;

-- Same-workspace member without the platform flag.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.discord_integrations where discord_guild_id = 'fixture-guild-a'), 0::bigint, 'member without flag cannot read integration');
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-a'), 0::bigint, 'member without flag cannot read mappings');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','self-mapped','00000000-0000-0000-0000-000000000003')$$, '42501', null, 'member without flag cannot map');
with removed as (delete from public.discord_integrations where discord_guild_id='fixture-guild-a' returning id) select is(count(*), 0::bigint, 'member without flag cannot disconnect') from removed;
select throws_ok($$select public.ensure_discord_guild_member_identity_index()$$, '42501', null, 'clients cannot run the index helper');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*) from public.discord_guild_members where discord_guild_id in ('fixture-guild-a','fixture-guild-b')), 0::bigint, 'anonymous reads see no mappings');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','anonymous','00000000-0000-0000-0000-000000000001')$$, '42501', null, 'anonymous writes denied');
select is((select count(*) from public.discord_integrations where discord_guild_id in ('fixture-guild-a','fixture-guild-b')), 0::bigint, 'anonymous reads see no integrations');
reset role;

-- service_role (bot and agent runtime) keeps full access but cannot rebind.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select is((select count(*) from public.discord_integrations where discord_guild_id in ('fixture-guild-a','fixture-guild-b')), 2::bigint, 'service role reads every integration');
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-a'), 3::bigint, 'service role reads every mapping');
select lives_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-b','service-mapped','00000000-0000-0000-0000-000000000002')$$, 'service role can write mappings');
select throws_ok($$update public.discord_integrations set ws_id='91000000-0000-4000-8000-000000000003' where discord_guild_id='fixture-guild-b'$$, '42501', 'Discord integration guild, workspace and creator are immutable', 'service role cannot rebind an integration');
reset role;

-- Conditional unique index: built when no duplicates exist, skipped otherwise.
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'discord_guild_members_guild_discord_user_key'), 'unique mapping index exists on a duplicate-free apply');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','discord-a','00000000-0000-0000-0000-000000000003')$$, '23505', null, 'duplicate Discord identity per guild rejected');
drop index public.discord_guild_members_guild_discord_user_key;
insert into public.discord_guild_members(id, discord_guild_id, discord_user_id, platform_user_id) values
 ('92000000-0000-4000-8000-000000000009', 'fixture-guild-a', 'discord-a', '00000000-0000-0000-0000-000000000003');
select is(public.ensure_discord_guild_member_identity_index(), false, 'index helper skips without failing when duplicates exist');
select ok(not exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'discord_guild_members_guild_discord_user_key'), 'skipped index stays absent');
delete from public.discord_guild_members where id = '92000000-0000-4000-8000-000000000009';
select is(public.ensure_discord_guild_member_identity_index(), true, 'index helper builds once duplicates are resolved');
select ok(exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'discord_guild_members_guild_discord_user_key'), 'index exists after rerun');

-- Deleting a workspace cascades to its integration and then its mappings.
select lives_ok($$delete from public.workspaces where id = '91000000-0000-4000-8000-000000000002'$$, 'workspace with an integration can be deleted');
select is((select count(*) from public.discord_guild_members where discord_guild_id = 'fixture-guild-b'), 0::bigint, 'workspace deletion removes the guild mappings');
select * from finish();
rollback;
