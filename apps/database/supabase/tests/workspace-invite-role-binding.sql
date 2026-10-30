BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(8);
SELECT set_config('request.jwt.claims', '{}', true);
INSERT INTO auth.users(id) SELECT ('9c730201-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid FROM generate_series(1,8) n;
INSERT INTO public.users(id) SELECT ('9c730201-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid FROM generate_series(1,8) n ON CONFLICT DO NOTHING;
INSERT INTO public.workspaces(id,name,creator_id,personal) VALUES
 ('9c730201-0000-4000-8000-000000000010','Invite role A','9c730201-0000-4000-8000-000000000001',false),
 ('9c730201-0000-4000-8000-000000000011','Invite role B','9c730201-0000-4000-8000-000000000001',false);
DELETE FROM public.workspace_default_permissions WHERE ws_id='9c730201-0000-4000-8000-000000000010';
INSERT INTO public.workspace_members(ws_id,user_id,type) VALUES
 ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000002','MEMBER'),
 ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000003','MEMBER');
INSERT INTO public.workspace_roles(id,ws_id,name) VALUES
 ('9c730201-0000-4000-8000-000000000020','9c730201-0000-4000-8000-000000000010','Members manager'),
 ('9c730201-0000-4000-8000-000000000021','9c730201-0000-4000-8000-000000000010','Members and roles manager'),
 ('9c730201-0000-4000-8000-000000000022','9c730201-0000-4000-8000-000000000010','Local member'),
 ('9c730201-0000-4000-8000-000000000023','9c730201-0000-4000-8000-000000000010','Local admin'),
 ('9c730201-0000-4000-8000-000000000024','9c730201-0000-4000-8000-000000000011','Foreign role');
INSERT INTO public.workspace_role_permissions(ws_id,role_id,permission,enabled) VALUES
 ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000020','manage_workspace_members',true),
 ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000021','manage_workspace_members',true),
 ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000021','manage_workspace_roles',true),
 ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000023','admin',true);
INSERT INTO public.workspace_role_members(role_id,user_id) VALUES
 ('9c730201-0000-4000-8000-000000000020','9c730201-0000-4000-8000-000000000002'),
 ('9c730201-0000-4000-8000-000000000021','9c730201-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"9c730201-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
SELECT ok(public.has_workspace_permission('9c730201-0000-4000-8000-000000000010',auth.uid(),'manage_workspace_members') AND NOT public.has_workspace_permission('9c730201-0000-4000-8000-000000000010',auth.uid(),'manage_workspace_roles'),'fixture has members permission only');
SELECT throws_ok($$INSERT INTO public.workspace_invites(ws_id,user_id,type,role_id) VALUES ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000004','MEMBER','9c730201-0000-4000-8000-000000000022')$$,'42501',null,'members manager cannot assign a role through an invite');
SELECT throws_ok($$INSERT INTO public.workspace_invites(ws_id,user_id,type,role_id) VALUES ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000004','MEMBER','9c730201-0000-4000-8000-000000000023')$$,'42501',null,'members manager cannot assign an admin role');
SELECT lives_ok($$INSERT INTO public.workspace_invites(ws_id,user_id,type) VALUES ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000004','MEMBER')$$,'members manager can invite without assigning a role');
SELECT set_config('request.jwt.claims','{"sub":"9c730201-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
SELECT throws_ok($$INSERT INTO public.workspace_invites(ws_id,user_id,type,role_id) VALUES ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000005','MEMBER','9c730201-0000-4000-8000-000000000024')$$,'42501',null,'role manager cannot assign a role from another workspace');
SELECT throws_ok($$INSERT INTO public.workspace_invites(ws_id,user_id,type,role_id) VALUES ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000005','GUEST','9c730201-0000-4000-8000-000000000022')$$,'42501',null,'a role requires a MEMBER invite');
SELECT lives_ok($$INSERT INTO public.workspace_invites(ws_id,user_id,type,role_id) VALUES ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000005','MEMBER','9c730201-0000-4000-8000-000000000022')$$,'members and roles manager can assign a same-workspace role');
SELECT throws_ok($$INSERT INTO public.workspace_invites(ws_id,user_id,type,role_id) VALUES ('9c730201-0000-4000-8000-000000000010','9c730201-0000-4000-8000-000000000002','MEMBER','9c730201-0000-4000-8000-000000000022')$$,'42501',null,'a current member cannot be invited with a role');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
