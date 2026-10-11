begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
 select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
select is(private.topic_delivery_foundation_readiness(),'{"version":1,"activationEnabled":false}'::jsonb,'foundation cannot advertise send activation');
select is((select count(*) from private.topic_announcement_delivery_attempts),0::bigint,'migration creates no historical delivery attempts');
select ok(not has_table_privilege('authenticated','private.topic_announcement_delivery_attempts','SELECT,INSERT,UPDATE,DELETE'),'authenticated ledger access denied');
select ok(not has_table_privilege('anon','private.topic_announcement_delivery_attempts','SELECT,INSERT,UPDATE,DELETE'),'anonymous ledger access denied');
select ok(has_table_privilege('service_role','private.topic_announcement_delivery_attempts','SELECT'),'service can inspect ledger');
select ok(not has_table_privilege('service_role','private.topic_announcement_delivery_attempts','INSERT,UPDATE,DELETE'),'foundation has no service write admission');
select ok(not has_function_privilege('authenticated','private.topic_delivery_foundation_readiness()','EXECUTE'),'browser readiness execution denied');
select ok(not has_function_privilege('anon','private.topic_delivery_foundation_readiness()','EXECUTE'),'anonymous readiness execution denied');
select ok(has_function_privilege('service_role','private.topic_delivery_foundation_readiness()','EXECUTE'),'service readiness execution allowed');
select ok(not has_table_privilege('authenticated','private.topic_announcements','INSERT,UPDATE,DELETE'),'existing browser parent write denial preserved');
select ok(not has_table_privilege('authenticated','private.topic_announcement_recipients','INSERT,UPDATE,DELETE'),'existing browser recipient write denial preserved');
select ok(not has_table_privilege('authenticated','private.topic_announcement_attachments','INSERT,UPDATE,DELETE'),'existing browser attachment write denial preserved');
select ok((select bool_and(has_table_privilege('service_role','private.topic_announcements',privilege)) from unnest(array['INSERT','UPDATE','DELETE']) privilege),'existing parent callers are not revoked');
select ok((select bool_and(has_table_privilege('service_role','private.topic_announcement_recipients',privilege)) from unnest(array['INSERT','UPDATE','DELETE']) privilege),'existing recipient callers are not revoked');
select ok((select bool_and(has_table_privilege('service_role','private.topic_announcement_attachments',privilege)) from unnest(array['INSERT','UPDATE','DELETE']) privilege),'existing attachment callers are not revoked');
insert into auth.users(id) values(pg_temp.fid(121701)),(pg_temp.fid(121702));
insert into public.users(id) values(pg_temp.fid(121701)),(pg_temp.fid(121702)) on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
 (pg_temp.fid(121711),'Synthetic delivery foundation',false,pg_temp.fid(121701)),
 (pg_temp.fid(121712),'Synthetic foreign delivery scope',false,pg_temp.fid(121702));
insert into private.topic_announcements(id,ws_id,title,topic,created_by) values
 (pg_temp.fid(121721),pg_temp.fid(121711),'Synthetic notice','Synthetic topic',pg_temp.fid(121701));
select is((select delivery_revision from private.topic_announcements where id=pg_temp.fid(121721)),0::bigint,'existing parent starts with reserved zero revision');
select throws_ok($q$update private.topic_announcements set delivery_revision=-1 where id=pg_temp.fid(121721)$q$,'23514',null,'negative revision rejected');
create function pg_temp.insert_attempt(attempt integer,scope integer default 121711,payload jsonb default '{"payload":{},"recipients":[],"attachments":[]}'::jsonb) returns void language sql as $$
 insert into private.topic_announcement_delivery_attempts(id,announcement_id,ws_id,actor_id,snapshot)
 values(pg_temp.fid(attempt),pg_temp.fid(121721),pg_temp.fid(scope),pg_temp.fid(121701),payload);
$$;
select throws_ok($q$select pg_temp.insert_attempt(121731,121712)$q$,'23503',null,'foreign parent scope rejected');
select throws_ok($q$select pg_temp.insert_attempt(121731,121711,'{}')$q$,'23514',null,'missing snapshot sections rejected');
select throws_ok($q$select pg_temp.insert_attempt(121731,121711,'{"payload":{},"recipients":{},"attachments":[]}')$q$,'23514',null,'nonarray recipients rejected');
select pg_temp.insert_attempt(121731);
select throws_ok($q$select pg_temp.insert_attempt(121732)$q$,'23505',null,'concurrent-capable active-attempt constraint rejects duplicate');
select throws_ok($q$update private.topic_announcement_delivery_attempts set actor_id=pg_temp.fid(121702) where id=pg_temp.fid(121731)$q$,'55000','Delivery attempt identity is immutable','attempt actor cannot be replaced');
select throws_ok($q$update private.topic_announcement_delivery_attempts set snapshot='{"payload":{"changed":true},"recipients":[],"attachments":[]}' where id=pg_temp.fid(121731)$q$,'55000','Delivery attempt identity is immutable','attempt snapshot cannot be replaced');
select throws_ok($q$delete from private.topic_announcement_delivery_attempts where id=pg_temp.fid(121731)$q$,'55000','Delivery attempt history is immutable','attempt history cannot be deleted');
select throws_ok($q$delete from private.topic_announcements where id=pg_temp.fid(121721)$q$,'23503',null,'attempt parent history cannot be deleted');
select throws_ok($q$update private.topic_announcement_delivery_attempts set outcome='uncertain',completed_at=now() where id=pg_temp.fid(121731)$q$,'23514',null,'uncertainty without fixed reason rejected');
update private.topic_announcement_delivery_attempts set outcome='uncertain',completed_at=now(),outcome_reason='DELIVERY_UNCERTAIN' where id=pg_temp.fid(121731);
select throws_ok($q$select pg_temp.insert_attempt(121732)$q$,'23505',null,'uncertainty retains unique unresolved ownership');
select throws_ok($q$update private.topic_announcement_delivery_attempts set outcome='dispatching',completed_at=null,outcome_reason=null where id=pg_temp.fid(121731)$q$,'55000','Delivery uncertainty requires reconciliation','uncertainty cannot silently return to dispatch');
update private.topic_announcement_delivery_attempts set outcome='sent',completed_at=now(),provider_message_id='synthetic-provider-receipt' where id=pg_temp.fid(121731);
select throws_ok($q$update private.topic_announcement_delivery_attempts set provider_message_id='changed' where id=pg_temp.fid(121731)$q$,'55000','Delivery attempt terminal receipt is immutable','terminal receipt cannot be replaced');
select lives_ok($q$select pg_temp.insert_attempt(121732)$q$,'resolved history does not masquerade as unresolved ownership');
set local role service_role;
select is(private.topic_delivery_foundation_readiness()->>'activationEnabled','false','actual service role sees inactive contract');
select throws_ok($q$delete from private.topic_announcement_delivery_attempts$q$,'42501',null,'actual service role cannot delete ledger');
reset role;
set local role authenticated;
select throws_ok($q$select * from private.topic_announcement_delivery_attempts$q$,'42501',null,'actual authenticated role cannot read ledger');
select throws_ok($q$select private.topic_delivery_foundation_readiness()$q$,'42501',null,'actual authenticated role cannot invoke readiness');
reset role;
select * from finish();
rollback;
