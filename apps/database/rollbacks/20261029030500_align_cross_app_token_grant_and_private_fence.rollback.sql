-- PUBLIC/anon defaults are intentionally not restored (SR-331 fence; least privilege). See forward migration 20261029030500_align_cross_app_token_grant_and_private_fence.sql.
--
-- Restores only what the forward migration removed from service_role: EXECUTE on
-- public.generate_cross_app_token (five-argument overload). Default privileges
-- on schema private are not restored: the forward schema-scoped revoke removed
-- nothing that the global default privilege of 20261027151200 still grants, so
-- service_role keeps default EXECUTE on new private functions without it.
-- authenticated gets nothing new. This file never grants to PUBLIC or anon.
-- Apply manually.
BEGIN;

GRANT EXECUTE ON FUNCTION public.generate_cross_app_token(uuid, text, text, integer, jsonb)
TO service_role;

COMMIT;
