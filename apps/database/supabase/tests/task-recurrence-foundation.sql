BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;
SELECT no_plan();

SELECT is(count(*)::integer, 12, 'all recurrence tables are private')
FROM pg_class
WHERE relnamespace = 'private'::regnamespace AND relkind = 'r' AND relname LIKE 'task_recurrence_%';
SELECT is(count(*)::integer, 0, 'there is no public recurrence relation')
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'task_recurrence_%';
SELECT ok(bool_and(relrowsecurity), 'all recurrence tables enable RLS')
FROM pg_class
WHERE relnamespace = 'private'::regnamespace AND relkind = 'r' AND relname LIKE 'task_recurrence_%';
SELECT is(count(*)::integer, 0, 'there is no client-facing policy on a recurrence relation')
FROM pg_policy JOIN pg_class ON polrelid = pg_class.oid
WHERE relnamespace = 'private'::regnamespace AND relname LIKE 'task_recurrence_%';

SELECT ok(NOT rolcanlogin AND NOT rolinherit AND NOT rolcreaterole AND NOT rolcreatedb
  AND NOT rolbypassrls AND NOT rolsuper, 'operator is a restricted NOLOGIN role')
FROM pg_roles WHERE rolname = 'task_recurrence_operator';

SELECT ok(NOT pg_has_role(role_name, 'task_recurrence_operator', 'MEMBER')
  AND NOT pg_has_role('task_recurrence_operator', role_name, 'MEMBER'),
  format('%s and operator have no role membership in either direction', role_name))
FROM unnest(ARRAY['anon', 'authenticated', 'service_role', 'authenticator']) AS role_name;

SELECT ok(NOT has_table_privilege(role_name, pg_class.oid,
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  format('%s has no direct privilege on %s', role_name, relname))
FROM pg_class CROSS JOIN unnest(ARRAY['anon','authenticated','service_role','task_recurrence_operator']) AS role_name
WHERE relnamespace = 'private'::regnamespace AND relkind = 'r' AND relname LIKE 'task_recurrence_%'
ORDER BY relname, role_name;

SELECT is(count(*)::integer, 0, 'PUBLIC has no recurrence relation grants')
FROM pg_class CROSS JOIN LATERAL aclexplode(coalesce(relacl, acldefault('r', relowner))) AS acl
WHERE relnamespace = 'private'::regnamespace AND relkind = 'r'
  AND relname LIKE 'task_recurrence_%' AND acl.grantee = 0;

CREATE TEMP TABLE recurrence_rpc_acl(signature regprocedure PRIMARY KEY, grantee text);
INSERT INTO recurrence_rpc_acl VALUES
  ('private.task_recurrence_set_control(boolean,boolean,bigint)', 'task_recurrence_operator'),
  ('private.task_recurrence_set_workspace(uuid,boolean,bigint)', 'task_recurrence_operator'),
  ('private.task_recurrence_disable_control(bigint)', 'service_role'),
  ('private.task_recurrence_disable_workspace(uuid,bigint)', 'service_role'),
  ('private.task_recurrence_probe(bigint)', 'service_role'),
  ('private.task_recurrence_capture_completion(uuid,uuid,uuid,uuid,bigint)', 'service_role'),
  ('private.task_recurrence_guard_task()', NULL),
  ('private.task_recurrence_guard_list()', NULL),
  ('private.task_recurrence_guard_board()', NULL),
  ('private.task_recurrence_is_open(timestamptz,timestamptz,timestamptz,public.task_board_status)', NULL),
  ('private.task_recurrence_reclassify(uuid[])', NULL),
  ('private.task_recurrence_check_occurrence()', NULL),
  ('private.task_recurrence_check_active_slot()', NULL),
  ('private.task_recurrence_release_erased_owner()', NULL),
  ('private.task_recurrence_release_departed_member()', NULL),
  ('private.task_recurrence_lock_member_edit(uuid,uuid)', NULL);

INSERT INTO recurrence_rpc_acl VALUES
  ('private.task_recurrence_request_actor(uuid)', NULL),
  ('private.task_recurrence_request_gate(uuid)', NULL),
  ('private.task_recurrence_request_expiry(timestamptz)', NULL),
  ('private.task_recurrence_request_replay(uuid,uuid,uuid,timestamptz,text,jsonb,jsonb)', NULL),
  ('private.task_recurrence_request_receipt(uuid,uuid,uuid,timestamptz,text,jsonb,jsonb,jsonb)', NULL),
  ('private.task_recurrence_reserve_active(private.task_recurrence_series)', NULL),
  ('private.task_recurrence_copy_ids(jsonb)', NULL),
  ('private.task_recurrence_validate_spec(jsonb)', NULL),
  ('private.task_recurrence_generation_list(private.task_recurrence_series)', NULL),
  ('private.task_recurrence_materialize(private.task_recurrence_series,uuid,timestamptz,timestamptz,jsonb)', NULL),
  ('private.task_recurrence_plan_date(jsonb)', NULL),
  ('private.task_recurrence_next_pattern(jsonb,date)', NULL),
  ('private.task_recurrence_wall_instant(timestamp,text)', NULL),
  ('private.task_recurrence_local_start(date,text)', NULL),
  ('private.task_recurrence_step(private.task_recurrence_series,jsonb,text,uuid)', NULL),
  ('private.task_recurrence_apply_request(text,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,bigint,bigint,bigint,bigint,jsonb,jsonb,text,uuid)', NULL),
  ('private.task_recurrence_prepare_create(uuid,uuid,uuid)', 'service_role'),
  ('private.task_recurrence_create(uuid,uuid,uuid,uuid,timestamptz,bigint,bigint,jsonb,jsonb)', 'service_role'),
  ('private.task_recurrence_edit(uuid,uuid,uuid,uuid,uuid,timestamptz,bigint,bigint,jsonb,jsonb)', 'service_role'),
  ('private.task_recurrence_set_status(uuid,uuid,uuid,uuid,uuid,timestamptz,bigint,bigint,text,uuid,jsonb)', 'service_role'),
  ('private.task_recurrence_read(uuid,uuid,uuid[],boolean)', 'service_role'),
  ('private.task_recurrence_prepare_completion(uuid,uuid,uuid,uuid)', 'service_role'),
  ('private.task_recurrence_begin_completion(uuid,uuid,uuid,uuid,bigint,uuid,timestamptz)', 'service_role'),
  ('private.task_recurrence_complete(uuid,uuid,uuid,timestamptz,jsonb)', 'service_role'),
  ('private.task_recurrence_claim(bigint,smallint)', 'service_role'),
  ('private.task_recurrence_commit(bigint,smallint,jsonb)', 'service_role'),
  ('private.task_recurrence_scheduler_pause(uuid,text)', NULL),
  ('private.task_recurrence_scheduler_step(private.task_recurrence_series,bigint,timestamptz)', NULL);

SELECT is((SELECT count(*) FROM pg_proc WHERE pronamespace = 'private'::regnamespace
  AND proname LIKE 'task_recurrence_%'), (SELECT count(*) FROM recurrence_rpc_acl),
  'the exact RPC inventory covers every recurrence function');
SELECT is(has_function_privilege(role_name, signature, 'EXECUTE'), (role_name IS NOT DISTINCT FROM grantee),
  format('%s effective EXECUTE on %s matches the allowlist', role_name, signature))
FROM recurrence_rpc_acl CROSS JOIN unnest(ARRAY['anon','authenticated','service_role','task_recurrence_operator']) AS role_name
ORDER BY signature::text, role_name;
SELECT is(count(*)::integer, 0, 'PUBLIC cannot execute any recurrence function')
FROM recurrence_rpc_acl JOIN pg_proc ON signature = oid
CROSS JOIN LATERAL aclexplode(coalesce(proacl, acldefault('f', proowner))) AS acl
WHERE acl.grantee = 0;

SELECT is((SELECT to_jsonb(c) FROM private.task_recurrence_control AS c),
  '{"singleton":true,"request_enabled":false,"scheduler_enabled":false,"epoch":1,"scheduler_after_slot":0}'::jsonb,
  'global gate starts off');
SELECT is((SELECT count(*)::integer FROM private.task_recurrence_workspace), 0, 'missing workspace gates start off');

-- The migration role has administration of the NOLOGIN role. Grant test-only
-- SET access to exercise the operator's rights inside this rolled-back fixture.
GRANT task_recurrence_operator TO postgres WITH SET TRUE;
GRANT USAGE ON SCHEMA extensions TO task_recurrence_operator;
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM private.task_recurrence_control', '42501', NULL, 'anon direct read is denied');
SELECT throws_ok('SELECT private.task_recurrence_probe(900)', '42501', NULL, 'anon probe is denied');
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT * FROM private.task_recurrence_control', '42501', NULL, 'authenticated direct read is denied');
SELECT throws_ok('SELECT private.task_recurrence_probe(900)', '42501', NULL, 'authenticated probe is denied');
SET LOCAL ROLE service_role;
SELECT throws_ok('SELECT * FROM private.task_recurrence_control', '42501', NULL, 'service direct read is denied');
SELECT throws_ok('SELECT private.task_recurrence_set_control(true,true,1)', '42501', NULL, 'service cannot enable control');
SELECT is(private.task_recurrence_probe(900),
  '{"epoch":1,"request_enabled":false,"scheduler_enabled":false,"workspaces_sampled":0,"workspaces_with_due_series":0}'::jsonb,
  'off probe returns only aggregate state');
SELECT throws_ok('SELECT private.task_recurrence_probe(901)', '22023', 'TASK_RECURRENCE_INVALID_SLOT',
  'probe rejects malformed slot');
RESET ROLE;
SELECT ok(NOT pg_has_role('authenticator', 'task_recurrence_operator', 'SET')
  AND NOT pg_has_role('service_role', 'task_recurrence_operator', 'SET'),
  'PostgREST and service role cannot SET ROLE to operator');
SELECT is((SELECT latest_slot FROM private.task_recurrence_scheduler), 0::bigint, 'probe leaves watermark unchanged');
SELECT is((SELECT count(*) FROM private.task_recurrence_slots), 0::bigint, 'probe makes no slot reservation');

INSERT INTO auth.users (id,email) VALUES
  ('00000000-0000-4000-8000-0000000a1101','recurrence-owner@example.test'),
  ('00000000-0000-4000-8000-0000000a1102','recurrence-actor@example.test'),
  ('00000000-0000-4000-8000-0000000a1103','recurrence-guest@example.test');
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
INSERT INTO public.workspaces (id,name,creator_id,personal) VALUES
  ('00000000-0000-4000-8000-0000000a1110','Recurrence workspace','00000000-0000-4000-8000-0000000a1101',false),
  ('00000000-0000-4000-8000-0000000a1111','Other workspace','00000000-0000-4000-8000-0000000a1101',false);
INSERT INTO public.workspace_members (ws_id,user_id,type) VALUES
  ('00000000-0000-4000-8000-0000000a1110','00000000-0000-4000-8000-0000000a1102','MEMBER'),
  ('00000000-0000-4000-8000-0000000a1110','00000000-0000-4000-8000-0000000a1103','GUEST')
ON CONFLICT DO NOTHING;
INSERT INTO public.workspace_default_permissions (ws_id,permission,member_type,enabled)
VALUES ('00000000-0000-4000-8000-0000000a1110','manage_projects','MEMBER',true)
ON CONFLICT (ws_id, permission, member_type) DO UPDATE SET enabled = true;
INSERT INTO public.workspace_boards (id,ws_id,name,creator_id) VALUES
  ('00000000-0000-4000-8000-0000000a1120','00000000-0000-4000-8000-0000000a1110','Recurrence board','00000000-0000-4000-8000-0000000a1101'),
  ('00000000-0000-4000-8000-0000000a1121','00000000-0000-4000-8000-0000000a1111','Other board','00000000-0000-4000-8000-0000000a1101'),
  ('00000000-0000-4000-8000-0000000a1122','00000000-0000-4000-8000-0000000a1110','Moved board','00000000-0000-4000-8000-0000000a1101');
INSERT INTO public.task_lists (id,board_id,name,status,creator_id) VALUES
  ('00000000-0000-4000-8000-0000000a1130','00000000-0000-4000-8000-0000000a1120','Recurring active','active','00000000-0000-4000-8000-0000000a1101'),
  ('00000000-0000-4000-8000-0000000a1131','00000000-0000-4000-8000-0000000a1121','Other active','active','00000000-0000-4000-8000-0000000a1101'),
  ('00000000-0000-4000-8000-0000000a1132','00000000-0000-4000-8000-0000000a1122','Moved active','active','00000000-0000-4000-8000-0000000a1101'),
  ('00000000-0000-4000-8000-0000000a1133','00000000-0000-4000-8000-0000000a1120','Recurring done','done','00000000-0000-4000-8000-0000000a1101');
INSERT INTO public.tasks (id,list_id,name,creator_id)
SELECT ('00000000-0000-4000-8000-0000000a114' || i)::uuid,
  CASE WHEN i = 4 THEN '00000000-0000-4000-8000-0000000a1133'::uuid ELSE '00000000-0000-4000-8000-0000000a1130' END,
  format('Recurring fixture %s',i),'00000000-0000-4000-8000-0000000a1101'
FROM generate_series(1,4) AS i;
-- Terminal-list membership alone accounts for this task.
UPDATE public.tasks SET completed_at = NULL WHERE id = '00000000-0000-4000-8000-0000000a1144';
RESET ROLE;

INSERT INTO private.task_recurrence_series (id,ws_id,board_id,list_id,owner_id,rule,template,anchor_date,state,cursor_date,generate_at,consumed_count)
VALUES (
  '00000000-0000-4000-8000-0000000a1150','00000000-0000-4000-8000-0000000a1110',
  '00000000-0000-4000-8000-0000000a1120','00000000-0000-4000-8000-0000000a1130',
  '00000000-0000-4000-8000-0000000a1102','{"end":{"type":"never"}}','{}',DATE '2026-11-01',
  'active',DATE '2026-11-07',TIMESTAMPTZ '2026-11-07 00:00:00+00',1001
);
SELECT throws_ok('SET CONSTRAINTS ALL IMMEDIATE', '23514', 'TASK_RECURRENCE_ACTIVE_SLOT_MISMATCH',
  'active series require a reserved slot');
INSERT INTO private.task_recurrence_active_slots (series_id,ws_id,owner_id,ws_slot,owner_slot) VALUES
  ('00000000-0000-4000-8000-0000000a1150','00000000-0000-4000-8000-0000000a1110',
   '00000000-0000-4000-8000-0000000a1102',1,1);
INSERT INTO private.task_recurrence_occurrences (series_id,ws_id,occurrence_date,task_id,task_list_id,
  open_slot,state,source,request_actor_id,series_revision,task_write_version)
SELECT '00000000-0000-4000-8000-0000000a1150','00000000-0000-4000-8000-0000000a1110',
  DATE '2026-11-01' + i,task.id,task.list_id,CASE WHEN i < 4 THEN i END,
  'created','create','00000000-0000-4000-8000-0000000a1102',1,'fixture'
FROM generate_series(1,4) AS i
JOIN public.tasks AS task ON task.id = ('00000000-0000-4000-8000-0000000a114' || i)::uuid;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT throws_ok($sql$DO $check$ BEGIN
  UPDATE private.task_recurrence_occurrences SET open_slot = NULL WHERE task_id = '00000000-0000-4000-8000-0000000a1143';
  SET CONSTRAINTS ALL IMMEDIATE;
END $check$;$sql$, '23514', 'TASK_RECURRENCE_OCCURRENCE_MISMATCH', 'direct misclassification is rejected at commit');

SET LOCAL ROLE service_role;
SELECT is(private.task_recurrence_capture_completion('00000000-0000-4000-8000-0000000a1110',
  '00000000-0000-4000-8000-0000000a1101','00000000-0000-4000-8000-0000000a1143',
  '00000000-0000-4000-8000-0000000a1130',NULL), '{"status":"disabled"}'::jsonb,
  'capture is inert while gates are off');
SELECT throws_ok($$
  UPDATE public.tasks SET list_id = '00000000-0000-4000-8000-0000000a1131'
  WHERE id = '00000000-0000-4000-8000-0000000a1143'
$$, 'PT409', 'TASK_RECURRENCE_CROSS_WORKSPACE_MOVE', 'direct cross-workspace move is fenced while off');
SELECT throws_ok($$
  UPDATE public.task_lists SET status = 'review' WHERE id = '00000000-0000-4000-8000-0000000a1133'
$$, 'PT409', 'TASK_RECURRENCE_OPEN_CAPACITY', 'list reclassification cannot open a fourth task while off');
SELECT lives_ok($$
  UPDATE public.tasks SET deleted_at = CASE WHEN id = '00000000-0000-4000-8000-0000000a1141' THEN now() END
  WHERE id IN ('00000000-0000-4000-8000-0000000a1141','00000000-0000-4000-8000-0000000a1142')
$$, 'ordinary linked task deletion is available when gated off');
SELECT lives_ok($$
  UPDATE public.task_lists SET status = 'review' WHERE id = '00000000-0000-4000-8000-0000000a1133'
$$, 'review reclassification reserves a freed slot');
SELECT throws_ok($$
  UPDATE public.tasks SET deleted_at = NULL WHERE id = '00000000-0000-4000-8000-0000000a1141'
$$, 'PT409', 'TASK_RECURRENCE_OPEN_CAPACITY', 'single restore cannot create a fourth open task');
SELECT lives_ok($$
  UPDATE public.tasks SET deleted_at = CASE WHEN id = '00000000-0000-4000-8000-0000000a1142' THEN now() END
  WHERE id IN ('00000000-0000-4000-8000-0000000a1141','00000000-0000-4000-8000-0000000a1142')
$$, 'a multi-task statement can exchange open slots at full capacity');
RESET ROLE;

SET LOCAL ROLE task_recurrence_operator;
SELECT throws_ok('SELECT * FROM private.task_recurrence_control','42501',NULL,'operator direct reads are denied');
SELECT throws_ok('SELECT private.task_recurrence_probe(900)','42501',NULL,'operator has only gate RPC execution');
SELECT is((private.task_recurrence_set_control(true,false,1)->>'epoch')::bigint, 2::bigint, 'operator enables request stage');
SELECT is(private.task_recurrence_set_control(false,false,1)->>'applied','false','stale control retry cannot overwrite');
SELECT is((private.task_recurrence_set_control(true,false,2)->>'epoch')::bigint, 2::bigint, 'a matching no-op keeps epoch');
SELECT is((private.task_recurrence_set_workspace('00000000-0000-4000-8000-0000000a1110',true,0)->>'epoch')::bigint,
  1::bigint, 'operator creates enabled workspace from epoch zero');
SELECT is(private.task_recurrence_set_workspace('00000000-0000-4000-8000-0000000a1110',false,0)->>'applied',
  'false', 'stale workspace retry cannot overwrite');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"role":"authenticated","sub":"00000000-0000-4000-8000-0000000a1101"}';
SELECT throws_ok($$SELECT public.update_task_with_relations(
  '00000000-0000-4000-8000-0000000a1144','{"completed":true}',
  p_actor_user_id := '00000000-0000-4000-8000-0000000a1102')$$,
  '42501','TASK_UPDATE_ACTOR_MISMATCH','authenticated update wrapper cannot forge completion actor');
SELECT throws_ok($$SELECT public.update_task_with_relations_legacy_20260321(
  '00000000-0000-4000-8000-0000000a1144','{"completed":true}',
  p_actor_user_id := '00000000-0000-4000-8000-0000000a1102')$$,
  '42501','TASK_UPDATE_ACTOR_MISMATCH','authenticated legacy RPC cannot forge completion actor');
SELECT throws_ok($$SELECT private.task_recurrence_capture_completion(
  '00000000-0000-4000-8000-0000000a1110','00000000-0000-4000-8000-0000000a1102',
  '00000000-0000-4000-8000-0000000a1144','00000000-0000-4000-8000-0000000a1133',NULL)$$,
  '42501',NULL,'authenticated callers cannot reach the proof writer');
RESET ROLE;
SELECT is((SELECT count(*) FROM private.task_recurrence_transitions),0::bigint,'forged requests create no proof');

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role","sub":"00000000-0000-4000-8000-0000000a1101"}';
SELECT throws_ok($$SELECT private.task_recurrence_capture_completion(
  '00000000-0000-4000-8000-0000000a1110','00000000-0000-4000-8000-0000000a1102',
  '00000000-0000-4000-8000-0000000a1144','00000000-0000-4000-8000-0000000a1133',NULL)$$,
  '42501','TASK_RECURRENCE_ACTOR_OR_SCOPE','a JWT subject overrides supplied actor even under service role');
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
SELECT throws_ok($$SELECT private.task_recurrence_capture_completion(
  '00000000-0000-4000-8000-0000000a1110','00000000-0000-4000-8000-0000000a1103',
  '00000000-0000-4000-8000-0000000a1144','00000000-0000-4000-8000-0000000a1133',NULL)$$,
  '42501','TASK_RECURRENCE_TASK_UNAVAILABLE','guest cannot capture evidence');
SELECT is((SELECT to_jsonb(t) ? 'transition_id' FROM public.update_task_with_relations(
  '00000000-0000-4000-8000-0000000a1144','{"completed":true,"completed_at":"2026-11-20T00:00:00Z"}',
  p_actor_user_id := '00000000-0000-4000-8000-0000000a1101') AS t),
  false,'ordinary service writer returns a task row without evidence');
RESET ROLE;
SELECT is((SELECT count(*) FROM private.task_recurrence_transitions),0::bigint,'ordinary service completion creates no proof');

SET LOCAL ROLE service_role;
UPDATE public.tasks SET completed = false, completed_at = NULL WHERE id = '00000000-0000-4000-8000-0000000a1144';
SELECT ok(private.task_recurrence_capture_completion(
  '00000000-0000-4000-8000-0000000a1110','00000000-0000-4000-8000-0000000a1101',
  '00000000-0000-4000-8000-0000000a1144','00000000-0000-4000-8000-0000000a1133',NULL)->>'transition_id' IS NOT NULL,
  'new entry point captures latest linked open-to-terminal transition');
RESET ROLE;
SELECT is((SELECT (actor_id,revision,progress,global_epoch,workspace_epoch)::text
  FROM private.task_recurrence_transitions),
  '(00000000-0000-4000-8000-0000000a1101,1,0,2,1)', 'proof binds persisted actor, progress and both gate epochs');

SET LOCAL ROLE service_role;
UPDATE public.tasks SET completed = false, completed_at = NULL, closed_at = NULL
WHERE id = '00000000-0000-4000-8000-0000000a1144';
RESET ROLE;
SELECT is((SELECT count(*) FROM private.task_recurrence_transitions),0::bigint,'ordinary reopen invalidates old proof');

SET LOCAL ROLE service_role;
SELECT lives_ok($$UPDATE public.tasks SET list_id = '00000000-0000-4000-8000-0000000a1132'
  WHERE id = '00000000-0000-4000-8000-0000000a1144'$$,'linked move within workspace preserves ordinary board behavior');
SELECT throws_ok($$SELECT private.task_recurrence_capture_completion(
  '00000000-0000-4000-8000-0000000a1110','00000000-0000-4000-8000-0000000a1101',
  '00000000-0000-4000-8000-0000000a1144','00000000-0000-4000-8000-0000000a1132',NULL)$$,
  '42501','TASK_RECURRENCE_TASK_UNAVAILABLE','moved task cannot capture proof for origin series');
DELETE FROM public.tasks WHERE id = '00000000-0000-4000-8000-0000000a1144';
RESET ROLE;
SELECT ok((SELECT state = 'created' AND task_id IS NULL AND task_list_id IS NULL
  AND open_slot IS NULL AND task_write_version IS NULL
  FROM private.task_recurrence_occurrences WHERE occurrence_date = DATE '2026-11-05'),
  'hard deletion leaves a date tombstone and clears all task references');

-- A large list exceeds the budget only when its tasks would actually change state.
SET LOCAL ROLE service_role;
INSERT INTO public.task_lists (id,board_id,name,status,creator_id) VALUES
  ('00000000-0000-4000-8000-0000000a1134','00000000-0000-4000-8000-0000000a1120',
   'Large recurring list','done','00000000-0000-4000-8000-0000000a1101');
INSERT INTO public.tasks (id,list_id,name,creator_id)
SELECT ('00000000-0000-4000-8000-0000000b' || lpad(i::text,4,'0'))::uuid,
  '00000000-0000-4000-8000-0000000a1134',format('Capacity fixture %s',i),'00000000-0000-4000-8000-0000000a1101'
FROM generate_series(1,501) AS i;
UPDATE public.tasks SET completed_at = NULL WHERE list_id = '00000000-0000-4000-8000-0000000a1134';
RESET ROLE;
INSERT INTO private.task_recurrence_occurrences (series_id,ws_id,occurrence_date,task_id,task_list_id,state,source,series_revision)
SELECT '00000000-0000-4000-8000-0000000a1150','00000000-0000-4000-8000-0000000a1110',
  DATE '2026-12-01' + row_number() OVER (ORDER BY id)::integer,
  id,list_id,'created','create',1
FROM public.tasks WHERE list_id = '00000000-0000-4000-8000-0000000a1134';
SET LOCAL ROLE service_role;
SELECT throws_ok($$UPDATE public.task_lists SET status = 'review'
  WHERE id = '00000000-0000-4000-8000-0000000a1134'$$,
  'PT409','TASK_RECURRENCE_LIST_RECLASSIFICATION_LIMIT','501 links changing state cause an atomic conflict');
UPDATE public.tasks SET completed_at = now() WHERE list_id = '00000000-0000-4000-8000-0000000a1134';
SELECT lives_ok($$UPDATE public.task_lists SET status = 'review'
  WHERE id = '00000000-0000-4000-8000-0000000a1134'$$,
  '501 completed links do not count against the list reclassification bound');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT is((private.task_recurrence_disable_workspace('00000000-0000-4000-8000-0000000a1110',1)->>'epoch')::bigint,
  2::bigint,'break glass disables workspace with epoch advance');
SELECT is((private.task_recurrence_disable_control(2)->>'epoch')::bigint,3::bigint,'break glass disables both global bits');
RESET ROLE;
UPDATE public.workspace_members SET type = 'GUEST'
WHERE ws_id = '00000000-0000-4000-8000-0000000a1110' AND user_id = '00000000-0000-4000-8000-0000000a1102';
SELECT is((SELECT state FROM private.task_recurrence_series),'paused','membership loss pauses active series');
SELECT is((SELECT count(*) FROM private.task_recurrence_active_slots),0::bigint,'membership loss releases active slot');
DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000a1102';
SELECT ok((SELECT bool_and(request_actor_id IS NULL AND source = 'create') FROM private.task_recurrence_occurrences),
  'account erasure clears actor IDs and preserves producer category');
SELECT is((SELECT owner_id FROM private.task_recurrence_series),NULL::uuid,'account erasure clears series owner');
SET CONSTRAINTS ALL IMMEDIATE;
SELECT * FROM finish();
ROLLBACK;
