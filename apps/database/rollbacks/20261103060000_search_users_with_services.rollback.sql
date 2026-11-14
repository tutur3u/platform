BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION IF EXISTS public.search_users_with_services(text, integer, integer, text, boolean);
COMMIT;
