-- Removes the SSO metadata rollover certificate projection.
-- Rollback of 20261124134000_sso_metadata_rollover_certificates.sql.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.sso_metadata_certificates(uuid);
