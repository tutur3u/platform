begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.fid(n integer) returns uuid language sql as $$
  select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
insert into auth.users(id) select pg_temp.fid(n) from generate_series(97001,97006) n;
insert into public.users(id) select pg_temp.fid(n) from generate_series(97001,97006) n on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id) values
  (pg_temp.fid(97011),'Synthetic report review',false,pg_temp.fid(97001)),
  (pg_temp.fid(97012),'Synthetic foreign review',false,pg_temp.fid(97002));
-- Creator memberships are trigger-owned; only seed additional actors.
insert into public.workspace_members(ws_id,user_id,type) values
  (pg_temp.fid(97011),pg_temp.fid(97003),'MEMBER'),
  (pg_temp.fid(97011),pg_temp.fid(97004),'GUEST'),
  (pg_temp.fid(97011),pg_temp.fid(97005),'GUEST');
update public.workspace_default_permissions set enabled=false
  where ws_id in(pg_temp.fid(97011),pg_temp.fid(97012));
insert into public.workspace_users(id,ws_id,full_name) select pg_temp.fid(n),pg_temp.fid(97011),'Synthetic actor'
  from generate_series(97101,97107) n;
insert into public.workspace_users(id,ws_id,full_name) values(pg_temp.fid(97108),pg_temp.fid(97012),'Foreign actor');
insert into public.workspace_user_linked_users(platform_user_id,virtual_user_id,ws_id)
  select pg_temp.fid(97000+n),pg_temp.fid(97100+n),pg_temp.fid(97011) from generate_series(1,6) n
  on conflict(platform_user_id,ws_id) do update set virtual_user_id=excluded.virtual_user_id;
insert into public.workspace_roles(id,ws_id,name) values(pg_temp.fid(97201),pg_temp.fid(97011),'Review role');
insert into public.workspace_role_permissions(role_id,ws_id,permission,enabled)
  values(pg_temp.fid(97201),pg_temp.fid(97011),'approve_reports',true);
insert into public.workspace_role_members(role_id,user_id) values
  (pg_temp.fid(97201),pg_temp.fid(97003)),(pg_temp.fid(97201),pg_temp.fid(97004));
create function pg_temp.can_review(actor integer,kind text default 'periodic') returns boolean language sql as $$
  select private.can_review_report_entry(pg_temp.fid(97011),pg_temp.fid(actor),pg_temp.fid(actor+100),kind);
$$;
select ok(pg_temp.can_review(97001),'creator with exact actor link admitted');
select ok(pg_temp.can_review(97003),'MEMBER role explicit report grant admitted');
select ok(not pg_temp.can_review(97003,'daily'),'report grant cannot approve daily posts');
select ok(not pg_temp.can_review(97004),'GUEST cannot borrow role grants');
select ok(not pg_temp.can_review(97005),'missing GUEST default denies');
select ok(not pg_temp.can_review(97006),'nonmember denied despite linked user');
update public.workspace_user_linked_users set virtual_user_id=pg_temp.fid(97108)
 where platform_user_id=pg_temp.fid(97001) and ws_id=pg_temp.fid(97011);
select ok(not private.can_review_report_entry(pg_temp.fid(97011),pg_temp.fid(97001),pg_temp.fid(97108),'periodic'),'same claimed link with foreign virtual workspace denied');
update public.workspace_user_linked_users set virtual_user_id=pg_temp.fid(97101)
 where platform_user_id=pg_temp.fid(97001) and ws_id=pg_temp.fid(97011);
select ok(not private.can_review_report_entry(pg_temp.fid(97012),pg_temp.fid(97001),pg_temp.fid(97101),'periodic'),'foreign workspace actor link denied');
select ok(not private.can_review_report_entry(pg_temp.fid(97011),pg_temp.fid(97001),pg_temp.fid(97108),'periodic'),'foreign virtual actor denied');
select ok(not pg_temp.can_review(97001,'invalid'),'unrecognized approval kind denied');
insert into public.workspace_default_permissions(ws_id,member_type,permission,enabled)
  values(pg_temp.fid(97011),'GUEST','approve_posts',true)
  on conflict(ws_id,member_type,permission) do update set enabled=true;
select ok(pg_temp.can_review(97005,'daily'),'GUEST typed explicit default admitted');
select ok(not pg_temp.can_review(97005),'post default does not approve periodic reports');
update public.workspace_default_permissions set enabled=false where ws_id=pg_temp.fid(97011) and member_type='GUEST';
select ok(not pg_temp.can_review(97005,'daily'),'disabled GUEST grant revokes admission');
insert into public.workspace_default_permissions(ws_id,member_type,permission,enabled)
  values(pg_temp.fid(97011),'GUEST','admin',true)
  on conflict(ws_id,member_type,permission) do update set enabled=true;
select ok(pg_temp.can_review(97005),'GUEST typed admin follows app permission semantics');
select ok(pg_temp.can_review(97005,'daily'),'GUEST admin includes post approval');
update public.workspace_role_permissions set enabled=false where role_id=pg_temp.fid(97201);
select ok(not pg_temp.can_review(97003),'disabled MEMBER role grant revokes admission');
insert into public.workspace_default_permissions(ws_id,member_type,permission,enabled)
  values(pg_temp.fid(97011),'MEMBER','approve_reports',true)
  on conflict(ws_id,member_type,permission) do update set enabled=true;
select ok(pg_temp.can_review(97003),'MEMBER typed explicit default admitted');
update public.workspace_default_permissions set enabled=false where ws_id=pg_temp.fid(97011) and member_type='MEMBER';
insert into public.workspace_role_permissions(role_id,ws_id,permission,enabled)
  values(pg_temp.fid(97201),pg_temp.fid(97011),'admin',true);
select ok(pg_temp.can_review(97003,'daily'),'MEMBER role admin follows app semantics');
update public.workspace_default_permissions set enabled=false where ws_id=pg_temp.fid(97011) and member_type='GUEST';
select ok(not pg_temp.can_review(97004),'GUEST still cannot borrow role admin');
delete from public.workspace_members where ws_id=pg_temp.fid(97011) and user_id=pg_temp.fid(97003);
select ok(not pg_temp.can_review(97003),'revoked membership denies role admin');
delete from auth.users where id=pg_temp.fid(97005);
select ok(not pg_temp.can_review(97005),'deleted actor cannot acquire new admission');

insert into public.workspace_user_groups(id,ws_id,name) values(pg_temp.fid(97301),pg_temp.fid(97011),'Synthetic group'),(pg_temp.fid(97302),pg_temp.fid(97011),'Synthetic second group');
insert into private.external_user_monthly_reports(id,user_id,group_id,title,content,feedback,updated_at,review_revision)
 values(pg_temp.fid(97401),pg_temp.fid(97107),pg_temp.fid(97301),'Initial','Observed','Next step',now(),99);
select is((select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401)),1::bigint,'INSERT ignores forged version');
update private.external_user_monthly_reports set review_revision=900,delivery_status='draft' where id=pg_temp.fid(97401);
select is((select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401)),1::bigint,'bookkeeping-only UPDATE cannot forge version');
create function pg_temp.patch_report(p jsonb) returns bigint language plpgsql as $$
declare r private.external_user_monthly_reports;
begin
  select (jsonb_populate_record(x,p)).* into r from private.external_user_monthly_reports x where x.id=pg_temp.fid(97401);
  update private.external_user_monthly_reports set title=r.title,content=r.content,feedback=r.feedback,
    user_id=r.user_id,group_id=r.group_id,creator_id=r.creator_id,score=r.score,scores=r.scores,cadence=r.cadence,period_start=r.period_start,period_end=r.period_end,
    manager_instruction=r.manager_instruction,generation_mode=r.generation_mode,generation_status=r.generation_status,
    source_context=r.source_context,report_approval_status=r.report_approval_status,approved_at=r.approved_at,
    approved_by=r.approved_by,rejected_at=r.rejected_at,rejected_by=r.rejected_by,rejection_reason=r.rejection_reason,
    review_revision=900 where id=r.id;
  return (select review_revision from private.external_user_monthly_reports where id=r.id);
end; $$;
create function pg_temp.assert_patch(p jsonb) returns text language plpgsql as $$
declare before_revision bigint;
begin
  select review_revision into before_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401);
  return is(pg_temp.patch_report(p),before_revision+1,'review change increments once: '||p::text);
end; $$;
select pg_temp.assert_patch(p) from (values
  ('{"title":"Changed","content":"Changed"}'::jsonb),
  (jsonb_build_object('user_id',pg_temp.fid(97106))),
  (jsonb_build_object('creator_id',pg_temp.fid(97101))),
  (jsonb_build_object('creator_id',pg_temp.fid(97106))),
  ('{"creator_id":null}'::jsonb),
  (jsonb_build_object('group_id',pg_temp.fid(97302))),
  ('{"feedback":"Changed"}'::jsonb),('{"score":4}'::jsonb),('{"scores":[2,4]}'::jsonb),
  ('{"scores":null}'::jsonb),('{"cadence":"weekly","period_start":"2026-10-01","period_end":"2026-10-07"}'::jsonb),('{"period_start":"2026-10-02"}'::jsonb),
  ('{"period_end":"2026-10-08"}'::jsonb),('{"manager_instruction":"Human review"}'::jsonb),
  ('{"manager_instruction":null}'::jsonb),('{"generation_mode":"ai"}'::jsonb),
  ('{"generation_status":"generating"}'::jsonb),('{"source_context":{"evidence":"synthetic"}}'::jsonb),
  (jsonb_build_object('report_approval_status','APPROVED','approved_by',pg_temp.fid(97106),'approved_at','2026-10-06T00:00:00Z')),('{"approved_at":"2026-10-07T00:00:00Z"}'::jsonb),
  (jsonb_build_object('approved_by',pg_temp.fid(97101))),
  (jsonb_build_object('rejected_by',pg_temp.fid(97101))),
  ('{"rejected_at":"2026-10-07T01:00:00Z"}'::jsonb),
  ('{"rejection_reason":"Review again"}'::jsonb)
) changes(p);
-- Retain the actual historical period constraint while testing revision changes.
create temp table pre_invalid_period_revision as select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401);
select throws_ok($q$select pg_temp.patch_report('{"period_end":null}'::jsonb)$q$,'23514',null,'one-sided period rejected by actual constraint');
select throws_ok($q$select pg_temp.patch_report('{"period_end":"2026-10-01"}'::jsonb)$q$,'23514',null,'reversed period rejected by actual constraint');
select is((select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401)),(select review_revision from pre_invalid_period_revision),'invalid periods leave revision unchanged');

-- Approval consistency is a historical constraint, not a receipt admission rule.
create temp table pre_invalid_approval_revision as select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401);
select throws_ok($q$select pg_temp.patch_report('{"approved_by":null}'::jsonb)$q$,'23514',null,'approved status requires actor');
select throws_ok($q$select pg_temp.patch_report('{"approved_at":null}'::jsonb)$q$,'23514',null,'approved status requires timestamp');
select throws_ok($q$select pg_temp.patch_report('{"report_approval_status":"PENDING"}'::jsonb)$q$,'23514',null,'pending status rejects leftover approval metadata');
select is((select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401)),(select review_revision from pre_invalid_approval_revision),'invalid approval metadata leaves revision unchanged');
create temp table pre_service_revision as select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401);
set local role service_role;
update private.external_user_monthly_reports set review_revision=777,last_delivery_error='Trusted server bookkeeping'
 where id='00000000-0000-4000-8000-000000097401';
reset role;
select is((select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401)),(select review_revision from pre_service_revision),'actual trusted service bookkeeping cannot forge version');
create temp table saved_revision as select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401);
update private.external_user_monthly_reports set delivered_at=now(),last_delivery_error='Synthetic bookkeeping',review_revision=400 where id=pg_temp.fid(97401);
select is((select review_revision from private.external_user_monthly_reports where id=pg_temp.fid(97401)),(select review_revision from saved_revision),'delivery bookkeeping preserves review version');
-- Execute the actual overflow branch without disabling any product trigger.
create temp table revision_overflow(review_revision bigint,title text);
insert into revision_overflow values(9223372036854775807,'Original');
create trigger revision_test before update on revision_overflow for each row execute function private.advance_report_review_revision('title');
select throws_ok($q$update revision_overflow set title='Changed'$q$,'22003',null,'bigint overflow fails closed');
select is((select title from revision_overflow),'Original','overflow rolls back mutation');

insert into private.user_group_posts(id,group_id,title,content,notes,review_revision)
 values(pg_temp.fid(97501),pg_temp.fid(97301),'Daily','Observed','Human',100);
insert into private.user_group_post_checks(post_id,user_id,is_completed,notes,review_revision)
 values(pg_temp.fid(97501),pg_temp.fid(97107),true,'Human',100);
select is((select review_revision from private.user_group_posts where id=pg_temp.fid(97501)),1::bigint,'daily parent INSERT cannot forge version');
select is((select review_revision from private.user_group_post_checks where post_id=pg_temp.fid(97501) and user_id=pg_temp.fid(97107)),1::bigint,'daily check INSERT cannot forge version');
update private.user_group_posts set notes='Changed',review_revision=100 where id=pg_temp.fid(97501);
update private.user_group_post_checks set notes='Changed',is_completed=false,review_revision=100 where post_id=pg_temp.fid(97501) and user_id=pg_temp.fid(97107);
select is((select review_revision from private.user_group_posts where id=pg_temp.fid(97501)),2::bigint,'daily parent review changes increment');
select is((select review_revision from private.user_group_post_checks where post_id=pg_temp.fid(97501) and user_id=pg_temp.fid(97107)),2::bigint,'daily check changes increment once');
insert into public.sent_emails(id,ws_id,receiver_id,sender_id,content,email,source_email,source_name,subject)
 values(pg_temp.fid(97502),pg_temp.fid(97011),pg_temp.fid(97107),pg_temp.fid(97001),
 'Synthetic','recipient@example.invalid','sender@example.invalid','Synthetic','Synthetic');
update private.user_group_post_checks set email_id=pg_temp.fid(97502),review_revision=99 where post_id=pg_temp.fid(97501) and user_id=pg_temp.fid(97107);
select is((select review_revision from private.user_group_post_checks where post_id=pg_temp.fid(97501) and user_id=pg_temp.fid(97107)),2::bigint,'daily email bookkeeping cannot forge version');

select ok((select proconfig @> ARRAY['search_path=""'] from pg_proc where oid='private.advance_report_review_revision()'::regprocedure),'revision helper has empty search path');
select ok(not (select prosecdef from pg_proc where oid='private.advance_report_review_revision()'::regprocedure),'revision trigger remains invoker');
select is((select tgname::text from pg_trigger where tgrelid='private.external_user_monthly_reports'::regclass
 and not tgisinternal and (tgtype & 2)=2 order by tgname desc limit 1),'zz_report_review_revision','version observes final existing BEFORE trigger mutations');
select is((select tgname::text from pg_trigger where tgrelid='private.user_group_posts'::regclass
 and not tgisinternal and (tgtype & 2)=2 order by tgname desc limit 1),'zz_report_review_revision','daily parent revision runs after existing BEFORE triggers');
select is((select tgname::text from pg_trigger where tgrelid='private.user_group_post_checks'::regclass
 and not tgisinternal and (tgtype & 2)=2 order by tgname desc limit 1),'zz_report_review_revision','daily check revision runs after existing BEFORE triggers');
select ok((select relrowsecurity from pg_class where oid='private.report_review_receipts'::regclass),'receipt RLS enabled');
select ok(not has_table_privilege('authenticated','private.report_review_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'customer cannot read or write receipts');
select ok(not has_table_privilege('anon','private.report_review_receipts','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'anonymous cannot access receipts');
select ok(not has_table_privilege('service_role','private.report_review_receipts','INSERT,UPDATE,DELETE,TRUNCATE'),'service cannot bypass future canonical approval');
select ok(has_table_privilege('service_role','private.report_review_receipts','SELECT'),'trusted service audit reads permitted');
select ok(not has_function_privilege('authenticated','private.can_review_report_entry(uuid,uuid,uuid,text)','EXECUTE'),'customer cannot call trusted predicate');
select ok(not has_function_privilege('anon','private.report_review_delivery_ready(uuid)','EXECUTE'),'anonymous cannot probe readiness');
select ok(not private.report_review_delivery_ready(pg_temp.fid(97401)),'plausible legacy APPROVED is not a receipt');
select is((select count(*) from private.report_review_receipts),0::bigint,'ordinary source mutations minted no receipts');
create function pg_temp.receipt(digest text default repeat('a',64),kind text default 'periodic',parent_revision bigint default null,recipient_digest text default repeat('b',64)) returns void language sql as $$
 insert into private.report_review_receipts(kind,ws_id,subject_user_id,group_id,report_id,post_id,
   review_revision,parent_review_revision,reviewed_payload_sha256,recipient_sha256,actor_auth_uid,
   actor_workspace_user_id,required_permission,action_id)
 values(kind,pg_temp.fid(97011),pg_temp.fid(97107),pg_temp.fid(97301),
   case when kind='periodic' then pg_temp.fid(97401) end,case when kind='daily' then pg_temp.fid(97501) end,
   2,parent_revision,digest,recipient_digest,pg_temp.fid(97001),pg_temp.fid(97101),
   case when kind='periodic' then 'approve_reports' else 'approve_posts' end,gen_random_uuid());
$$;
select throws_ok($q$select pg_temp.receipt('nonempty')$q$,'23514',null,'non-SHA256 digest rejected');
select throws_ok($q$select pg_temp.receipt(repeat('A',64))$q$,'23514',null,'uppercase digest rejected for canonical format');
select throws_ok($q$select pg_temp.receipt(repeat('a',63))$q$,'23514',null,'short digest rejected');
select throws_ok($q$select pg_temp.receipt(repeat('a',64)||chr(10))$q$,'23514',null,'trailing newline cannot pass canonical digest');
select throws_ok($q$select pg_temp.receipt(repeat('a',65))$q$,'23514',null,'oversized digest rejected');
select throws_ok($q$select pg_temp.receipt(repeat('a',64),'daily',null)$q$,'23514',null,'daily parent revision cannot be absent');
select throws_ok($q$select pg_temp.receipt(repeat('a',64),'periodic',null,'invalid')$q$,'23514',null,'invalid recipient digest rejected');
select pg_temp.receipt();
select pg_temp.receipt(repeat('c',64),'daily',2);
select throws_ok($q$insert into private.report_review_receipts(kind,ws_id,subject_user_id,group_id,report_id,review_revision,
 reviewed_payload_sha256,recipient_sha256,actor_auth_uid,actor_workspace_user_id,required_permission,action_id)
 select kind,ws_id,subject_user_id,group_id,report_id,review_revision,reviewed_payload_sha256,recipient_sha256,
 actor_auth_uid,actor_workspace_user_id,required_permission,action_id from private.report_review_receipts where kind='periodic'$q$,
 '23505',null,'same action and entry cannot duplicate receipt');
select ok(not private.report_review_delivery_ready(pg_temp.fid(97401)),'even privileged synthetic receipt cannot activate readiness');
select throws_ok($q$update private.report_review_receipts set review_revision=3$q$,'55000','Review receipts are immutable','receipt update blocked');
select throws_ok($q$delete from private.report_review_receipts$q$,'55000','Review receipts are immutable','receipt delete blocked');
select throws_ok($q$truncate private.report_review_receipts$q$,'55000','Review receipts are immutable','receipt truncate blocked');
select is((select count(*) from pg_constraint where conrelid='private.report_review_receipts'::regclass and contype='f'),0::bigint,'snapshot receipts have no teardown-blocking live FKs');
delete from private.external_user_monthly_reports where id=pg_temp.fid(97401);
delete from private.user_group_posts where id=pg_temp.fid(97501);
select is((select count(*) from private.report_review_receipts),2::bigint,'authorized parent teardown preserves receipt history');
delete from public.sent_emails where id=pg_temp.fid(97502);
delete from public.workspaces where id=pg_temp.fid(97011);
select is((select count(*) from private.report_review_receipts),2::bigint,'tenant teardown is unblocked and preserves history');
select ok(not pg_temp.can_review(97001),'historical receipt cannot restore creator access after teardown');
select * from finish();
rollback;
