-- The SSO signer Worker's independent transaction check. The Worker reaches
-- Postgres through Hyperdrive as the dedicated role `sso_signer`, which holds
-- no table privilege and may execute exactly one function:
-- public.sso_signer_confirm_transaction. The role is created NOLOGIN; the
-- release authority enables LOGIN and sets its password out of band, so no
-- credential ever appears in SQL or in the repository.
--
-- The function returns the transaction's bound fields only while issuance is
-- still possible: the transaction is approved and consumed, has no
-- issuance.signed or issuance.failed audit, has not expired, and was consumed
-- within the five-second issuance window that sso_finalize_issuance enforces.
-- The client must be enabled, SAML, on its consumed policy revision and in a
-- non-personal, non-deleted workspace; the actor must still be a MEMBER with an
-- active assignment and an allowed Auth account; the kid must name the
-- client's current active key. Otherwise it returns NULL. It writes nothing
-- (STABLE SQL rejects data-modifying statements).
--
-- Email and names come from auth.users the way apps/web/src/lib/sso/identity.ts
-- reads them through the Auth admin API: `email`, and the string values of
-- user_metadata (raw_user_meta_data) `given_name` and `family_name`.
-- Rollback: apps/database/rollbacks/20261125073000_sso_signer_transaction_confirmation.rollback.sql

set local lock_timeout = '5s';
set local statement_timeout = '60s';

CREATE ROLE sso_signer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8;
-- Bounded per-session work once the release authority enables LOGIN.
ALTER ROLE sso_signer SET statement_timeout = '2s';
ALTER ROLE sso_signer SET lock_timeout = '1s';
ALTER ROLE sso_signer SET idle_in_transaction_session_timeout = '5s';

CREATE FUNCTION public.sso_signer_confirm_transaction(p_transaction_id uuid,
  p_client_id uuid, p_kid text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'client_id', c.id,
    'acs_url', t.acs_url,
    'sp_entity_id', s.entity_id,
    'in_response_to', t.in_response_to,
    'subject', j.subject,
    'email', u.email,
    'given_name', u.raw_user_meta_data->>'given_name',
    'family_name', u.raw_user_meta_data->>'family_name',
    'kid', k.kid)
  FROM private.sso_transactions t
  JOIN private.sso_clients c ON c.ws_id = t.ws_id AND c.id = t.client_id
    AND c.enabled AND c.protocol = 'saml' AND c.policy_revision = t.policy_revision
  JOIN public.workspaces w ON w.id = c.ws_id AND NOT w.personal AND w.deleted IS NOT TRUE
  JOIN private.sso_saml_clients s ON s.ws_id = c.ws_id AND s.client_id = c.id
    AND t.acs_url = ANY(s.acs_urls)
  JOIN public.workspace_members m ON m.ws_id = t.ws_id AND m.user_id = t.actor_id
    AND m.type = 'MEMBER'
  JOIN private.sso_assignments a ON a.ws_id = t.ws_id AND a.client_id = t.client_id
    AND a.user_id = t.actor_id AND a.active
  JOIN private.sso_subjects j ON j.ws_id = t.ws_id AND j.client_id = t.client_id
    AND j.user_id = t.actor_id
  JOIN auth.users u ON u.id = t.actor_id
  JOIN private.sso_signing_keys k ON k.ws_id = c.ws_id AND k.client_id = c.id
    AND k.status = 'active' AND k.kid = p_kid
    AND k.not_before <= clock_timestamp() AND k.not_after > clock_timestamp()
  WHERE t.id = p_transaction_id AND t.client_id = p_client_id
    AND t.outcome = 'approved' AND t.consumed_at IS NOT NULL
    AND t.consumed_at > clock_timestamp() - interval '5 seconds'
    AND t.expires_at > clock_timestamp()
    AND u.email IS NOT NULL AND u.email_confirmed_at IS NOT NULL
    AND u.is_anonymous IS NOT TRUE AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= clock_timestamp())
    AND jsonb_typeof(u.raw_user_meta_data->'given_name') = 'string'
    AND jsonb_typeof(u.raw_user_meta_data->'family_name') = 'string'
    AND NOT EXISTS (SELECT 1 FROM private.sso_audit_events e
      WHERE e.ws_id = t.ws_id AND e.client_id = t.client_id AND e.transaction_id = t.id
        AND e.event_type IN ('issuance.signed', 'issuance.failed'));
$$;

REVOKE ALL ON FUNCTION public.sso_signer_confirm_transaction(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
-- Name resolution for the one function; no table, sequence or other grant.
GRANT USAGE ON SCHEMA public TO sso_signer;
-- The dedicated Worker role only; no client role (anon, authenticated,
-- service_role) may execute it (pgTAP: sso-signer-confirmation.sql).
-- tuturuuu: reviewed(function-grant): public.sso_signer_confirm_transaction(uuid,uuid,text) review=sso-idp-s1d
GRANT EXECUTE ON FUNCTION public.sso_signer_confirm_transaction(uuid, uuid, text)
  TO sso_signer;
