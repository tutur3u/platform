BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
INSERT INTO public.calendar_event_colors(value) VALUES ('BLUE'), ('PURPLE'), ('GREEN') ON CONFLICT DO NOTHING;
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000009101'),
 ('00000000-0000-4000-8000-000000009102'),
 ('00000000-0000-4000-8000-000000009103');
INSERT INTO public.users(id) SELECT id FROM auth.users WHERE id::text LIKE '%00910_' ON CONFLICT DO NOTHING;
INSERT INTO public.workspaces(id, name, personal, creator_id) VALUES
 ('00000000-0000-4000-8000-000000009111', 'SSO fixture A', false, '00000000-0000-4000-8000-000000009101'),
 ('00000000-0000-4000-8000-000000009112', 'SSO fixture B', false, '00000000-0000-4000-8000-000000009102');
UPDATE public.workspace_default_permissions SET enabled = false WHERE ws_id IN
 ('00000000-0000-4000-8000-000000009111', '00000000-0000-4000-8000-000000009112');
INSERT INTO public.workspace_members(ws_id, user_id, type) VALUES
 ('00000000-0000-4000-8000-000000009111', '00000000-0000-4000-8000-000000009103', 'MEMBER');
CREATE TEMP TABLE fixture AS SELECT
 '00000000-0000-4000-8000-000000009111'::uuid ws,
 '00000000-0000-4000-8000-000000009112'::uuid other_ws,
 '00000000-0000-4000-8000-000000009101'::uuid actor,
 '00000000-0000-4000-8000-000000009102'::uuid other_actor,
 '00000000-0000-4000-8000-000000009103'::uuid member;
SELECT ok(EXISTS (SELECT 1 FROM public.workspace_members m, fixture f
 WHERE m.ws_id = f.ws AND m.user_id = f.actor AND m.type = 'MEMBER'), 'creator bootstrap supplies actual membership');
CREATE TEMP TABLE clients AS SELECT c.* FROM fixture f, LATERAL public.sso_manage_client(
 f.ws, f.actor, NULL, 0, 'Claude fixture', ARRAY['example.test'], 'urn:fixture:sp', ARRAY['https://sp.example.test/acs']) c;
SELECT is((SELECT enabled FROM clients), false, 'clients default disabled');
SELECT is((SELECT created_by FROM clients), (SELECT actor FROM fixture), 'created_by stamped from validated manager');
SELECT throws_ok($$SELECT public.sso_create_transaction(f.ws,c.id,1,'_disabled',repeat('a',64),repeat('b',64),NULL,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes') FROM fixture f, clients c$$,
 '42501','sso_forbidden','disabled client denies request admission');
SELECT throws_ok($$SELECT public.sso_manage_client(f.ws,f.other_actor,NULL,0,'Bad',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test/acs']) FROM fixture f$$,
 '42501','sso_forbidden','cross-workspace manager cannot create client');
SELECT throws_ok($$SELECT public.sso_manage_client(f.ws,f.member,NULL,0,'Bad',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test/acs']) FROM fixture f$$,
 '42501','sso_forbidden','membership without management permission denied');
INSERT INTO public.workspace_default_permissions(ws_id,permission,member_type,enabled)
 SELECT ws,'manage_sso_clients','MEMBER',true FROM fixture ON CONFLICT (ws_id,permission,member_type) DO UPDATE SET enabled=true;
SELECT lives_ok($$SELECT private.sso_assert_manager(ws,member) FROM fixture$$,'explicit manage_sso_clients permission admits member manager');
SELECT throws_ok($$SELECT public.sso_manage_client(f.other_ws,f.other_actor,c.id,1,'Bad',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test/acs']) FROM fixture f, clients c$$,
 '40001','sso_revision_conflict','foreign client cannot be updated under own workspace');
SELECT throws_ok($$UPDATE private.sso_saml_clients SET ws_id=(SELECT other_ws FROM fixture)$$,
 '23503',NULL,'composite tenant FK rejects mixed profile');
SELECT throws_ok($$SELECT public.sso_manage_client(ws,actor,NULL,0,'Bad',ARRAY['example.test'],'sp',ARRAY['https://evil.test@sp.example.test/acs']) FROM fixture$$,
 '23514',NULL,'ACS credentials rejected');
SELECT throws_ok($$SELECT public.sso_manage_client(ws,actor,NULL,0,'Bad',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test:8443/acs']) FROM fixture$$,
 '23514',NULL,'ACS arbitrary port rejected');
SELECT throws_ok($$SELECT public.sso_manage_client(ws,actor,NULL,0,'Bad',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test/acs#fragment']) FROM fixture$$,
 '23514',NULL,'ACS fragment rejected');
SELECT throws_ok($$SELECT public.sso_manage_client(ws,actor,NULL,0,'Bad',ARRAY['example.test'],'sp',ARRAY['http://sp.example.test/acs']) FROM fixture$$,
 '23514',NULL,'non-HTTPS ACS rejected');
SELECT public.sso_manage_client(f.ws,f.actor,c.id,1,'Claude fixture',ARRAY['example.test'],'urn:fixture:sp',ARRAY['https://sp.example.test/acs'],true) FROM fixture f,clients c;
SELECT throws_ok($$SELECT public.sso_manage_client(f.ws,f.actor,c.id,1,'Stale',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test/acs'],true) FROM fixture f,clients c$$,
 '40001','sso_revision_conflict','stale client revision denied');
SELECT public.sso_set_assignment(f.ws,c.id,f.actor,f.actor,0,true) FROM fixture f,clients c;
SELECT throws_ok($$SELECT public.sso_set_assignment(f.ws,c.id,f.actor,f.other_actor,0,true) FROM fixture f,clients c$$,
 '42501','sso_forbidden','outsider cannot be assigned');
-- Management UI projection and trust writer remain tenant-bound and service-only.
SELECT is((public.sso_management_overview(f.ws,f.actor)->'clients'->0->>'id'),c.id::text,
 'management overview includes own client') FROM fixture f,clients c;
SELECT throws_ok($$SELECT public.sso_management_overview(ws,other_actor) FROM fixture$$,
 '42501','sso_forbidden','management overview denies other-workspace actor');
SELECT throws_ok($$SELECT public.sso_management_detail(f.other_ws,f.other_actor,c.id) FROM fixture f,clients c$$,
 '42501','sso_forbidden','management detail binds client to workspace');
SELECT ok(NOT has_function_privilege('authenticated','public.sso_management_overview(uuid,uuid)','EXECUTE'),
 'browser cannot invoke management read with an arbitrary actor');
SELECT ok(NOT has_function_privilege('anon','public.sso_save_saml_client(uuid,uuid,bigint,text,text[],text,text,text,text,boolean,uuid)','EXECUTE'),
 'anonymous cannot invoke management writes');
CREATE TEMP TABLE ui_clients AS SELECT (public.sso_save_saml_client(f.ws,f.actor,0,'UI client',
 ARRAY['example.test'],'urn:ui:sp','https://sp.example.test/acs','unsigned')->>'id')::uuid id FROM fixture f;
SELECT is((SELECT enabled FROM private.sso_clients WHERE id=(SELECT id FROM ui_clients)),false,
 'UI writer creates disabled clients');
SELECT is((SELECT request_signing_mode FROM private.sso_saml_clients WHERE client_id=(SELECT id FROM ui_clients)),
 'unsigned','UI writer persists request-signature policy');
SELECT throws_ok($$SELECT public.sso_save_saml_client(f.ws,f.actor,0,'Enabled',ARRAY['example.test'],
 'urn:ui:sp','https://sp.example.test/acs','unsigned',NULL,true) FROM fixture f$$,
 '22023','sso_create_disabled','UI writer cannot create enabled client');
SELECT throws_ok($$SELECT public.sso_save_saml_client(f.ws,f.actor,1,'Invalid cert',ARRAY['example.test'],
 'urn:ui:sp','https://sp.example.test/acs','required',NULL,false,c.id) FROM fixture f,ui_clients c$$,
 '23514',NULL,'required signatures need certificate atomically');
SELECT is((SELECT policy_revision FROM private.sso_clients WHERE id=(SELECT id FROM ui_clients)),1::bigint,
 'failed trust write rolls back revision');
SELECT is((public.sso_set_client_enabled(f.ws,f.actor,c.id,1,true)->>'revision')::integer,2,
 'activation increments policy revision') FROM fixture f,ui_clients c;
SELECT is((public.sso_set_client_enabled(f.ws,f.actor,c.id,2,false)->>'revision')::integer,3,
 'disable increments policy revision') FROM fixture f,ui_clients c;
SELECT is((SELECT enabled FROM private.sso_clients WHERE id=(SELECT id FROM ui_clients)),false,
 'disable fences subsequent issuance');
SELECT throws_ok($$SELECT public.sso_set_client_enabled(f.ws,f.actor,c.id,2,true) FROM fixture f,ui_clients c$$,
 '40001','sso_revision_conflict','stale activation cannot resurrect disabled client');
SELECT throws_ok($$SELECT public.sso_set_client_enabled(f.other_ws,f.other_actor,c.id,3,true) FROM fixture f,ui_clients c$$,
 '42501','sso_forbidden','foreign workspace cannot activate client');
SELECT ok(NOT has_function_privilege('authenticated','public.sso_set_client_enabled(uuid,uuid,uuid,bigint,boolean)','EXECUTE'),
 'activation RPC remains service-only');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009101',true);
UPDATE public.workspace_members SET type='GUEST' WHERE ws_id=(SELECT ws FROM fixture) AND user_id=(SELECT member FROM fixture);
SELECT ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.sso_management_detail(f.ws,f.actor,c.id)->'members') m
 WHERE m->>'userId'=f.member::text),'management roster excludes guests') FROM fixture f,ui_clients c;
SELECT throws_ok($$SELECT public.sso_set_assignment(f.ws,c.id,f.actor,f.member,0,true) FROM fixture f,ui_clients c$$,
 '42501','sso_forbidden','UI cannot assign guests');
SELECT ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements(public.sso_management_detail(f.ws,f.actor,c.id)->'audit') a
 WHERE a ? 'actor_id' OR a ? 'transaction_id'),'audit projection excludes actor and transaction identifiers') FROM fixture f,ui_clients c;
UPDATE public.workspace_members SET type='MEMBER' WHERE ws_id=(SELECT ws FROM fixture) AND user_id=(SELECT member FROM fixture);

CREATE FUNCTION pg_temp.start_login(p_request text, p_handle text) RETURNS uuid LANGUAGE sql AS $$
 SELECT (public.sso_create_transaction(f.ws,c.id,2,p_request,encode(extensions.digest(p_handle,'sha256'),'hex'),repeat('b',64),repeat('c',64),
 'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes',true)).id FROM fixture f,clients c;
$$;
CREATE TEMP TABLE logins AS SELECT pg_temp.start_login('_request1','handle1') id;
SELECT throws_ok($$SELECT pg_temp.start_login('_request1','new-handle')$$,'23505',NULL,'same request cannot be reserved twice');
SELECT throws_ok($$SELECT public.sso_create_transaction(f.other_ws,c.id,2,'_foreign',repeat('d',64),repeat('b',64),NULL,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes') FROM fixture f,clients c$$,
 '42501','sso_forbidden','cross-workspace transaction denied');
SELECT throws_ok($$SELECT public.sso_create_transaction(f.ws,c.id,2,'_acs',repeat('d',64),repeat('b',64),NULL,'https://sp.example.test/acs/evil',clock_timestamp()+interval '4 minutes') FROM fixture f,clients c$$,
 '42501','sso_forbidden','ACS prefix is not an exact match');
SELECT throws_ok($$SELECT public.sso_create_transaction(f.ws,c.id,2,'_long',repeat('d',64),repeat('b',64),NULL,'https://sp.example.test/acs',clock_timestamp()+interval '6 minutes') FROM fixture f,clients c$$,
 '23514',NULL,'transaction lifetime capped at five minutes');
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,logins t$$,
 '42501','sso_forbidden','consumption without per-login consent denied');
SELECT throws_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,logins t$$,
 '42501','sso_forbidden','unassigned member cannot consent');
SELECT throws_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('0',64),repeat('e',64),2,true) FROM fixture f,clients c,logins t$$,
 '42501','sso_forbidden','wrong browser binding denied');
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,logins t;
SELECT throws_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,logins t$$,
 '40001','sso_consent_recorded','consent cannot be overwritten');
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('f',64),2) FROM fixture f,clients c,logins t$$,
 '42501','sso_forbidden','wrong session binding denied');
CREATE TEMP TABLE subjects AS SELECT s.* FROM fixture f,clients c,logins t,LATERAL public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) s;
SELECT matches((SELECT subject FROM subjects),'^[0-9a-f]{64}$','pairwise subject is 256 random bits');
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,logins t$$,
 '40001','sso_transaction_unavailable','double consumption fails');
SELECT is((SELECT count(*)::integer FROM private.sso_audit_events WHERE event_type='transaction.consumed'),1,'replay produces no second consume audit');
CREATE TEMP TABLE second_login AS SELECT pg_temp.start_login('_request2','handle2') id;
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,second_login t;
SELECT is((SELECT (public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2)).subject FROM fixture f,clients c,second_login t),
 (SELECT subject FROM subjects),'later login reuses stable subject');
CREATE TEMP TABLE denied_login AS SELECT pg_temp.start_login('_request3','handle3') id;
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,false) FROM fixture f,clients c,denied_login t;
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,denied_login t$$,
 '40001','sso_transaction_unavailable','denial burns transaction');
SELECT throws_ok($$UPDATE private.sso_audit_events SET event_type='issuance.signed'$$,'42501','sso_append_only','audit updates forbidden even to owner');
SELECT throws_ok($$DELETE FROM private.sso_audit_events$$,'42501','sso_append_only','audit deletes forbidden even to owner');
SELECT throws_ok($$UPDATE private.sso_disclosure_grants SET approved=false$$,'42501','sso_append_only','disclosure history immutable');
SELECT throws_ok($$SELECT public.sso_append_audit(f.other_ws,c.id,t.id,f.actor,'issuance.signed',2) FROM fixture f,clients c,logins t$$,
 '42501','sso_forbidden','audit cannot cross tenants');
SELECT lives_ok($$SELECT public.sso_append_audit(f.ws,c.id,t.id,f.actor,'issuance.signed',2) FROM fixture f,clients c,logins t$$,'server can append correlated issuance event');
SELECT ok(NOT has_table_privilege('anon','private.sso_clients','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct clients access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_clients','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct clients access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_clients','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct clients access');
SELECT ok(NOT has_table_privilege('anon','private.sso_saml_clients','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct saml_clients access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_saml_clients','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct saml_clients access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_saml_clients','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct saml_clients access');
SELECT ok(NOT has_table_privilege('anon','private.sso_assignments','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct assignments access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_assignments','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct assignments access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_assignments','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct assignments access');
SELECT ok(NOT has_table_privilege('anon','private.sso_subjects','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct subjects access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_subjects','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct subjects access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_subjects','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct subjects access');
SELECT ok(NOT has_table_privilege('anon','private.sso_transactions','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct transactions access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_transactions','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct transactions access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_transactions','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct transactions access');
SELECT ok(NOT has_table_privilege('anon','private.sso_disclosure_grants','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct disclosure_grants access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_disclosure_grants','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct disclosure_grants access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_disclosure_grants','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct disclosure_grants access');
SELECT ok(NOT has_table_privilege('anon','private.sso_signing_keys','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct signing_keys access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_signing_keys','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct signing_keys access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_signing_keys','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct signing_keys access');
SELECT ok(NOT has_table_privilege('anon','private.sso_audit_events','SELECT,INSERT,UPDATE,DELETE'),'anon has no direct audit_events access');
SELECT ok(NOT has_table_privilege('authenticated','private.sso_audit_events','SELECT,INSERT,UPDATE,DELETE'),'authenticated has no direct audit_events access');
SELECT ok(NOT has_table_privilege('service_role','private.sso_audit_events','SELECT,INSERT,UPDATE,DELETE'),'service_role has no direct audit_events access');
SELECT ok((SELECT count(*) = 8 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname LIKE 'sso_%' AND c.relkind='r'),'all eight SSO tables enable and force RLS');
SELECT ok((SELECT bool_and(p.prosecdef AND 'search_path=pg_catalog, pg_temp' = ANY(p.proconfig)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sso_%'),'all exposed RPCs use SECURITY DEFINER and hardened search_path');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM private.sso_transactions$$,'42501',NULL,'anonymous direct table read rejected');
SELECT throws_ok($$SELECT public.sso_read_own_disclosures('00000000-0000-4000-8000-000000009111')$$,'42501',NULL,'anonymous cannot call disclosure reader');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.sso_manage_client(NULL,NULL,NULL,0,'x',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test/acs'])$$,'42501',NULL,'browser cannot invoke management RPC');
SELECT throws_ok($$SELECT public.sso_consume_transaction(NULL,NULL,NULL,NULL,NULL,NULL,1)$$,'42501',NULL,'browser cannot invoke consume RPC');
SELECT throws_ok($$SELECT * FROM private.sso_subjects$$,'42501',NULL,'browser cannot read subjects');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009101',true);
SELECT is((SELECT count(*)::integer FROM public.sso_read_own_disclosures('00000000-0000-4000-8000-000000009111')),3,'user reads own disclosure receipts');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009102',true);
SELECT is((SELECT count(*)::integer FROM public.sso_read_own_disclosures('00000000-0000-4000-8000-000000009111')),0,'other user sees no receipts');
RESET ROLE;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT SELECT ON private.sso_clients, private.sso_subjects, private.sso_transactions, private.sso_audit_events, private.sso_disclosure_grants TO authenticated;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM private.sso_clients),0,'RLS still hides clients under an accidental table grant');
SELECT is((SELECT count(*)::integer FROM private.sso_transactions),0,'RLS still hides transactions under an accidental table grant');
SELECT is((SELECT count(*)::integer FROM private.sso_subjects),0,'RLS still hides subjects under an accidental table grant');
SELECT is((SELECT count(*)::integer FROM private.sso_audit_events),0,'RLS still hides audit under an accidental table grant');
SELECT is((SELECT count(*)::integer FROM private.sso_disclosure_grants),0,'own-read RLS denies other users');
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000009101',true);
SELECT is((SELECT count(*)::integer FROM private.sso_disclosure_grants),3,'own-read RLS permits only actor receipts');
RESET ROLE;
CREATE TEMP TABLE pending_login AS SELECT pg_temp.start_login('_request4','handle4') id;
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,pending_login t;
UPDATE private.sso_assignments SET active=false WHERE user_id=(SELECT actor FROM fixture);
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,pending_login t$$,
 '42501','sso_forbidden','assignment removal after consent denies consume');
UPDATE private.sso_assignments SET active=true WHERE user_id=(SELECT actor FROM fixture);
SELECT public.sso_set_assignment(f.ws,c.id,f.actor,f.member,0,true) FROM fixture f,clients c;
CREATE TEMP TABLE guest_login AS SELECT pg_temp.start_login('_guest','guest-handle') id;
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,guest_login t;
UPDATE public.workspace_members SET type='GUEST' WHERE ws_id=(SELECT ws FROM fixture) AND user_id=(SELECT member FROM fixture);
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,guest_login t$$,
 '42501','sso_forbidden','guest cannot consume even with assignment and earlier consent');
SELECT throws_ok($$SELECT private.sso_assert_manager(ws,member) FROM fixture$$,'42501','sso_forbidden','guest cannot manage SSO despite broad default permissions');
SELECT is((SELECT count(*)::integer FROM private.sso_assignments WHERE user_id=(SELECT member FROM fixture)),0,'demotion revokes assignments');
UPDATE public.workspace_members SET type='MEMBER' WHERE ws_id=(SELECT ws FROM fixture) AND user_id=(SELECT member FROM fixture);
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,guest_login t$$,
 '42501','sso_forbidden','promotion does not revive assignment');
SELECT public.sso_set_assignment(f.ws,c.id,f.actor,f.member,0,true) FROM fixture f,clients c;
DELETE FROM public.workspace_members WHERE ws_id=(SELECT ws FROM fixture) AND user_id=(SELECT member FROM fixture);
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,guest_login t$$,
 '42501','sso_forbidden','membership removal ordered before final authorization denies consume');
UPDATE private.sso_clients SET enabled=false WHERE id=(SELECT id FROM clients);
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,pending_login t$$,
 '42501','sso_forbidden','client disable after consent denies consume');
UPDATE private.sso_clients SET enabled=true,policy_revision=3 WHERE id=(SELECT id FROM clients);
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,pending_login t$$,
 '42501','sso_forbidden','policy change invalidates pending consent');
UPDATE private.sso_clients SET policy_revision=2 WHERE id=(SELECT id FROM clients);
UPDATE private.sso_transactions SET created_at=clock_timestamp()-interval '5 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE id=(SELECT id FROM pending_login);
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,pending_login t$$,
 '40001','sso_transaction_unavailable','expired transaction cannot consume');
SELECT throws_ok($$INSERT INTO private.sso_signing_keys(ws_id,client_id,kid,public_certificate,not_before,not_after)
 SELECT f.ws,c.id,'private',E'-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',now(),now()+interval '1 day' FROM fixture f,clients c$$,
 '23514',NULL,'private key material cannot be stored as certificate');
INSERT INTO private.sso_signing_keys(ws_id,client_id,kid,public_certificate,status,activated_at,not_before,not_after)
 SELECT f.ws,c.id,'key-one',E'-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----','active',now(),now(),now()+interval '1 day' FROM fixture f,clients c;
SELECT throws_ok($$INSERT INTO private.sso_signing_keys(ws_id,client_id,kid,public_certificate,status,activated_at,not_before,not_after)
 SELECT f.ws,c.id,'key-two',E'-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----','active',now(),now(),now()+interval '1 day' FROM fixture f,clients c$$,
 '23505',NULL,'at most one active signing key per client');
-- Phase-3 projections and post-signing authorization fences.
SELECT ok(public.sso_issuance_snapshot(c.id,f.actor)->>'member' = 'true',
 'snapshot requires current member projection') FROM fixture f,clients c;
SELECT ok(public.sso_issuance_snapshot(c.id,f.actor)->>'assigned' = 'true',
 'snapshot carries explicit assignment') FROM fixture f,clients c;
SELECT ok(public.sso_issuance_snapshot(c.id,f.other_actor)->>'assigned' = 'false',
 'foreign account has no assignment') FROM fixture f,clients c;
SELECT is(public.sso_issuance_snapshot('00000000-0000-4000-8000-000000000000'),NULL::jsonb,
 'unknown client has no snapshot');
CREATE TEMP TABLE final_login AS SELECT pg_temp.start_login('_final','final-handle') id;
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true)
 FROM fixture f,clients c,final_login t;
SELECT throws_ok($$SELECT public.sso_reject_transaction(f.ws,c.id,t.id,repeat('b',64),f.actor,2)
 FROM fixture f,clients c,final_login t$$,'40001','sso_transaction_unavailable',
 'a losing decision cannot burn another already-consented decision');
SELECT is((SELECT consumed_at FROM private.sso_transactions WHERE id=(SELECT id FROM final_login)),NULL::timestamptz,
 'rejection leaves the consent winner consumable');
SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2)
 FROM fixture f,clients c,final_login t;
SELECT throws_ok($$SELECT public.sso_finalize_issuance(f.ws,c.id,t.id,f.actor,2,k.id,999)
 FROM fixture f,clients c,final_login t,private.sso_signing_keys k$$,
 '42501','sso_forbidden','changed key revision rejects finalization');
UPDATE private.sso_assignments SET active=false WHERE user_id=(SELECT actor FROM fixture);
SELECT throws_ok($$SELECT public.sso_finalize_issuance(f.ws,c.id,t.id,f.actor,2,k.id,k.revision)
 FROM fixture f,clients c,final_login t,private.sso_signing_keys k$$,
 '42501','sso_forbidden','revoked assignment after consume rejects finalization');
UPDATE private.sso_assignments SET active=true WHERE user_id=(SELECT actor FROM fixture);
SELECT lives_ok($$SELECT public.sso_finalize_issuance(f.ws,c.id,t.id,f.actor,2,k.id,k.revision)
 FROM fixture f,clients c,final_login t,private.sso_signing_keys k$$,
 'current consumed transaction can finalize with durable audit');
SELECT throws_ok($$SELECT public.sso_finalize_issuance(f.ws,c.id,t.id,f.actor,2,k.id,k.revision)
 FROM fixture f,clients c,final_login t,private.sso_signing_keys k$$,
 '40001','sso_transaction_unavailable','finalization cannot be replayed');
CREATE TEMP TABLE reject_login AS SELECT pg_temp.start_login('_reject','reject-handle') id;
SELECT throws_ok($$SELECT public.sso_reject_transaction(f.ws,c.id,t.id,repeat('a',64),NULL,2)
 FROM fixture f,clients c,reject_login t$$,'40001','sso_transaction_unavailable','reject binds browser');
SELECT lives_ok($$SELECT public.sso_reject_transaction(f.ws,c.id,t.id,repeat('b',64),NULL,2)
 FROM fixture f,clients c,reject_login t$$,'unassigned rejection burns transaction and audits');
SELECT is((SELECT outcome FROM private.sso_transactions WHERE id=(SELECT id FROM reject_login)),'denied',
 'rejected transaction is consumed');
-- Bind the known starter at creation, before either account can load consent.
CREATE TEMP TABLE starter_login AS SELECT t.id FROM fixture f,clients c,LATERAL public.sso_create_transaction(
 f.ws,c.id,2,'_starter',repeat('6',64),repeat('b',64),NULL,'https://sp.example.test/acs',
 clock_timestamp()+interval '4 minutes',true,repeat('e',64)) t;
SELECT ok((SELECT public.sso_bind_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2)
 FROM fixture f,clients c,starter_login t),'the starting user and session can load consent');
SELECT throws_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('f',64),2,true)
 FROM fixture f,clients c,starter_login t$$,'42501','sso_forbidden','unassigned account still fails authorization');
SELECT throws_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('f',64),2,true)
 FROM fixture f,clients c,starter_login t$$,'42501','sso_session_changed','direct consent cannot bypass the starter binding');
SELECT is((SELECT public.sso_bind_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('f',64),2)
 FROM fixture f,clients c,starter_login t),false,'replacement session is rejected');
SELECT is((SELECT outcome FROM private.sso_transactions WHERE id=(SELECT id FROM starter_login)),'denied',
 'session mismatch commits transaction invalidation');
SELECT is((SELECT count(*)::integer FROM private.sso_audit_events WHERE transaction_id=(SELECT id FROM starter_login)
 AND event_type='issuance.failed'),1,'session mismatch durably audits one failure');
SELECT throws_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true)
 FROM fixture f,clients c,starter_login t$$,'40001','sso_transaction_unavailable','original session cannot revive a burned transaction');
CREATE TEMP TABLE unbound_login AS SELECT pg_temp.start_login('_unbound','unbound-handle') id;
SELECT ok((SELECT public.sso_bind_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2)
 FROM fixture f,clients c,unbound_login t),'signed-out admission claims its first authenticated session');
SELECT ok((SELECT public.sso_bind_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2)
 FROM fixture f,clients c,unbound_login t),'same-session reload is idempotent');
SELECT lives_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true)
 FROM fixture f,clients c,unbound_login t$$,'bound session can still approve');
SELECT throws_ok($$SELECT public.sso_bind_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('f',64),2)
 FROM fixture f,clients c,unbound_login t$$,'40001','sso_consent_recorded','a losing bind cannot burn committed consent');
SELECT is((SELECT consumed_at FROM private.sso_transactions WHERE id=(SELECT id FROM unbound_login)),NULL::timestamptz,
 'a concurrent bind preserves the consent winner');
UPDATE private.sso_clients SET enabled=false WHERE id=(SELECT id FROM clients);
SELECT is((SELECT public.sso_issuance_snapshot(id) FROM clients),NULL::jsonb,'disabled client has no snapshot');
UPDATE private.sso_clients SET enabled=true WHERE id=(SELECT id FROM clients);
CREATE TEMP TABLE other_client AS SELECT c.* FROM fixture f,LATERAL public.sso_manage_client(
 f.ws,f.actor,NULL,0,'Second SP',ARRAY['example.test'],'urn:other:sp',ARRAY['https://sp.example.test/acs']) c;
SELECT public.sso_manage_client(f.ws,f.actor,c.id,1,'Second SP',ARRAY['example.test'],'urn:other:sp',ARRAY['https://sp.example.test/acs'],true) FROM fixture f,other_client c;
SELECT public.sso_set_assignment(f.ws,c.id,f.actor,f.actor,0,true) FROM fixture f,other_client c;
CREATE TEMP TABLE other_login AS SELECT t.id FROM fixture f,other_client c,LATERAL public.sso_create_transaction(
 f.ws,c.id,2,'_request1',repeat('0',64),repeat('b',64),NULL,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes',true) t;
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2,true) FROM fixture f,other_client c,other_login t;
SELECT isnt((SELECT (public.sso_consume_transaction(f.ws,c.id,t.id,f.actor,repeat('b',64),repeat('e',64),2)).subject FROM fixture f,other_client c,other_login t),
 (SELECT subject FROM subjects),'same user has unrelated subjects for different clients');
GRANT SELECT ON fixture,clients TO service_role;
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.sso_create_transaction(f.ws,c.id,2,'_service',repeat('1',64),repeat('b',64),NULL,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes') FROM fixture f,clients c$$,'service role can execute RPC without table grants');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.sso_assignments WHERE user_id=(SELECT member FROM fixture)),0,'membership deletion cascades assignment');
INSERT INTO public.workspace_members(ws_id,user_id,type) SELECT ws,member,'MEMBER' FROM fixture;
CREATE TEMP TABLE rejoin_login AS SELECT pg_temp.start_login('_rejoin','rejoin-handle') id;
SELECT throws_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,rejoin_login t$$,
 '42501','sso_forbidden','rejoined member cannot consent until explicitly reassigned');
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,guest_login t$$,
 '42501','sso_forbidden','rejoined member cannot consume earlier consent until reassigned');
SELECT public.sso_set_assignment(f.ws,c.id,f.actor,f.member,0,true) FROM fixture f,clients c;
SELECT lives_ok($$SELECT public.sso_record_consent(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,rejoin_login t$$,
 'explicit reassignment permits fresh consent');
CREATE TEMP TABLE no_create_login AS SELECT t.id FROM fixture f,clients c,LATERAL public.sso_create_transaction(
 f.ws,c.id,2,'_no_create',repeat('2',64),repeat('b',64),NULL,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes') t;
SELECT is((SELECT allow_create FROM private.sso_transactions WHERE id=(SELECT id FROM no_create_login)),false,'omitted AllowCreate is persisted as false');
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,no_create_login t;
SELECT throws_ok($$SELECT public.sso_consume_transaction(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2) FROM fixture f,clients c,no_create_login t$$,
 '42501','sso_subject_creation_denied','omitted AllowCreate denies a new subject despite valid consent');
SELECT is((SELECT count(*)::integer FROM private.sso_subjects WHERE user_id=(SELECT member FROM fixture)),0,'failed allocation leaves no subject');
CREATE TEMP TABLE create_login AS SELECT pg_temp.start_login('_allow_create','create-handle') id;
SELECT public.sso_record_consent(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2,true) FROM fixture f,clients c,create_login t;
CREATE TEMP TABLE member_subject AS SELECT s.* FROM fixture f,clients c,create_login t,LATERAL public.sso_consume_transaction(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2) s;
SELECT is((SELECT (public.sso_consume_transaction(f.ws,c.id,t.id,f.member,repeat('b',64),repeat('e',64),2)).subject FROM fixture f,clients c,no_create_login t),
 (SELECT subject FROM member_subject),'AllowCreate false can use an existing mapping');
SELECT throws_ok($$SELECT public.sso_manage_client(ws,actor,NULL,0,'Bad',ARRAY['example.test'],'sp',ARRAY['https://sp.example.test/*']) FROM fixture$$,
 '23514',NULL,'wildcard ACS path rejected');
SELECT ok((SELECT bool_and(NOT has_function_privilege('authenticated',p.oid,'EXECUTE') AND NOT has_function_privilege('anon',p.oid,'EXECUTE'))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'sso_%' AND p.proname <> 'sso_read_own_disclosures'),
 'all SSO writer RPCs reject anonymous and authenticated execution');

SELECT ok((SELECT bool_and(r.rolsuper OR r.rolbypassrls) FROM pg_proc p
 JOIN pg_roles r ON r.oid=p.proowner JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private') AND p.proname LIKE 'sso_%' AND p.prosecdef),
 'definer owners bypass forced RLS without permissive policies');
CREATE ROLE sso_test_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA private, extensions TO sso_test_owner;
GRANT EXECUTE ON FUNCTION private.sso_valid_acs(text[]), private.sso_valid_domains(text[]) TO sso_test_owner;
CREATE TEMP TABLE original_owners AS SELECT c.relname, r.rolname FROM pg_class c
 JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
 WHERE n.nspname='private' AND c.relname LIKE 'sso_%' AND c.relkind='r';
DO $$DECLARE t record; BEGIN
 FOR t IN SELECT * FROM original_owners LOOP
   EXECUTE format('ALTER TABLE private.%I OWNER TO sso_test_owner',t.relname);
   EXECUTE format('GRANT ALL ON TABLE private.%I TO %I',t.relname,t.rolname);
 END LOOP;
END$$;
SET LOCAL ROLE sso_test_owner;
SELECT is((SELECT count(*)::integer FROM private.sso_clients),0,'forced RLS hides clients from non-bypass owner');
SELECT is((SELECT count(*)::integer FROM private.sso_saml_clients),0,'forced RLS hides saml_clients from non-bypass owner');
SELECT is((SELECT count(*)::integer FROM private.sso_assignments),0,'forced RLS hides assignments from non-bypass owner');
SELECT is((SELECT count(*)::integer FROM private.sso_subjects),0,'forced RLS hides subjects from non-bypass owner');
SELECT is((SELECT count(*)::integer FROM private.sso_transactions),0,'forced RLS hides transactions from non-bypass owner');
SELECT is((SELECT count(*)::integer FROM private.sso_disclosure_grants),0,'forced RLS hides disclosure_grants from non-bypass owner');
SELECT is((SELECT count(*)::integer FROM private.sso_signing_keys),0,'forced RLS hides signing_keys from non-bypass owner');
SELECT is((SELECT count(*)::integer FROM private.sso_audit_events),0,'forced RLS hides audit_events from non-bypass owner');
SELECT throws_ok($$INSERT INTO private.sso_clients(ws_id,display_name,approved_email_domains)
 VALUES('00000000-0000-4000-8000-000000009111','Denied',ARRAY['example.test'])$$,
 '42501',NULL,'non-bypass owner cannot write through forced RLS');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT public.sso_create_transaction('00000000-0000-4000-8000-000000009111',
 (SELECT id FROM clients),2,'_forced_owner',repeat('3',64),repeat('b',64),NULL,
 'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes')$$,
 'definer RPC works with non-bypass table owner and forced RLS');
RESET ROLE;
DO $$DECLARE t record; BEGIN
 FOR t IN SELECT * FROM original_owners LOOP
   EXECUTE format('ALTER TABLE private.%I OWNER TO %I',t.relname,t.rolname);
 END LOOP;
END$$;
CREATE TEMP TABLE disabled_client AS SELECT c.* FROM fixture f,LATERAL public.sso_manage_client(
 f.ws,f.actor,NULL,0,'Retirement disabled',ARRAY['example.test'],'urn:disabled:sp',ARRAY['https://sp.example.test/acs']) c;
CREATE TEMP TABLE retire_client AS SELECT c.* FROM fixture f,LATERAL public.sso_manage_client(
 f.other_ws,f.other_actor,NULL,0,'Direct retirement',ARRAY['example.test'],'urn:retire:sp',ARRAY['https://sp.example.test/acs']) c;
SELECT public.sso_manage_client(f.other_ws,f.other_actor,c.id,1,'Direct retirement',ARRAY['example.test'],
 'urn:retire:sp',ARRAY['https://sp.example.test/acs'],true) FROM fixture f,retire_client c;
SELECT public.sso_set_assignment(f.other_ws,c.id,f.other_actor,f.other_actor,0,true) FROM fixture f,retire_client c;
CREATE TEMP TABLE retire_login AS SELECT t.id FROM fixture f,retire_client c,LATERAL public.sso_create_transaction(
 f.other_ws,c.id,2,'_retire',repeat('5',64),repeat('b',64),NULL,'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes',true) t;
SELECT public.sso_record_consent(f.other_ws,c.id,t.id,f.other_actor,repeat('b',64),repeat('e',64),2,true)
 FROM fixture f,retire_client c,retire_login t;
SELECT public.sso_manage_client(f.other_ws,f.other_actor,c.id,2,'Direct retirement',ARRAY['example.test'],
 'urn:retire:sp',ARRAY['https://sp.example.test/acs'],false) FROM fixture f,retire_client c;
CREATE TEMP TABLE retained_history AS SELECT
 (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM private.sso_audit_events a) audit,
 (SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM private.sso_disclosure_grants g) disclosures;
SELECT lives_ok($$DELETE FROM public.workspaces WHERE id=(SELECT other_ws FROM fixture)$$,
 'direct workspace deletion succeeds with disabled client, live assignment and consent-bound transaction');
SELECT is((SELECT count(*)::integer FROM private.sso_clients WHERE ws_id=(SELECT other_ws FROM fixture)),0,
 'direct workspace deletion removes disabled client');
SELECT is((SELECT count(*)::integer FROM private.sso_assignments WHERE ws_id=(SELECT other_ws FROM fixture)),0,
 'direct workspace deletion removes live assignment');
SELECT is((SELECT count(*)::integer FROM private.sso_transactions WHERE ws_id=(SELECT other_ws FROM fixture)),0,
 'direct workspace deletion removes consent-bound transaction');
SELECT lives_ok($$DELETE FROM auth.users WHERE id=(SELECT member FROM fixture)$$,
 'actual Auth deletion trigger chain succeeds');
SELECT ok(EXISTS(SELECT 1 FROM public.users WHERE id=(SELECT member FROM fixture)),
 'Auth deletion retains public user proving the actual lifecycle was tested');
SELECT is((SELECT subject FROM private.sso_subjects WHERE subject=(SELECT subject FROM member_subject)),
 (SELECT subject FROM member_subject),'Auth deletion preserves nonrecyclable subject value');
SELECT ok((SELECT user_id IS NULL FROM private.sso_subjects WHERE subject=(SELECT subject FROM member_subject)),
 'Auth deletion unlinks subject from retained public user');
SELECT is((SELECT count(*)::integer FROM private.sso_assignments WHERE user_id=(SELECT member FROM fixture)),0,
 'Auth deletion removes assignments');
SELECT is((SELECT count(*)::integer FROM private.sso_transactions WHERE actor_id=(SELECT member FROM fixture)),0,
 'Auth deletion removes consent-bound transactions');
SELECT is((SELECT count(*)::integer FROM private.sso_disclosure_grants g
 JOIN private.sso_transactions t ON (t.ws_id,t.client_id,t.id)=(g.ws_id,g.client_id,g.transaction_id)
 WHERE g.actor_id=(SELECT member FROM fixture)),0,
 'Auth deletion leaves no live consent authorization; retained receipts are historical');
SELECT lives_ok($$DELETE FROM auth.users WHERE id=(SELECT actor FROM fixture)$$,
 'creator Auth deletion succeeds with clients and immutable history');
SELECT ok((SELECT bool_and(created_by IS NULL) FROM private.sso_clients WHERE ws_id=(SELECT ws FROM fixture)),
 'creator Auth deletion clears live client attribution');
SELECT is((SELECT count(*)::integer FROM private.sso_assignments WHERE ws_id=(SELECT ws FROM fixture)),0,
 'creator Auth deletion removes remaining assignments');
SELECT is((SELECT count(*)::integer FROM private.sso_transactions WHERE actor_id=(SELECT actor FROM fixture)),0,
 'creator Auth deletion removes creator consent-bound transactions');
SELECT lives_ok($$DELETE FROM public.workspaces WHERE id=(SELECT ws FROM fixture)$$,
 'existing hard workspace cleanup succeeds after creator Auth deletion');
SELECT is((SELECT count(*)::integer FROM private.sso_clients WHERE ws_id=(SELECT ws FROM fixture)),0,
 'workspace deletion cascades enabled and disabled clients');
SELECT is((SELECT count(*)::integer FROM private.sso_saml_clients WHERE ws_id=(SELECT ws FROM fixture)),0,'workspace deletion removes saml_clients');
SELECT is((SELECT count(*)::integer FROM private.sso_assignments WHERE ws_id=(SELECT ws FROM fixture)),0,'workspace deletion removes assignments');
SELECT is((SELECT count(*)::integer FROM private.sso_subjects WHERE ws_id=(SELECT ws FROM fixture)),0,'workspace deletion removes subjects');
SELECT is((SELECT count(*)::integer FROM private.sso_transactions WHERE ws_id=(SELECT ws FROM fixture)),0,'workspace deletion removes transactions');
SELECT is((SELECT count(*)::integer FROM private.sso_signing_keys WHERE ws_id=(SELECT ws FROM fixture)),0,'workspace deletion removes signing_keys');
SELECT is((SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM private.sso_audit_events a),
 (SELECT audit FROM retained_history),'Auth and workspace retirement preserve every audit byte');
SELECT is((SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM private.sso_disclosure_grants g),
 (SELECT disclosures FROM retained_history),'retirement preserves immutable historical consent receipts');
SELECT throws_ok($$DELETE FROM private.sso_audit_events$$,'42501','sso_append_only','retired audit remains append only');
SELECT throws_ok($$DELETE FROM private.sso_disclosure_grants$$,'42501','sso_append_only','retired disclosures remain append only');
SELECT throws_ok($$SELECT public.sso_create_transaction(f.ws,c.id,2,'_retired',repeat('4',64),repeat('b',64),NULL,
 'https://sp.example.test/acs',clock_timestamp()+interval '4 minutes') FROM fixture f,clients c$$,
 '42501','sso_forbidden','retired workspace cannot admit issuance');
SELECT * FROM finish();
ROLLBACK;
