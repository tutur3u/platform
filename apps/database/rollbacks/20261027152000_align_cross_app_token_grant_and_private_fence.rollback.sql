BEGIN;

GRANT EXECUTE ON FUNCTION public.generate_cross_app_token(uuid, text, text, integer, jsonb)
TO service_role;

COMMIT;
