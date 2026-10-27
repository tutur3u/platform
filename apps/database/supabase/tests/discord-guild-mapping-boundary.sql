begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

-- Disposable seed identities; these fixtures are never run against a hosted DB.
insert into public.workspaces(id, name, creator_id) values
 ('91000000-0000-4000-8000-000000000001', 'Guild boundary A', '00000000-0000-0000-0000-000000000001'),
 ('91000000-0000-4000-8000-000000000002', 'Guild boundary B', '00000000-0000-0000-0000-000000000002');
insert into public.workspace_members(ws_id, user_id) values
 ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.platform_user_roles(user_id, allow_discord_integrations)
 values ('00000000-0000-0000-0000-000000000001', true)
 on conflict(user_id) do update set allow_discord_integrations = true;
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
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is((select count(*) from public.discord_guild_members where discord_guild_id in ('fixture-guild-a','fixture-guild-b')), 0::bigint, 'anonymous reads see no mappings');
select throws_ok($$insert into public.discord_guild_members(discord_guild_id,discord_user_id,platform_user_id) values ('fixture-guild-a','anonymous','00000000-0000-0000-0000-000000000001')$$, '42501', null, 'anonymous writes denied');
reset role;
select * from finish();
rollback;
