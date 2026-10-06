-- Signing credentials stay encrypted in a private, desktop-only vault.
CREATE TABLE private.desktop_deployment_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE CHECK (platform IN ('windows','macos')),
  enabled boolean NOT NULL DEFAULT false,
  active_version_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,platform)
);
CREATE TABLE private.desktop_deployment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid NOT NULL,
  platform text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  data_key_ciphertext text NOT NULL CHECK (length(data_key_ciphertext) BETWEEN 1 AND 16384),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  validated_revision bigint,
  validation_errors text[] NOT NULL DEFAULT ARRAY['not_validated'],
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_by uuid REFERENCES auth.users(id),
  activated_at timestamptz,
  FOREIGN KEY(environment_id,platform) REFERENCES private.desktop_deployment_environments(id,platform),
  UNIQUE(environment_id,version),
  UNIQUE(id,platform),
  UNIQUE(id,environment_id)
);
ALTER TABLE private.desktop_deployment_environments ADD CONSTRAINT desktop_environment_active_version_fk
  FOREIGN KEY(active_version_id,id) REFERENCES private.desktop_deployment_versions(id,environment_id);
CREATE UNIQUE INDEX desktop_one_draft_per_environment ON private.desktop_deployment_versions(environment_id) WHERE status = 'draft';
CREATE UNIQUE INDEX desktop_one_active_per_environment ON private.desktop_deployment_versions(environment_id) WHERE status = 'active';
CREATE TABLE private.desktop_deployment_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL,
  platform text NOT NULL,
  name text NOT NULL,
  encrypted_value text NOT NULL CHECK (length(encrypted_value) BETWEEN 1 AND 6000000),
  plaintext_sha256 text NOT NULL CHECK (plaintext_sha256 ~ '^[a-f0-9]{64}$'),
  plaintext_size integer NOT NULL CHECK (plaintext_size BETWEEN 1 AND 2097152),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(version_id,platform) REFERENCES private.desktop_deployment_versions(id,platform) ON DELETE CASCADE,
  UNIQUE(version_id,name),
  CHECK (
    (platform = 'windows' AND name IN ('windows_authenticode_certificate_pfx','WINDOWS_SIGNING_CERTIFICATE_PASSWORD')) OR
    (platform = 'macos' AND name IN ('macos_developer_id_certificate_p12','macos_notarization_private_key_p8','MACOS_CERTIFICATE_PASSWORD','MACOS_SIGNING_IDENTITY','APPLE_TEAM_ID','APP_STORE_CONNECT_API_KEY_ID','APP_STORE_CONNECT_ISSUER_ID'))
  ),
  CHECK (name IN ('windows_authenticode_certificate_pfx','macos_developer_id_certificate_p12','macos_notarization_private_key_p8') OR plaintext_size <= 32768)
);
CREATE TABLE private.desktop_deployment_ci_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid NOT NULL,
  platform text NOT NULL,
  version_id uuid NOT NULL,
  token_prefix text NOT NULL CHECK (token_prefix ~ '^ttr_desktop_ci_[A-Za-z0-9_-]+$'),
  token_hash text NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(environment_id,platform) REFERENCES private.desktop_deployment_environments(id,platform),
  FOREIGN KEY(version_id,environment_id) REFERENCES private.desktop_deployment_versions(id,environment_id),
  UNIQUE(token_prefix),
  UNIQUE(id,platform),
  CHECK(expires_at > created_at AND expires_at <= created_at + interval '30 days')
);
CREATE TABLE private.desktop_deployment_fetch_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL,
  platform text NOT NULL,
  version_id uuid NOT NULL REFERENCES private.desktop_deployment_versions(id),
  run_id text NOT NULL CHECK (run_id ~ '^[1-9][0-9]{0,19}$'),
  run_attempt text NOT NULL CHECK (run_attempt ~ '^[1-9][0-9]{0,9}$'),
  source_sha text NOT NULL CHECK (source_sha ~ '^[a-f0-9]{40}$'),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','delivered','failed')),
  failure_code text CHECK (failure_code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY(token_id,platform) REFERENCES private.desktop_deployment_ci_tokens(id,platform),
  UNIQUE(token_id,platform,run_id,run_attempt)
);
CREATE TABLE private.desktop_deployment_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id uuid NOT NULL REFERENCES private.desktop_deployment_environments(id),
  version_id uuid REFERENCES private.desktop_deployment_versions(id),
  actor_id uuid REFERENCES auth.users(id),
  token_id uuid REFERENCES private.desktop_deployment_ci_tokens(id),
  event_type text NOT NULL CHECK (event_type IN ('version.created','resource.saved','resource.removed','version.validated','version.activated','token.created','token.revoked','bundle.reserved','bundle.delivered','bundle.failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No credential or ciphertext SELECT is available to ordinary authenticated clients.
ALTER TABLE private.desktop_deployment_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.desktop_deployment_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.desktop_deployment_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.desktop_deployment_ci_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.desktop_deployment_fetch_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.desktop_deployment_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.desktop_deployment_environments,private.desktop_deployment_versions,private.desktop_deployment_resources,private.desktop_deployment_ci_tokens,private.desktop_deployment_fetch_leases,private.desktop_deployment_audit_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON private.desktop_deployment_environments,private.desktop_deployment_versions,private.desktop_deployment_resources,private.desktop_deployment_ci_tokens,private.desktop_deployment_fetch_leases,private.desktop_deployment_audit_events TO service_role;
INSERT INTO private.desktop_deployment_environments(platform) VALUES ('windows'),('macos');

CREATE FUNCTION private.desktop_deployment_assert_admin(p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members WHERE ws_id = '00000000-0000-0000-0000-000000000000' AND user_id = p_actor
  ) OR NOT public.has_workspace_permission('00000000-0000-0000-0000-000000000000',p_actor,'manage_desktop_deployment_vault') THEN
    RAISE EXCEPTION 'desktop_vault_forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION private.desktop_deployment_create_version(p_actor uuid,p_platform text,p_data_key_ciphertext text) RETURNS private.desktop_deployment_versions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE env private.desktop_deployment_environments; created private.desktop_deployment_versions;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE platform = p_platform FOR UPDATE;
  INSERT INTO private.desktop_deployment_versions(environment_id,platform,version,data_key_ciphertext,created_by)
    SELECT env.id,p_platform,COALESCE(max(version),0)+1,p_data_key_ciphertext,p_actor FROM private.desktop_deployment_versions WHERE environment_id = env.id RETURNING * INTO created;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,event_type) VALUES(env.id,created.id,p_actor,'version.created');
  RETURN created;
END;
$$;

-- Preserve active signing bytes and invalidate readiness on every draft write, including direct service writes.
CREATE FUNCTION private.desktop_deployment_resource_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ver private.desktop_deployment_versions; version_id uuid;
BEGIN
  version_id := CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  IF TG_OP='UPDATE' AND (NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.platform IS DISTINCT FROM OLD.platform OR NEW.name IS DISTINCT FROM OLD.name) THEN RAISE EXCEPTION 'desktop_resource_identity_immutable'; END IF;
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=version_id FOR UPDATE;
  IF ver.status <> 'draft' THEN RAISE EXCEPTION 'desktop_version_immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE FUNCTION private.desktop_deployment_resource_invalidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.desktop_deployment_versions SET revision=revision+1,validated_revision=NULL,validation_errors=ARRAY['not_validated'] WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  RETURN NULL;
END;
$$;
CREATE TRIGGER desktop_resource_invalidate AFTER INSERT OR UPDATE OR DELETE ON private.desktop_deployment_resources FOR EACH ROW EXECUTE FUNCTION private.desktop_deployment_resource_invalidate();
REVOKE ALL ON FUNCTION private.desktop_deployment_resource_invalidate() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desktop_deployment_resource_invalidate() TO service_role;
CREATE TRIGGER desktop_resource_guard BEFORE INSERT OR UPDATE OR DELETE ON private.desktop_deployment_resources FOR EACH ROW EXECUTE FUNCTION private.desktop_deployment_resource_guard();
REVOKE ALL ON FUNCTION private.desktop_deployment_resource_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desktop_deployment_resource_guard() TO service_role;

CREATE FUNCTION private.desktop_deployment_write_resource(p_actor uuid,p_version uuid,p_revision bigint,p_name text,p_ciphertext text,p_sha256 text,p_size integer) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ver private.desktop_deployment_versions;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id = p_version FOR UPDATE;
  IF ver.status <> 'draft' OR ver.revision <> p_revision THEN RAISE EXCEPTION 'desktop_version_conflict' USING ERRCODE = '40001'; END IF;
  INSERT INTO private.desktop_deployment_resources(version_id,platform,name,encrypted_value,plaintext_sha256,plaintext_size,updated_by)
    VALUES(ver.id,ver.platform,p_name,p_ciphertext,p_sha256,p_size,p_actor)
    ON CONFLICT(version_id,name) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value,plaintext_sha256=EXCLUDED.plaintext_sha256,plaintext_size=EXCLUDED.plaintext_size,updated_by=p_actor,updated_at=now();
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=ver.id;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,event_type) VALUES(ver.environment_id,ver.id,p_actor,'resource.saved');
  RETURN ver.revision;
END;
$$;

CREATE FUNCTION private.desktop_deployment_validate_version(p_actor uuid,p_version uuid,p_revision bigint,p_errors text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ver private.desktop_deployment_versions; resource_count integer;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version FOR UPDATE;
  IF ver.status <> 'draft' OR ver.revision <> p_revision THEN RAISE EXCEPTION 'desktop_version_conflict' USING ERRCODE = '40001'; END IF;
  IF p_errors IS NULL OR cardinality(p_errors)>32 OR EXISTS(SELECT 1 FROM unnest(p_errors) value WHERE value IS NULL OR value !~ '^[a-z_]{1,64}$') THEN RAISE EXCEPTION 'desktop_validation_invalid'; END IF;
  SELECT count(*) INTO resource_count FROM private.desktop_deployment_resources WHERE version_id=ver.id;
  IF cardinality(p_errors)=0 AND resource_count <> (CASE WHEN ver.platform='windows' THEN 2 ELSE 7 END) THEN RAISE EXCEPTION 'desktop_profile_incomplete'; END IF;
  UPDATE private.desktop_deployment_versions SET validated_revision=p_revision,validation_errors=p_errors WHERE id=ver.id;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,event_type) VALUES(ver.environment_id,ver.id,p_actor,'version.validated');
END;
$$;

CREATE FUNCTION private.desktop_deployment_activate_version(p_actor uuid,p_version uuid,p_revision bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ver private.desktop_deployment_versions; env private.desktop_deployment_environments;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version;
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE id=ver.environment_id FOR UPDATE;
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version FOR UPDATE;
  IF ver.status <> 'draft' OR ver.revision <> p_revision OR ver.validated_revision IS DISTINCT FROM p_revision OR cardinality(ver.validation_errors)<>0 THEN RAISE EXCEPTION 'desktop_version_not_ready' USING ERRCODE = '40001'; END IF;
  UPDATE private.desktop_deployment_versions SET status='archived' WHERE id=env.active_version_id;
  UPDATE private.desktop_deployment_versions SET status='active',activated_at=now(),activated_by=p_actor WHERE id=ver.id;
  UPDATE private.desktop_deployment_environments SET active_version_id=ver.id WHERE id=env.id;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,event_type) VALUES(env.id,ver.id,p_actor,'version.activated');
END;
$$;

CREATE FUNCTION private.desktop_deployment_reserve_bundle(p_token uuid,p_platform text,p_run_id text,p_attempt text,p_sha text) RETURNS private.desktop_deployment_fetch_leases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tok private.desktop_deployment_ci_tokens; env private.desktop_deployment_environments; lease private.desktop_deployment_fetch_leases;
BEGIN
  SELECT * INTO STRICT tok FROM private.desktop_deployment_ci_tokens WHERE id=p_token FOR UPDATE;
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE id=tok.environment_id FOR UPDATE;
  IF NOT env.enabled OR tok.platform <> p_platform OR tok.revoked_at IS NOT NULL OR tok.expires_at <= now() OR tok.version_id IS DISTINCT FROM env.active_version_id THEN RAISE EXCEPTION 'desktop_bundle_denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.desktop_deployment_versions WHERE id=tok.version_id AND status='active' AND validated_revision=revision AND cardinality(validation_errors)=0) THEN RAISE EXCEPTION 'desktop_bundle_denied' USING ERRCODE='42501'; END IF;
  INSERT INTO private.desktop_deployment_fetch_leases(token_id,platform,version_id,run_id,run_attempt,source_sha)
    VALUES(tok.id,p_platform,tok.version_id,p_run_id,p_attempt,p_sha) RETURNING * INTO lease;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,token_id,event_type) VALUES(env.id,tok.version_id,tok.id,'bundle.reserved');
  RETURN lease;
END;
$$;

REVOKE ALL ON FUNCTION private.desktop_deployment_assert_admin(uuid),private.desktop_deployment_create_version(uuid,text,text),private.desktop_deployment_write_resource(uuid,uuid,bigint,text,text,text,integer),private.desktop_deployment_validate_version(uuid,uuid,bigint,text[]),private.desktop_deployment_activate_version(uuid,uuid,bigint),private.desktop_deployment_reserve_bundle(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desktop_deployment_assert_admin(uuid),private.desktop_deployment_create_version(uuid,text,text),private.desktop_deployment_write_resource(uuid,uuid,bigint,text,text,text,integer),private.desktop_deployment_validate_version(uuid,uuid,bigint,text[]),private.desktop_deployment_activate_version(uuid,uuid,bigint),private.desktop_deployment_reserve_bundle(uuid,text,text,text,text) TO service_role;


CREATE FUNCTION private.desktop_deployment_remove_resource(p_actor uuid,p_version uuid,p_revision bigint,p_name text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ver private.desktop_deployment_versions;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version FOR UPDATE;
  IF ver.status <> 'draft' OR ver.revision <> p_revision THEN RAISE EXCEPTION 'desktop_version_conflict' USING ERRCODE='40001'; END IF;
  DELETE FROM private.desktop_deployment_resources WHERE version_id=ver.id AND name=p_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'desktop_resource_missing' USING ERRCODE='P0002'; END IF;
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,event_type) VALUES(ver.environment_id,ver.id,p_actor,'resource.removed');
  RETURN ver.revision;
END;
$$;

CREATE FUNCTION private.desktop_deployment_create_token(p_actor uuid,p_version uuid,p_name text,p_prefix text,p_hash text,p_expires timestamptz) RETURNS private.desktop_deployment_ci_tokens
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE ver private.desktop_deployment_versions; env private.desktop_deployment_environments; tok private.desktop_deployment_ci_tokens;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version;
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE id=ver.environment_id FOR UPDATE;
  SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version FOR UPDATE;
  IF ver.status <> 'active' OR env.active_version_id IS DISTINCT FROM ver.id OR ver.validated_revision IS DISTINCT FROM ver.revision OR cardinality(ver.validation_errors)<>0 THEN RAISE EXCEPTION 'desktop_version_not_ready' USING ERRCODE='40001'; END IF;
  INSERT INTO private.desktop_deployment_ci_tokens(environment_id,platform,version_id,name,token_prefix,token_hash,expires_at,created_by)
    VALUES(env.id,ver.platform,ver.id,p_name,p_prefix,p_hash,p_expires,p_actor) RETURNING * INTO tok;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,token_id,event_type) VALUES(env.id,ver.id,p_actor,tok.id,'token.created');
  RETURN tok;
END;
$$;

CREATE FUNCTION private.desktop_deployment_revoke_token(p_actor uuid,p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tok private.desktop_deployment_ci_tokens;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  SELECT * INTO STRICT tok FROM private.desktop_deployment_ci_tokens WHERE id=p_token FOR UPDATE;
  UPDATE private.desktop_deployment_ci_tokens SET revoked_at=COALESCE(revoked_at,now()) WHERE id=tok.id;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,token_id,event_type) VALUES(tok.environment_id,tok.version_id,p_actor,tok.id,'token.revoked');
END;
$$;

-- Recheck live admission after decryption and before returning signing bytes.
-- A failed or delivered lease is consumed; callers must use a new run_attempt.
CREATE FUNCTION private.desktop_deployment_complete_bundle(p_lease uuid,p_failure_code text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE lease private.desktop_deployment_fetch_leases; tok private.desktop_deployment_ci_tokens; env private.desktop_deployment_environments;
BEGIN
  SELECT * INTO STRICT lease FROM private.desktop_deployment_fetch_leases WHERE id=p_lease;
  SELECT * INTO STRICT tok FROM private.desktop_deployment_ci_tokens WHERE id=lease.token_id FOR UPDATE;
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE id=tok.environment_id FOR UPDATE;
  SELECT * INTO STRICT lease FROM private.desktop_deployment_fetch_leases WHERE id=p_lease FOR UPDATE;
  IF lease.status <> 'reserved' THEN RAISE EXCEPTION 'desktop_lease_consumed' USING ERRCODE='40001'; END IF;
  IF p_failure_code IS NOT NULL AND p_failure_code !~ '^[a-z_]{1,64}$' THEN RAISE EXCEPTION 'desktop_failure_code_invalid'; END IF;
  IF p_failure_code IS NULL AND (NOT env.enabled OR tok.revoked_at IS NOT NULL OR tok.expires_at<=now() OR tok.version_id IS DISTINCT FROM env.active_version_id OR lease.version_id IS DISTINCT FROM tok.version_id OR NOT EXISTS(SELECT 1 FROM private.desktop_deployment_versions WHERE id=tok.version_id AND status='active' AND validated_revision=revision AND cardinality(validation_errors)=0)) THEN
    RAISE EXCEPTION 'desktop_bundle_denied' USING ERRCODE='42501';
  END IF;
  UPDATE private.desktop_deployment_fetch_leases SET status=CASE WHEN p_failure_code IS NULL THEN 'delivered' ELSE 'failed' END,failure_code=p_failure_code,completed_at=now() WHERE id=lease.id;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,token_id,event_type) VALUES(env.id,lease.version_id,tok.id,CASE WHEN p_failure_code IS NULL THEN 'bundle.delivered' ELSE 'bundle.failed' END);
END;
$$;
REVOKE ALL ON FUNCTION private.desktop_deployment_remove_resource(uuid,uuid,bigint,text),private.desktop_deployment_create_token(uuid,uuid,text,text,text,timestamptz),private.desktop_deployment_revoke_token(uuid,uuid),private.desktop_deployment_complete_bundle(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desktop_deployment_remove_resource(uuid,uuid,bigint,text),private.desktop_deployment_create_token(uuid,uuid,text,text,text,timestamptz),private.desktop_deployment_revoke_token(uuid,uuid),private.desktop_deployment_complete_bundle(uuid,text) TO service_role;

CREATE FUNCTION private.desktop_deployment_version_identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.environment_id IS DISTINCT FROM OLD.environment_id OR NEW.platform IS DISTINCT FROM OLD.platform OR NEW.version IS DISTINCT FROM OLD.version OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.data_key_ciphertext IS DISTINCT FROM OLD.data_key_ciphertext THEN
    RAISE EXCEPTION 'desktop_version_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER desktop_version_identity_guard BEFORE UPDATE ON private.desktop_deployment_versions FOR EACH ROW EXECUTE FUNCTION private.desktop_deployment_version_identity_guard();
REVOKE ALL ON FUNCTION private.desktop_deployment_version_identity_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desktop_deployment_version_identity_guard() TO service_role;
