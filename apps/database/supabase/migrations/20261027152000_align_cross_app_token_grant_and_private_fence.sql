BEGIN;

REVOKE EXECUTE ON FUNCTION public.generate_cross_app_token(uuid, text, text, integer, jsonb)
FROM service_role;

COMMIT;
