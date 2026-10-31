BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(3);
SELECT ok(NOT has_function_privilege($$anon$$, $$public.get_workspace_storage_limit(uuid)$$, $$EXECUTE$$), $$anon storage limit execute$$);
SELECT ok(has_function_privilege($$authenticated$$, $$public.get_workspace_storage_limit(uuid)$$, $$EXECUTE$$), $$authenticated storage limit execute$$);
SELECT ok(has_function_privilege($$service_role$$, $$public.get_workspace_storage_limit(uuid)$$, $$EXECUTE$$), $$service_role storage limit execute$$);
SELECT * FROM finish();
ROLLBACK;
