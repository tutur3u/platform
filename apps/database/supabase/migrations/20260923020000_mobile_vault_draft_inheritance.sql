-- Existing drafts require explicit repair; only drafts created after this migration
-- initialize automatically. Plaintext and envelope keys never enter these RPCs.
ALTER TABLE private.mobile_deployment_versions
  ADD COLUMN inheritance_initialized boolean NOT NULL DEFAULT true,
  ADD COLUMN inheritance_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN inherited_from_version_id uuid REFERENCES private.mobile_deployment_versions(id),
  ADD COLUMN inheritance_excluded text[] NOT NULL DEFAULT '{}';
ALTER TABLE private.mobile_deployment_versions ALTER COLUMN inheritance_initialized SET DEFAULT false;

-- Conservatively preserve deletions/replacements recorded by older deployments.
UPDATE private.mobile_deployment_versions v SET inheritance_excluded = ARRAY(
  SELECT DISTINCT exclusion FROM private.mobile_deployment_audit_events a
  CROSS JOIN LATERAL (SELECT CASE
    WHEN a.event_type = 'env.replaced' THEN 'env:*'
    WHEN a.event_type = 'env.cleared' THEN 'env:' || (a.metadata ->> 'name')
    WHEN a.event_type = 'scalar.cleared' THEN 'scalar:' || (a.metadata ->> 'name')
    WHEN a.event_type = 'env.saved' THEN 'env:' || (a.metadata ->> 'previousName')
  END AS exclusion) x
  WHERE a.version_id = v.id AND exclusion IS NOT NULL
) WHERE v.status = 'draft';

CREATE FUNCTION private.mobile_deployment_track_draft_write() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE target uuid; ready boolean;
BEGIN
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
  SELECT inheritance_initialized INTO ready FROM private.mobile_deployment_versions
    WHERE id = target FOR UPDATE;
  IF NOT FOUND AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF ready IS DISTINCT FROM true THEN RAISE EXCEPTION 'Vault draft initialization is incomplete'; END IF;
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'mobile_deployment_secret_values' THEN
    UPDATE private.mobile_deployment_versions SET
      inheritance_excluded = array_append(inheritance_excluded, OLD.kind || ':' || OLD.name)
      WHERE id = target;
  END IF;
  UPDATE private.mobile_deployment_versions SET inheritance_revision = inheritance_revision + 1 WHERE id = target;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER mobile_deployment_secret_inheritance_revision BEFORE INSERT OR UPDATE OR DELETE
  ON private.mobile_deployment_secret_values FOR EACH ROW EXECUTE FUNCTION private.mobile_deployment_track_draft_write();
CREATE TRIGGER mobile_deployment_file_inheritance_revision BEFORE INSERT OR UPDATE OR DELETE
  ON private.mobile_deployment_file_artifacts FOR EACH ROW EXECUTE FUNCTION private.mobile_deployment_track_draft_write();

-- Record a tombstone even when the deleted key was absent in a legacy partial draft.
CREATE FUNCTION private.mobile_deployment_exclude_inheritance(p_version uuid, p_key text) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE private.mobile_deployment_versions SET
    inheritance_excluded = array_append(inheritance_excluded, p_key),
    inheritance_revision = inheritance_revision + 1
    WHERE id = p_version AND status = 'draft' AND inheritance_initialized;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault draft is not editable'; END IF;
END $$;

CREATE FUNCTION private.mobile_deployment_inheritance_snapshot(p_version uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE draft private.mobile_deployment_versions; source private.mobile_deployment_versions; active_id uuid;
BEGIN
  SELECT * INTO STRICT draft FROM private.mobile_deployment_versions WHERE id = p_version FOR UPDATE;
  IF draft.status <> 'draft' THEN RAISE EXCEPTION 'Vault version is not a draft'; END IF;
  SELECT active_version_id INTO active_id FROM private.mobile_deployment_environments WHERE id = draft.environment_id;
  IF active_id IS NOT NULL THEN
    SELECT * INTO STRICT source FROM private.mobile_deployment_versions WHERE id = active_id;
    IF source.environment_id <> draft.environment_id THEN RAISE EXCEPTION 'Invalid vault source'; END IF;
  END IF;
  RETURN jsonb_build_object('draft', to_jsonb(draft), 'source', CASE WHEN active_id IS NULL THEN NULL ELSE to_jsonb(source) END,
    'secrets', COALESCE((SELECT jsonb_agg(s) FROM private.mobile_deployment_secret_values s WHERE version_id = active_id), '[]'),
    'files', COALESCE((SELECT jsonb_agg(f) FROM private.mobile_deployment_file_artifacts f WHERE version_id = active_id), '[]'),
    'draftSecrets', COALESCE((SELECT jsonb_agg(s) FROM private.mobile_deployment_secret_values s WHERE version_id = p_version), '[]'),
    'draftFiles', COALESCE((SELECT jsonb_agg(f) FROM private.mobile_deployment_file_artifacts f WHERE version_id = p_version), '[]'));
END $$;

CREATE FUNCTION private.mobile_deployment_commit_inheritance(
  p_version uuid, p_source uuid, p_revision bigint, p_user uuid, p_secrets jsonb, p_files jsonb
) RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE draft private.mobile_deployment_versions; active_id uuid;
BEGIN
  SELECT * INTO STRICT draft FROM private.mobile_deployment_versions WHERE id = p_version FOR UPDATE;
  SELECT active_version_id INTO active_id FROM private.mobile_deployment_environments
    WHERE id = draft.environment_id FOR UPDATE;
  IF draft.status <> 'draft' OR draft.inheritance_revision <> p_revision
    OR draft.inherited_from_version_id IS NOT NULL OR active_id IS DISTINCT FROM p_source THEN
    RAISE EXCEPTION 'Vault changed during inheritance; refresh and retry' USING ERRCODE = '40001';
  END IF;
  UPDATE private.mobile_deployment_versions SET inheritance_initialized = true,
    inherited_from_version_id = p_source, inheritance_revision = inheritance_revision + 1 WHERE id = p_version;
  INSERT INTO private.mobile_deployment_secret_values
    (version_id, kind, name, encrypted_value, plaintext_sha256, plaintext_last_four, value_size, updated_by)
  SELECT p_version, x.kind, x.name, x.encrypted_value, x.plaintext_sha256, x.plaintext_last_four, x.value_size, p_user
    FROM jsonb_populate_recordset(NULL::private.mobile_deployment_secret_values, p_secrets) x
    WHERE NOT (x.kind || ':' || x.name = ANY(draft.inheritance_excluded))
      AND NOT (x.kind || ':*' = ANY(draft.inheritance_excluded))
    ON CONFLICT (version_id, kind, name) DO NOTHING;
  INSERT INTO private.mobile_deployment_file_artifacts
    (version_id, kind, storage_provider, storage_path, filename, content_type, ciphertext_sha256,
     plaintext_sha256, plaintext_size, ciphertext_size, validation_status, validation_errors, updated_by)
  SELECT p_version, x.kind, x.storage_provider, x.storage_path, x.filename, x.content_type, x.ciphertext_sha256,
    x.plaintext_sha256, x.plaintext_size, x.ciphertext_size, x.validation_status, x.validation_errors, p_user
    FROM jsonb_populate_recordset(NULL::private.mobile_deployment_file_artifacts, p_files) x
    ON CONFLICT (version_id, kind) DO NOTHING;
  INSERT INTO private.mobile_deployment_audit_events
    (environment_id, version_id, actor_user_id, actor_type, event_type, metadata)
  VALUES (draft.environment_id, p_version, p_user, 'user', 'version.inherited', jsonb_build_object('sourceVersionId', p_source));
END $$;

REVOKE ALL ON FUNCTION private.mobile_deployment_track_draft_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mobile_deployment_exclude_inheritance(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mobile_deployment_inheritance_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.mobile_deployment_commit_inheritance(uuid, uuid, bigint, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.mobile_deployment_exclude_inheritance(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.mobile_deployment_inheritance_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.mobile_deployment_commit_inheritance(uuid, uuid, bigint, uuid, jsonb, jsonb) TO service_role;
