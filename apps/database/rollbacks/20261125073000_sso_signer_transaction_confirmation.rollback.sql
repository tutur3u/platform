-- Removes the SSO signer Worker's transaction confirmation function and role.
-- Rollback of 20261125073000_sso_signer_transaction_confirmation.sql.
-- Disable the Worker's transaction check (or stop its fence) first: without
-- the function every sign request is refused.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

DROP FUNCTION IF EXISTS public.sso_signer_confirm_transaction(uuid, uuid, text);
-- The schema grant is the role's last dependency; DROP ROLE fails while it
-- remains.
REVOKE USAGE ON SCHEMA public FROM sso_signer;
DROP ROLE sso_signer;
