BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
-- Assume supabase_auth_admin for Auth writes only when this session can.
CREATE FUNCTION pg_temp.as_auth_admin() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(nullif(current_setting('role'), 'none'), session_user::text)
       IN ('postgres', 'supabase_auth_admin') THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin')
     AND pg_has_role(session_user, 'supabase_auth_admin', 'SET') THEN
    PERFORM set_config('role', 'supabase_auth_admin', true);
  END IF;
END;
$$;
SELECT pg_temp.as_auth_admin();
INSERT INTO auth.users(id, email, email_confirmed_at, raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000009201', 'signer@signer.test', now(),
  '{"given_name":"Ada","family_name":"Lovelace"}'),
 ('00000000-0000-4000-8000-000000009202', 'second@signer.test', now(),
  '{"given_name":"Grace","family_name":"Hopper"}');
RESET ROLE;
SET LOCAL search_path = public, extensions;
INSERT INTO public.users(id) SELECT id FROM auth.users WHERE id::text LIKE '%00920_' ON CONFLICT DO NOTHING;
INSERT INTO public.workspaces(id, name, personal, creator_id) VALUES
 ('00000000-0000-4000-8000-000000009211', 'SSO signer fixture', false, '00000000-0000-4000-8000-000000009201');
INSERT INTO public.workspace_members(ws_id, user_id, type) VALUES
 ('00000000-0000-4000-8000-000000009211', '00000000-0000-4000-8000-000000009202', 'MEMBER');
CREATE TEMP TABLE sf AS SELECT
 '00000000-0000-4000-8000-000000009211'::uuid ws,
 '00000000-0000-4000-8000-000000009201'::uuid actor,
 '00000000-0000-4000-8000-000000009202'::uuid peer,
 NULL::uuid client, NULL::uuid other_client;
UPDATE sf SET client = (SELECT (public.sso_manage_client(ws, actor, NULL, 0, 'Signer fixture',
 ARRAY['signer.test'], 'urn:signer:sp', ARRAY['https://sp.signer.test/acs'])).id FROM sf);
SELECT public.sso_manage_client(ws, actor, client, 1, 'Signer fixture', ARRAY['signer.test'],
 'urn:signer:sp', ARRAY['https://sp.signer.test/acs'], true) FROM sf;
UPDATE sf SET other_client = (SELECT (public.sso_manage_client(ws, actor, NULL, 0, 'Other fixture',
 ARRAY['signer.test'], 'urn:other:sp', ARRAY['https://sp.signer.test/acs'])).id FROM sf);
SELECT public.sso_manage_client(ws, actor, other_client, 1, 'Other fixture', ARRAY['signer.test'],
 'urn:other:sp', ARRAY['https://sp.signer.test/acs'], true) FROM sf;
SELECT public.sso_set_assignment(ws, client, actor, actor, 0, true) FROM sf;
SELECT public.sso_set_assignment(ws, client, actor, peer, 0, true) FROM sf;
SELECT public.sso_set_assignment(ws, other_client, actor, actor, 0, true) FROM sf;
INSERT INTO private.sso_signing_keys(ws_id, client_id, kid, public_certificate, status, activated_at, not_before, not_after)
 SELECT ws, client, 'key-active', E'-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
  'active', now(), now() - interval '1 hour', now() + interval '1 day' FROM sf
 UNION ALL SELECT ws, client, 'key-pending', E'-----BEGIN CERTIFICATE-----\nBBBB\n-----END CERTIFICATE-----',
  'pending', NULL, now() - interval '1 hour', now() + interval '1 day' FROM sf
 UNION ALL SELECT ws, other_client, 'key-other', E'-----BEGIN CERTIFICATE-----\nCCCC\n-----END CERTIFICATE-----',
  'active', now(), now() - interval '1 hour', now() + interval '1 day' FROM sf;

-- An approved, consumed transaction for p_user, consumed just now.
CREATE FUNCTION pg_temp.consumed(p_label text, p_user uuid DEFAULT NULL, p_approve boolean DEFAULT true,
  p_consume boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v sf; v_id uuid; v_user uuid;
BEGIN
  SELECT * INTO v FROM sf;
  v_user := coalesce(p_user, v.actor);
  v_id := (public.sso_create_transaction(v.ws, v.client, 2, p_label,
    encode(extensions.digest(p_label, 'sha256'), 'hex'), repeat('b', 64), NULL,
    'https://sp.signer.test/acs', clock_timestamp() + interval '4 minutes', true)).id;
  PERFORM public.sso_record_consent(v.ws, v.client, v_id, v_user, repeat('b', 64), repeat('e', 64), 2, p_approve);
  IF p_approve AND p_consume THEN
    PERFORM public.sso_consume_transaction(v.ws, v.client, v_id, v_user, repeat('b', 64), repeat('e', 64), 2);
  END IF;
  RETURN v_id;
END;
$$;
CREATE FUNCTION pg_temp.confirm(p_id uuid, p_kid text DEFAULT 'key-active', p_client uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.sso_signer_confirm_transaction(p_id, coalesce(p_client, (SELECT client FROM sf)), p_kid);
$$;

-- Happy path: exactly the bound fields.
CREATE TEMP TABLE happy AS SELECT pg_temp.consumed('_happy') id;
SELECT is(pg_temp.confirm(h.id), jsonb_build_object(
  'client_id', f.client, 'acs_url', 'https://sp.signer.test/acs', 'sp_entity_id', 'urn:signer:sp',
  'in_response_to', '_happy', 'subject', s.subject, 'email', 'signer@signer.test',
  'given_name', 'Ada', 'family_name', 'Lovelace', 'kid', 'key-active'),
  'approved consumed transaction returns exactly its bound fields')
FROM happy h, sf f JOIN private.sso_subjects s ON s.ws_id = f.ws AND s.client_id = f.client AND s.user_id = f.actor;
SELECT is((SELECT array_agg(a.event_type ORDER BY a.event_type) FROM private.sso_audit_events a, happy h
  WHERE a.transaction_id = h.id), ARRAY['consent.approved', 'transaction.consumed', 'transaction.created'],
  'confirmation appends no audit event');

-- Transaction state.
SELECT is(pg_temp.confirm(pg_temp.consumed('_denied', NULL, false)), NULL::jsonb, 'denied transaction returns NULL');
SELECT is(pg_temp.confirm(pg_temp.consumed('_unconsumed', NULL, true, false)), NULL::jsonb,
  'approved but unconsumed transaction returns NULL');
SELECT is(pg_temp.confirm(gen_random_uuid()), NULL::jsonb, 'unknown transaction returns NULL');
CREATE TEMP TABLE signed AS SELECT pg_temp.consumed('_signed') id;
SELECT isnt(pg_temp.confirm(id), NULL::jsonb, 'control: signed fixture confirms before its audit') FROM signed;
SELECT public.sso_append_audit(f.ws, f.client, s.id, f.actor, 'issuance.signed', 2) FROM sf f, signed s;
SELECT is(pg_temp.confirm(id), NULL::jsonb, 'already signed transaction returns NULL') FROM signed;
CREATE TEMP TABLE failed AS SELECT pg_temp.consumed('_failed') id;
SELECT isnt(pg_temp.confirm(id), NULL::jsonb, 'control: failed fixture confirms before its audit') FROM failed;
SELECT public.sso_append_audit(f.ws, f.client, x.id, f.actor, 'issuance.failed', 2) FROM sf f, failed x;
SELECT is(pg_temp.confirm(id), NULL::jsonb, 'failed transaction returns NULL') FROM failed;
CREATE TEMP TABLE expired AS SELECT pg_temp.consumed('_expired') id;
SELECT isnt(pg_temp.confirm(id), NULL::jsonb, 'control: expiry fixture confirms') FROM expired;
UPDATE private.sso_transactions SET created_at = clock_timestamp() - interval '2 minutes',
  expires_at = clock_timestamp() WHERE id = (SELECT id FROM expired);
SELECT is(pg_temp.confirm(id), NULL::jsonb, 'expired transaction returns NULL') FROM expired;
CREATE TEMP TABLE stale AS SELECT pg_temp.consumed('_stale') id;
SELECT isnt(pg_temp.confirm(id), NULL::jsonb, 'control: window fixture confirms') FROM stale;
UPDATE private.sso_transactions SET consumed_at = clock_timestamp() - interval '6 seconds'
  WHERE id = (SELECT id FROM stale);
SELECT is(pg_temp.confirm(id), NULL::jsonb, 'consume outside the issuance window returns NULL') FROM stale;

-- Client and workspace.
CREATE TEMP TABLE probe AS SELECT pg_temp.consumed('_probe') id;
-- Each fresh call moves the consume to now, so a NULL below comes from the one
-- condition its case flips, never from the issuance window.
CREATE FUNCTION pg_temp.fresh(p_id uuid, p_kid text DEFAULT 'key-active', p_client uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  UPDATE private.sso_transactions SET consumed_at = clock_timestamp() WHERE id = p_id;
  SELECT pg_temp.confirm(p_id, p_kid, p_client);
$$;
CREATE FUNCTION pg_temp.probe(p_kid text DEFAULT 'key-active', p_client uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql AS $$ SELECT pg_temp.fresh((SELECT id FROM probe), p_kid, p_client); $$;
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms');
UPDATE private.sso_clients SET enabled = false WHERE id = (SELECT client FROM sf);
SELECT is(pg_temp.probe(), NULL::jsonb, 'disabled client returns NULL');
UPDATE private.sso_clients SET enabled = true WHERE id = (SELECT client FROM sf);
UPDATE private.sso_clients SET policy_revision = 3 WHERE id = (SELECT client FROM sf);
SELECT is(pg_temp.probe(), NULL::jsonb, 'policy revision changed since consume returns NULL');
UPDATE private.sso_clients SET policy_revision = 2 WHERE id = (SELECT client FROM sf);
UPDATE private.sso_saml_clients SET acs_urls = ARRAY['https://sp.signer.test/other'] WHERE client_id = (SELECT client FROM sf);
SELECT is(pg_temp.probe(), NULL::jsonb, 'ACS removed from the profile returns NULL');
UPDATE private.sso_saml_clients SET acs_urls = ARRAY['https://sp.signer.test/acs'] WHERE client_id = (SELECT client FROM sf);
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms after client restore');
-- One personal workspace per creator: lend the flag from the actor's own.
ALTER TABLE public.workspaces DISABLE TRIGGER enforce_unique_personal_workspace_tr;
CREATE TEMP TABLE own_personal AS SELECT w.id FROM public.workspaces w, sf f
  WHERE w.creator_id = f.actor AND w.personal AND w.id <> f.ws;
UPDATE public.workspaces SET personal = false WHERE id IN (SELECT id FROM own_personal);
UPDATE public.workspaces SET personal = true WHERE id = (SELECT ws FROM sf);
SELECT is(pg_temp.probe(), NULL::jsonb, 'personal workspace returns NULL');
UPDATE public.workspaces SET personal = false WHERE id = (SELECT ws FROM sf);
UPDATE public.workspaces SET personal = true WHERE id IN (SELECT id FROM own_personal);
ALTER TABLE public.workspaces ENABLE TRIGGER enforce_unique_personal_workspace_tr;
UPDATE public.workspaces SET deleted = true WHERE id = (SELECT ws FROM sf);
SELECT is(pg_temp.probe(), NULL::jsonb, 'deleted workspace returns NULL');
UPDATE public.workspaces SET deleted = false WHERE id = (SELECT ws FROM sf);
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms after workspace restore');

-- Kid and client binding.
SELECT is(pg_temp.probe('key-pending'), NULL::jsonb, 'pending kid returns NULL');
SELECT is(pg_temp.probe('key-none'), NULL::jsonb, 'unknown kid returns NULL');
SELECT is(pg_temp.probe('key-other'), NULL::jsonb, 'another client''s active kid returns NULL');
SELECT is(pg_temp.probe('key-other', f.other_client), NULL::jsonb, 'wrong client returns NULL') FROM sf f;
SELECT is(pg_temp.probe('key-active', f.other_client), NULL::jsonb, 'wrong client with the right kid returns NULL') FROM sf f;
UPDATE private.sso_signing_keys SET not_after = clock_timestamp() WHERE kid = 'key-active';
SELECT is(pg_temp.probe(), NULL::jsonb, 'active kid outside its validity window returns NULL');
UPDATE private.sso_signing_keys SET not_after = now() + interval '1 day' WHERE kid = 'key-active';
UPDATE private.sso_signing_keys SET status = 'retiring', retired_at = clock_timestamp() WHERE kid = 'key-active';
SELECT is(pg_temp.probe(), NULL::jsonb, 'retired kid returns NULL');
UPDATE private.sso_signing_keys SET status = 'active', retired_at = NULL WHERE kid = 'key-active';
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms after key restore');

-- Actor membership, assignment and account.
UPDATE private.sso_assignments SET active = false WHERE user_id = (SELECT actor FROM sf) AND client_id = (SELECT client FROM sf);
SELECT is(pg_temp.probe(), NULL::jsonb, 'revoked assignment returns NULL');
UPDATE private.sso_assignments SET active = true WHERE user_id = (SELECT actor FROM sf) AND client_id = (SELECT client FROM sf);
-- Auth writes run as supabase_auth_admin, which cannot read the session's
-- temp tables, so they name the actor literally.
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET banned_until = clock_timestamp() + interval '1 hour' WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'banned account returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET banned_until = NULL, email_confirmed_at = NULL WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'unconfirmed email returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET email_confirmed_at = now(), raw_user_meta_data = '{"family_name":"Lovelace"}'
  WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'missing given name returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET raw_user_meta_data = '{"given_name":"Augusta","family_name":"King"}',
  email = 'ada@signer.test' WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SET LOCAL search_path = public, extensions;
SELECT is(pg_temp.probe() - 'subject', jsonb_build_object('client_id', f.client, 'acs_url', 'https://sp.signer.test/acs',
  'sp_entity_id', 'urn:signer:sp', 'in_response_to', '_probe', 'email', 'ada@signer.test',
  'given_name', 'Augusta', 'family_name', 'King', 'kid', 'key-active'),
  'email and names are read fresh from Auth') FROM sf f;
-- Account, subject and key edge cases: each flip follows its own control.
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms before the anonymous flip');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET is_anonymous = true WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'anonymous account returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET is_anonymous = false WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms before the deleted-account flip');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET deleted_at = clock_timestamp() WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'soft-deleted account returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET deleted_at = NULL WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms before the missing-email flip');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET email = NULL WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'missing email returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET email = 'ada@signer.test' WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms before the family-name flips');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET raw_user_meta_data = '{"given_name":"Augusta","family_name":42}'
  WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'non-string family name returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET raw_user_meta_data = '{"given_name":"Augusta","family_name":null}'
  WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SELECT is(pg_temp.probe(), NULL::jsonb, 'JSON null family name returns NULL');
SELECT pg_temp.as_auth_admin();
UPDATE auth.users SET raw_user_meta_data = '{"given_name":"Augusta","family_name":"King"}'
  WHERE id = '00000000-0000-4000-8000-000000009201';
RESET ROLE;
SET LOCAL search_path = public, extensions;
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms before the missing-subject flip');
CREATE TEMP TABLE saved_subject AS SELECT j.* FROM private.sso_subjects j, sf f
  WHERE j.ws_id = f.ws AND j.client_id = f.client AND j.user_id = f.actor;
SELECT is((SELECT count(*)::integer FROM saved_subject), 1, 'isolation: the actor has one pairwise subject');
DELETE FROM private.sso_subjects j USING sf f
  WHERE j.ws_id = f.ws AND j.client_id = f.client AND j.user_id = f.actor;
SELECT is(pg_temp.probe(), NULL::jsonb, 'missing pairwise subject returns NULL');
INSERT INTO private.sso_subjects SELECT * FROM saved_subject;
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms before the not-yet-valid key flip');
UPDATE private.sso_signing_keys SET not_before = clock_timestamp() + interval '1 hour' WHERE kid = 'key-active';
SELECT is(pg_temp.probe(), NULL::jsonb, 'active kid before its not_before returns NULL');
UPDATE private.sso_signing_keys SET not_before = now() - interval '1 hour' WHERE kid = 'key-active';
SELECT isnt(pg_temp.probe(), NULL::jsonb, 'control: probe confirms after the edge-case restores');
CREATE TEMP TABLE second_login AS SELECT pg_temp.consumed('_second', (SELECT peer FROM sf)) id;
SELECT isnt(pg_temp.fresh(id), NULL::jsonb, 'control: second member confirms') FROM second_login;
-- Member type changes need a manager: act as the workspace creator.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009201', true);
-- Isolate the membership join from the trigger that also revokes assignments.
ALTER TABLE public.workspace_members DISABLE TRIGGER sso_revoke_demoted_assignments;
UPDATE public.workspace_members SET type = 'GUEST' WHERE ws_id = (SELECT ws FROM sf) AND user_id = (SELECT peer FROM sf);
SELECT ok(EXISTS (SELECT 1 FROM private.sso_assignments a, sf f WHERE a.user_id = f.peer AND a.active),
  'isolation: the demoted member keeps an active assignment');
SELECT is(pg_temp.fresh(id), NULL::jsonb, 'demoted member returns NULL') FROM second_login;
UPDATE public.workspace_members SET type = 'MEMBER' WHERE ws_id = (SELECT ws FROM sf) AND user_id = (SELECT peer FROM sf);
ALTER TABLE public.workspace_members ENABLE TRIGGER sso_revoke_demoted_assignments;
SELECT isnt(pg_temp.fresh(id), NULL::jsonb, 'control: restored member confirms') FROM second_login;
UPDATE public.workspace_members SET type = 'GUEST' WHERE ws_id = (SELECT ws FROM sf) AND user_id = (SELECT peer FROM sf);
SELECT is(pg_temp.fresh(id), NULL::jsonb, 'demotion through the normal path returns NULL') FROM second_login;
SELECT set_config('request.jwt.claim.sub', '', true);

-- Privileges: only sso_signer executes, and it reads nothing directly.
SELECT ok(NOT has_function_privilege(r, 'public.sso_signer_confirm_transaction(uuid,uuid,text)', 'EXECUTE'),
  r || ' cannot execute the signer confirmation') FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) r;
SELECT ok(has_function_privilege('sso_signer', 'public.sso_signer_confirm_transaction(uuid,uuid,text)', 'EXECUTE'),
  'sso_signer can execute the signer confirmation');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  WHERE p.oid = 'public.sso_signer_confirm_transaction(uuid,uuid,text)'::regprocedure AND a.grantee = 0),
  'PUBLIC holds no privilege on the signer confirmation');
SELECT is((SELECT array_agg(a.grantee::regrole::text ORDER BY a.grantee::regrole::text) FROM pg_proc p,
  LATERAL aclexplode(p.proacl) a WHERE p.oid = 'public.sso_signer_confirm_transaction(uuid,uuid,text)'::regprocedure
  AND a.grantee <> p.proowner), ARRAY['sso_signer'], 'the only non-owner grantee is sso_signer');
SELECT ok(p.prosecdef AND p.provolatile = 's' AND p.proconfig = ARRAY['search_path=pg_catalog, pg_temp'],
  'definer is STABLE with the hardened search_path')
FROM pg_proc p WHERE p.oid = 'public.sso_signer_confirm_transaction(uuid,uuid,text)'::regprocedure;
SELECT ok(NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb
  AND NOT r.rolreplication AND NOT r.rolinherit AND r.rolconnlimit = 8, 'sso_signer is a NOLOGIN least-privilege role')
FROM pg_roles r WHERE r.rolname = 'sso_signer';
SELECT ok((SELECT s.setconfig @> ARRAY['statement_timeout=2s', 'lock_timeout=1s', 'idle_in_transaction_session_timeout=5s']
  FROM pg_db_role_setting s WHERE s.setrole = 'sso_signer'::regrole AND s.setdatabase = 0), 'sso_signer sessions are time-bounded');
-- Role membership: sso_signer is in no role. The only row naming it is the
-- creator's implicit administrative grant (Postgres 16+), which lets the
-- release authority enable LOGIN later; it neither inherits nor sets.
SELECT is((SELECT count(*)::integer FROM pg_auth_members m WHERE m.member = 'sso_signer'::regrole), 0,
  'sso_signer is a member of no role');
SELECT is((SELECT count(*)::integer FROM pg_auth_members m WHERE m.roleid = 'sso_signer'::regrole
  AND (m.inherit_option OR m.set_option OR NOT m.admin_option)), 0,
  'only an administrative grant names sso_signer, with no inherit or set');
SELECT diag('sso_signer administrators: ' || coalesce((SELECT string_agg(m.member::regrole::text, ', ' ORDER BY 1)
  FROM pg_auth_members m WHERE m.roleid = 'sso_signer'::regrole), 'none'));
-- Direct grants: none but the one function. Anything else sso_signer can
-- reach, it reaches through PUBLIC like every other role.
SELECT is((SELECT count(*)::integer FROM pg_class c, LATERAL aclexplode(c.relacl) a
  WHERE a.grantee = 'sso_signer'::regrole), 0, 'sso_signer holds no direct table, view or sequence grant');
SELECT is((SELECT array_agg(p.oid::regprocedure::text) FROM pg_proc p, LATERAL aclexplode(p.proacl) a
  WHERE a.grantee = 'sso_signer'::regrole), ARRAY['sso_signer_confirm_transaction(uuid,uuid,text)'],
  'sso_signer holds a direct grant on the confirmation function only');
CREATE TEMP TABLE signer_reach AS SELECT c.oid::regclass::text AS object,
  EXISTS (SELECT 1 FROM aclexplode(c.relacl) a WHERE a.grantee = 0) AS via_public
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S') AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
  AND has_schema_privilege('sso_signer', n.oid, 'USAGE')
  AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('sso_signer', c.oid, 'USAGE,SELECT,UPDATE')
    ELSE has_table_privilege('sso_signer', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') END;
SELECT is((SELECT count(*)::integer FROM signer_reach WHERE NOT via_public), 0,
  'every table, view or sequence sso_signer can reach is granted to PUBLIC, not to it');
SELECT diag('reachable through PUBLIC: ' || coalesce((SELECT string_agg(object, ', ' ORDER BY object) FROM signer_reach), 'none'));
CREATE TEMP TABLE signer_definers AS SELECT p.oid::regprocedure::text AS routine,
  p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS via_public
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef AND n.nspname IN ('public', 'private', 'auth', 'storage', 'extensions')
  AND has_function_privilege('sso_signer', p.oid, 'EXECUTE')
  AND p.oid <> 'public.sso_signer_confirm_transaction(uuid,uuid,text)'::regprocedure;
SELECT is((SELECT count(*)::integer FROM signer_definers WHERE NOT via_public), 0,
  'every other definer sso_signer can execute is executable by PUBLIC, not granted to it');
SELECT diag('definers executable through PUBLIC: ' || coalesce((SELECT string_agg(routine, ', ' ORDER BY routine)
  FROM signer_definers), 'none'));
-- Nothing beyond anon: every schema, relation (by privilege) and routine
-- sso_signer can reach, anon reaches too; the confirmation function aside.
CREATE TEMP TABLE signer_beyond_anon AS
SELECT 'schema ' || n.nspname || ' ' || p AS item FROM pg_namespace n, unnest(ARRAY['USAGE', 'CREATE']) p
WHERE n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast%'
  AND has_schema_privilege('sso_signer', n.oid, p) AND NOT has_schema_privilege('anon', n.oid, p)
UNION ALL
SELECT 'relation ' || c.oid::regclass::text || ' ' || p FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace,
  unnest(CASE WHEN c.relkind = 'S' THEN ARRAY['USAGE', 'SELECT', 'UPDATE']
    ELSE ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] END) p
WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast%'
  AND has_schema_privilege('sso_signer', n.oid, 'USAGE')
  AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('sso_signer', c.oid, p)
    ELSE has_table_privilege('sso_signer', c.oid, p) END
  AND NOT (has_schema_privilege('anon', n.oid, 'USAGE')
    AND CASE WHEN c.relkind = 'S' THEN has_sequence_privilege('anon', c.oid, p)
      ELSE has_table_privilege('anon', c.oid, p) END)
UNION ALL
SELECT 'routine ' || p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname NOT LIKE 'pg_temp%'
  AND p.oid <> 'public.sso_signer_confirm_transaction(uuid,uuid,text)'::regprocedure
  AND has_schema_privilege('sso_signer', n.oid, 'USAGE') AND has_function_privilege('sso_signer', p.oid, 'EXECUTE')
  AND NOT (has_schema_privilege('anon', n.oid, 'USAGE') AND has_function_privilege('anon', p.oid, 'EXECUTE'));
SELECT is((SELECT array_agg(item ORDER BY item) FROM signer_beyond_anon), NULL::text[],
  'sso_signer reaches no schema, relation or routine that anon does not');
-- Allow-list: every ACL entry naming sso_signer, across object kinds
-- (including column grants and parameter grants), and it owns nothing.
CREATE TEMP TABLE signer_acl AS
SELECT 'schema ' || x.nspname || ' ' || a.privilege_type AS item FROM pg_namespace x, aclexplode(x.nspacl) a
  WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'relation ' || x.oid::regclass::text || ' ' || a.privilege_type FROM pg_class x, aclexplode(x.relacl) a
  WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'column ' || x.attrelid::regclass::text || '.' || x.attname || ' ' || a.privilege_type
  FROM pg_attribute x, aclexplode(x.attacl) a WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'routine ' || x.oid::regprocedure::text || ' ' || a.privilege_type FROM pg_proc x, aclexplode(x.proacl) a
  WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'database ' || x.datname || ' ' || a.privilege_type FROM pg_database x, aclexplode(x.datacl) a
  WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'type ' || x.oid::regtype::text || ' ' || a.privilege_type FROM pg_type x, aclexplode(x.typacl) a
  WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'language ' || x.lanname || ' ' || a.privilege_type FROM pg_language x, aclexplode(x.lanacl) a
  WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'foreign data wrapper ' || x.fdwname || ' ' || a.privilege_type
  FROM pg_foreign_data_wrapper x, aclexplode(x.fdwacl) a WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'foreign server ' || x.srvname || ' ' || a.privilege_type
  FROM pg_foreign_server x, aclexplode(x.srvacl) a WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'large object ' || x.oid::text || ' ' || a.privilege_type
  FROM pg_largeobject_metadata x, aclexplode(x.lomacl) a WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'parameter ' || x.parname || ' ' || a.privilege_type FROM pg_parameter_acl x, aclexplode(x.paracl) a
  WHERE a.grantee = 'sso_signer'::regrole
UNION ALL SELECT 'default privilege ' || x.defaclobjtype::text || ' ' || a.privilege_type
  FROM pg_default_acl x, aclexplode(x.defaclacl) a WHERE a.grantee = 'sso_signer'::regrole;
SELECT is((SELECT array_agg(item ORDER BY item) FROM signer_acl),
  ARRAY['routine sso_signer_confirm_transaction(uuid,uuid,text) EXECUTE', 'schema public USAGE'],
  'the only privileges granted to sso_signer are EXECUTE on the confirmation and USAGE on schema public');
SELECT is((SELECT count(*)::integer FROM pg_shdepend d WHERE d.refclassid = 'pg_authid'::regclass
  AND d.refobjid = 'sso_signer'::regrole AND d.deptype = 'o'), 0, 'sso_signer owns no object');
SELECT set_config('sso_test.transaction', (SELECT id::text FROM happy), true);
SELECT set_config('sso_test.client', (SELECT client::text FROM sf), true);
UPDATE private.sso_transactions SET consumed_at = clock_timestamp() WHERE id = (SELECT id FROM happy);
SET LOCAL ROLE sso_signer;
SELECT set_config('sso_test.as_signer', coalesce(public.sso_signer_confirm_transaction(
  current_setting('sso_test.transaction')::uuid, current_setting('sso_test.client')::uuid, 'key-active')->>'kid', 'null'), true);
DO $$ BEGIN
  PERFORM 1 FROM private.sso_transactions;
  PERFORM set_config('sso_test.private_read', 'allowed', true);
EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('sso_test.private_read', 'denied', true);
END $$;
DO $$ BEGIN
  PERFORM 1 FROM auth.users;
  PERFORM set_config('sso_test.auth_read', 'allowed', true);
EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('sso_test.auth_read', 'denied', true);
END $$;
DO $$ BEGIN
  PERFORM 1 FROM public.workspace_members;
  PERFORM set_config('sso_test.public_read', 'allowed', true);
EXCEPTION WHEN insufficient_privilege THEN PERFORM set_config('sso_test.public_read', 'denied', true);
END $$;
RESET ROLE;
SELECT is(current_setting('sso_test.as_signer'), 'key-active', 'sso_signer confirms through the definer');
SELECT is(current_setting('sso_test.private_read'), 'denied', 'sso_signer cannot read SSO tables');
SELECT is(current_setting('sso_test.auth_read'), 'denied', 'sso_signer cannot read Auth users');
SELECT is(current_setting('sso_test.public_read'), 'denied', 'sso_signer cannot read workspace members');
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.sso_signer_confirm_transaction(gen_random_uuid(), gen_random_uuid(), 'k')$$,
  '42501', NULL, 'service_role cannot call the signer confirmation');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.sso_signer_confirm_transaction(gen_random_uuid(), gen_random_uuid(), 'k')$$,
  '42501', NULL, 'authenticated cannot call the signer confirmation');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
