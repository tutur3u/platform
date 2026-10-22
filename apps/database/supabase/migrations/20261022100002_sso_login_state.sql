CREATE TABLE private.sso_subjects (
  ws_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex')
    CHECK (subject ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, client_id, subject),
  UNIQUE (ws_id, client_id, user_id),
  UNIQUE (subject),
  FOREIGN KEY (ws_id, client_id) REFERENCES private.sso_clients(ws_id, id) ON DELETE CASCADE
);
CREATE TABLE private.sso_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL,
  client_id uuid NOT NULL,
  request_id_hash text NOT NULL CHECK (request_id_hash ~ '^[0-9a-f]{64}$'),
  in_response_to text NOT NULL CHECK (length(in_response_to) BETWEEN 1 AND 256),
  handle_hash text NOT NULL UNIQUE CHECK (handle_hash ~ '^[0-9a-f]{64}$'),
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^[0-9a-f]{64}$'),
  relay_state_hash text CHECK (relay_state_hash ~ '^[0-9a-f]{64}$'),
  acs_url text NOT NULL,
  allow_create boolean NOT NULL DEFAULT false,
  policy_revision bigint NOT NULL CHECK (policy_revision > 0),
  actor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_binding_hash text CHECK (session_binding_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  outcome text CHECK (outcome IN ('approved', 'denied')),
  UNIQUE (ws_id, client_id, id),
  UNIQUE (ws_id, client_id, request_id_hash),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  CHECK ((consumed_at IS NULL) = (outcome IS NULL)),
  CHECK ((actor_id IS NULL) = (session_binding_hash IS NULL)),
  FOREIGN KEY (ws_id, client_id) REFERENCES private.sso_clients(ws_id, id) ON DELETE CASCADE
);
CREATE INDEX sso_transactions_expiry_idx ON private.sso_transactions(expires_at);
-- Immutable historical receipts retain correlation UUIDs independently of live parents.
CREATE TABLE private.sso_disclosure_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL,
  client_id uuid NOT NULL,
  transaction_id uuid NOT NULL UNIQUE,
  actor_id uuid NOT NULL,
  policy_revision bigint NOT NULL CHECK (policy_revision > 0),
  approved boolean NOT NULL,
  attribute_names text[] NOT NULL DEFAULT ARRAY['id', 'email', 'firstName', 'lastName']
    CHECK (attribute_names = ARRAY['id', 'email', 'firstName', 'lastName']),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.sso_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sso_subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE private.sso_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sso_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE private.sso_disclosure_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sso_disclosure_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY sso_disclosure_own_read ON private.sso_disclosure_grants
  FOR SELECT TO authenticated USING (actor_id = (SELECT auth.uid()));
REVOKE ALL ON private.sso_subjects, private.sso_transactions, private.sso_disclosure_grants FROM PUBLIC, anon, authenticated, service_role;
