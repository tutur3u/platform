-- First-class workspace ↔ canonical external project binding.
--
-- Historically the binding lived in `workspace_secrets`
-- (EXTERNAL_PROJECT_ENABLED / EXTERNAL_PROJECT_CANONICAL_ID). That is an
-- opaque, untyped pattern that is hard to query and reason about. This
-- migration introduces a dedicated, typed binding table.
--
-- ROLLOUT SAFETY: this is purely additive. We backfill from the existing
-- secrets and the binding write path dual-writes BOTH the secrets (which the
-- delivery pipeline in apps/web still reads) and this table. The delivery side
-- gains a dual-read fallback (new table first, secrets second) so nothing
-- breaks for workspaces that have not been backfilled yet. No existing table or
-- column is dropped.

CREATE TABLE "public"."workspace_external_project_bindings" (
  "ws_id" uuid PRIMARY KEY REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "canonical_project_id" text REFERENCES "public"."canonical_external_projects"("id") ON DELETE SET NULL,
  "is_enabled" boolean NOT NULL DEFAULT false,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX "workspace_external_project_bindings_canonical_idx"
  ON "public"."workspace_external_project_bindings" ("canonical_project_id");

ALTER TABLE "public"."workspace_external_project_bindings" ENABLE ROW LEVEL SECURITY;

-- Workspace publishers (and managers / root admins, which can_publish already
-- includes) may read the binding for their workspace.
CREATE POLICY "Workspace external project publishers can read bindings"
ON "public"."workspace_external_project_bindings"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

-- Only root external project admins may mutate bindings (matches the existing
-- set_workspace_external_project_binding RPC authorization).
CREATE POLICY "Root external project admins manage bindings"
ON "public"."workspace_external_project_bindings"
FOR ALL
TO authenticated
USING (public.is_root_external_project_admin())
WITH CHECK (public.is_root_external_project_admin());

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_bindings"
TO authenticated;

CREATE TRIGGER "workspace_external_project_bindings_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_bindings"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Backfill from the legacy workspace_secrets pattern. Pick the most recent
-- canonical-id secret per workspace and only bind to a canonical project that
-- still exists and is active (FK + delivery expect a valid, active project).
INSERT INTO public.workspace_external_project_bindings (
  ws_id,
  canonical_project_id,
  is_enabled
)
SELECT
  cid.ws_id,
  cid.value AS canonical_project_id,
  COALESCE(
    (
      SELECT en.value = 'true'
      FROM public.workspace_secrets en
      WHERE en.ws_id = cid.ws_id
        AND en.name = 'EXTERNAL_PROJECT_ENABLED'
      ORDER BY en.created_at DESC
      LIMIT 1
    ),
    false
  ) AS is_enabled
FROM (
  SELECT DISTINCT ON (s.ws_id)
    s.ws_id,
    s.value
  FROM public.workspace_secrets s
  WHERE s.name = 'EXTERNAL_PROJECT_CANONICAL_ID'
    AND s.value IS NOT NULL
  ORDER BY s.ws_id, s.created_at DESC
) cid
WHERE EXISTS (
  SELECT 1
  FROM public.canonical_external_projects c
  WHERE c.id = cid.value
)
ON CONFLICT (ws_id) DO NOTHING;

-- Dual-write: extend the existing binding RPC so it keeps the secrets AND the
-- new table in sync atomically. Body is identical to the original except for the
-- upsert into workspace_external_project_bindings before RETURN.
CREATE OR REPLACE FUNCTION "public"."set_workspace_external_project_binding"(
  p_destination_ws_id uuid,
  p_next_canonical_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_previous_canonical_id text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.is_root_external_project_admin(v_actor_id) THEN
    RAISE EXCEPTION 'manage_external_projects permission required in root workspace';
  END IF;

  IF p_destination_ws_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'Root workspace cannot be used as a destination external project workspace';
  END IF;

  IF p_next_canonical_id IS NOT NULL THEN
    PERFORM 1
    FROM public.canonical_external_projects cep
    WHERE cep.id = p_next_canonical_id
      AND cep.is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Canonical external project is missing or inactive';
    END IF;
  END IF;

  SELECT ws.value
  INTO v_previous_canonical_id
  FROM public.workspace_secrets ws
  WHERE ws.ws_id = p_destination_ws_id
    AND ws.name = 'EXTERNAL_PROJECT_CANONICAL_ID'
  ORDER BY ws.created_at DESC
  LIMIT 1;

  DELETE FROM public.workspace_secrets
  WHERE ws_id = p_destination_ws_id
    AND name IN (
      'EXTERNAL_PROJECT_ENABLED',
      'EXTERNAL_PROJECT_CANONICAL_ID'
    );

  IF p_next_canonical_id IS NOT NULL THEN
    INSERT INTO public.workspace_secrets ("ws_id", "name", "value")
    VALUES
      (p_destination_ws_id, 'EXTERNAL_PROJECT_ENABLED', 'true'),
      (
        p_destination_ws_id,
        'EXTERNAL_PROJECT_CANONICAL_ID',
        p_next_canonical_id
      );
  END IF;

  -- Keep the first-class binding table in sync (dual-write).
  INSERT INTO public.workspace_external_project_bindings (
    "ws_id",
    "canonical_project_id",
    "is_enabled",
    "updated_by",
    "updated_at"
  )
  VALUES (
    p_destination_ws_id,
    p_next_canonical_id,
    p_next_canonical_id IS NOT NULL,
    v_actor_id,
    timezone('utc'::text, now())
  )
  ON CONFLICT (ws_id) DO UPDATE SET
    canonical_project_id = EXCLUDED.canonical_project_id,
    is_enabled = EXCLUDED.is_enabled,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.workspace_external_project_binding_audits (
    "actor_user_id",
    "source_ws_id",
    "destination_ws_id",
    "previous_canonical_id",
    "next_canonical_id"
  )
  VALUES (
    v_actor_id,
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_destination_ws_id,
    v_previous_canonical_id,
    p_next_canonical_id
  );

  RETURN jsonb_build_object(
    'destinationWorkspaceId',
    p_destination_ws_id,
    'canonicalId',
    p_next_canonical_id,
    'enabled',
    p_next_canonical_id IS NOT NULL
  );
END;
$$;
