-- tuturuuu: reviewed(function-grant): public.put_workspace_secret_credential(uuid,uuid,text,bigint,uuid,smallint,bytea,bytea,text) review=workspace-secrets-step1
-- tuturuuu: reviewed(function-grant): public.get_workspace_secret_credential(uuid,text) review=workspace-secrets-step1
-- tuturuuu: reviewed(function-grant): public.workspace_secret_credential_status(uuid,uuid) review=workspace-secrets-step1
-- Workspace secrets encryption, step 1: the database side of the
-- tuturuuu-workspace-secrets Worker. Only service_role may call these, and the
-- Worker is the only service_role caller that uses them. Values arrive and
-- leave as ciphertext; Postgres never sees a credential in plaintext through
-- them. Legacy plaintext rows written before step 1 are returned only so
-- reveal can serve them until backfill encrypts them.

-- A put retried with the same request id after it succeeded is a replay, not
-- a conflict.
ALTER TABLE private.workspace_secret_payloads
  ADD COLUMN IF NOT EXISTS put_request_id uuid;

-- Writes one credential payload with compare-and-swap on value_rev.
-- - Create (p_expected_rev IS NULL): inserts the row with the caller-chosen
--   id and value NULL at revision 0. A same-named row in the workspace is a
--   conflict.
-- - Replace (p_expected_rev = current value_rev): sets value NULL, bumps the
--   revision by one and applies p_name (a rename re-binds the ciphertext, so
--   the Worker re-seals it for the new name and revision).
-- The ciphertext must be sealed for (ws, id, name, the returned revision);
-- the Worker computes that revision as p_expected_rev + 1, or 0 on create.
-- Returns status 'ok', 'replayed', 'conflict', 'not_found' or 'not_credential'.
CREATE OR REPLACE FUNCTION public.put_workspace_secret_credential(
  p_ws_id uuid,
  p_secret_id uuid,
  p_name text,
  p_expected_rev bigint,
  p_request_id uuid,
  p_kek_version smallint,
  p_wrapped_dek bytea,
  p_ciphertext bytea,
  p_last4 text
)
RETURNS TABLE (status text, secret_id uuid, value_rev bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_name text := regexp_replace(coalesce(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_row public.workspace_secrets%ROWTYPE;
  v_rev bigint;
BEGIN
  IF p_ws_id IS NULL OR p_secret_id IS NULL OR p_request_id IS NULL
     OR v_name = '' OR p_kek_version IS NULL OR p_kek_version < 1
     OR p_wrapped_dek IS NULL OR p_ciphertext IS NULL
     OR (p_expected_rev IS NOT NULL AND p_expected_rev < 0)
     OR (p_last4 IS NOT NULL AND char_length(p_last4) > 4) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'workspace_secret_credential_invalid';
  END IF;

  IF private.workspace_secret_name_tier(v_name) <> 'credential' THEN
    RETURN QUERY SELECT 'not_credential'::text, p_secret_id, NULL::bigint;
    RETURN;
  END IF;

  -- Serializes writers of one name in one workspace.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_ws_id::text || ':' || v_name, 0));

  SELECT * INTO v_row FROM public.workspace_secrets AS s
  WHERE s.id = p_secret_id
  FOR UPDATE;

  IF FOUND AND v_row.ws_id <> p_ws_id THEN
    RETURN QUERY SELECT 'not_found'::text, p_secret_id, NULL::bigint;
    RETURN;
  END IF;

  IF FOUND AND EXISTS (
    SELECT 1 FROM private.workspace_secret_payloads AS payload
    WHERE payload.secret_id = p_secret_id
      AND payload.put_request_id = p_request_id
      AND payload.source_rev = v_row.value_rev
  ) THEN
    RETURN QUERY SELECT 'replayed'::text, p_secret_id, v_row.value_rev;
    RETURN;
  END IF;

  IF p_expected_rev IS NULL THEN
    IF FOUND OR EXISTS (
      SELECT 1 FROM public.workspace_secrets AS s
      WHERE s.ws_id = p_ws_id
        AND regexp_replace(s.name, '^[[:space:]]+|[[:space:]]+$', '', 'g') = v_name
    ) THEN
      RETURN QUERY SELECT 'conflict'::text, p_secret_id, NULL::bigint;
      RETURN;
    END IF;
    INSERT INTO public.workspace_secrets (id, ws_id, name, value)
    VALUES (p_secret_id, p_ws_id, v_name, NULL);
    v_rev := 0;
  ELSE
    IF NOT FOUND THEN
      RETURN QUERY SELECT 'not_found'::text, p_secret_id, NULL::bigint;
      RETURN;
    END IF;
    IF v_row.value_rev <> p_expected_rev THEN
      RETURN QUERY SELECT 'conflict'::text, p_secret_id, v_row.value_rev;
      RETURN;
    END IF;
    IF v_name <> v_row.name AND EXISTS (
      SELECT 1 FROM public.workspace_secrets AS s
      WHERE s.ws_id = p_ws_id AND s.id <> p_secret_id
        AND regexp_replace(s.name, '^[[:space:]]+|[[:space:]]+$', '', 'g') = v_name
    ) THEN
      RETURN QUERY SELECT 'conflict'::text, p_secret_id, v_row.value_rev;
      RETURN;
    END IF;
    v_rev := p_expected_rev + 1;
    -- value NULL over NULL does not fire the revision trigger's bump, so the
    -- new revision is written explicitly.
    -- Admits only this rename in workspace_secrets_guard_payload_rename: the
    -- payload below is re-sealed for the new name in the same transaction.
    PERFORM set_config('tuturuuu.workspace_secret_credential_put', 'on', true);
    UPDATE public.workspace_secrets AS s
    SET name = v_name, value = NULL, value_rev = v_rev
    WHERE s.id = p_secret_id;
    PERFORM set_config('tuturuuu.workspace_secret_credential_put', '', true);
  END IF;

  INSERT INTO private.workspace_secret_payloads AS payload (
    secret_id, ws_id, tier, kek_version, wrapped_dek, ciphertext, last4,
    source_rev, verified_rev, put_request_id, updated_at
  )
  VALUES (
    p_secret_id, p_ws_id, 'credential', p_kek_version, p_wrapped_dek,
    p_ciphertext, nullif(p_last4, ''), v_rev, v_rev, p_request_id, now()
  )
  ON CONFLICT (secret_id) DO UPDATE SET
    tier = 'credential',
    vault_secret_id = NULL,
    kek_version = excluded.kek_version,
    wrapped_dek = excluded.wrapped_dek,
    ciphertext = excluded.ciphertext,
    last4 = excluded.last4,
    source_rev = excluded.source_rev,
    verified_rev = excluded.verified_rev,
    put_request_id = excluded.put_request_id,
    updated_at = now();

  DELETE FROM private.workspace_secret_backfill_status AS status_row
  WHERE status_row.secret_id = p_secret_id;

  RETURN QUERY SELECT 'ok'::text, p_secret_id, v_rev;
END;
$$;

-- The credential ciphertext is bound to the row's name, so a direct rename of
-- a row with a credential payload would make it undecryptable. Renames go
-- through put_workspace_secret_credential, which re-seals the value; every
-- other rename of such a row is refused, for every role.
CREATE OR REPLACE FUNCTION private.workspace_secrets_guard_payload_rename()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     AND coalesce(current_setting('tuturuuu.workspace_secret_credential_put', true), '') <> 'on'
     AND EXISTS (
       SELECT 1 FROM private.workspace_secret_payloads AS payload
       WHERE payload.secret_id = OLD.id AND payload.tier = 'credential'
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace_secrets_credential_rename_requires_put';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.workspace_secrets_guard_payload_rename()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS workspace_secrets_guard_payload_rename
  ON public.workspace_secrets;
CREATE TRIGGER workspace_secrets_guard_payload_rename
BEFORE UPDATE OF name ON public.workspace_secrets
FOR EACH ROW EXECUTE FUNCTION private.workspace_secrets_guard_payload_rename();

-- What reveal and rename need for one credential name in one workspace: the
-- current payload when it matches the row's revision, otherwise the legacy
-- plaintext of a row not yet encrypted. Never both.
CREATE OR REPLACE FUNCTION public.get_workspace_secret_credential(
  p_ws_id uuid,
  p_name text
)
RETURNS TABLE (
  secret_id uuid,
  name text,
  value_rev bigint,
  kek_version smallint,
  wrapped_dek bytea,
  ciphertext bytea,
  legacy_value text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    s.id,
    s.name,
    s.value_rev,
    payload.kek_version,
    payload.wrapped_dek,
    payload.ciphertext,
    CASE WHEN payload.secret_id IS NULL THEN s.value END
  FROM public.workspace_secrets AS s
  LEFT JOIN private.workspace_secret_payloads AS payload
    ON payload.secret_id = s.id
   AND payload.tier = 'credential'
   AND payload.verified_rev = s.value_rev
  WHERE s.ws_id = p_ws_id
    AND s.name = regexp_replace(coalesce(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g')
    AND private.workspace_secret_name_tier(s.name) = 'credential'
  ORDER BY s.created_at, s.id
  LIMIT 1;
$$;

-- Metadata only: whether a credential row exists in the workspace and holds a
-- verified encrypted value. Never returns key material.
CREATE OR REPLACE FUNCTION public.workspace_secret_credential_status(
  p_ws_id uuid,
  p_secret_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN payload.secret_id IS NOT NULL THEN 'active'
      WHEN s.value IS NOT NULL THEN 'active'
      ELSE 'invalid'
    END
    FROM public.workspace_secrets AS s
    LEFT JOIN private.workspace_secret_payloads AS payload
      ON payload.secret_id = s.id
     AND payload.tier = 'credential'
     AND payload.verified_rev = s.value_rev
    WHERE s.id = p_secret_id
      AND s.ws_id = p_ws_id
      AND private.workspace_secret_name_tier(s.name) = 'credential'
  ), 'missing');
$$;

REVOKE ALL ON FUNCTION public.put_workspace_secret_credential(uuid, uuid, text, bigint, uuid, smallint, bytea, bytea, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_workspace_secret_credential(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_secret_credential_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.put_workspace_secret_credential(uuid, uuid, text, bigint, uuid, smallint, bytea, bytea, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_secret_credential(uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_secret_credential_status(uuid, uuid)
  TO service_role;
