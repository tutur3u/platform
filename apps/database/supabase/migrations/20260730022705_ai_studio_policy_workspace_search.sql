CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS workspaces_ai_policy_name_search_idx
ON public.workspaces
USING gin (
  public.normalize_workspace_user_search_text(coalesce(name, '')) gin_trgm_ops
);

CREATE OR REPLACE FUNCTION private.search_ai_studio_policy_workspaces(
  p_query TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 51,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  ws_id UUID,
  workspace_name TEXT,
  allowed_models TEXT[],
  denied_models TEXT[],
  capture_enabled BOOLEAN,
  metadata_retention_days INTEGER,
  content_retention_days INTEGER,
  requests_per_minute INTEGER,
  monthly_credit_budget NUMERIC,
  no_training_enforced BOOLEAN,
  api_key_creation_approved BOOLEAN,
  api_key_creation_decided_at TIMESTAMPTZ,
  api_key_creation_decided_by UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_query TEXT := public.normalize_workspace_user_search_text(p_query);
  v_pattern TEXT := '%' ||
    replace(
      replace(
        replace(v_query, '\', '\\'),
        '%',
        '\%'
      ),
      '_',
      '\_'
    ) || '%';
BEGIN
  RETURN QUERY
  SELECT
    workspace.id,
    workspace.name,
    coalesce(policy.allowed_models, '{}'::TEXT[]),
    coalesce(policy.denied_models, '{}'::TEXT[]),
    policy.capture_enabled,
    policy.metadata_retention_days,
    policy.content_retention_days,
    policy.requests_per_minute,
    policy.monthly_credit_budget,
    coalesce(policy.no_training_enforced, TRUE),
    coalesce(policy.api_key_creation_approved, FALSE),
    policy.api_key_creation_decided_at,
    policy.api_key_creation_decided_by
  FROM public.workspaces AS workspace
  LEFT JOIN private.workspace_ai_studio_policies AS policy
    ON policy.ws_id = workspace.id
  WHERE
    v_query = ''
    OR public.normalize_workspace_user_search_text(
      coalesce(workspace.name, '')
    ) LIKE v_pattern ESCAPE '\'
    OR workspace.id::TEXT LIKE v_pattern ESCAPE '\'
  ORDER BY
    CASE
      WHEN v_query = '' THEN 0
      WHEN workspace.id::TEXT = v_query THEN 0
      WHEN left(workspace.id::TEXT, length(v_query)) = v_query THEN 1
      WHEN public.normalize_workspace_user_search_text(
        coalesce(workspace.name, '')
      ) = v_query THEN 2
      WHEN left(
        public.normalize_workspace_user_search_text(
          coalesce(workspace.name, '')
        ),
        length(v_query)
      ) = v_query THEN 3
      ELSE 4
    END,
    public.normalize_workspace_user_search_text(
      coalesce(workspace.name, '')
    ),
    workspace.id
  LIMIT least(greatest(coalesce(p_limit, 51), 1), 101)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION private.search_ai_studio_policy_workspaces(
  TEXT,
  INTEGER,
  INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.search_ai_studio_policy_workspaces(
  TEXT,
  INTEGER,
  INTEGER
) TO service_role;

COMMENT ON FUNCTION private.search_ai_studio_policy_workspaces(
  TEXT,
  INTEGER,
  INTEGER
) IS
  'Service-role workspace policy explorer with normalized name/UUID substring search and deterministic pagination.';
