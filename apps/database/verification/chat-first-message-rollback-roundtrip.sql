-- Run with psql -X -v ON_ERROR_STOP=1 after an isolated reset to main.
\set ON_ERROR_STOP on
CREATE OR REPLACE TEMP VIEW rollback_catalog AS
SELECT jsonb_build_object(
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proowner,p.proacl) ORDER BY p.oid::regprocedure::text),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('chat_create_conversation','chat_creation_receipt_json','chat_create_ai_first_message')),
 'receipt',(SELECT coalesce(jsonb_agg(jsonb_build_array(c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname='chat_creation_requests')
) AS value;
CREATE TEMP TABLE rollback_baseline AS SELECT value FROM rollback_catalog;
\ir ../supabase/migrations/20261029100000_chat_first_message_creation_receipts.sql
\ir ../rollbacks/20261029100000_chat_first_message_creation_receipts.rollback.sql
DO $$ BEGIN
 IF (SELECT value FROM rollback_catalog) IS DISTINCT FROM (SELECT value FROM rollback_baseline) THEN
 RAISE EXCEPTION 'Chat rollback did not restore main function definition, owner, ACL and settings'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname IN ('chat_create_conversation','chat_creation_receipt_json','chat_create_ai_first_message')
 AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))) THEN
 RAISE EXCEPTION 'Chat rollback exposed EXECUTE'; END IF;
 IF to_regclass('private.chat_creation_requests') IS NOT NULL THEN
 RAISE EXCEPTION 'Chat receipt SELECT surface remains after rollback'; END IF;
END $$;
\echo PASS chat rollback restored prior definitions and service-only ACL
\ir ../supabase/migrations/20261029100000_chat_first_message_creation_receipts.sql
\echo PASS chat reapply
