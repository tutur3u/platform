begin;

create extension if not exists pgtap with schema extensions;

set local search_path = public, extensions;

select plan(54);

-- Actors: 1 owner, 2 MEMBER, 3 GUEST, 4 view sharee, 5 board editor,
-- 6 task editor, 7 public viewer, 8 confirmed email, 9 unconfirmed email.

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
  ('33700000-0000-0000-0000-000000000001','authenticated','authenticated','sr337-1@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000002','authenticated','authenticated','sr337-2@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000003','authenticated','authenticated','sr337-3@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000004','authenticated','authenticated','sr337-4@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000005','authenticated','authenticated','sr337-5@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000006','authenticated','authenticated','sr337-6@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000007','authenticated','authenticated','sr337-7@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000008','authenticated','authenticated','sr337-8@example.com',now(),now(),now()),
  ('33700000-0000-0000-0000-000000000009','authenticated','authenticated','sr337-9@example.com',now(),now(),now());

insert into public.users(id) values
  ('33700000-0000-0000-0000-000000000001'),
  ('33700000-0000-0000-0000-000000000002'),
  ('33700000-0000-0000-0000-000000000003'),
  ('33700000-0000-0000-0000-000000000004'),
  ('33700000-0000-0000-0000-000000000005'),
  ('33700000-0000-0000-0000-000000000006'),
  ('33700000-0000-0000-0000-000000000007'),
  ('33700000-0000-0000-0000-000000000008'),
  ('33700000-0000-0000-0000-000000000009') on conflict(id) do nothing;

insert into public.workspaces(id,name,personal,creator_id) values
  ('33700000-0000-0000-0000-000000000100','SR-337/SR-338 authorization',false,'33700000-0000-0000-0000-000000000001'),
  ('33700000-0000-0000-0000-000000000101','Other workspace',false,'33700000-0000-0000-0000-000000000001');

insert into public.workspace_members(ws_id,user_id,type) values
  ('33700000-0000-0000-0000-000000000100','33700000-0000-0000-0000-000000000002','MEMBER'),
  ('33700000-0000-0000-0000-000000000100','33700000-0000-0000-0000-000000000003','GUEST');

update public.workspace_default_permissions set enabled = false where ws_id='33700000-0000-0000-0000-000000000100' and member_type='MEMBER';

insert into public.workspace_default_permissions(ws_id,permission,member_type,enabled) values
  ('33700000-0000-0000-0000-000000000100','manage_projects','MEMBER',true) on conflict(ws_id,permission,member_type) do update set enabled=true;

insert into public.workspace_boards(id,ws_id,name,creator_id) values
  ('33700000-0000-0000-0000-000000000200','33700000-0000-0000-0000-000000000100','Authorization board','33700000-0000-0000-0000-000000000001'),
  ('33700000-0000-0000-0000-000000000201','33700000-0000-0000-0000-000000000101','Other board','33700000-0000-0000-0000-000000000001');

insert into public.task_lists(id,board_id,name,creator_id) values
  ('33700000-0000-0000-0000-000000000300','33700000-0000-0000-0000-000000000200','List 300','33700000-0000-0000-0000-000000000001');

insert into public.task_lists(id,board_id,name,creator_id) values
  ('33700000-0000-0000-0000-000000000301','33700000-0000-0000-0000-000000000200','List 301','33700000-0000-0000-0000-000000000001');

insert into public.task_lists(id,board_id,name,creator_id) values
  ('33700000-0000-0000-0000-000000000302','33700000-0000-0000-0000-000000000200','List 302','33700000-0000-0000-0000-000000000001');

insert into public.task_lists(id,board_id,name,creator_id) values
  ('33700000-0000-0000-0000-000000000303','33700000-0000-0000-0000-000000000200','List 303','33700000-0000-0000-0000-000000000001');

insert into public.task_lists(id,board_id,name,creator_id) values
  ('33700000-0000-0000-0000-000000000304','33700000-0000-0000-0000-000000000200','List 304','33700000-0000-0000-0000-000000000001');

insert into public.tasks(id,list_id,name,creator_id) values
  ('33700000-0000-0000-0000-000000000400','33700000-0000-0000-0000-000000000301','Cascade sentinel','33700000-0000-0000-0000-000000000001'),
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000300','Assignment task','33700000-0000-0000-0000-000000000001');

insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000001');

insert into public.task_board_shares(board_id,shared_with_user_id,permission,shared_by_user_id) values
  ('33700000-0000-0000-0000-000000000200','33700000-0000-0000-0000-000000000004','view','33700000-0000-0000-0000-000000000001'),
  ('33700000-0000-0000-0000-000000000200','33700000-0000-0000-0000-000000000005','edit','33700000-0000-0000-0000-000000000001');

insert into public.task_shares(task_id,shared_with_user_id,permission,shared_by_user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000004','view','33700000-0000-0000-0000-000000000001'),
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000006','edit','33700000-0000-0000-0000-000000000001');

insert into public.task_share_links(task_id,code,created_by_user_id,public_access) values
  ('33700000-0000-0000-0000-000000000401','sr338-public-view','33700000-0000-0000-0000-000000000001','view');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000003","role":"authenticated"}',true);

set local role authenticated;

select is((select count(*)::int from public.task_lists where board_id='33700000-0000-0000-0000-000000000200'),0,'SR-337 guest cannot SELECT unshared lists');

select results_eq($sql$update public.task_lists set name='Guest rename' where id='33700000-0000-0000-0000-000000000300' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-337 guest UPDATE denied');

select results_eq($sql$delete from public.task_lists where id='33700000-0000-0000-0000-000000000301' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-337 guest DELETE denied');

reset role;

select is((select count(*)::int from public.tasks where id='33700000-0000-0000-0000-000000000400'),1,'SR-337 guest cannot trigger task cascade');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000003","role":"authenticated"}',true);

set local role authenticated;

select throws_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'42501',null,'SR-338 guest INSERT denied');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000001' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-338 guest DELETE denied');

reset role;

delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401';

insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000001');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000004","role":"authenticated"}',true);

set local role authenticated;

select throws_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'42501',null,'SR-338 view sharee INSERT denied');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000001' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-338 view sharee DELETE denied');

reset role;

delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401';

insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000001');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000007","role":"authenticated"}',true);

set local role authenticated;

select throws_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'42501',null,'SR-338 public link viewer INSERT denied');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000001' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-338 public link viewer DELETE denied');

reset role;

delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401';

insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000001');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000002","role":"authenticated"}',true);

set local role authenticated;

select is((select count(*)::int from public.task_lists where id='33700000-0000-0000-0000-000000000300'),1,'SR-337 MEMBER can SELECT lists');

select results_eq($sql$update public.task_lists set name='Member rename' where id='33700000-0000-0000-0000-000000000300' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-337 MEMBER with manage_projects can UPDATE');

select lives_ok($sql$insert into public.task_lists(id,board_id,name) values
  ('33700000-0000-0000-0000-000000000305','33700000-0000-0000-0000-000000000200','Member list')$sql$,'SR-337 MEMBER with permission can INSERT');

select results_eq($sql$delete from public.task_lists where id='33700000-0000-0000-0000-000000000302' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-337 MEMBER with permission can DELETE');

select throws_ok($sql$update public.task_lists set board_id='33700000-0000-0000-0000-000000000201' where id='33700000-0000-0000-0000-000000000300'$sql$,'42501',null,'SR-337 moving a list requires target board permission');

reset role;

delete from public.task_share_links where task_id='33700000-0000-0000-0000-000000000401';

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000002","role":"authenticated"}',true);

set local role authenticated;

select lives_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'SR-338 MEMBER with permission can INSERT');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000002' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-338 MEMBER with permission can DELETE');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000005","role":"authenticated"}',true);

set local role authenticated;

select lives_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'SR-338 board edit sharee can INSERT');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000002' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-338 board edit sharee can DELETE');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000006","role":"authenticated"}',true);

set local role authenticated;

select lives_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'SR-338 task edit sharee can INSERT');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000002' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-338 task edit sharee can DELETE');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000004","role":"authenticated"}',true);

set local role authenticated;

select is((select count(*)::int from public.task_lists where id='33700000-0000-0000-0000-000000000300'),1,'SR-337 board view sharee can SELECT');

select results_eq($sql$update public.task_lists set name='View rename' where id='33700000-0000-0000-0000-000000000300' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-337 board view sharee cannot UPDATE');

select results_eq($sql$delete from public.task_lists where id='33700000-0000-0000-0000-000000000303' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-337 board view sharee cannot DELETE');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000005","role":"authenticated"}',true);

set local role authenticated;

select results_eq($sql$update public.task_lists set name='Share rename' where id='33700000-0000-0000-0000-000000000300' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-337 board edit sharee can UPDATE');

select lives_ok($sql$insert into public.task_lists(id,board_id,name) values
  ('33700000-0000-0000-0000-000000000306','33700000-0000-0000-0000-000000000200','Shared list')$sql$,'SR-337 board edit sharee can INSERT');

select results_eq($sql$delete from public.task_lists where id='33700000-0000-0000-0000-000000000306' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-337 board edit sharee can DELETE');

reset role;

update public.workspace_default_permissions set enabled=false where ws_id='33700000-0000-0000-0000-000000000100' and permission='manage_projects';

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000002","role":"authenticated"}',true);

set local role authenticated;

select results_eq($sql$update public.task_lists set name='No permission' where id='33700000-0000-0000-0000-000000000300' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-337 MEMBER without permission cannot UPDATE');

select throws_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'42501',null,'SR-338 MEMBER without permission cannot INSERT');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000001' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-338 MEMBER without permission cannot DELETE');

reset role;

delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000002';

set local role service_role;

select lives_ok($sql$update public.task_lists set name='Service rename' where id='33700000-0000-0000-0000-000000000300'$sql$,'SR-337 service_role UPDATE unaffected');

select lives_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'SR-338 service_role INSERT unaffected');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000002' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-338 service_role DELETE unaffected');

reset role;

insert into public.task_board_shares(board_id,shared_with_email,permission,shared_by_user_id) values
  ('33700000-0000-0000-0000-000000000200','sr337-8@example.com','edit','33700000-0000-0000-0000-000000000001'),
  ('33700000-0000-0000-0000-000000000200','sr337-9@example.com','edit','33700000-0000-0000-0000-000000000001');

update auth.users set email_confirmed_at=null where id='33700000-0000-0000-0000-000000000009';

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000008","role":"authenticated"}',true);

set local role authenticated;

select results_eq($sql$update public.task_lists set name='Verified email editor' where id='33700000-0000-0000-0000-000000000300' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-337 confirmed Auth email edit share permits UPDATE');

select lives_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'SR-338 confirmed board email editor can INSERT');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000002' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-338 confirmed board email editor can DELETE without a public link');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000009","role":"authenticated"}',true);

set local role authenticated;

select is((select count(*)::int from public.task_lists where id='33700000-0000-0000-0000-000000000300'),0,'SR-337 unconfirmed email does not admit a board share');

select throws_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'42501',null,'SR-338 unconfirmed board email cannot INSERT');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000007","role":"authenticated"}',true);

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000007","role":"authenticated","email":"sr337-8@example.com"}',true);

select is((select count(*)::int from public.task_lists where id='33700000-0000-0000-0000-000000000300'),0,'SR-337 JWT email cannot impersonate an Auth recipient');

select throws_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'42501',null,'SR-338 JWT email cannot impersonate an edit share');

reset role;

delete from public.task_board_shares where shared_with_email='sr337-8@example.com';

insert into public.task_shares(task_id,shared_with_email,permission,shared_by_user_id) values
  ('33700000-0000-0000-0000-000000000401','SR337-8@example.com','edit','33700000-0000-0000-0000-000000000001');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000008","role":"authenticated"}',true);

set local role authenticated;

select lives_ok($sql$insert into public.task_assignees(task_id,user_id) values
  ('33700000-0000-0000-0000-000000000401','33700000-0000-0000-0000-000000000002')$sql$,'SR-338 confirmed task email editor can INSERT');

select results_eq($sql$delete from public.task_assignees where task_id='33700000-0000-0000-0000-000000000401' and user_id='33700000-0000-0000-0000-000000000002' returning 1$sql$, $expected$select 1 where true$expected$, 'SR-338 confirmed task email editor can DELETE');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000003","role":"authenticated"}',true);

set local role authenticated;

select throws_ok($sql$insert into public.task_lists(board_id,name) values
  ('33700000-0000-0000-0000-000000000200','Guest insertion')$sql$,'42501',null,'SR-337 guest cannot INSERT');

select ok(public.is_task_board_member(auth.uid(),'33700000-0000-0000-0000-000000000200'),'SR-337 legacy membership read helper remains unchanged');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000004","role":"authenticated"}',true);

set local role authenticated;

select throws_ok($sql$insert into public.task_lists(board_id,name) values
  ('33700000-0000-0000-0000-000000000200','Viewer insertion')$sql$,'42501',null,'SR-337 view sharee cannot INSERT');

reset role;

select set_config('request.jwt.claims', '{"sub":"33700000-0000-0000-0000-000000000002","role":"authenticated"}',true);

set local role authenticated;

select throws_ok($sql$insert into public.task_lists(board_id,name) values
  ('33700000-0000-0000-0000-000000000200','No permission')$sql$,'42501',null,'SR-337 MEMBER without manage_projects cannot INSERT');

select results_eq($sql$delete from public.task_lists where id='33700000-0000-0000-0000-000000000304' returning 1$sql$, $expected$select 1 where false$expected$, 'SR-337 MEMBER without manage_projects cannot DELETE');

reset role;

select ok(not has_table_privilege('anon','public.task_lists','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'SR-337/SR-338 anon has no task_lists grants');

select ok(not has_table_privilege('authenticated','public.task_lists','TRUNCATE,REFERENCES,TRIGGER'),'SR-337/SR-338 authenticated has no non-RLS task_lists grants');

select ok(not has_table_privilege('anon','public.task_assignees','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'SR-337/SR-338 anon has no task_assignees grants');

select ok(not has_table_privilege('authenticated','public.task_assignees','TRUNCATE,REFERENCES,TRIGGER'),'SR-337/SR-338 authenticated has no non-RLS task_assignees grants');

select ok(not has_function_privilege('anon','public.can_access_task_list_board(uuid,boolean)','EXECUTE'),'SR-337 board helper is not anonymous');

select ok(not has_function_privilege('anon','public.can_edit_task_assignees(uuid)','EXECUTE'),'SR-338 assignment helper is not anonymous');

reset role;

select ok(not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='task_lists'),'SR-337 task_lists uses Cloudflare realtime');

select * from finish();

rollback;
