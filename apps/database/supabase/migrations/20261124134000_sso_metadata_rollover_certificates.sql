-- Public certificates that one enabled SAML client's IdP metadata publishes:
-- the active signing key first, then pending keys (trusted before they sign)
-- and retiring keys for one day after retirement, each inside its validity
-- window. The table holds public certificates only; private keys never exist
-- in the database. Signing still uses only the active key from
-- sso_issuance_snapshot, and metadata fails closed when no active key is current.
-- Volatile because validity is checked against clock_timestamp(). Only SAML
-- clients publish SAML metadata. The caller publishes at most two rollover
-- keys and fails closed on more.
-- Rollback: apps/database/rollbacks/20261124134000_sso_metadata_rollover_certificates.rollback.sql

set local lock_timeout = '5s';
set local statement_timeout = '60s';

CREATE FUNCTION public.sso_metadata_certificates(p_client_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_agg(jsonb_build_object('kid', k.kid, 'status', k.status,
      'revision', k.revision, 'public_certificate', k.public_certificate)
    ORDER BY CASE k.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
      k.created_at, k.id)
  FROM private.sso_clients c
  JOIN public.workspaces w ON w.id = c.ws_id AND NOT w.personal AND w.deleted IS NOT TRUE
  JOIN private.sso_signing_keys k ON k.ws_id = c.ws_id AND k.client_id = c.id
    AND k.not_before <= clock_timestamp() AND k.not_after > clock_timestamp()
    AND (k.status IN ('active', 'pending')
      OR (k.status = 'retiring' AND k.retired_at > clock_timestamp() - interval '1 day'))
  WHERE c.id = p_client_id AND c.enabled AND c.protocol = 'saml'
    AND EXISTS (SELECT 1 FROM private.sso_signing_keys a WHERE a.ws_id = c.ws_id
      AND a.client_id = c.id AND a.status = 'active'
      AND a.not_before <= clock_timestamp() AND a.not_after > clock_timestamp());
$$;

REVOKE ALL ON FUNCTION public.sso_metadata_certificates(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sso_metadata_certificates(uuid) TO service_role;
