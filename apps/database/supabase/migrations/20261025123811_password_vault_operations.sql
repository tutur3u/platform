BEGIN;
CREATE FUNCTION private.password_vault_require_workspace_member(p_ws uuid, p_actor uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.workspaces WHERE id = p_ws AND deleted IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.workspace_members
    WHERE ws_id = p_ws AND user_id = p_actor AND type = 'MEMBER' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM auth.users WHERE id = p_actor
    AND (banned_until IS NULL OR banned_until <= now()) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.workspace_user_linked_users l JOIN public.workspace_users u
    ON u.id = l.virtual_user_id AND u.ws_id = l.ws_id
    WHERE l.ws_id = p_ws AND l.platform_user_id = p_actor FOR SHARE OF l, u;
  IF EXISTS (SELECT 1 FROM public.workspace_user_linked_users l JOIN public.workspace_users u
    ON u.id = l.virtual_user_id AND u.ws_id = l.ws_id
    WHERE l.ws_id = p_ws AND l.platform_user_id = p_actor AND u.archived) THEN
    RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
  END IF;
END $$;
CREATE FUNCTION private.password_vault_execute(
  p_ws uuid, p_vault uuid, p_actor uuid, p_request uuid, p_action text,
  p_input jsonb, p_token uuid DEFAULT NULL, p_token_digest text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v private.password_vaults;
  m private.password_vault_members;
  g private.password_vault_machine_grants;
  t private.password_vault_machine_tokens;
  old_request private.password_vault_requests;
  observed_request private.password_vault_requests;
  authorization_action text := p_action;
  item private.password_vault_items;
  actor uuid := p_actor;
  target uuid;
  allowed text[];
  result jsonb := '{}'::jsonb;
  receipt jsonb;
  entry jsonb;
  n bigint;
  lim integer;
  mutates boolean;
BEGIN
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), session_user::text) <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_ws IS NULL OR p_vault IS NULL OR p_request IS NULL OR p_action IS NULL
    OR p_input IS NULL OR jsonb_typeof(p_input) <> 'object' OR octet_length(p_input::text) > 12582912 THEN
    RAISE EXCEPTION 'Invalid vault operation' USING ERRCODE = '22023';
  END IF;
  allowed := CASE p_action
    WHEN 'vault.create' THEN ARRAY['label', 'encrypted_data_key']
    WHEN 'vault.rename' THEN ARRAY['expected_revision', 'label']
    WHEN 'item.read' THEN ARRAY['item_id']
    WHEN 'key.read' THEN ARRAY['item_id', 'expected_revision', 'expected_item_revision']
    WHEN 'item.list' THEN ARRAY['after_id', 'limit']
    WHEN 'member.list' THEN ARRAY['after_id', 'limit']
    WHEN 'audit.list' THEN ARRAY['after_created_at', 'after_id', 'limit']
    WHEN 'request.status' THEN ARRAY['request_id', 'item_id']
    WHEN 'item.write' THEN ARRAY['expected_revision', 'item_id', 'expected_item_revision', 'version',
      'name', 'encrypted_payload', 'encrypted_file_id', 'storage_object_id', 'encrypted_metadata', 'ciphertext_bytes']
    WHEN 'item.delete' THEN ARRAY['expected_revision', 'item_id', 'expected_item_revision']
    WHEN 'member.set' THEN ARRAY['expected_revision', 'user_id', 'role', 'revoked']
    WHEN 'rotation.snapshot' THEN ARRAY['expected_revision']
    WHEN 'vault.rotate' THEN ARRAY['expected_revision', 'encrypted_data_key', 'items']
    WHEN 'grant.create' THEN ARRAY['expected_revision', 'grant_id', 'scopes', 'item_ids', 'expires_at']
    WHEN 'grant.revoke' THEN ARRAY['expected_revision', 'grant_id']
    WHEN 'token.issue' THEN ARRAY['expected_revision', 'token_id', 'grant_id', 'token_digest', 'expires_at']
    ELSE NULL END;
  IF allowed IS NULL OR p_input - allowed <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid vault operation fields' USING ERRCODE = '22023';
  END IF;
  mutates := p_action NOT IN ('item.read', 'item.list', 'rotation.snapshot', 'key.read',
    'member.list', 'audit.list', 'request.status');
  -- Workspace lock serializes creation against the 32-vault cap.
  PERFORM 1 FROM public.workspaces WHERE id = p_ws FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  IF p_action = 'vault.create' THEN
    IF p_token IS NOT NULL OR p_token_digest IS NOT NULL THEN
      RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
    END IF;
    PERFORM private.password_vault_require_workspace_member(p_ws, actor);
    IF NOT EXISTS (SELECT 1 FROM private.password_vaults WHERE ws_id = p_ws AND id = p_vault) THEN
      IF (SELECT count(*) FROM private.password_vaults WHERE ws_id = p_ws) >= 32 THEN
        RAISE EXCEPTION 'Vault limit reached' USING ERRCODE = '54000';
      END IF;
      INSERT INTO private.password_vaults(id, ws_id, label, created_by) VALUES (p_vault, p_ws, p_input->>'label', actor);
      INSERT INTO private.password_vault_versions(ws_id, vault_id, version, encrypted_data_key)
        VALUES (p_ws, p_vault, 1, p_input->>'encrypted_data_key');
      INSERT INTO private.password_vault_members(ws_id, vault_id, user_id, role)
        VALUES (p_ws, p_vault, actor, 'owner');
    END IF;
  END IF;
  SELECT * INTO v FROM private.password_vaults WHERE ws_id = p_ws AND id = p_vault FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  IF p_action = 'request.status' THEN
    IF (p_input->>'request_id')::uuid IS NULL OR (p_input->>'request_id')::uuid = p_request THEN
      RAISE EXCEPTION 'Invalid receipt request' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO observed_request FROM private.password_vault_requests r
      WHERE r.ws_id = p_ws AND r.vault_id = p_vault AND r.request_id = (p_input->>'request_id')::uuid;
    IF FOUND THEN authorization_action := observed_request.action; END IF;
  END IF;
  IF p_token IS NOT NULL THEN
    IF p_actor IS NOT NULL OR p_token_digest IS NULL
      OR p_action NOT IN ('item.read', 'item.write', 'key.read', 'item.list', 'request.status') THEN
      RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO t FROM private.password_vault_machine_tokens WHERE ws_id = p_ws AND vault_id = p_vault
      AND id = p_token AND token_digest = p_token_digest AND revoked_at IS NULL AND expires_at > clock_timestamp();
    IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
    SELECT * INTO g FROM private.password_vault_machine_grants WHERE ws_id = p_ws AND vault_id = p_vault
      AND id = t.grant_id AND revoked_at IS NULL AND expires_at > clock_timestamp()
      AND authorization_epoch = v.authorization_epoch;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
    IF p_action = 'item.list' OR (p_action = 'request.status' AND observed_request.request_id IS NULL) THEN
      -- A missing receipt remains UNKNOWN. No item existence is disclosed.
      IF NOT g.scopes && ARRAY['item.read', 'item.write']::text[] THEN
        RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
      END IF;
    ELSE
      target := CASE WHEN p_action = 'request.status' THEN (observed_request.input->>'item_id')::uuid
        ELSE (p_input->>'item_id')::uuid END;
      IF (target = ANY(g.item_ids)) IS NOT TRUE
        OR ((CASE WHEN authorization_action = 'key.read' THEN 'item.write' ELSE authorization_action END) = ANY(g.scopes)) IS NOT TRUE
        OR (p_action = 'request.status' AND p_input ? 'item_id' AND (p_input->>'item_id')::uuid IS DISTINCT FROM target) THEN
        RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
      END IF;
    END IF;
    actor := g.issuer_user_id;
  ELSIF p_token_digest IS NOT NULL THEN
    RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM private.password_vault_require_workspace_member(p_ws, actor);
  SELECT * INTO m FROM private.password_vault_members
    WHERE ws_id = p_ws AND vault_id = p_vault AND user_id = actor AND revoked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  IF p_token IS NOT NULL AND m.role <> 'owner' THEN
    RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  IF p_action = 'request.status' AND observed_request.request_id IS NOT NULL AND
    (observed_request.actor_user_id IS DISTINCT FROM actor OR observed_request.token_id IS DISTINCT FROM p_token) THEN
    RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
  END IF;
  IF m.role = 'viewer' AND (mutates OR authorization_action IN
    ('key.read', 'item.write', 'item.delete')) THEN
    RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
  END IF;
  IF authorization_action IN ('vault.create', 'vault.rename', 'member.set', 'rotation.snapshot', 'vault.rotate',
    'grant.create', 'grant.revoke', 'token.issue', 'member.list', 'audit.list')
    AND m.role <> 'owner' THEN RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
  IF v.rotation_required AND p_action NOT IN ('rotation.snapshot', 'vault.rotate', 'member.set', 'grant.revoke',
    'member.list', 'item.list', 'audit.list', 'request.status') THEN
    RAISE EXCEPTION 'Vault rotation required' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO old_request FROM private.password_vault_requests
    WHERE ws_id = p_ws AND vault_id = p_vault AND request_id = p_request;
  IF FOUND THEN
    IF old_request.actor_user_id IS DISTINCT FROM actor OR old_request.token_id IS DISTINCT FROM p_token
      OR old_request.action <> p_action OR old_request.input <> p_input THEN
      RAISE EXCEPTION 'Request identity conflict' USING ERRCODE = '22023';
    END IF;
    -- Replay never discloses ciphertext or key material; fetch again with a new read request.
    RETURN old_request.response || jsonb_build_object('replayed', true);
  END IF;
  IF p_action = 'vault.create' AND v.created_by <> actor THEN
    RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501';
  END IF;
  IF mutates AND p_action <> 'vault.create' AND
    (p_input->>'expected_revision')::bigint IS DISTINCT FROM v.revision THEN
    RAISE EXCEPTION 'Vault revision conflict' USING ERRCODE = '40001';
  END IF;
  CASE p_action
  WHEN 'vault.create' THEN
    IF EXISTS (SELECT 1 FROM private.password_vault_requests WHERE ws_id = p_ws AND vault_id = p_vault) THEN
      RAISE EXCEPTION 'Vault already exists' USING ERRCODE = '23505';
    END IF;
  WHEN 'vault.rename' THEN
    UPDATE private.password_vaults SET label = p_input->>'label' WHERE ws_id = p_ws AND id = p_vault;
  WHEN 'key.read' THEN
    target := (p_input->>'item_id')::uuid;
    IF target IS NULL OR (p_input->>'expected_revision')::bigint IS DISTINCT FROM v.revision THEN
      RAISE EXCEPTION 'Vault revision conflict' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO item FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault AND id = target;
    IF FOUND THEN
      IF item.deleted_at IS NOT NULL OR (p_input->>'expected_item_revision')::bigint IS DISTINCT FROM item.revision THEN
        RAISE EXCEPTION 'Item revision conflict' USING ERRCODE = '40001'; END IF;
    ELSE
      IF p_token IS NOT NULL OR (p_input->>'expected_item_revision')::bigint IS DISTINCT FROM 0::bigint THEN
        RAISE EXCEPTION 'Vault access denied' USING ERRCODE = '42501'; END IF;
      IF (SELECT count(*) FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault) >= 1000 THEN
        RAISE EXCEPTION 'Item limit reached' USING ERRCODE = '54000'; END IF;
    END IF;
    SELECT jsonb_build_object('encrypted_data_key', encrypted_data_key, 'version', version) INTO result
      FROM private.password_vault_versions WHERE ws_id = p_ws AND vault_id = p_vault AND version = v.active_version;
  WHEN 'item.read' THEN
    SELECT * INTO item FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault
      AND id = (p_input->>'item_id')::uuid AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vault item unavailable' USING ERRCODE = 'P0002'; END IF;
    SELECT jsonb_build_object('item', to_jsonb(item), 'encrypted_data_key', k.encrypted_data_key)
      INTO result FROM private.password_vault_versions k
      WHERE k.ws_id = p_ws AND k.vault_id = p_vault AND k.version = item.version;
  WHEN 'item.list' THEN
    lim := COALESCE((p_input->>'limit')::integer, 50);
    IF lim NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page limit' USING ERRCODE = '22023'; END IF;
    SELECT jsonb_build_object('items', COALESCE(jsonb_agg(x), '[]'::jsonb)) INTO result FROM (
      SELECT id, name, version, revision, (encrypted_file_id IS NOT NULL) AS is_file FROM private.password_vault_items
      WHERE ws_id = p_ws AND vault_id = p_vault AND deleted_at IS NULL
        AND (p_token IS NULL OR id = ANY(g.item_ids))
        AND ((p_input->>'after_id') IS NULL OR id > (p_input->>'after_id')::uuid)
      ORDER BY id LIMIT lim
    ) x;
    IF p_token IS NOT NULL THEN
      result := result || jsonb_build_object('vault', jsonb_build_object(
        'id', v.id, 'ws_id', v.ws_id, 'revision', v.revision, 'active_version', v.active_version,
        'rotation_required', v.rotation_required,
        'role', CASE WHEN 'item.write' = ANY(g.scopes) THEN 'editor' ELSE 'viewer' END));
    END IF;
  WHEN 'member.list' THEN
    lim := COALESCE((p_input->>'limit')::integer, 50);
    IF lim NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid page limit' USING ERRCODE = '22023'; END IF;
    SELECT jsonb_build_object('members', COALESCE(jsonb_agg(x ORDER BY x.user_id), '[]'::jsonb)) INTO result FROM (
      SELECT vm.user_id, vm.role, vm.revoked_at, vm.created_at FROM private.password_vault_members vm
      WHERE vm.ws_id = p_ws AND vm.vault_id = p_vault
        AND (p_input->>'after_id' IS NULL OR vm.user_id > (p_input->>'after_id')::uuid)
      ORDER BY vm.user_id LIMIT lim
    ) x;
  WHEN 'audit.list' THEN
    lim := COALESCE((p_input->>'limit')::integer, 50);
    IF lim NOT BETWEEN 1 AND 100 OR (p_input->>'after_created_at' IS NULL) <> (p_input->>'after_id' IS NULL) THEN
      RAISE EXCEPTION 'Invalid audit page' USING ERRCODE = '22023'; END IF;
    SELECT jsonb_build_object('events', COALESCE(jsonb_agg(x ORDER BY x.created_at DESC, x.id DESC), '[]'::jsonb)) INTO result FROM (
      SELECT a.id, a.request_id, a.actor_user_id, a.token_id, a.actor_type, a.event_type,
        a.item_id, a.metadata, a.created_at FROM private.password_vault_audit_events a
      WHERE a.ws_id = p_ws AND a.vault_id = p_vault AND (p_input->>'after_id' IS NULL
        OR (a.created_at, a.id) < ((p_input->>'after_created_at')::timestamptz, (p_input->>'after_id')::uuid))
      ORDER BY a.created_at DESC, a.id DESC LIMIT lim
    ) x;
  WHEN 'request.status' THEN
    IF observed_request.request_id IS NULL THEN
      result := jsonb_build_object('status', 'unknown', 'request_id', (p_input->>'request_id')::uuid);
    ELSE
      result := jsonb_build_object('status', 'committed', 'request_id', observed_request.request_id,
        'action', observed_request.action, 'created_at', observed_request.created_at,
        'resource', CASE
          WHEN observed_request.action IN ('item.read', 'item.write', 'item.delete', 'key.read') THEN
            jsonb_build_object('type', 'item', 'id', (observed_request.input->>'item_id')::uuid)
          WHEN observed_request.action = 'member.set' THEN
            jsonb_build_object('type', 'member', 'id', (observed_request.input->>'user_id')::uuid)
          WHEN observed_request.action IN ('grant.create', 'grant.revoke') THEN
            jsonb_build_object('type', 'grant', 'id', (observed_request.input->>'grant_id')::uuid)
          WHEN observed_request.action = 'token.issue' THEN
            jsonb_build_object('type', 'token', 'id', (observed_request.input->>'token_id')::uuid)
          ELSE jsonb_build_object('type', 'vault', 'id', p_vault) END,
        'receipt', jsonb_strip_nulls(jsonb_build_object(
          'vault_id', observed_request.response->'vault_id', 'revision', observed_request.response->'revision',
          'authorization_epoch', observed_request.response->'authorization_epoch',
          'active_version', observed_request.response->'active_version',
          'item_id', observed_request.response->'item_id', 'item_revision', observed_request.response->'item_revision')));
    END IF;
  WHEN 'item.write' THEN
    target := (p_input->>'item_id')::uuid;
    IF target IS NULL OR (p_input->>'version')::integer IS DISTINCT FROM v.active_version THEN
      RAISE EXCEPTION 'Invalid item version' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO item FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault AND id = target;
    IF FOUND THEN
      IF item.deleted_at IS NOT NULL OR (p_input->>'expected_item_revision')::bigint IS DISTINCT FROM item.revision THEN
        RAISE EXCEPTION 'Item revision conflict' USING ERRCODE = '40001';
      END IF;
      n := item.revision + 1;
    ELSE
      IF (p_input->>'expected_item_revision')::bigint IS DISTINCT FROM 0::bigint THEN
        RAISE EXCEPTION 'Item revision conflict' USING ERRCODE = '40001';
      END IF;
      IF (SELECT count(*) FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault) >= 1000 THEN
        RAISE EXCEPTION 'Item limit reached' USING ERRCODE = '54000';
      END IF;
      n := 1;
    END IF;
    IF p_input->>'encrypted_file_id' IS NOT NULL THEN
      PERFORM private.password_vault_register_file(p_ws, p_vault, v.active_version, target,
        (p_input->>'encrypted_file_id')::uuid, (p_input->>'storage_object_id')::uuid,
        (p_input->>'ciphertext_bytes')::bigint);
    ELSIF p_input ? 'storage_object_id' THEN
      RAISE EXCEPTION 'Invalid file reference' USING ERRCODE = '22023';
    END IF;
    INSERT INTO private.password_vault_items(ws_id, vault_id, id, version, name, revision,
      encrypted_payload, encrypted_file_id, encrypted_metadata, ciphertext_bytes)
    VALUES (p_ws, p_vault, target, v.active_version, p_input->>'name', n, p_input->>'encrypted_payload',
      (p_input->>'encrypted_file_id')::uuid, p_input->>'encrypted_metadata', (p_input->>'ciphertext_bytes')::bigint)
    ON CONFLICT (ws_id, vault_id, id) DO UPDATE SET version = EXCLUDED.version, name = EXCLUDED.name, revision = EXCLUDED.revision,
      encrypted_payload = EXCLUDED.encrypted_payload, encrypted_file_id = EXCLUDED.encrypted_file_id,
      encrypted_metadata = EXCLUDED.encrypted_metadata, ciphertext_bytes = EXCLUDED.ciphertext_bytes, updated_at = now();
    result := jsonb_build_object('item_id', target, 'item_revision', n);
  WHEN 'item.delete' THEN
    target := (p_input->>'item_id')::uuid;
    UPDATE private.password_vault_items SET deleted_at = now(), revision = revision + 1, updated_at = now()
      WHERE ws_id = p_ws AND vault_id = p_vault AND id = target AND deleted_at IS NULL
        AND revision = (p_input->>'expected_item_revision')::bigint;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item revision conflict' USING ERRCODE = '40001'; END IF;
  WHEN 'member.set' THEN
    target := (p_input->>'user_id')::uuid;
    IF target IS NULL OR (p_input->>'role' IN ('owner', 'editor', 'viewer')) IS NOT TRUE
      OR jsonb_typeof(p_input->'revoked') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Invalid member operation' USING ERRCODE = '22023';
    END IF;
    PERFORM private.password_vault_require_workspace_member(p_ws, target);
    IF target = actor AND ((p_input->>'revoked')::boolean OR p_input->>'role' <> 'owner')
      AND NOT EXISTS (SELECT 1 FROM private.password_vault_members WHERE ws_id = p_ws AND vault_id = p_vault
        AND user_id <> actor AND role = 'owner' AND revoked_at IS NULL) THEN
      RAISE EXCEPTION 'Last owner cannot be removed' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM private.password_vault_members WHERE ws_id = p_ws AND vault_id = p_vault AND user_id = target)
      AND (SELECT count(*) FROM private.password_vault_members WHERE ws_id = p_ws AND vault_id = p_vault) >= 100 THEN
      RAISE EXCEPTION 'Member limit reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO private.password_vault_members(ws_id, vault_id, user_id, role, revoked_at)
      VALUES (p_ws, p_vault, target, p_input->>'role', CASE WHEN (p_input->>'revoked')::boolean THEN now() END)
      ON CONFLICT (ws_id, vault_id, user_id) DO UPDATE SET role = EXCLUDED.role, revoked_at = EXCLUDED.revoked_at;
    UPDATE private.password_vaults SET authorization_epoch = authorization_epoch + 1, rotation_required = true
      WHERE ws_id = p_ws AND id = p_vault;
  WHEN 'rotation.snapshot' THEN
    IF (p_input->>'expected_revision')::bigint IS DISTINCT FROM v.revision THEN
      RAISE EXCEPTION 'Vault revision conflict' USING ERRCODE = '40001';
    END IF;
    SELECT jsonb_build_object('items', COALESCE(jsonb_agg(i), '[]'::jsonb)) INTO result
      FROM private.password_vault_items i WHERE ws_id = p_ws AND vault_id = p_vault AND deleted_at IS NULL;
    result := result || jsonb_build_object('versions', (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb)
      FROM private.password_vault_versions k WHERE ws_id = p_ws AND vault_id = p_vault AND version = v.active_version));
  WHEN 'vault.rotate' THEN
    IF jsonb_typeof(p_input->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'items') > 1000
      OR v.active_version >= 1000 THEN RAISE EXCEPTION 'Invalid rotation batch' USING ERRCODE = '22023'; END IF;
    SELECT count(*) INTO n FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault AND deleted_at IS NULL;
    IF n <> jsonb_array_length(p_input->'items') OR n <> (SELECT count(DISTINCT (e->>'id')::uuid)
      FROM jsonb_array_elements(p_input->'items') e) THEN
      RAISE EXCEPTION 'Rotation must replace every live item exactly once' USING ERRCODE = '40001';
    END IF;
    INSERT INTO private.password_vault_versions(ws_id, vault_id, version, encrypted_data_key)
      VALUES (p_ws, p_vault, v.active_version + 1, p_input->>'encrypted_data_key');
    FOR entry IN SELECT value FROM jsonb_array_elements(p_input->'items') LOOP
      IF entry - ARRAY['id', 'expected_item_revision', 'encrypted_payload', 'encrypted_file_id',
        'storage_object_id', 'encrypted_metadata', 'ciphertext_bytes']::text[] <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Invalid rotation fields' USING ERRCODE = '22023';
      END IF;
      IF entry->>'encrypted_file_id' IS NOT NULL THEN
        PERFORM private.password_vault_register_file(p_ws, p_vault, v.active_version + 1, (entry->>'id')::uuid,
          (entry->>'encrypted_file_id')::uuid, (entry->>'storage_object_id')::uuid, (entry->>'ciphertext_bytes')::bigint);
      ELSIF entry ? 'storage_object_id' THEN
        RAISE EXCEPTION 'Invalid file reference' USING ERRCODE = '22023';
      END IF;
      UPDATE private.password_vault_items SET version = v.active_version + 1, revision = revision + 1,
        encrypted_payload = entry->>'encrypted_payload', encrypted_file_id = (entry->>'encrypted_file_id')::uuid,
        encrypted_metadata = entry->>'encrypted_metadata', ciphertext_bytes = (entry->>'ciphertext_bytes')::bigint, updated_at = now()
        WHERE ws_id = p_ws AND vault_id = p_vault AND id = (entry->>'id')::uuid AND deleted_at IS NULL
          AND revision = (entry->>'expected_item_revision')::bigint;
      IF NOT FOUND THEN RAISE EXCEPTION 'Rotation item conflict' USING ERRCODE = '40001'; END IF;
    END LOOP;
    UPDATE private.password_vaults SET active_version = active_version + 1,
      authorization_epoch = authorization_epoch + 1, rotation_required = false WHERE ws_id = p_ws AND id = p_vault;
  WHEN 'grant.create' THEN
    IF (SELECT count(*) FROM private.password_vault_machine_grants WHERE ws_id = p_ws AND vault_id = p_vault
      AND revoked_at IS NULL AND expires_at > clock_timestamp()) >= 100 THEN
      RAISE EXCEPTION 'Grant limit reached' USING ERRCODE = '54000';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_input->'item_ids') e
      WHERE NOT EXISTS (SELECT 1 FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault
        AND id = e::uuid AND deleted_at IS NULL)) THEN
      RAISE EXCEPTION 'Invalid grant scope' USING ERRCODE = '22023';
    END IF;
    INSERT INTO private.password_vault_machine_grants(ws_id, vault_id, id, issuer_user_id, authorization_epoch,
      scopes, item_ids, expires_at)
    VALUES (p_ws, p_vault, (p_input->>'grant_id')::uuid, actor, v.authorization_epoch,
      ARRAY(SELECT jsonb_array_elements_text(p_input->'scopes')),
      ARRAY(SELECT jsonb_array_elements_text(p_input->'item_ids')::uuid), (p_input->>'expires_at')::timestamptz);
  WHEN 'grant.revoke' THEN
    UPDATE private.password_vault_machine_grants SET revoked_at = now()
      WHERE ws_id = p_ws AND vault_id = p_vault AND id = (p_input->>'grant_id')::uuid AND revoked_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grant unavailable' USING ERRCODE = 'P0002'; END IF;
  WHEN 'token.issue' THEN
    SELECT * INTO g FROM private.password_vault_machine_grants WHERE ws_id = p_ws AND vault_id = p_vault
      AND id = (p_input->>'grant_id')::uuid AND revoked_at IS NULL AND authorization_epoch = v.authorization_epoch
      AND expires_at > clock_timestamp();
    IF NOT FOUND OR g.issuer_user_id IS DISTINCT FROM actor
      OR (p_input->>'expires_at')::timestamptz > g.expires_at THEN
      RAISE EXCEPTION 'Grant unavailable' USING ERRCODE = '42501';
    END IF;
    IF (SELECT count(*) FROM private.password_vault_machine_tokens WHERE ws_id = p_ws AND vault_id = p_vault
      AND grant_id = g.id AND revoked_at IS NULL AND expires_at > clock_timestamp()) >= 16 THEN
      RAISE EXCEPTION 'Token limit reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO private.password_vault_machine_tokens(ws_id, vault_id, id, grant_id, token_digest, expires_at)
      VALUES (p_ws, p_vault, (p_input->>'token_id')::uuid, g.id, p_input->>'token_digest', (p_input->>'expires_at')::timestamptz);
  END CASE;
  IF p_action IN ('item.write', 'vault.rotate') AND EXISTS (
    SELECT 1 FROM private.password_vault_items WHERE ws_id = p_ws AND vault_id = p_vault
    HAVING sum(ciphertext_bytes) > 104857600
      OR sum(octet_length(COALESCE(encrypted_payload, encrypted_metadata))) > 8388608
  ) THEN RAISE EXCEPTION 'Vault byte limit reached' USING ERRCODE = '54000'; END IF;
  IF mutates AND p_action <> 'vault.create' THEN
    UPDATE private.password_vaults SET revision = revision + 1, updated_at = now() WHERE ws_id = p_ws AND id = p_vault;
  END IF;
  SELECT * INTO STRICT v FROM private.password_vaults WHERE ws_id = p_ws AND id = p_vault;
  receipt := jsonb_build_object('vault_id', p_vault, 'revision', v.revision,
    'authorization_epoch', v.authorization_epoch, 'active_version', v.active_version, 'replayed', false);
  -- Read results are returned only after both mandatory appends succeed.
  INSERT INTO private.password_vault_audit_events(ws_id, vault_id, request_id, actor_user_id, token_id,
    actor_type, event_type, item_id, metadata) VALUES (p_ws, p_vault, p_request, actor, p_token, CASE WHEN p_token IS NULL THEN 'user' ELSE 'machine' END, p_action,
    CASE WHEN p_action IN ('item.read', 'item.write', 'item.delete', 'key.read') THEN (p_input->>'item_id')::uuid END,
    jsonb_build_object('revision', v.revision, 'authorizationEpoch', v.authorization_epoch));
  INSERT INTO private.password_vault_requests(ws_id, vault_id, request_id, actor_user_id, token_id, action, input, response)
    VALUES (p_ws, p_vault, p_request, actor, p_token, p_action, p_input, receipt ||
      CASE WHEN p_action = 'item.write' THEN result ELSE '{}'::jsonb END);
  RETURN receipt || result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow
  OR invalid_datetime_format OR not_null_violation THEN
  RAISE EXCEPTION 'Invalid vault operation fields' USING ERRCODE = '22023';
END $$;
CREATE FUNCTION private.password_vault_list(p_ws uuid, p_actor uuid, p_request uuid,
  p_after uuid DEFAULT NULL, p_limit integer DEFAULT 32)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE result jsonb; prior private.password_vault_audit_events;
BEGIN
  IF COALESCE(NULLIF(current_setting('role', true), 'none'), session_user::text) <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  IF p_request IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'Invalid page request' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.workspaces WHERE id = p_ws FOR UPDATE;
  PERFORM private.password_vault_require_workspace_member(p_ws, p_actor);
  SELECT * INTO prior FROM private.password_vault_audit_events
    WHERE ws_id = p_ws AND vault_id IS NULL AND request_id = p_request;
  IF FOUND THEN
    IF prior.actor_user_id IS DISTINCT FROM p_actor OR prior.event_type <> 'vault.list'
      OR prior.metadata->>'afterId' IS DISTINCT FROM p_after::text
      OR (prior.metadata->>'pageLimit')::integer IS DISTINCT FROM p_limit THEN
      RAISE EXCEPTION 'Request identity conflict' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('replayed', true);
  END IF;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO result FROM (
    SELECT v.id, v.label, v.revision, v.authorization_epoch, v.active_version, v.rotation_required, m.role
    FROM private.password_vaults v JOIN private.password_vault_members m ON m.ws_id = v.ws_id AND m.vault_id = v.id
    WHERE v.ws_id = p_ws AND m.user_id = p_actor AND m.revoked_at IS NULL AND (p_after IS NULL OR v.id > p_after)
    ORDER BY v.id LIMIT p_limit
  ) x;
  INSERT INTO private.password_vault_audit_events(ws_id, vault_id, request_id, actor_user_id, event_type, metadata)
    VALUES (p_ws, NULL, p_request, p_actor, 'vault.list', jsonb_build_object('revision', 0,
      'authorizationEpoch', 0, 'itemCount', jsonb_array_length(result), 'pageLimit', p_limit, 'afterId', p_after));
  RETURN jsonb_build_object('vaults', result, 'replayed', false);
END $$;
ALTER FUNCTION private.password_vault_execute(uuid, uuid, uuid, uuid, text, jsonb, uuid, text) OWNER TO postgres;
ALTER FUNCTION private.password_vault_list(uuid, uuid, uuid, uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.password_vault_require_workspace_member(uuid, uuid)
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
REVOKE ALL ON FUNCTION private.password_vault_execute(uuid, uuid, uuid, uuid, text, jsonb, uuid, text)
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
REVOKE ALL ON FUNCTION private.password_vault_list(uuid, uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
GRANT EXECUTE ON FUNCTION private.password_vault_execute(uuid, uuid, uuid, uuid, text, jsonb, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION private.password_vault_list(uuid, uuid, uuid, uuid, integer) TO service_role;
COMMIT;
