CREATE OR REPLACE TEMP VIEW rollback_catalog AS
SELECT jsonb_build_object(
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner,p.proacl) ORDER BY p.oid::regprocedure::text),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname LIKE 'password_vault_%'),
 'tables',(SELECT coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname LIKE 'password_vault%' AND c.relkind='r'),
 'policies',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.policyname),'[]') FROM pg_policies p WHERE p.policyname LIKE 'password_vault_%'),
 'bucket',(SELECT coalesce(jsonb_agg(to_jsonb(b)-'created_at'-'updated_at'),'[]') FROM storage.buckets b WHERE b.id='password-vault-files'),
 'schema',(SELECT to_jsonb(n.nspacl) FROM pg_namespace n WHERE n.nspname='private')
) AS value;
