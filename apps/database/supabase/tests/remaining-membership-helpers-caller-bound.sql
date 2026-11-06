BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
SELECT set_config('request.jwt.claims', '', true);
SELECT set_config('request.method', '', true);
SELECT set_config('request.headers', '', true);
SELECT set_config('request.path', '', true);
INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at) VALUES
 ('52200000-0000-0000-0000-000000000001','authenticated','authenticated','oracle-actor@example.invalid','{}',now(),now()),
 ('52200000-0000-0000-0000-000000000002','authenticated','authenticated','oracle-target@example.invalid','{}',now(),now()),
 ('52200000-0000-0000-0000-000000000003','authenticated','authenticated','oracle-outsider@example.invalid','{}',now(),now());
INSERT INTO public.users(id) VALUES ('52200000-0000-0000-0000-000000000001'),('52200000-0000-0000-0000-000000000002'),('52200000-0000-0000-0000-000000000003') ON CONFLICT DO NOTHING;
INSERT INTO public.user_private_details(user_id,email) VALUES
 ('52200000-0000-0000-0000-000000000001','oracle-actor@example.invalid'),('52200000-0000-0000-0000-000000000002','oracle-target@example.invalid'),('52200000-0000-0000-0000-000000000003','oracle-outsider@example.invalid')
ON CONFLICT(user_id) DO UPDATE SET email=excluded.email;
INSERT INTO public.platform_user_roles(user_id,enabled,allow_role_management) VALUES
 ('52200000-0000-0000-0000-000000000001',true,false),('52200000-0000-0000-0000-000000000002',true,true),('52200000-0000-0000-0000-000000000003',true,false)
ON CONFLICT(user_id) DO UPDATE SET enabled=true,allow_role_management=excluded.allow_role_management;

SELECT is((SELECT prosecdef FROM pg_proc WHERE oid='public.search_users(text,integer,integer,text,boolean)'::regprocedure),false,'SR-348 search_users remains SECURITY INVOKER');
SELECT is((SELECT count(*) FROM public.workspace_members a JOIN public.workspace_members b USING(ws_id) WHERE a.user_id='52200000-0000-0000-0000-000000000001' AND b.user_id='52200000-0000-0000-0000-000000000003'),0::bigint,'SR-348 outsider is not a workspace co-member');

SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"52200000-0000-0000-0000-000000000001"}',true);
SELECT set_config('request.method','POST',true);
SELECT set_config('request.path','/rpc/search_users',true);
SET LOCAL ROLE authenticated;

RESET ROLE;
SELECT set_config('request.jwt.claims','',true);
SELECT set_config('request.method','',true);
SELECT set_config('request.path','',true);
INSERT INTO public.workspaces(id,name,creator_id) VALUES
 ('52200000-0000-0000-0000-000000000010','Oracle actor workspace','52200000-0000-0000-0000-000000000001'),('52200000-0000-0000-0000-000000000011','Oracle target workspace','52200000-0000-0000-0000-000000000002');
INSERT INTO public.workspace_members(ws_id,user_id,type) VALUES
 ('52200000-0000-0000-0000-000000000010','52200000-0000-0000-0000-000000000001','MEMBER'),('52200000-0000-0000-0000-000000000011','52200000-0000-0000-0000-000000000002','MEMBER')
ON CONFLICT(ws_id,user_id) DO UPDATE SET type='MEMBER';
INSERT INTO public.workspace_invites(ws_id,user_id) VALUES ('52200000-0000-0000-0000-000000000010','52200000-0000-0000-0000-000000000001'),('52200000-0000-0000-0000-000000000011','52200000-0000-0000-0000-000000000002');
INSERT INTO public.workspace_chat_channels(id,ws_id,name,created_by) VALUES ('52200000-0000-0000-0000-000000000020','52200000-0000-0000-0000-000000000011','Oracle fixture','52200000-0000-0000-0000-000000000002');
INSERT INTO public.workspace_chat_participants(channel_id,user_id) VALUES ('52200000-0000-0000-0000-000000000020','52200000-0000-0000-0000-000000000001'),('52200000-0000-0000-0000-000000000020','52200000-0000-0000-0000-000000000002');
INSERT INTO public.hive_members(user_id) VALUES ('52200000-0000-0000-0000-000000000001'),('52200000-0000-0000-0000-000000000002');
UPDATE public.platform_user_roles SET allow_role_management=true WHERE user_id='52200000-0000-0000-0000-000000000001';
INSERT INTO public.task_plans(id,owner_id,personal_ws_id,title,period_type,period_start,period_end) VALUES
 ('52200000-0000-0000-0000-000000000030','52200000-0000-0000-0000-000000000002','52200000-0000-0000-0000-000000000011','Oracle fixture','week','2026-10-26','2026-11-01');
INSERT INTO public.task_plan_workspaces(plan_id,ws_id,added_by_user_id) VALUES ('52200000-0000-0000-0000-000000000030','52200000-0000-0000-0000-000000000010','52200000-0000-0000-0000-000000000002'),('52200000-0000-0000-0000-000000000030','52200000-0000-0000-0000-000000000011','52200000-0000-0000-0000-000000000002');

CREATE TEMP TABLE oracle_cases(finding text,name text,self_call text,target_call text,positive text,denied text);
INSERT INTO oracle_cases VALUES
 ('SR-345','is_workspace_owner', 'public.is_workspace_owner(''52200000-0000-0000-0000-000000000010'',''52200000-0000-0000-0000-000000000001'')', 'public.is_workspace_owner(''52200000-0000-0000-0000-000000000011'',''52200000-0000-0000-0000-000000000002'')', 'true', 'false'),
 ('SR-345','is_member_invited', 'public.is_member_invited(''52200000-0000-0000-0000-000000000001'',''52200000-0000-0000-0000-000000000010'')', 'public.is_member_invited(''52200000-0000-0000-0000-000000000002'',''52200000-0000-0000-0000-000000000011'')', 'true', 'false'),
 ('SR-345','user_is_in_channel', 'public.user_is_in_channel(''52200000-0000-0000-0000-000000000020'',''52200000-0000-0000-0000-000000000001'')', 'public.user_is_in_channel(''52200000-0000-0000-0000-000000000020'',''52200000-0000-0000-0000-000000000002'')', 'true', 'false'),
 ('SR-345','is_hive_member', 'public.is_hive_member(''52200000-0000-0000-0000-000000000001'')', 'public.is_hive_member(''52200000-0000-0000-0000-000000000002'')', 'true', 'false'),
 ('SR-345','is_hive_platform_admin', 'public.is_hive_platform_admin(''52200000-0000-0000-0000-000000000001'')', 'public.is_hive_platform_admin(''52200000-0000-0000-0000-000000000002'')', 'true', 'false'),
 ('SR-345','can_create_workspace', 'public.can_create_workspace(''52200000-0000-0000-0000-000000000001'')', 'public.can_create_workspace(''52200000-0000-0000-0000-000000000002'')', 'true', 'false'),
 ('SR-345','count_user_workspaces', 'public.count_user_workspaces(''52200000-0000-0000-0000-000000000001'')', 'public.count_user_workspaces(''52200000-0000-0000-0000-000000000002'')', '2', '0'),
 ('SR-347','is_personal_workspace', 'public.is_personal_workspace('''||(select id::text from public.workspaces where creator_id='52200000-0000-0000-0000-000000000001' and personal)||''')', 'public.is_personal_workspace('''||(select id::text from public.workspaces where creator_id='52200000-0000-0000-0000-000000000002' and personal)||''')', 'true', NULL),
 ('SR-347','is_task_plan_intended_workspace', 'public.is_task_plan_intended_workspace(''52200000-0000-0000-0000-000000000030'',''52200000-0000-0000-0000-000000000010'')', 'public.is_task_plan_intended_workspace(''52200000-0000-0000-0000-000000000030'',''52200000-0000-0000-0000-000000000011'')', 'true', 'false');
GRANT SELECT ON oracle_cases TO authenticated, service_role;
CREATE FUNCTION pg_temp.oracle_eval(call text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE result text;
BEGIN
  EXECUTE 'SELECT (' || call || ')::text' INTO result;
  RETURN result;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"52200000-0000-0000-0000-000000000001"}',true);
SELECT is(pg_temp.oracle_eval(self_call), positive, name || ': self works') FROM oracle_cases;
SELECT is(pg_temp.oracle_eval(target_call), denied, name || ': foreign target fails closed') FROM oracle_cases;
-- Nested function evaluation keeps self identity and rejects foreign identity.
SELECT is(pg_temp.oracle_eval(self_call), positive, name || ': nested self evaluation works') FROM oracle_cases;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
-- Execute the bodies with anonymous claims as owner: actual anon EXECUTE is revoked.
SELECT is(pg_temp.oracle_eval(target_call), denied, name || ': anonymous claims fail closed') FROM oracle_cases;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT is(pg_temp.oracle_eval(target_call), positive, name || ': service role retains target scope') FROM oracle_cases;
RESET ROLE;
CREATE TEMP TABLE trigger_results(name text, actual text, expected text);
CREATE FUNCTION pg_temp.oracle_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO trigger_results SELECT name, pg_temp.oracle_eval(target_call), positive FROM oracle_cases;
  RETURN NEW;
END;
$$;
CREATE TEMP TABLE trigger_probe(id integer);
CREATE TRIGGER oracle_trigger AFTER INSERT ON trigger_probe FOR EACH ROW EXECUTE FUNCTION pg_temp.oracle_trigger();
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"52200000-0000-0000-0000-000000000001"}',true);
INSERT INTO trigger_probe VALUES (1);
SELECT is(actual, expected, name || ': trigger retains target scope') FROM trigger_results;
SELECT * FROM finish();
ROLLBACK;
