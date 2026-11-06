BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
-- Changed paths from the legacy 24-26 matrix, without reasserting unrelated RPC ACLs.
SELECT ok(has_function_privilege('authenticated',sig,'EXECUTE'),'authenticated EXECUTE: '||sig) FROM (VALUES ('public.has_workspace_permission(uuid,uuid,text)'),('public.is_org_member(uuid,uuid)'),('public.get_workspace_storage_limit(uuid)')) f(sig);
SELECT ok(has_function_privilege('service_role',sig,'EXECUTE'),'service_role EXECUTE: '||sig) FROM (VALUES ('public.has_workspace_permission(uuid,uuid,text)'),('public.is_org_member(uuid,uuid)'),('public.get_workspace_storage_limit(uuid)')) f(sig);
SELECT ok(NOT has_function_privilege('anon','public.get_workspace_storage_limit(uuid)','EXECUTE'),'anon does not inherit storage quota EXECUTE');
SELECT is((SELECT provolatile::text FROM pg_proc WHERE oid='public.is_org_member(uuid,uuid)'::regprocedure),'s','membership predicate is STABLE');
SELECT * FROM finish();
ROLLBACK;
