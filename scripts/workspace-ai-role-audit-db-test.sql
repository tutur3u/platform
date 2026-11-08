-- Disposable reduced schema; run with psql -v ON_ERROR_STOP=1 -v apply_audit=false/true.
-- Provision anon/authenticated/service_role/postgres in the isolated cluster.
-- actor_sql contains the two audit functions preceding the first public function
-- in 20260401134200_preserve_workspace_user_audit_actor_context.sql.
CREATE SCHEMA extensions;
CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '11111111-1111-4111-8111-111111111111'::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated'::text $$;
CREATE TABLE public.users (id uuid PRIMARY KEY);
INSERT INTO public.users VALUES (auth.uid());
CREATE TABLE public.workspaces (id uuid PRIMARY KEY);
CREATE TABLE public.workspace_members (ws_id uuid, user_id uuid);




\i apps/database/supabase/migrations/20230428053924_add_supa_audit_v0.3.1.sql
\i :actor_sql
CREATE TABLE public.workspace_role_permissions (ws_id uuid, role_id uuid, permission text, enabled boolean, PRIMARY KEY(ws_id, role_id, permission));
CREATE TABLE public.workspace_role_members (role_id uuid, user_id uuid, PRIMARY KEY(role_id, user_id));
\if :apply_audit
\i apps/database/supabase/migrations/20261104121700_workspace_ai_role_audit.sql
\endif
INSERT INTO public.workspace_role_permissions VALUES ('22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','update_user_groups',true);
UPDATE public.workspace_role_permissions SET enabled=false;
DELETE FROM public.workspace_role_permissions;
INSERT INTO public.workspace_role_members VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');
UPDATE public.workspace_role_members SET user_id='44444444-4444-4444-8444-444444444444';
DELETE FROM public.workspace_role_members;
DO $$
BEGIN
  IF (SELECT count(*) FROM audit.record_version WHERE table_name IN ('workspace_role_permissions','workspace_role_members')) <> 6 THEN
    RAISE EXCEPTION 'role permission and membership INSERT/UPDATE/DELETE audit missing';
  END IF;
  IF EXISTS (SELECT 1 FROM audit.record_version WHERE auth_uid IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'audit actor missing';
  END IF;
  IF (SELECT count(DISTINCT op) FROM audit.record_version) <> 3 THEN
    RAISE EXCEPTION 'audit operation missing';
  END IF;
END $$;
\echo PASS: role permission and membership changes audited with actor and old/new records
