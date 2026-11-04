-- Manual rollback for 20261104183000_auth_synced_private_details_email.sql.
-- Re-opens SR-926: signed-in users can again overwrite their own
-- user_private_details.email. Roll back only together with, or after, app code
-- that never treats that column as identity. Touches no rows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop trigger if exists enforce_auth_synced_private_details_email
  on public.user_private_details;
drop function if exists private.keep_auth_synced_private_details_email();

commit;
