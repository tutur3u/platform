CREATE FUNCTION private.sso_valid_acs(p_urls text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT cardinality(p_urls) BETWEEN 1 AND 8
    AND array_position(p_urls, NULL) IS NULL
    AND (SELECT count(DISTINCT u) = cardinality(p_urls) FROM unnest(p_urls) u)
    AND NOT EXISTS (SELECT 1 FROM unnest(p_urls) u WHERE length(u) > 2048
      OR u !~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(/[[:graph:]]*)?$'
      OR u ~ '[*@#\\[:space:]]');
$$;
CREATE FUNCTION private.sso_valid_domains(p_domains text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT cardinality(p_domains) BETWEEN 1 AND 32
    AND array_position(p_domains, NULL) IS NULL
    AND NOT EXISTS (SELECT 1 FROM unnest(p_domains) d
      WHERE length(d) > 253 OR d !~ '^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]+$');
$$;
CREATE TABLE private.sso_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  protocol text NOT NULL DEFAULT 'saml' CHECK (protocol = 'saml'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  enabled boolean NOT NULL DEFAULT false,
  policy_revision bigint NOT NULL DEFAULT 1 CHECK (policy_revision > 0),
  approved_email_domains text[] NOT NULL CHECK (private.sso_valid_domains(approved_email_domains)),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ws_id, id)
);
CREATE TABLE private.sso_saml_clients (
  client_id uuid PRIMARY KEY,
  ws_id uuid NOT NULL,
  entity_id text NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 2048),
  acs_urls text[] NOT NULL CHECK (private.sso_valid_acs(acs_urls)),
  name_id_format text NOT NULL DEFAULT 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'
    CHECK (name_id_format = 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent'),
  FOREIGN KEY (ws_id, client_id) REFERENCES private.sso_clients(ws_id, id) ON DELETE CASCADE
);
CREATE TABLE private.sso_assignments (
  ws_id uuid NOT NULL,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, client_id, user_id),
  FOREIGN KEY (ws_id, user_id) REFERENCES public.workspace_members(ws_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (ws_id, client_id) REFERENCES private.sso_clients(ws_id, id) ON DELETE CASCADE
);
ALTER TABLE private.sso_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sso_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE private.sso_saml_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sso_saml_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE private.sso_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.sso_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.sso_clients, private.sso_saml_clients, private.sso_assignments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.sso_valid_acs(text[]), private.sso_valid_domains(text[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.sso_revoke_demoted_assignments() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM private.sso_assignments WHERE ws_id = OLD.ws_id AND user_id = OLD.user_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sso_revoke_demoted_assignments AFTER UPDATE OF type ON public.workspace_members
  FOR EACH ROW WHEN (OLD.type = 'MEMBER' AND NEW.type IS DISTINCT FROM 'MEMBER')
  EXECUTE FUNCTION private.sso_revoke_demoted_assignments();
REVOKE ALL ON FUNCTION private.sso_revoke_demoted_assignments() FROM PUBLIC, anon, authenticated, service_role;
