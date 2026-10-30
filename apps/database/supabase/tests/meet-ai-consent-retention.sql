-- B1/B2/B3: MFA, preserved consent, and server-only anonymization.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
select set_config('request.jwt.claims', '{}', true);
create function pg_temp.cid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id) select pg_temp.cid(n) from generate_series(88601,88603) n;
insert into public.users(id) select pg_temp.cid(n) from generate_series(88601,88603) n on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 (pg_temp.cid(88611),'Consent retention',false,pg_temp.cid(88601));
insert into public.workspace_members(ws_id,user_id,type) values
 (pg_temp.cid(88611),pg_temp.cid(88602),'MEMBER'),
 (pg_temp.cid(88611),pg_temp.cid(88603),'MEMBER') on conflict do nothing;
update public.workspace_default_permissions set enabled=false where ws_id=pg_temp.cid(88611) and permission='admin';
insert into public.workspace_roles(id,ws_id,name) values (pg_temp.cid(88612),pg_temp.cid(88611),'Consent admin');
insert into public.workspace_role_permissions(ws_id,role_id,permission,enabled) values (pg_temp.cid(88611),pg_temp.cid(88612),'admin',true);
insert into public.workspace_role_members(role_id,user_id) values (pg_temp.cid(88612),pg_temp.cid(88603));
insert into public.workspace_meetings(id,ws_id,creator_id,name) values
 (pg_temp.cid(88621),pg_temp.cid(88611),pg_temp.cid(88601),'Evidence meeting'),
 (pg_temp.cid(88622),pg_temp.cid(88611),pg_temp.cid(88601),'Second meeting');
insert into public.meet_ai_sessions(id,meeting_id,user_id,purge_after) values
 (pg_temp.cid(88631),pg_temp.cid(88621),pg_temp.cid(88601),now()-interval '1 day'),
 (pg_temp.cid(88632),pg_temp.cid(88622),pg_temp.cid(88601),null);
insert into public.workspace_meet_settings(ws_id) values (pg_temp.cid(88611));
-- Even the server cannot choose a deterministic identifying reference.
set local role service_role;
insert into private.meet_ai_consents(id,session_id,user_id,participant_ref,decision,notice_version) values
 (pg_temp.cid(88641),pg_temp.cid(88631),pg_temp.cid(88602),pg_temp.cid(88602),'allow','v1'),
 (pg_temp.cid(88642),pg_temp.cid(88631),pg_temp.cid(88602),pg_temp.cid(88602),'withdraw','v1'),
 (pg_temp.cid(88643),pg_temp.cid(88632),pg_temp.cid(88602),pg_temp.cid(88602),'allow','v1'),
 (pg_temp.cid(88644),pg_temp.cid(88631),pg_temp.cid(88601),pg_temp.cid(88601),'allow','v1');
reset role;
create temporary table consent_snapshot as select * from private.meet_ai_consents where session_id in (pg_temp.cid(88631),pg_temp.cid(88632));
select ok((select count(distinct participant_ref)=1 from consent_snapshot where id in(pg_temp.cid(88641),pg_temp.cid(88642))), 'same session-participant reuses one pseudonym');
select isnt((select participant_ref from consent_snapshot where id=pg_temp.cid(88641)), (select participant_ref from consent_snapshot where id=pg_temp.cid(88643)), 'participant pseudonym is different in another session');
select isnt((select participant_ref from consent_snapshot where id=pg_temp.cid(88641)), (select participant_ref from consent_snapshot where id=pg_temp.cid(88644)), 'different participants have different pseudonyms');
select ok(not exists(select 1 from consent_snapshot where participant_ref=user_id or participant_ref is null), 'insert replaces caller identity with a random UUID');
select throws_ok($$update private.meet_ai_consents set notice_version='v2' where id=pg_temp.cid(88641)$$,'55000','Consent evidence is immutable','even privileged updates cannot rewrite evidence');
select throws_ok($$update private.meet_ai_consents set user_id=null where id=pg_temp.cid(88641)$$,'55000','Consent evidence is immutable','manual anonymization cannot impersonate account deletion');
select throws_ok($$insert into private.meet_ai_consents(session_id,user_id,decision,notice_version) values(pg_temp.cid(88631),pg_temp.cid(88601),'allow',repeat('v',81))$$,'23514',null,'notice version capped at 80');
select throws_ok($$update public.workspace_meet_settings set transcript_retention_days=366 where ws_id=pg_temp.cid(88611)$$,'23514',null,'transcript retention bounded at 365 days');
select throws_ok($$update public.workspace_meet_settings set audio_retention_hours=1 where ws_id=pg_temp.cid(88611)$$,'23514',null,'audio retention stays zero without audio storage');
select set_config('request.jwt.claim.sub',pg_temp.cid(88601)::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.cid(88601),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select throws_ok($$delete from public.workspace_meetings where id=pg_temp.cid(88621)$$,'23503',null,'creator cannot cascade away consent');
reset role;
select is((select count(*)::int from private.meet_ai_consents where session_id=pg_temp.cid(88631)),3,'creator delete leaves all consent rows intact');
select set_config('request.jwt.claim.sub',pg_temp.cid(88603)::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.cid(88603),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select ok(public.has_workspace_permission(pg_temp.cid(88611),auth.uid(),'admin'), 'admin fixture has explicit admin permission');
select throws_ok($$delete from public.workspace_meetings where id=pg_temp.cid(88621)$$,'23503',null,'workspace admin cannot cascade away consent');
reset role;
select is((select count(*)::int from private.meet_ai_consents where session_id=pg_temp.cid(88631)),3,'workspace admin delete leaves all consent rows intact');
select set_config('request.jwt.claim.sub',pg_temp.cid(88602)::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.cid(88602),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select throws_ok($$delete from auth.users where id=pg_temp.cid(88602)$$,'42501',null,'authenticated cannot delete Auth accounts');
select is_empty($$delete from public.users where id=pg_temp.cid(88602) returning id$$,'authenticated cannot trigger user FK anonymization');
select throws_ok($$update private.meet_ai_consents set user_id=null where id=pg_temp.cid(88641)$$,'42501',null,'authenticated cannot clear the identifying FK');
select throws_ok($$delete from private.meet_ai_consents where session_id=pg_temp.cid(88631)$$,'42501',null,'authenticated cannot erase evidence');
reset role;
select is((select user_id from private.meet_ai_consents where id=pg_temp.cid(88641)),pg_temp.cid(88602),'authenticated leaves identity attached');
set local role anon;
select throws_ok($$delete from auth.users where id=pg_temp.cid(88602)$$,'42501',null,'anon cannot delete Auth accounts');
select is_empty($$delete from public.users where id=pg_temp.cid(88602) returning id$$,'anon cannot trigger user FK anonymization');
select throws_ok($$update private.meet_ai_consents set user_id=null where id=pg_temp.cid(88641)$$,'42501',null,'anon cannot clear the identifying FK');
select throws_ok($$delete from private.meet_ai_consents where session_id=pg_temp.cid(88631)$$,'42501',null,'anon cannot erase evidence');
reset role;
select is((select user_id from private.meet_ai_consents where id=pg_temp.cid(88641)),pg_temp.cid(88602),'anon leaves identity attached');
select set_config('request.jwt.claims','{}',true);
select set_config('request.jwt.claim.sub','',true);
-- Auth account deletion is the real account boundary: the existing Auth
-- trigger retains the public profile and removes memberships.
select lives_ok($$delete from auth.users where id=pg_temp.cid(88602)$$,'Auth account deletion still succeeds');
select ok(exists(select 1 from public.users where id=pg_temp.cid(88602)), 'Auth deletion retains the legacy public profile');
select is((select count(*)::int from private.meet_ai_consents where id in(pg_temp.cid(88641),pg_temp.cid(88642),pg_temp.cid(88643)) and user_id is null),3,'account deletion retains all three anonymized decisions');
select ok(not exists(select 1 from private.meet_ai_consents c join consent_snapshot s using(id)
 where c.participant_ref is distinct from s.participant_ref or
 (to_jsonb(c)-'user_id') is distinct from (to_jsonb(s)-'user_id')), 'account deletion preserves pseudonym and all other evidence bytes');
select is((select decision from private.meet_ai_consents where session_id=pg_temp.cid(88631)
 and participant_ref=(select participant_ref from consent_snapshot where id=pg_temp.cid(88642)) order by created_at desc,id desc limit 1),'withdraw','anonymization cannot revive an earlier allow');
-- Later explicit profile erasure follows existing personal-workspace guards.
set local role service_role;
select lives_ok($$delete from public.workspaces where creator_id=pg_temp.cid(88602) and personal$$,'server cleanup can remove personal workspace after Auth deletion');
select lives_ok($$delete from public.users where id=pg_temp.cid(88602)$$,'later server profile erasure still succeeds');
reset role;
select throws_ok($$delete from public.workspace_meetings where id=pg_temp.cid(88621)$$,'23503',null,'even owner deletion needs explicit consent erasure first');
set local role service_role;
select lives_ok($$delete from private.meet_ai_consents where session_id=pg_temp.cid(88631)$$,'service role can explicitly erase consent');
select lives_ok($$delete from public.workspace_meetings where id=pg_temp.cid(88621)$$,'service erasure can then delete meeting and session');
reset role;
select is((select count(*)::int from private.meet_ai_consents where session_id=pg_temp.cid(88631)),0,'explicit erasure removes only the chosen session evidence');
select is((select count(*)::int from private.meet_ai_consents where session_id=pg_temp.cid(88632)),1,'other session evidence survives erasure');
select * from finish();
rollback;
