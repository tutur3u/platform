begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(64);
select is((select creator_id from public.handles where value='local'),'00000000-0000-0000-0000-000000000001'::uuid,'full-schema seed reserves the canonical handle for its actual actor');
select lives_ok($$select public.update_public_user_profile('00000000-0000-0000-0000-000000000001','{"handle":"local"}')$$,'the existing canonical seed handle remains a valid no-op');
select is((select count(*) from private.user_profile_change_events where user_id='00000000-0000-0000-0000-000000000001' and field='handle'),1::bigint,'existing-handle no-op adds no quota event to the seeded initial claim');
insert into auth.users(id) values ('00000000-0000-4000-8000-000000009501'), ('00000000-0000-4000-8000-000000009502');
insert into public.users(id) values ('00000000-0000-4000-8000-000000009501'), ('00000000-0000-4000-8000-000000009502') on conflict do nothing;
select ok(not has_function_privilege('anon','public.update_public_user_profile(uuid,jsonb)','EXECUTE'),'anonymous users cannot forge a profile actor');
select ok(not has_function_privilege('authenticated','public.update_public_user_profile(uuid,jsonb)','EXECUTE'),'authenticated clients cannot forge a profile actor');
select ok(has_function_privilege('service_role','public.update_public_user_profile(uuid,jsonb)','EXECUTE'),'authenticated API can update the resolved actor');
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"display_name":"Synthetic creator","handle":"synthetic_creator_9501","bio":"Build worlds","banner_url":"https://example.test/banner.png"}')$$,'identity saves atomically');
select is((select handle from public.users where id='00000000-0000-4000-8000-000000009501'),'synthetic_creator_9501','canonical username is shared');
select is((select banner_url from public.users where id='00000000-0000-4000-8000-000000009501'),'https://example.test/banner.png','canonical banner is shared');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"synthetic_creator_9501","display_name":"Rejected"}')$$,'23505',null,'another creator cannot steal a reserved handle');
select isnt((select display_name from public.users where id='00000000-0000-4000-8000-000000009502'),'Rejected','conflicting profile does not partially save');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"handle":"synthetic_invalid_9501","banner_url":"javascript:alert(1)"}')$$,'22023',null,'unsafe artwork is rejected');
select ok(not exists(select 1 from public.handles where value='synthetic_invalid_9501'),'invalid saves reserve no handles');
update private.user_profile_change_events set changed_at=now()-interval '14 days' where user_id='00000000-0000-4000-8000-000000009501' and field='handle';
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"handle":"synthetic_renamed_9501","banner_url":null}')$$,'rename and clear banner work');
select is((select banner_url from public.users where id='00000000-0000-4000-8000-000000009501'),null::text,'clearing a banner preserves null semantics');
select throws_ok($$update public.users set handle='synthetic_creator_9501' where id='00000000-0000-4000-8000-000000009502'$$,'23505',null,'direct writes cannot steal previous usernames');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"email":"private@example.test"}')$$,'22023',null,'private identity fields are excluded');

select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"four"}')$$,'22023',null,'usernames require at least five characters');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"google"}')$$,'22023',null,'Google is reserved');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"apple"}')$$,'22023',null,'Apple is reserved');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"microsoft"}')$$,'22023',null,'Microsoft is reserved');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"support"}')$$,'22023',null,'common service names are reserved');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"g_o_o_g_l_e"}')$$,'22023',null,'separator variants cannot impersonate brands');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"apple123"}')$$,'22023',null,'numeric variants cannot impersonate brands');
select ok(not exists(select 1 from public.handles where value in ('four','google','apple','microsoft','support','g_o_o_g_l_e','apple123')),'rejected usernames reserve nothing');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"handle":"synthetic_cooldown_9501","bio":"Rejected cooldown"}')$$,'PT429',null,'username changes have a fourteen day cooldown');
select ok(not exists(select 1 from public.handles where value='synthetic_cooldown_9501'),'cooldown rejection rolls back handle reservation');
select isnt((select bio from public.users where id='00000000-0000-4000-8000-000000009501'),'Rejected cooldown','cooldown rejection rolls back the complete profile patch');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"handle":null}')$$,'PT429',null,'clearing a username cannot bypass the cooldown');
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"handle":"synthetic_renamed_9501","display_name":"Synthetic creator"}')$$,'unchanged identity does not consume a change');
select is((select count(*) from private.user_profile_change_events where user_id='00000000-0000-4000-8000-000000009501' and field='display_name'),1::bigint,'display no-op preserves the remaining allowance');
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"display_name":"Second synthetic name"}')$$,'second display change within seven days is allowed');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"display_name":"Third synthetic name","banner_url":"https://example.test/rejected.png"}')$$,'PT429',null,'third display change within seven days is rejected');
select is((select banner_url from public.users where id='00000000-0000-4000-8000-000000009501'),null::text,'display quota rejection rolls back banner changes');
select throws_ok($$update public.users set display_name='Direct bypass' where id='00000000-0000-4000-8000-000000009501'$$,'PT429',null,'direct profile writes cannot bypass display quotas');
update private.user_profile_change_events set changed_at=now()-interval '7 days' where user_id='00000000-0000-4000-8000-000000009501' and field='display_name';
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"display_name":"Name after seven days"}')$$,'seven day rolling window expires at its exact boundary');
select ok(not has_table_privilege('authenticated','private.user_profile_change_events','INSERT'),'clients cannot forge their quota history');
select ok(not has_table_privilege('authenticated','private.reserved_usernames','DELETE'),'clients cannot remove reserved usernames');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000009501","role":"authenticated"}';
set local role authenticated;
select throws_ok($$insert into public.handles(value,creator_id) values('unbounded_claim_9501','00000000-0000-4000-8000-000000009501')$$,'42501',null,'clients cannot pre-reserve arbitrary usernames outside the atomic RPC');
select throws_ok($$insert into public.handles(value,creator_id) values('forged_claim_9502','00000000-0000-4000-8000-000000009502')$$,'42501',null,'clients cannot forge another creator reservation');
reset role;
set local request.jwt.claims = '{"role":"service_role"}';
set local role service_role;
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"authorized_creator_9502"}')$$,'actual service role can claim a username atomically');
reset role;
select is((select creator_id from public.handles where value='authorized_creator_9502'),'00000000-0000-4000-8000-000000009502'::uuid,'authorized reservations retain the resolved actor');

-- Emulate pre-migration identities without weakening production enforcement.
insert into auth.users(id) values ('00000000-0000-4000-8000-000000009503'), ('00000000-0000-4000-8000-000000009504'), ('00000000-0000-4000-8000-000000009505'), ('00000000-0000-4000-8000-000000009506');
insert into public.users(id) values ('00000000-0000-4000-8000-000000009503'), ('00000000-0000-4000-8000-000000009504'), ('00000000-0000-4000-8000-000000009505'), ('00000000-0000-4000-8000-000000009506') on conflict do nothing;
insert into public.handles(value,creator_id) values
  ('legacy_null_9503',null),
  ('legacy_wrong_9504','00000000-0000-4000-8000-000000009506'),
  ('legacy_orphan_9500',null),
  ('old','00000000-0000-4000-8000-000000009505'),
  ('legacy_owned_9506','00000000-0000-4000-8000-000000009506');
alter table public.users disable trigger enforce_public_user_profile_policy;
update public.users set handle = case id
  when '00000000-0000-4000-8000-000000009503' then 'legacy_null_9503'
  when '00000000-0000-4000-8000-000000009504' then 'legacy_wrong_9504'
  when '00000000-0000-4000-8000-000000009505' then 'old'
  when '00000000-0000-4000-8000-000000009506' then 'legacy_owned_9506' end
  where id in ('00000000-0000-4000-8000-000000009503','00000000-0000-4000-8000-000000009504','00000000-0000-4000-8000-000000009505','00000000-0000-4000-8000-000000009506');
alter table public.users enable trigger enforce_public_user_profile_policy;
select lives_ok($$select private.reconcile_creator_handle_owners()$$,'legacy owner reconciliation runs against actual pre-migration row shapes');
select is((select creator_id from public.handles where value='legacy_null_9503'),'00000000-0000-4000-8000-000000009503'::uuid,'a unique canonical profile receives its null-owner reservation');
select is((select creator_id from public.handles where value='legacy_wrong_9504'),'00000000-0000-4000-8000-000000009506'::uuid,'conflicting non-null ownership is never reassigned');
select is((select creator_id from public.handles where value='legacy_orphan_9500'),null::uuid,'unclaimed null reservations remain untouched');
select is((select creator_id from public.handles where value='legacy_owned_9506'),'00000000-0000-4000-8000-000000009506'::uuid,'existing canonical ownership remains intact');
select lives_ok($$select private.reconcile_creator_handle_owners()$$,'reconciliation is safe to repeat');
select is((select creator_id from public.handles where value='legacy_null_9503'),'00000000-0000-4000-8000-000000009503'::uuid,'repeated reconciliation preserves the matched owner');
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009505','{"handle":"old"}')$$,'unchanged short legacy handles remain valid');
select is((select count(*) from private.user_profile_change_events where user_id='00000000-0000-4000-8000-000000009505' and field='handle'),0::bigint,'legacy no-op saves consume no allowance');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009503','{"handle":"legacy_orphan_9500"}')$$,'23505',null,'unclaimed old reservations cannot be newly claimed');
select ok(not has_function_privilege('authenticated','private.reconcile_creator_handle_owners()','EXECUTE'),'clients cannot invoke privileged legacy reconciliation');

-- Exercise the installed legacy trigger across real renames and clears.
delete from private.user_profile_change_events
 where user_id='00000000-0000-4000-8000-000000009501' and field='handle';
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"handle":"retained_creator_9501"}')$$,'rename succeeds through installed triggers');
select is((select creator_id from public.handles where value='synthetic_creator_9501'),'00000000-0000-4000-8000-000000009501'::uuid,'rename retains the previous reservation');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"synthetic_creator_9501"}')$$,'23505',null,'another creator cannot claim a retired handle');
delete from private.user_profile_change_events
 where user_id='00000000-0000-4000-8000-000000009501' and field='handle';
select lives_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009501','{"handle":null}')$$,'clear succeeds after cooldown');
select is((select count(*) from public.handles where creator_id='00000000-0000-4000-8000-000000009501' and value in ('synthetic_creator_9501','retained_creator_9501')),2::bigint,'clear retains current and historical reservations');

select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"admin123"}')$$,'22023',null,'numeric service-name variants are reserved');
select throws_ok($$select public.update_public_user_profile('00000000-0000-4000-8000-000000009502','{"handle":"supportteam"}')$$,'22023',null,'team service-name variants are reserved');
select throws_ok($$update public.users set avatar_url='javascript:alert(1)' where id='00000000-0000-4000-8000-000000009501'$$,'22023',null,'direct writes reject unsafe avatars');
select throws_ok($$update public.users set avatar_url='https://example.test/has space.png' where id='00000000-0000-4000-8000-000000009501'$$,'22023',null,'direct writes reject whitespace in avatars');
select lives_ok($$update public.users set avatar_url='https://example.test/avatar.png' where id='00000000-0000-4000-8000-000000009501'$$,'direct writes accept valid HTTPS avatars');
select lives_ok($$update public.users set avatar_url=null where id='00000000-0000-4000-8000-000000009501'$$,'direct writes can clear avatars');
select * from finish();
rollback;
