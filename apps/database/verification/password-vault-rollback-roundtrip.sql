-- Run with psql -X -v ON_ERROR_STOP=1 on a disposable database reset to main.
\set ON_ERROR_STOP on
\ir password-vault-rollback-catalog.sql
CREATE TEMP TABLE rollback_baseline (value jsonb);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='password-vault-files') THEN RAISE EXCEPTION 'Roundtrip requires baseline bucket absence'; END IF; END $$;
SET tuturuuu.rollback.password_vault_bucket_created = 'true';
TRUNCATE rollback_baseline;
INSERT INTO rollback_baseline SELECT value FROM rollback_catalog;
\ir ../supabase/migrations/20261026190000_password_vault_tables.sql
\ir password-vault-rollback-acl.sql
\ir ../rollbacks/20261026190000_password_vault_tables.rollback.sql
\ir password-vault-rollback-acl.sql
DO $$ BEGIN IF (SELECT value FROM rollback_baseline) IS DISTINCT FROM (SELECT value FROM rollback_catalog) THEN RAISE EXCEPTION 'Rollback catalog mismatch: 20261026190000_password_vault_tables'; END IF; END $$;
\echo PASS rollback 20261026190000_password_vault_tables
\ir ../supabase/migrations/20261026190000_password_vault_tables.sql
TRUNCATE rollback_baseline;
INSERT INTO rollback_baseline SELECT value FROM rollback_catalog;
\ir ../supabase/migrations/20261026190100_password_vault_storage.sql
\ir password-vault-rollback-acl.sql
\ir ../rollbacks/20261026190100_password_vault_storage.rollback.sql
\ir password-vault-rollback-acl.sql
DO $$ BEGIN IF (SELECT value FROM rollback_baseline) IS DISTINCT FROM (SELECT value FROM rollback_catalog) THEN RAISE EXCEPTION 'Rollback catalog mismatch: 20261026190100_password_vault_storage'; END IF; END $$;
\echo PASS rollback 20261026190100_password_vault_storage
\ir ../supabase/migrations/20261026190100_password_vault_storage.sql
TRUNCATE rollback_baseline;
INSERT INTO rollback_baseline SELECT value FROM rollback_catalog;
\ir ../supabase/migrations/20261026190200_password_vault_operations.sql
\ir password-vault-rollback-acl.sql
\ir ../rollbacks/20261026190200_password_vault_operations.rollback.sql
\ir password-vault-rollback-acl.sql
DO $$ BEGIN IF (SELECT value FROM rollback_baseline) IS DISTINCT FROM (SELECT value FROM rollback_catalog) THEN RAISE EXCEPTION 'Rollback catalog mismatch: 20261026190200_password_vault_operations'; END IF; END $$;
\echo PASS rollback 20261026190200_password_vault_operations
\ir ../supabase/migrations/20261026190200_password_vault_operations.sql
TRUNCATE rollback_baseline;
INSERT INTO rollback_baseline SELECT value FROM rollback_catalog;
\ir ../supabase/migrations/20261026190300_password_vault_lifecycle.sql
\ir password-vault-rollback-acl.sql
\ir ../rollbacks/20261026190300_password_vault_lifecycle.rollback.sql
\ir password-vault-rollback-acl.sql
DO $$ BEGIN IF (SELECT value FROM rollback_baseline) IS DISTINCT FROM (SELECT value FROM rollback_catalog) THEN RAISE EXCEPTION 'Rollback catalog mismatch: 20261026190300_password_vault_lifecycle'; END IF; END $$;
\echo PASS rollback 20261026190300_password_vault_lifecycle
\ir ../supabase/migrations/20261026190300_password_vault_lifecycle.sql
\ir ../rollbacks/20261026190300_password_vault_lifecycle.rollback.sql
\ir password-vault-rollback-acl.sql
\ir ../rollbacks/20261026190200_password_vault_operations.rollback.sql
\ir password-vault-rollback-acl.sql
\ir ../rollbacks/20261026190100_password_vault_storage.rollback.sql
\ir password-vault-rollback-acl.sql
\ir ../rollbacks/20261026190000_password_vault_tables.rollback.sql
\ir password-vault-rollback-acl.sql
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='private' AND c.relname LIKE 'password_vault%') THEN RAISE EXCEPTION 'Vault relations remain'; END IF; END $$;
\ir ../supabase/migrations/20261026190000_password_vault_tables.sql
\ir ../supabase/migrations/20261026190100_password_vault_storage.sql
\ir ../supabase/migrations/20261026190200_password_vault_operations.sql
\ir ../supabase/migrations/20261026190300_password_vault_lifecycle.sql
\ir password-vault-rollback-acl.sql
\echo PASS all four vault rollback/reapply cycles
