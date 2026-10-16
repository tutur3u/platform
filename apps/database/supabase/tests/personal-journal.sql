begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000009801'),('00000000-0000-4000-8000-000000009802');
insert into public.users(id) values('00000000-0000-4000-8000-000000009801'),('00000000-0000-4000-8000-000000009802') on conflict do nothing;
-- Signup creates the unique personal workspace. Derive and verify that scope;
-- creating a second synthetic personal workspace would violate the live contract.
create function pg_temp.personal_workspace() returns uuid language sql stable as $$
 select w.id from public.workspaces w join public.workspace_members m on m.ws_id=w.id
 where w.personal and w.creator_id='00000000-0000-4000-8000-000000009801'
 and m.user_id=w.creator_id and m.type='MEMBER' and not coalesce(w.deleted,false)
$$;
select ok(pg_temp.personal_workspace() is not null,'signup provides one actual owner-member personal workspace');
create function pg_temp.document(p_body text default 'Original source') returns jsonb language sql as $$
 select jsonb_build_object('title','Synthetic reflection','body',p_body,'occurredAt','2026-10-12T10:00:00.000Z','timezone','Asia/Ho_Chi_Minh',
 'mood','good','moodContext','User chose this mood','domain','life','category','reflection')
$$;
create function pg_temp.write_entry(p_revision integer,p_operation uuid,p_body text default 'Original source') returns jsonb language sql as $$
 select private.write_personal_journal('00000000-0000-4000-8000-000000009801',pg_temp.personal_workspace(),
 '00000000-0000-4000-8000-000000009821',p_operation,p_revision,pg_temp.document(p_body))
$$;
select ok(not has_table_privilege('authenticated','private.personal_journal_entries','SELECT'),'authenticated cannot read journals directly');
select ok(not has_table_privilege('anon','private.personal_journal_entries','SELECT'),'anonymous cannot read journals');
select ok(not has_function_privilege('authenticated','private.write_personal_journal(uuid,uuid,uuid,uuid,integer,jsonb)','EXECUTE'),'caller cannot forge actor RPC');
select ok(not has_table_privilege('service_role','private.personal_journal_revisions','UPDATE'),'service cannot rewrite history');
select ok(not has_table_privilege('service_role','private.personal_journal_revisions','DELETE'),'service cannot delete history directly');
select is(pg_temp.write_entry(0,'00000000-0000-4000-8000-000000009821')->>'revision','1','create acknowledges revision one');
select is(pg_temp.write_entry(0,'00000000-0000-4000-8000-000000009821')->>'body','Original source','exact create replay reads original receipt');
select is((select count(*) from private.personal_journal_revisions),1::bigint,'create replay creates no duplicate history');
select throws_ok($$select pg_temp.write_entry(0,'00000000-0000-4000-8000-000000009821','Different source')$$,'40001',null,'same create ID with different body conflicts');
select is(pg_temp.write_entry(1,'00000000-0000-4000-8000-000000009822','Edited source')->>'revision','2','atomic edit advances revision');
select is(pg_temp.write_entry(1,'00000000-0000-4000-8000-000000009822','Edited source')->>'revision','2','unknown-outcome retry returns same edit receipt');
select throws_ok($$select pg_temp.write_entry(1,'00000000-0000-4000-8000-000000009823','Stale edit')$$,'40001',null,'stale independent edit conflicts');
select is((select entry_snapshot->>'body' from private.personal_journal_revisions where revision=1),'Original source','original history remains intact');
select is((select count(*) from private.personal_journal_revisions),2::bigint,'conflict and replay add no revisions');
select is(private.read_personal_journal('00000000-0000-4000-8000-000000009801',pg_temp.personal_workspace(),'00000000-0000-4000-8000-000000009821')->>'body','Edited source','owner reads actual edited source');
select throws_ok($$select private.read_personal_journal('00000000-0000-4000-8000-000000009802',pg_temp.personal_workspace(),'00000000-0000-4000-8000-000000009821')$$,'42501',null,'foreign actor is denied');
select is(jsonb_array_length(private.list_personal_journal('00000000-0000-4000-8000-000000009801',pg_temp.personal_workspace())->'items'),1,'owner timeline contains original journal source');
select ok(not private.personal_journal_valid_document(pg_temp.document() || '{"timezone":"unknown/zone"}'),'invalid timezone fails document validation');
select ok(not private.personal_journal_valid_document(pg_temp.document() || '{"mood":"diagnosis"}'),'unsupported inferred or diagnostic mood fails');
select ok(not private.personal_journal_valid_document(pg_temp.document() || '{"public":true}'),'sharing extras cannot enter document');
create temp table journal_revoked_scope as select pg_temp.personal_workspace() as ws_id;
update public.workspaces set deleted=true where id=(select ws_id from journal_revoked_scope);
select throws_ok($$select private.write_personal_journal('00000000-0000-4000-8000-000000009801',(select ws_id from journal_revoked_scope),'00000000-0000-4000-8000-000000009821','00000000-0000-4000-8000-000000009824',2,pg_temp.document('Revoked edit'))$$,'42501',null,'workspace scope revocation blocks writes');
select throws_ok($$select private.read_personal_journal('00000000-0000-4000-8000-000000009801',(select ws_id from journal_revoked_scope),'00000000-0000-4000-8000-000000009821')$$,'42501',null,'revoked workspace blocks original-content reads');
select throws_ok($$select private.write_personal_journal('00000000-0000-4000-8000-000000009801',(select ws_id from journal_revoked_scope),'00000000-0000-4000-8000-000000009821','00000000-0000-4000-8000-000000009821',0,pg_temp.document())$$,'42501',null,'revoked workspace blocks replay of an earlier successful receipt');
select * from finish();
rollback;
