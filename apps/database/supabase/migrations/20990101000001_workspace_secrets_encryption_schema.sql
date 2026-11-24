-- tuturuuu: no-grant (internal)
-- Workspace secrets encryption, step 1 schema
-- (apps/docs/platform/architecture/workspace-secrets-encryption.mdx).
--
-- Adds value revisions, the encrypted payload store, backfill status, the
-- migration state row, a database mirror of the TypeScript tier registry and
-- the trigger that rejects new credential plaintext. The trigger is a no-op
-- until private.workspace_secrets_migration_state.enforce_credential_encryption
-- is set, which only the migration owner can do, after the secrets Worker and
-- the app release that writes credentials through it are live.

-- 1. Value revisions --------------------------------------------------------

ALTER TABLE public.workspace_secrets
  ADD COLUMN IF NOT EXISTS value_rev bigint NOT NULL DEFAULT 0;

-- A value change bumps the revision. Credential replacements write NULL over
-- NULL, which this cannot see, so the credential put function increments
-- value_rev itself; the trigger only refuses to move a revision backwards.
CREATE OR REPLACE FUNCTION private.workspace_secrets_bump_value_rev()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.value_rev := 0;
    RETURN NEW;
  END IF;

  IF NEW.value IS DISTINCT FROM OLD.value THEN
    NEW.value_rev := OLD.value_rev + 1;
  ELSIF NEW.value_rev < OLD.value_rev THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'workspace_secrets_value_rev_decrease';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.workspace_secrets_bump_value_rev()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS workspace_secrets_value_rev ON public.workspace_secrets;
CREATE TRIGGER workspace_secrets_value_rev
BEFORE INSERT OR UPDATE ON public.workspace_secrets
FOR EACH ROW EXECUTE FUNCTION private.workspace_secrets_bump_value_rev();

-- 2. Tier mirror ------------------------------------------------------------

-- Rows equal WORKSPACE_SECRET_TIER_RULES in
-- packages/utils/src/workspace-secret-tier-rules.ts; a test compares them.
-- Rules apply in ascending priority; unmatched names are credential.
CREATE TABLE private.workspace_secret_name_tiers (
  priority integer PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('exact', 'prefix', 'pattern')),
  match text NOT NULL CHECK (match <> ''),
  tier text NOT NULL CHECK (tier IN ('config', 'credential')),
  client_visible boolean NOT NULL,
  value_type text NOT NULL
    CHECK (value_type IN ('boolean', 'json', 'number', 'string')),
  UNIQUE (kind, match),
  CHECK (tier = 'config' OR NOT client_visible)
);

INSERT INTO private.workspace_secret_name_tiers
  (priority, kind, match, tier, client_visible, value_type)
VALUES
  (10, 'exact', 'DRIVE_R2_ACCESS_KEY_ID', 'credential', false, 'string'),
  (20, 'exact', 'DRIVE_R2_SECRET_ACCESS_KEY', 'credential', false, 'string'),
  (30, 'exact', 'DRIVE_AUTO_EXTRACT_PROXY_TOKEN', 'credential', false, 'string'),
  (40, 'exact', 'AI_AGENT_CHAT_SDK_STATE_REDIS_URL', 'credential', false, 'string'),
  (50, 'exact', 'AI_AGENT_DISCORD_GATEWAY_WATCHER_SECRET', 'credential', false, 'string'),
  (60, 'exact', 'mobile_calendar_gateway:v1', 'credential', false, 'string'),
  (70, 'exact', 'EXTERNAL_APP_MANAGED_CRON_TOKEN', 'config', false, 'string'),
  (80, 'pattern', '^AI_AGENT_REGISTRY:[^:]+:(meta|instructions(:[0-9]+)?)$', 'config', true, 'string'),
  (90, 'pattern', '^AI_AGENT_REGISTRY:[^:]+:channel:[^:]+:meta$', 'config', true, 'string'),
  (100, 'pattern', '^AI_AGENT_IDENTITY:[^:]+:zalo:[^:]+:[^:]+$', 'config', true, 'string'),
  (110, 'pattern', '^EXTERNAL_APP_REGISTRY:[^:]+:(allowedScopes|allowedWorkspaceIds|callbackPaths|createdAt|createdBy|displayName|enabled|logoUrl|maxBearerTtlSeconds|origins|requirePkce|secretIssuedAt|secretLastFour|updatedAt|updatedBy)$', 'config', true, 'string'),
  (120, 'exact', 'AUTO_SEND_APPROVED_REPORTS', 'config', true, 'boolean'),
  (130, 'exact', 'DRIVE_AUTO_EXTRACT_PROXY_URL', 'config', true, 'string'),
  (140, 'exact', 'DRIVE_AUTO_EXTRACT_ZIP', 'config', true, 'boolean'),
  (150, 'exact', 'DRIVE_R2_BUCKET', 'config', true, 'string'),
  (160, 'exact', 'DRIVE_R2_ENDPOINT', 'config', true, 'string'),
  (170, 'exact', 'DRIVE_STORAGE_PROVIDER', 'config', true, 'string'),
  (180, 'exact', 'EXTERNAL_PROJECT_CANONICAL_ID', 'config', true, 'string'),
  (190, 'exact', 'EXTERNAL_PROJECT_ENABLED', 'config', true, 'boolean'),
  (200, 'exact', 'FINANCE_SHOW_INVOICES', 'config', true, 'boolean'),
  (210, 'exact', 'MANAGED_CRON_ENABLED', 'config', true, 'boolean'),
  (220, 'exact', 'MOBILE_HIDDEN_MODULES', 'config', true, 'json'),
  (230, 'exact', 'MOBILE_HIDE_EXPERIMENTAL_MODULES', 'config', true, 'boolean'),
  (240, 'exact', 'STORAGE_LIMIT_BYTES', 'config', true, 'number'),
  (250, 'pattern', '^TUTURUUU_[A-Z0-9_]+_SECONDS$', 'config', true, 'number'),
  (260, 'prefix', 'ENABLE_', 'config', true, 'boolean'),
  (270, 'prefix', 'DISABLE_', 'config', true, 'boolean'),
  (280, 'prefix', 'ALLOW_', 'config', true, 'boolean'),
  (290, 'prefix', 'PREVENT_', 'config', true, 'boolean'),
  (300, 'prefix', 'HIDE_', 'config', true, 'boolean'),
  (310, 'prefix', 'SHOW_', 'config', true, 'boolean'),
  (320, 'prefix', 'RATE_LIMIT_', 'config', true, 'number'),
  (330, 'prefix', 'EMAIL_RATE_LIMIT_', 'config', true, 'number'),
  (340, 'prefix', 'INVITE_RATE_LIMIT_', 'config', true, 'number');

-- The tier of one name, matching getWorkspaceSecretPolicy: surrounding
-- whitespace is ignored, the lowest-priority matching rule wins, and a name
-- no rule matches (or an empty one) is credential.
CREATE OR REPLACE FUNCTION private.workspace_secret_name_tier(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH normalized AS (
    SELECT regexp_replace(coalesce(p_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g') AS name
  )
  SELECT coalesce((
    SELECT rule.tier
    FROM private.workspace_secret_name_tiers AS rule, normalized
    WHERE normalized.name <> ''
      AND (
        (rule.kind = 'exact' AND normalized.name = rule.match)
        OR (rule.kind = 'prefix' AND starts_with(normalized.name, rule.match))
        OR (rule.kind = 'pattern' AND normalized.name ~ rule.match)
      )
    ORDER BY rule.priority
    LIMIT 1
  ), 'credential');
$$;

REVOKE ALL ON FUNCTION private.workspace_secret_name_tier(text)
  FROM PUBLIC, anon, authenticated, service_role;

-- 3. Encrypted payloads, backfill status and migration state ---------------

CREATE TABLE private.workspace_secret_payloads (
  secret_id uuid PRIMARY KEY
    REFERENCES public.workspace_secrets(id) ON DELETE CASCADE,
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('config', 'credential')),
  vault_secret_id uuid,
  kek_version smallint CHECK (kek_version > 0),
  wrapped_dek bytea,
  ciphertext bytea,
  last4 text CHECK (last4 IS NULL OR char_length(last4) <= 4),
  source_rev bigint NOT NULL CHECK (source_rev >= 0),
  verified_rev bigint CHECK (verified_rev IS NULL OR verified_rev = source_rev),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tier = 'config') = (vault_secret_id IS NOT NULL)),
  CHECK (
    (tier = 'credential')
    = (ciphertext IS NOT NULL AND wrapped_dek IS NOT NULL AND kek_version IS NOT NULL)
  ),
  CHECK (tier = 'credential' OR last4 IS NULL)
);

CREATE INDEX workspace_secret_payloads_ws_id_idx
  ON private.workspace_secret_payloads (ws_id);

-- Backfill progress lives apart from payloads, so a first attempt that fails
-- before any Vault row or ciphertext exists can still be recorded.
CREATE TABLE private.workspace_secret_backfill_status (
  secret_id uuid PRIMARY KEY
    REFERENCES public.workspace_secrets(id) ON DELETE CASCADE,
  source_rev bigint NOT NULL CHECK (source_rev >= 0),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_error_class text CHECK (last_error_class ~ '^[a-z][a-z0-9_]{0,63}$'),
  needs_review_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE private.workspace_secrets_migration_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Off until the secrets Worker and the app release that writes credentials
  -- through it are live; the migration owner sets it with
  -- private.set_workspace_secrets_credential_enforcement.
  enforce_credential_encryption boolean NOT NULL DEFAULT false,
  enforcement_changed_at timestamptz,
  enforcement_changed_by text,
  read_mode text NOT NULL DEFAULT 'plaintext'
    CHECK (read_mode IN ('plaintext', 'dual', 'encrypted')),
  dual_since timestamptz,
  mismatches bigint NOT NULL DEFAULT 0 CHECK (mismatches >= 0),
  last_mismatch_at timestamptz,
  null_approved_by text,
  null_approved_at timestamptz,
  plaintext_nulled_at timestamptz
);

INSERT INTO private.workspace_secrets_migration_state (id) VALUES (true);

ALTER TABLE private.workspace_secret_name_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workspace_secret_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workspace_secret_backfill_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.workspace_secrets_migration_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  private.workspace_secret_name_tiers,
  private.workspace_secret_payloads,
  private.workspace_secret_backfill_status,
  private.workspace_secrets_migration_state
FROM PUBLIC, anon, authenticated, service_role;

-- 4. Credential enforcement -------------------------------------------------

-- The only path that changes enforcement. Execute is revoked from every API
-- role, so only the database owner (the migration owner's SQL session) can
-- call it.
CREATE OR REPLACE FUNCTION private.set_workspace_secrets_credential_enforcement(
  p_enabled boolean,
  p_changed_by text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF p_enabled IS NULL OR coalesce(btrim(p_changed_by), '') = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'workspace_secrets_enforcement_args_required';
  END IF;

  UPDATE private.workspace_secrets_migration_state
  SET enforce_credential_encryption = p_enabled,
      enforcement_changed_at = now(),
      enforcement_changed_by = btrim(p_changed_by)
  WHERE id;
END;
$$;

REVOKE ALL ON FUNCTION private.set_workspace_secrets_credential_enforcement(boolean, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Rejects new credential plaintext for every role, service_role included,
-- once enforcement is on. It blocks:
-- - inserting a non-null value under a credential-tier name;
-- - setting or changing a non-null value under a credential-tier name;
-- - renaming a row with a plaintext value into a credential-tier name;
-- - renaming a plaintext credential row to a config-tier name without a new
--   value, which would expose the credential as config;
-- - any non-null value on a row that has a credential payload.
-- Legacy plaintext credential rows stay readable, deletable and renamable
-- among credential names until backfill encrypts them.
CREATE OR REPLACE FUNCTION private.workspace_secrets_reject_credential_plaintext()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_new_tier text;
  v_old_tier text;
BEGIN
  IF NOT coalesce((
    SELECT state.enforce_credential_encryption
    FROM private.workspace_secrets_migration_state AS state
    WHERE state.id
  ), false) THEN
    RETURN NEW;
  END IF;

  IF NEW.value IS NULL THEN
    RETURN NEW;
  END IF;

  v_new_tier := private.workspace_secret_name_tier(NEW.name);

  IF TG_OP = 'INSERT' THEN
    IF v_new_tier = 'credential' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'workspace_secrets_credential_plaintext';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM private.workspace_secret_payloads AS payload
    WHERE payload.secret_id = NEW.id AND payload.tier = 'credential'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace_secrets_credential_plaintext';
  END IF;

  v_old_tier := private.workspace_secret_name_tier(OLD.name);

  IF v_new_tier = 'credential'
     AND (NEW.value IS DISTINCT FROM OLD.value OR v_old_tier <> 'credential') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace_secrets_credential_plaintext';
  END IF;

  IF v_old_tier = 'credential' AND v_new_tier <> 'credential'
     AND NEW.value IS NOT DISTINCT FROM OLD.value THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'workspace_secrets_credential_plaintext';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.workspace_secrets_reject_credential_plaintext()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS workspace_secrets_reject_credential_plaintext
  ON public.workspace_secrets;
CREATE TRIGGER workspace_secrets_reject_credential_plaintext
BEFORE INSERT OR UPDATE ON public.workspace_secrets
FOR EACH ROW EXECUTE FUNCTION private.workspace_secrets_reject_credential_plaintext();
