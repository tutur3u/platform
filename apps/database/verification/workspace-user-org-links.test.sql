BEGIN;
SELECT no_plan();
SELECT has_table('public', 'workspace_user_org_links', 'org links table exists');
INSERT INTO auth.users(id) VALUES ('c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000002'),('c1000000-0000-4000-8000-000000000003');
INSERT INTO public.workspaces(id, creator_id) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000001'),('c1000000-0000-4000-8000-000000000099','c1000000-0000-4000-8000-000000000003');
INSERT INTO public.workspace_members(ws_id,user_id,type) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000001','MEMBER'),('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000002','MEMBER');
INSERT INTO public.workspace_roles(id,ws_id) VALUES ('c1000000-0000-4000-8000-000000000010','00000000-0000-0000-0000-000000000000');
INSERT INTO private.mastermind_access_role(role_id) VALUES ('c1000000-0000-4000-8000-000000000010');
INSERT INTO public.workspace_role_members(role_id,user_id) VALUES ('c1000000-0000-4000-8000-000000000010','c1000000-0000-4000-8000-000000000001');
INSERT INTO public.workspace_role_permissions(ws_id,role_id,permission,enabled) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000010','manage_mastermind',true);
INSERT INTO public.workspace_users(id,ws_id) VALUES ('c1000000-0000-4000-8000-000000000020','00000000-0000-0000-0000-000000000000'),('c1000000-0000-4000-8000-000000000021','c1000000-0000-4000-8000-000000000099');
   INSERT INTO auth.users(id) VALUES ('c1000000-0000-4000-8000-000000000004'),('c1000000-0000-4000-8000-000000000005');
   UPDATE public.workspaces SET creator_id='c1000000-0000-4000-8000-000000000005' WHERE id='00000000-0000-0000-0000-000000000000';
   INSERT INTO public.workspace_members(ws_id,user_id,type) VALUES
     ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000004','MEMBER'),
     ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000005','MEMBER');
   INSERT INTO public.workspace_roles(id,ws_id) VALUES
     ('c1000000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000'),  -- Contacts-only
     ('c1000000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000');  -- admin + unrecorded manage_mastermind
   INSERT INTO public.workspace_role_members(role_id,user_id) VALUES
     ('c1000000-0000-4000-8000-000000000011','c1000000-0000-4000-8000-000000000004'),
     ('c1000000-0000-4000-8000-000000000012','c1000000-0000-4000-8000-000000000005');
   INSERT INTO public.workspace_role_permissions(ws_id,role_id,permission,enabled) VALUES
     ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000011','manage_users',true),
     ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000012','admin',true),
     ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000012','manage_mastermind',true);

   CREATE TEMP TABLE mfa_canonical(id int);
   CREATE POLICY canonical ON mfa_canonical USING ((SELECT public.account_required_mfa_satisfied())) WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
   SELECT is((SELECT pg_get_expr(polqual,polrelid)||'|'||pg_get_expr(polwithcheck,polrelid) FROM pg_policy WHERE polrelid='public.workspace_user_org_links'::regclass AND polname='account_required_mfa' AND NOT polpermissive AND polcmd='*'),
             (SELECT pg_get_expr(polqual,polrelid)||'|'||pg_get_expr(polwithcheck,polrelid) FROM pg_policy WHERE polrelid='mfa_canonical'::regclass AND polname='canonical'),
             'account_required_mfa uses the canonical expression');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000020','team','engineering','member_of')$q$,'authorized insert');
SELECT is((SELECT count(*) FROM public.workspace_user_org_links),1::bigint,'authorized read');
SELECT lives_ok($q$UPDATE public.workspace_user_org_links SET title='Lead'$q$,'authorized update');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
SELECT is((SELECT count(*) FROM public.workspace_user_org_links),0::bigint,'member read denied');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000020','team','engineering','member_of')$q$,'42501',NULL,'member insert denied');
WITH changed AS (UPDATE public.workspace_user_org_links SET title='attack' RETURNING *) SELECT is(count(*),0::bigint,'member update denied') FROM changed;
WITH changed AS (DELETE FROM public.workspace_user_org_links RETURNING *) SELECT is(count(*),0::bigint,'member delete denied') FROM changed;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000004","aal":"aal2"}',true);
SELECT is((SELECT count(*) FROM public.workspace_user_org_links),0::bigint,'Contacts-only read denied');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000040','team','engineering','member_of')$q$,'42501',NULL,'Contacts-only insert denied');
WITH changed AS (UPDATE public.workspace_user_org_links SET title='attack' RETURNING *) SELECT is(count(*),0::bigint,'Contacts-only update denied') FROM changed;
WITH changed AS (DELETE FROM public.workspace_user_org_links RETURNING *) SELECT is(count(*),0::bigint,'Contacts-only delete denied') FROM changed;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000005","aal":"aal2"}',true);
SELECT is((SELECT count(*) FROM public.workspace_user_org_links),0::bigint,'creator admin unrecorded role read denied');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000050','team','engineering','member_of')$q$,'42501',NULL,'creator admin unrecorded role insert denied');
WITH changed AS (UPDATE public.workspace_user_org_links SET title='attack' RETURNING *) SELECT is(count(*),0::bigint,'creator admin unrecorded role update denied') FROM changed;
WITH changed AS (DELETE FROM public.workspace_user_org_links RETURNING *) SELECT is(count(*),0::bigint,'creator admin unrecorded role delete denied') FROM changed;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
SELECT is((SELECT count(*) FROM public.workspace_user_org_links),0::bigint,'outsider read denied');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000020','team','engineering','member_of')$q$,'42501',NULL,'outsider insert denied');
WITH changed AS (UPDATE public.workspace_user_org_links SET title='attack' RETURNING *) SELECT is(count(*),0::bigint,'outsider update denied') FROM changed;
WITH changed AS (DELETE FROM public.workspace_user_org_links RETURNING *) SELECT is(count(*),0::bigint,'outsider delete denied') FROM changed;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET created_by='c1000000-0000-4000-8000-000000000002'$q$,'42501',NULL,'creator immutable');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation,created_by) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000020','team','spoof','owns','c1000000-0000-4000-8000-000000000002')$q$,'42501',NULL,'creator spoof denied');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000021','team','foreign','owns')$q$,'23503',NULL,'cross workspace contact denied');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000020','team','engineering','member_of')$q$,'23505',NULL,'duplicate link denied');
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET subject_kind='invalid'$q$,'23514',NULL,'invalid subject_kind rejected');
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET relation='invalid'$q$,'23514',NULL,'invalid relation rejected');
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET subject_key=repeat('a',65)$q$,'23514',NULL,'invalid subject_key rejected');
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET subject_key=''$q$,'23514',NULL,'invalid subject_key rejected');
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET title=repeat('a',81)$q$,'23514',NULL,'invalid title rejected');
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET ws_id='c1000000-0000-4000-8000-000000000099'$q$,'42501',NULL,'non-root update denied by RLS');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000002","aal":"aal2"}',true);
SELECT ok(NOT public.has_workspace_permission('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000001','manage_mastermind'),'permission cannot evaluate forged subject');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
SELECT is((SELECT count(*) FROM public.workspace_user_org_links),0::bigint,'required MFA denies AAL1');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT * FROM public.workspace_user_org_links$q$,'42501',NULL,'anon denied');
SELECT throws_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000020','team','engineering','member_of')$q$,'42501',NULL,'anon denied');
SELECT throws_ok($q$UPDATE public.workspace_user_org_links SET title='anon'$q$,'42501',NULL,'anon denied');
SELECT throws_ok($q$DELETE FROM public.workspace_user_org_links$q$,'42501',NULL,'anon denied');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
WITH removed AS (DELETE FROM public.workspace_user_org_links RETURNING *) SELECT is(count(*),1::bigint,'authorized delete') FROM removed;
SELECT lives_ok($q$INSERT INTO public.workspace_user_org_links(ws_id,workspace_user_id,subject_kind,subject_key,relation) VALUES ('00000000-0000-0000-0000-000000000000','c1000000-0000-4000-8000-000000000020','team','engineering','member_of')$q$,'reinsert for cascade');
RESET ROLE;
DELETE FROM public.workspace_users WHERE id='c1000000-0000-4000-8000-000000000020';
SELECT is((SELECT count(*) FROM public.workspace_user_org_links),0::bigint,'contact deletion cascades');
SELECT * FROM finish();
ROLLBACK;
