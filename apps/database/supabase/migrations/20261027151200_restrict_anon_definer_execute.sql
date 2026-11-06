-- Preserve signed-out policy evaluation and token exchange at explicit boundaries.
-- Auth hooks keep their supabase_auth_admin grants. Trigger dispatch does not
-- check EXECUTE; invoker trigger bodies still check their nested function calls.
DO $migration$
DECLARE
  fn record;
  creator record;
  named_role record;
  default_access boolean;
  global_public_default boolean;
  explicit_default_access boolean;
  anonymous_allowlist oid[] := ARRAY[
    -- PUBLIC/anon RLS membership evaluation must return false rather than 42501.
    -- apps/database/supabase/migrations/20250929072433_lead_generation.sql:153
    'public.is_org_member(uuid,uuid)'::regprocedure::oid,
    -- PUBLIC changelog policies and the anon-readable wallet view use this helper.
    -- apps/database/supabase/migrations/20251130000002_update_changelog_rls_with_permission.sql:15
    'public.has_workspace_permission(uuid,uuid,text)'::regprocedure::oid,
    -- SECURITY INVOKER check_account_request calls the limiter for signed-out requests.
    -- apps/database/supabase/migrations/20260925014000_anonymous_account_request.sql:16
    'public.check_request()'::regprocedure::oid,
    -- One-time token validation occurs before the destination has a session.
    -- apps/web/src/app/api/v1/auth/app-token/exchange/route.ts:509
    -- packages/auth/src/cross-app/server.ts:94
    'public.validate_cross_app_token_with_session(text,text)'::regprocedure::oid,
    -- Conservative legacy pre-session API compatibility; no current first-party
    -- caller was found. The retained interface is referenced by this contract:
    -- apps/database/supabase/tests/private-schema-auth-credential-tables.sql:197
    'public.validate_cross_app_token(text,text)'::regprocedure::oid,
    -- Conservative exception: the storage INSERT trigger is SECURITY INVOKER,
    -- so a signed-out upload may need EXECUTE on its nested quota lookup.
    -- apps/database/supabase/migrations/20260309224924_fix_workspace_storage_limit_logic.sql:72
    'public.get_workspace_storage_limit(uuid)'::regprocedure::oid
  ];
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_before,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_before
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT p.oid = ANY(anonymous_allowlist)
  LOOP
    EXECUTE format('revoke execute on function %s from public, anon', fn.oid::regprocedure);
    IF fn.proname NOT IN ('record_email_bounce', 'record_email_complaint') THEN
      IF fn.authenticated_before
        AND NOT has_function_privilege('authenticated', fn.oid, 'EXECUTE') THEN
        EXECUTE format('grant execute on function %s to authenticated', fn.oid::regprocedure);
      END IF;
      IF fn.service_role_before
        AND NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
        EXECUTE format('grant execute on function %s to service_role', fn.oid::regprocedure);
      END IF;
    END IF;
  END LOOP;

  -- Provider ingestion only; intentionally excluded from authenticated restoration.
  -- No application RPC callers exist in apps/*, packages/* or Worker sources.
  FOR fn IN
    SELECT p.oid FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('record_email_bounce', 'record_email_complaint')
  LOOP
    EXECUTE format('revoke execute on function %s from public, anon, authenticated', fn.oid::regprocedure);
    EXECUTE format('grant execute on function %s to service_role', fn.oid::regprocedure);
  END LOOP;

  -- Application migrations create functions as postgres. As in the existing
  -- default-ACL migration, include supabase_admin only when this connection can
  -- act as that provider role. Provider-owned defaults require that role's owner.
  -- apps/database/supabase/migrations/20260522172925_harden_proxy_only_public_tables.sql:88
  FOR creator IN
    SELECT oid, rolname FROM pg_roles
    WHERE rolname IN ('postgres', 'supabase_admin')
      AND pg_has_role(oid, 'MEMBER')
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM aclexplode(coalesce((
        SELECT defaclacl FROM pg_default_acl
        WHERE defaclrole = creator.oid AND defaclnamespace = 0 AND defaclobjtype = 'f'
      ), acldefault('f', creator.oid))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) INTO global_public_default;
    -- A schema REVOKE cannot subtract PostgreSQL's global PUBLIC function default.
    -- Snapshot the effective default for signed-in/service callers before both
    -- global and schema revokes, then restore only access that depended on PUBLIC.
    FOR named_role IN SELECT unnest(ARRAY['authenticated', 'service_role']) AS role_name
    LOOP
      SELECT coalesce(bool_or(CASE WHEN a.grantee = 0 THEN true
          ELSE pg_has_role(named_role.role_name, a.grantee, 'USAGE') END), false),
        coalesce(bool_or(CASE WHEN a.grantee = 0 THEN false
          ELSE pg_has_role(named_role.role_name, a.grantee, 'USAGE') END), false)
      INTO default_access, explicit_default_access
      FROM (
        SELECT a.* FROM aclexplode(coalesce((
          SELECT defaclacl FROM pg_default_acl
          WHERE defaclrole = creator.oid AND defaclnamespace = 0 AND defaclobjtype = 'f'
        ), acldefault('f', creator.oid))) a
        UNION ALL
        SELECT a.* FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
        WHERE d.defaclrole = creator.oid
          AND d.defaclnamespace = 'public'::regnamespace AND d.defaclobjtype = 'f'
      ) a WHERE a.privilege_type = 'EXECUTE';

      IF default_access AND NOT explicit_default_access THEN
        -- Preserve the scope of the old grant, including temporary/invoker
        -- helpers outside public when their access came from global PUBLIC.
        EXECUTE format('alter default privileges for role %I%s grant execute on functions to %I',
          creator.rolname, CASE WHEN global_public_default THEN '' ELSE ' in schema public' END,
          named_role.role_name);
      END IF;
    END LOOP;
    EXECUTE format('alter default privileges for role %I revoke execute on functions from public, anon', creator.rolname);
    EXECUTE format('alter default privileges for role %I in schema public revoke execute on functions from public, anon', creator.rolname);
  END LOOP;
END;
$migration$;
