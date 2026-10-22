CREATE TABLE private.sso_signing_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL,
  client_id uuid NOT NULL,
  kid text NOT NULL CHECK (kid ~ '^[a-zA-Z0-9_-]{1,128}$'),
  public_certificate text NOT NULL CHECK (length(public_certificate) <= 16384
    AND public_certificate ~ '^-----BEGIN CERTIFICATE-----[\r\n]+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----[\r\n]*$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'retiring', 'revoked')),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  not_before timestamptz NOT NULL,
  not_after timestamptz NOT NULL,
  activated_at timestamptz,
  retired_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (not_after > not_before),
  CHECK (status <> 'active' OR activated_at IS NOT NULL),
  CHECK (status <> 'retiring' OR retired_at IS NOT NULL),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
  UNIQUE (ws_id, client_id, kid),
  FOREIGN KEY (ws_id, client_id) REFERENCES private.sso_clients(ws_id, id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX sso_one_active_key ON private.sso_signing_keys(ws_id, client_id) WHERE status = 'active';
CREATE TABLE private.sso_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL,
  client_id uuid NOT NULL,
  actor_id uuid,
  transaction_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('client.created', 'client.updated',
    'assignment.updated', 'transaction.created', 'transaction.consumed',
    'consent.approved', 'consent.denied', 'issuance.failed', 'issuance.signed')),
  policy_revision bigint NOT NULL CHECK (policy_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (ws_id, client_id) REFERENCES private.sso_clients(ws_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (ws_id, client_id, transaction_id) REFERENCES private.sso_transactions(ws_id, client_id, id) ON DELETE RESTRICT
);
CREATE INDEX sso_audit_tenant_time_idx ON private.sso_audit_events(ws_id, client_id, created_at DESC);
CREATE FUNCTION private.sso_reject_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION USING errcode = '42501', message = 'sso_append_only';
END;
$$;
CREATE TRIGGER sso_audit_append_only BEFORE UPDATE OR DELETE ON private.sso_audit_events
  FOR EACH ROW EXECUTE FUNCTION private.sso_reject_mutation();
CREATE TRIGGER sso_disclosure_append_only BEFORE UPDATE OR DELETE ON private.sso_disclosure_grants
  FOR EACH ROW EXECUTE FUNCTION private.sso_reject_mutation();
ALTER TABLE private.sso_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sso_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.sso_signing_keys, private.sso_audit_events FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sso_reject_mutation() FROM PUBLIC, anon, authenticated, service_role;
