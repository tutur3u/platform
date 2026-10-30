BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(7);
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO auth.users(id,raw_app_meta_data) VALUES ('9c7302c1-0000-4000-8000-000000000001','{}'),('9c7302c1-0000-4000-8000-000000000002','{}');
INSERT INTO public.users(id) VALUES ('9c7302c1-0000-4000-8000-000000000001'),('9c7302c1-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
INSERT INTO public.workspaces(id,name,creator_id,personal) VALUES
 ('9c7302c1-0000-4000-8000-000000000010','Learner current workspace','9c7302c1-0000-4000-8000-000000000001',false),
 ('9c7302c1-0000-4000-8000-000000000011','Learner selected workspace','9c7302c1-0000-4000-8000-000000000001',false),
 ('9c7302c1-0000-4000-8000-000000000012','Learner inaccessible workspace','9c7302c1-0000-4000-8000-000000000002',false);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"9c7302c1-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SELECT lives_ok($$INSERT INTO public.tulearn_learner_state(ws_id,user_id,selected_workspace_id) VALUES ('9c7302c1-0000-4000-8000-000000000010','9c7302c1-0000-4000-8000-000000000001','9c7302c1-0000-4000-8000-000000000011')$$,'learner 14: member can insert own state with an accessible selection');
SELECT is((SELECT count(*) FROM public.tulearn_learner_state WHERE ws_id='9c7302c1-0000-4000-8000-000000000010'),1::bigint,'learner 13: member reads own state');
SELECT lives_ok($$UPDATE public.tulearn_learner_state SET xp_total=10 WHERE ws_id='9c7302c1-0000-4000-8000-000000000010'$$,'learner 15: member updates own state');
SELECT throws_ok($$UPDATE public.tulearn_learner_state SET selected_workspace_id='9c7302c1-0000-4000-8000-000000000012' WHERE ws_id='9c7302c1-0000-4000-8000-000000000010'$$,'42501',null,'learner 16: inaccessible selected workspace is denied');
SELECT throws_ok($$INSERT INTO public.tulearn_learner_state(ws_id,user_id) VALUES ('9c7302c1-0000-4000-8000-000000000012','9c7302c1-0000-4000-8000-000000000001')$$,'42501',null,'learner 17: another users membership cannot authorize a learner state row');
SELECT set_config('request.jwt.claims','{"sub":"9c7302c1-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
SELECT is((SELECT count(*) FROM public.tulearn_learner_state WHERE ws_id='9c7302c1-0000-4000-8000-000000000010'),0::bigint,'learner 13: another user cannot read the state');
SELECT throws_ok($$INSERT INTO public.tulearn_learner_state(ws_id,user_id) VALUES ('9c7302c1-0000-4000-8000-000000000012','9c7302c1-0000-4000-8000-000000000001')$$,'42501',null,'learner 14: even a workspace creator cannot insert another users state');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
