-- Fail on effective client privileges, including inherited and PUBLIC grants.
DO $acl$ BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private' AND p.proname LIKE 'password_vault_%'
   AND (has_function_privilege('anon',p.oid,'EXECUTE')
    OR has_function_privilege('authenticated',p.oid,'EXECUTE')
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
 ) THEN RAISE EXCEPTION 'Vault EXECUTE exposed after rollback'; END IF;
 IF EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relname LIKE 'password_vault%' AND c.relkind IN ('r','v','m','p')
   AND (has_table_privilege('anon',c.oid,'SELECT') OR has_any_column_privilege('anon',c.oid,'SELECT')
    OR has_table_privilege('authenticated',c.oid,'SELECT') OR has_any_column_privilege('authenticated',c.oid,'SELECT')
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
     WHERE a.grantee=0 AND a.privilege_type='SELECT')
    OR EXISTS(SELECT 1 FROM pg_attribute col CROSS JOIN LATERAL aclexplode(col.attacl) a
      WHERE col.attrelid=c.oid AND a.grantee=0 AND a.privilege_type='SELECT'))
 ) THEN RAISE EXCEPTION 'Vault SELECT exposed after rollback'; END IF;
END $acl$;
