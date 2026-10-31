begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
-- Match installed Storage fixtures; the transaction rolls back all changes.
set local storage.allow_delete_query = 'true';
select no_plan();
insert into auth.users(id) values ('5707a6e0-0000-4000-8000-000000008801');
insert into public.users(id) values ('5707a6e0-0000-4000-8000-000000008801') on conflict do nothing;
insert into public.workspaces(id,name,personal,creator_id)
values ('5707a6e0-0000-4000-8000-000000008811','Storage insert test',false,'5707a6e0-0000-4000-8000-000000008801');
insert into public.workspace_members(ws_id,user_id,type)
values ('5707a6e0-0000-4000-8000-000000008811','5707a6e0-0000-4000-8000-000000008801','MEMBER') on conflict do nothing;
insert into public.support_inquiries(id,name,email,subject,message,creator_id)
values ('5707a6e0-0000-4000-8000-000000008821','Test','test@example.invalid','Test','Test','5707a6e0-0000-4000-8000-000000008801');
insert into private.time_tracking_requests(id,workspace_id,user_id,title,start_time,end_time)
values ('5707a6e0-0000-4000-8000-000000008831','5707a6e0-0000-4000-8000-000000008811','5707a6e0-0000-4000-8000-000000008801','Test',now()-interval '1 hour',now());
insert into storage.buckets(id,name) values ('storage-test-other','storage-test-other');
insert into storage.objects(bucket_id,name) values ('devbox-code-archives','existing'),('devbox-run-artifacts','existing');
create policy storage_test_select on storage.objects for select to authenticated using (true);
create policy storage_test_update on storage.objects for update to authenticated using (true) with check (true);
create policy storage_test_delete on storage.objects for delete to authenticated using (true);
select set_config('request.jwt.claims','{"sub":"5707a6e0-0000-4000-8000-000000008801","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$insert into storage.objects(bucket_id,name) values ('changelog','denied')$$,'42501',null,'changelog client insert follows bucket contract');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('devbox-code-archives','denied')$$,'42501',null,'devbox-code-archives client insert follows bucket contract');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('devbox-run-artifacts','denied')$$,'42501',null,'devbox-run-artifacts client insert follows bucket contract');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('storage-test-other','denied')$$,'42501',null,'storage-test-other client insert follows bucket contract');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('avatars','denied')$$,'42501',null,'avatars client insert follows bucket contract');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('banners','denied')$$,'42501',null,'banners client insert follows bucket contract');
select throws_ok($$insert into storage.buckets(id,name,public) values ('client-created','client-created',true)$$,'42501',null,'client bucket creation is denied');
select lives_ok($$insert into storage.objects(bucket_id,name) values ('workspaces','5707a6e0-0000-4000-8000-000000008811/project-updates/test.png')$$,'workspaces authorized client upload works');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('support_inquiries','5707a6e0-0000-4000-8000-000000008821/test.png')$$,'42501',null,'support_inquiries client upload requires a server-issued ticket');
select throws_ok($$insert into storage.objects(bucket_id,name) values ('time_tracking_requests','5707a6e0-0000-4000-8000-000000008831/test.png')$$,'42501',null,'time_tracking_requests client upload requires a server-issued ticket');
with affected as (update storage.objects set name='changed' where bucket_id='devbox-code-archives' and name='existing' returning 1) select is(count(*),0::bigint,'devbox-code-archives client update affects no rows') from affected;
with affected as (delete from storage.objects where bucket_id='devbox-code-archives' and name='existing' returning 1) select is(count(*),0::bigint,'devbox-code-archives client delete affects no rows') from affected;
with affected as (update storage.objects set name='changed' where bucket_id='devbox-run-artifacts' and name='existing' returning 1) select is(count(*),0::bigint,'devbox-run-artifacts client update affects no rows') from affected;
with affected as (delete from storage.objects where bucket_id='devbox-run-artifacts' and name='existing' returning 1) select is(count(*),0::bigint,'devbox-run-artifacts client delete affects no rows') from affected;
reset role;
insert into public.workspaces(id,name,personal) values ('00000000-0000-0000-0000-000000000000','Root test',false) on conflict do nothing;
insert into public.workspace_members(ws_id,user_id,type) values ('00000000-0000-0000-0000-000000000000','5707a6e0-0000-4000-8000-000000008801','MEMBER') on conflict do nothing;
set local role authenticated;
select lives_ok($$insert into storage.objects(bucket_id,name) values ('changelog','staff-test.png')$$,'root workspace member can upload changelog media');
reset role;
select ok(not has_table_privilege('authenticated','public.support_inquiries','SELECT'),'inquiry table SELECT remains server-owned');
select ok(not has_table_privilege('authenticated','private.time_tracking_requests','SELECT'),'time request table SELECT remains server-owned');
-- Upload-url routes issue signed tickets using createDynamicAdminClient.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select lives_ok($$insert into storage.objects(bucket_id,name) values ('support_inquiries','5707a6e0-0000-4000-8000-000000008801/server-test.png')$$,'inquiry service upload remains supported');
select lives_ok($$insert into storage.objects(bucket_id,name) values ('time_tracking_requests','5707a6e0-0000-4000-8000-000000008831/server-test.png')$$,'time request service upload remains supported');
select lives_ok($$insert into storage.objects(bucket_id,name) values ('workspaces','5707a6e0-0000-4000-8000-000000008811/project-updates/server-test.png')$$,'workspace service upload remains supported');
select lives_ok($$insert into storage.objects(bucket_id,name) values ('changelog','server-test.png')$$,'changelog service upload remains supported');
reset role;
select * from finish();
rollback;
