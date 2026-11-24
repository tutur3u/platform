-- tuturuuu: reviewed(function-grant): public.put_workspace_secret_config(uuid,text,text) review=workspace-secrets-step1
-- tuturuuu: reviewed(function-grant): public.list_workspace_secret_config(uuid) review=workspace-secrets-step1
-- Workspace secrets encryption, step 1: the config tier in Supabase Vault.
--
-- workspace_secrets_definer owns the config-tier functions and is the only
-- non-service role granted vault.decrypted_secrets. (Supabase also grants
-- service_role SELECT on that view; the design records this as an accepted
-- residual, because config values are non-secret flags and settings and the
-- service key is already full trust.) Config writes are dual: the plaintext
-- column keeps the value until step 4 and Vault holds the same value, written
-- in one transaction. Reads honor private.workspace_secrets_migration_state
-- .read_mode.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- GRANT ... WITH INHERIT FALSE, SET TRUE below needs PostgreSQL 16 or later.
DO $$
BEGIN
  IF current_setting('server_version_num')::integer < 160000 THEN
    RAISE EXCEPTION USING
      ERRCODE = '0A000',
      MESSAGE = 'workspace_secrets_requires_postgres_16';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'workspace_secrets_definer') THEN
    CREATE ROLE workspace_secrets_definer NOLOGIN NOINHERIT;
  END IF;
END;
$$;

-- Reasserted unconditionally, in case the role already existed. SUPERUSER
-- and REPLICATION can be changed only by roles that hold them, so they are
-- checked instead of set.
ALTER ROLE workspace_secrets_definer
  NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'workspace_secrets_definer' AND (rolsuper OR rolreplication)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace_secrets_definer_has_superuser_or_replication';
  END IF;
END;
$$;

-- The migration user hands function ownership to the role, which needs SET
-- membership; INHERIT stays off, so it gains none of the role's privileges.
GRANT workspace_secrets_definer TO current_user WITH INHERIT FALSE, SET TRUE;

GRANT USAGE ON SCHEMA public, private, vault TO workspace_secrets_definer;
GRANT SELECT ON vault.decrypted_secrets TO workspace_secrets_definer;
-- vault.decrypted_secrets decrypts through this internal function; it is
-- granted by name because its argument list belongs to the Vault version.
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure FROM pg_proc AS p
    WHERE p.pronamespace = 'vault'::regnamespace
      AND p.proname = '_crypto_aead_det_decrypt'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO workspace_secrets_definer', v_fn);
  END LOOP;
END;
$$;
GRANT SELECT, DELETE ON vault.secrets TO workspace_secrets_definer;
GRANT EXECUTE ON FUNCTION vault.create_secret(text, text, text, uuid)
  TO workspace_secrets_definer;
GRANT EXECUTE ON FUNCTION vault.update_secret(uuid, text, text, text, uuid)
  TO workspace_secrets_definer;
GRANT SELECT, INSERT, UPDATE ON public.workspace_secrets TO workspace_secrets_definer;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.workspace_secret_payloads
  TO workspace_secrets_definer;
GRANT SELECT ON private.workspace_secrets_migration_state TO workspace_secrets_definer;
GRANT EXECUTE ON FUNCTION private.workspace_secret_name_tier(text)
  TO workspace_secrets_definer;

-- The definer role does not bypass RLS; these policies admit it, and only it.
CREATE POLICY "workspace_secrets_definer_all" ON public.workspace_secrets
  FOR ALL TO workspace_secrets_definer USING (true) WITH CHECK (true);
CREATE POLICY "workspace_secrets_definer_all" ON private.workspace_secret_payloads
  FOR ALL TO workspace_secrets_definer USING (true) WITH CHECK (true);
CREATE POLICY "workspace_secrets_definer_read" ON private.workspace_secrets_migration_state
  FOR SELECT TO workspace_secrets_definer USING (true);

-- The config value of one row as the current read mode serves it:
-- 'plaintext' reads the column; 'dual' reads Vault when the payload is
-- verified for the row's revision and the column otherwise; 'encrypted'
-- reads Vault only.
CREATE OR REPLACE FUNCTION private.workspace_secret_config_row_value(p_secret_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE state.read_mode
    WHEN 'plaintext' THEN s.value
    WHEN 'dual' THEN CASE
      WHEN payload.verified_rev = s.value_rev THEN decrypted.decrypted_secret
      ELSE s.value
    END
    ELSE CASE
      WHEN payload.verified_rev = s.value_rev THEN decrypted.decrypted_secret
    END
  END
  FROM public.workspace_secrets AS s
  CROSS JOIN private.workspace_secrets_migration_state AS state
  LEFT JOIN private.workspace_secret_payloads AS payload
    ON payload.secret_id = s.id AND payload.tier = 'config'
  LEFT JOIN vault.decrypted_secrets AS decrypted
    ON decrypted.id = payload.vault_secret_id
  WHERE s.id = p_secret_id
    AND state.id
    AND private.workspace_secret_name_tier(s.name) = 'config';
$$;

-- The value Postgres functions read for one config name.
CREATE OR REPLACE FUNCTION private.workspace_secret_config_value(
  p_ws_id uuid,
  p_name text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT private.workspace_secret_config_row_value(s.id)
  FROM public.workspace_secrets AS s
  WHERE s.ws_id = p_ws_id
    AND s.name = btrim(p_name)
  ORDER BY s.created_at, s.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.workspace_secret_enabled(
  p_ws_id uuid,
  p_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(private.workspace_secret_config_value(p_ws_id, p_name) = 'true', false);
$$;

-- All config-tier names and values for one workspace; the hot-path RPC.
-- Credential-tier rows are never returned.
CREATE OR REPLACE FUNCTION public.list_workspace_secret_config(p_ws_id uuid)
RETURNS TABLE (name text, value text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT s.name, private.workspace_secret_config_row_value(s.id)
  FROM public.workspace_secrets AS s
  WHERE s.ws_id = p_ws_id
    AND private.workspace_secret_name_tier(s.name) = 'config'
  ORDER BY s.name, s.created_at, s.id;
$$;

-- Writes one config value: the plaintext column (until step 4) and its Vault
-- secret in one transaction, creating the row when the name is new. The
-- value travels as a parameter, so it appears in no SQL text. Returns status
-- 'ok' or 'not_config'.
CREATE OR REPLACE FUNCTION public.put_workspace_secret_config(
  p_ws_id uuid,
  p_name text,
  p_value text
)
RETURNS TABLE (status text, secret_id uuid, value_rev bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_name text := regexp_replace(coalesce(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  v_id uuid;
  v_rev bigint;
  v_vault_id uuid;
BEGIN
  IF p_ws_id IS NULL OR v_name = '' OR p_value IS NULL OR p_value = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'workspace_secret_config_invalid';
  END IF;

  IF private.workspace_secret_name_tier(v_name) <> 'config' THEN
    RETURN QUERY SELECT 'not_config'::text, NULL::uuid, NULL::bigint;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_ws_id::text || ':' || v_name, 0));

  SELECT s.id INTO v_id
  FROM public.workspace_secrets AS s
  WHERE s.ws_id = p_ws_id AND s.name = v_name
  ORDER BY s.created_at, s.id
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.workspace_secrets (ws_id, name, value)
    VALUES (p_ws_id, v_name, p_value)
    RETURNING id, value_rev INTO v_id, v_rev;
  ELSE
    UPDATE public.workspace_secrets AS s
    SET value = p_value
    WHERE s.id = v_id
    RETURNING s.value_rev INTO v_rev;
  END IF;

  SELECT payload.vault_secret_id INTO v_vault_id
  FROM private.workspace_secret_payloads AS payload
  WHERE payload.secret_id = v_id AND payload.tier = 'config';

  IF v_vault_id IS NULL THEN
    v_vault_id := vault.create_secret(
      p_value,
      'workspace_secret:' || v_id::text,
      'Workspace secret config value'
    );
  ELSE
    PERFORM vault.update_secret(v_vault_id, p_value);
  END IF;

  INSERT INTO private.workspace_secret_payloads AS payload (
    secret_id, ws_id, tier, vault_secret_id, source_rev, verified_rev, updated_at
  )
  VALUES (v_id, p_ws_id, 'config', v_vault_id, v_rev, v_rev, now())
  ON CONFLICT (secret_id) DO UPDATE SET
    tier = 'config',
    vault_secret_id = excluded.vault_secret_id,
    kek_version = NULL,
    wrapped_dek = NULL,
    ciphertext = NULL,
    last4 = NULL,
    source_rev = excluded.source_rev,
    verified_rev = excluded.verified_rev,
    put_request_id = NULL,
    updated_at = now();

  RETURN QUERY SELECT 'ok'::text, v_id, v_rev;
END;
$$;

-- Deleting a payload (directly or by the secret's cascade) removes its Vault
-- secret, so a deleted config value leaves no copy behind.
CREATE OR REPLACE FUNCTION private.workspace_secret_payloads_delete_vault()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF OLD.vault_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = OLD.vault_secret_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS workspace_secret_payloads_delete_vault
  ON private.workspace_secret_payloads;
CREATE TRIGGER workspace_secret_payloads_delete_vault
AFTER DELETE ON private.workspace_secret_payloads
FOR EACH ROW EXECUTE FUNCTION private.workspace_secret_payloads_delete_vault();

-- ALTER ... OWNER needs the new owner to hold CREATE on the schema at that
-- moment; the grant is removed right after, so the role creates nothing.
GRANT CREATE ON SCHEMA private, public TO workspace_secrets_definer;
ALTER FUNCTION private.workspace_secret_config_row_value(uuid) OWNER TO workspace_secrets_definer;
ALTER FUNCTION private.workspace_secret_config_value(uuid, text) OWNER TO workspace_secrets_definer;
ALTER FUNCTION private.workspace_secret_enabled(uuid, text) OWNER TO workspace_secrets_definer;
ALTER FUNCTION public.list_workspace_secret_config(uuid) OWNER TO workspace_secrets_definer;
ALTER FUNCTION public.put_workspace_secret_config(uuid, text, text) OWNER TO workspace_secrets_definer;
ALTER FUNCTION private.workspace_secret_payloads_delete_vault() OWNER TO workspace_secrets_definer;
REVOKE CREATE ON SCHEMA private, public FROM workspace_secrets_definer;

-- ALTER ... OWNER keeps each function's existing ACL, default-privilege
-- grants included, with the new owner as their grantor, so only the new owner
-- can revoke them. The privileges are therefore set here, as the owner. The
-- check at the end of this file fails the migration if they did not apply.
SET LOCAL ROLE workspace_secrets_definer;
REVOKE ALL ON FUNCTION private.workspace_secret_config_row_value(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.workspace_secret_config_value(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.workspace_secret_enabled(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.workspace_secret_payloads_delete_vault()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_workspace_secret_config(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.put_workspace_secret_config(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

-- The definer functions call one another as their owner.
GRANT EXECUTE ON FUNCTION private.workspace_secret_config_row_value(uuid)
  TO workspace_secrets_definer;
GRANT EXECUTE ON FUNCTION private.workspace_secret_config_value(uuid, text)
  TO workspace_secrets_definer;

-- Database functions owned by the migration user (the step 3 rewrites of
-- flag checks) read config values through these.
GRANT EXECUTE ON FUNCTION private.workspace_secret_config_value(uuid, text) TO SESSION_USER;
GRANT EXECUTE ON FUNCTION private.workspace_secret_enabled(uuid, text) TO SESSION_USER;

GRANT EXECUTE ON FUNCTION public.list_workspace_secret_config(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.put_workspace_secret_config(uuid, text, text) TO service_role;
RESET ROLE;

-- The grants above must hold however the runner executes this file: SET
-- LOCAL ROLE outside a transaction would leave the revokes unapplied.
DO $$
DECLARE
  v_fn text;
  v_role text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.put_workspace_secret_config(uuid,text,text)',
    'public.list_workspace_secret_config(uuid)',
    'private.workspace_secret_config_row_value(uuid)',
    'private.workspace_secret_config_value(uuid,text)',
    'private.workspace_secret_enabled(uuid,text)',
    'private.workspace_secret_payloads_delete_vault()'
  ] LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format('workspace_secrets_grant_check_failed: %s for %s', v_fn, v_role);
      END IF;
    END LOOP;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'private.workspace_secret_config_row_value(uuid)',
    'private.workspace_secret_config_value(uuid,text)',
    'private.workspace_secret_enabled(uuid,text)',
    'private.workspace_secret_payloads_delete_vault()'
  ] LOOP
    IF has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = format('workspace_secrets_grant_check_failed: %s for service_role', v_fn);
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.put_workspace_secret_config(uuid,text,text)',
    'public.list_workspace_secret_config(uuid)'
  ] LOOP
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = format('workspace_secrets_grant_check_failed: %s missing for service_role', v_fn);
    END IF;
  END LOOP;
  IF pg_has_role('service_role', 'workspace_secrets_definer', 'MEMBER')
     OR pg_has_role('authenticator', 'workspace_secrets_definer', 'MEMBER')
     OR pg_has_role('authenticated', 'workspace_secrets_definer', 'MEMBER')
     OR pg_has_role('anon', 'workspace_secrets_definer', 'MEMBER') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace_secrets_grant_check_failed: API role holds the definer role';
  END IF;
END;
$$;
