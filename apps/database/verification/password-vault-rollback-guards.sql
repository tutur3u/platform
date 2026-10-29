-- Run from the repository root. Read the actual rollback file for every guard control.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION pg_temp.expect_rollback_refusal(p_sql text, p_message text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE refused boolean := false;
BEGIN
 BEGIN
  EXECUTE p_sql;
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE p_message || '%' THEN RAISE; END IF;
  refused := true;
 END;
 IF NOT refused THEN RAISE EXCEPTION 'Rollback unexpectedly accepted retained data' USING ERRCODE='XX000'; END IF;
END $fn$;
BEGIN;
SET LOCAL tuturuuu.rollback.password_vault_bucket_created = 'false';
\set rollback_sql `sed '/^BEGIN;$/d; /^COMMIT;$/d' apps/database/rollbacks/20261026190100_password_vault_storage.rollback.sql`
SELECT pg_temp.expect_rollback_refusal(:'rollback_sql', 'Rollback refused: confirm from pre-migration evidence');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='password-vault-files') THEN
 RAISE EXCEPTION 'Unconfirmed bucket was removed'; END IF; END $$;
ROLLBACK;
\echo PASS bucket provenance guard

BEGIN;
INSERT INTO private.password_vault_audit_events(ws_id,request_id,actor_user_id,event_type,metadata)
VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'vault.list','{"revision":0,"authorizationEpoch":0}');

\set rollback_sql `sed '/^BEGIN;$/d; /^COMMIT;$/d' apps/database/rollbacks/20261026190000_password_vault_tables.rollback.sql`
SELECT pg_temp.expect_rollback_refusal(:'rollback_sql', 'Rollback refused:');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.password_vault_audit_events) THEN RAISE EXCEPTION 'Rollback lost retained fixture'; END IF; END $$;
ROLLBACK;
\echo PASS retained-data guard 20261026190000_password_vault_tables.rollback
BEGIN;
SET LOCAL tuturuuu.rollback.password_vault_bucket_created = 'true';
INSERT INTO storage.objects(bucket_id,name) VALUES ('password-vault-files','rollback-guard-ciphertext');

\set rollback_sql `sed '/^BEGIN;$/d; /^COMMIT;$/d' apps/database/rollbacks/20261026190100_password_vault_storage.rollback.sql`
SELECT pg_temp.expect_rollback_refusal(:'rollback_sql', 'Rollback refused:');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='password-vault-files') THEN RAISE EXCEPTION 'Rollback lost retained fixture'; END IF; END $$;
ROLLBACK;
\echo PASS retained-data guard 20261026190100_password_vault_storage.rollback
BEGIN;
INSERT INTO private.password_vault_lifecycle_jobs(kind,user_id) VALUES ('account',gen_random_uuid());

\set rollback_sql `sed '/^BEGIN;$/d; /^COMMIT;$/d' apps/database/rollbacks/20261026190300_password_vault_lifecycle.rollback.sql`
SELECT pg_temp.expect_rollback_refusal(:'rollback_sql', 'Rollback refused:');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM private.password_vault_lifecycle_jobs) THEN RAISE EXCEPTION 'Rollback lost retained fixture'; END IF; END $$;
ROLLBACK;
\echo PASS retained-data guard 20261026190300_password_vault_lifecycle.rollback
