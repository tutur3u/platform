ALTER TYPE "public"."workspace_role_permission"
ADD VALUE IF NOT EXISTS 'manage_external_projects';

ALTER TYPE "public"."workspace_role_permission"
ADD VALUE IF NOT EXISTS 'publish_external_projects';

CREATE TYPE "public"."external_project_adapter_kind" AS ENUM (
  'junly',
  'yoola',
  'theguyser',
  'exocorpse'
);

CREATE TYPE "public"."external_project_entry_status" AS ENUM (
  'draft',
  'scheduled',
  'published',
  'archived'
);

CREATE TYPE "public"."external_project_import_status" AS ENUM (
  'queued',
  'running',
  'completed',
  'failed'
);

CREATE TYPE "public"."external_project_publish_event_kind" AS ENUM (
  'publish',
  'preview',
  'unpublish'
);

CREATE TABLE "public"."canonical_external_projects" (
  "id" text PRIMARY KEY,
  "display_name" text NOT NULL,
  "adapter" "public"."external_project_adapter_kind" NOT NULL,
  "allowed_collections" text[] NOT NULL DEFAULT '{}'::text[],
  "allowed_features" text[] NOT NULL DEFAULT '{}'::text[],
  "delivery_profile" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE "public"."workspace_external_project_binding_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "source_ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "destination_ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "previous_canonical_id" text,
  "next_canonical_id" text,
  "changed_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE "public"."workspace_external_project_collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "collection_type" text NOT NULL,
  "description" text,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_collections_ws_slug_key" UNIQUE ("ws_id", "slug")
);

CREATE TABLE "public"."workspace_external_project_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "collection_id" uuid NOT NULL REFERENCES "public"."workspace_external_project_collections"("id") ON DELETE CASCADE,
  "stable_source_id" text,
  "source_adapter" "public"."external_project_adapter_kind",
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "subtitle" text,
  "summary" text,
  "status" "public"."external_project_entry_status" NOT NULL DEFAULT 'draft',
  "scheduled_for" timestamp with time zone,
  "published_at" timestamp with time zone,
  "sort_order" integer NOT NULL DEFAULT 0,
  "profile_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_entries_ws_collection_slug_key" UNIQUE ("ws_id", "collection_id", "slug")
);

CREATE TABLE "public"."workspace_external_project_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "entry_id" uuid NOT NULL REFERENCES "public"."workspace_external_project_entries"("id") ON DELETE CASCADE,
  "stable_source_id" text,
  "block_type" text NOT NULL,
  "title" text,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_blocks_entry_sort_order_key" UNIQUE ("entry_id", "sort_order")
);

CREATE TABLE "public"."workspace_external_project_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "entry_id" uuid REFERENCES "public"."workspace_external_project_entries"("id") ON DELETE CASCADE,
  "block_id" uuid REFERENCES "public"."workspace_external_project_blocks"("id") ON DELETE CASCADE,
  "stable_source_id" text,
  "asset_type" text NOT NULL,
  "storage_path" text,
  "source_url" text,
  "alt_text" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE "public"."workspace_external_project_taxonomies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "label" text NOT NULL,
  "taxonomy_type" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_taxonomies_ws_type_slug_key" UNIQUE ("ws_id", "taxonomy_type", "slug")
);

CREATE TABLE "public"."workspace_external_project_entry_relations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "from_entry_id" uuid NOT NULL REFERENCES "public"."workspace_external_project_entries"("id") ON DELETE CASCADE,
  "to_entry_id" uuid NOT NULL REFERENCES "public"."workspace_external_project_entries"("id") ON DELETE CASCADE,
  "relation_type" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_entry_relations_unique" UNIQUE (
    "ws_id",
    "from_entry_id",
    "to_entry_id",
    "relation_type"
  )
);

CREATE TABLE "public"."workspace_external_project_import_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "canonical_external_project_id" text NOT NULL REFERENCES "public"."canonical_external_projects"("id") ON DELETE RESTRICT,
  "adapter" "public"."external_project_adapter_kind" NOT NULL,
  "source_reference" text,
  "status" "public"."external_project_import_status" NOT NULL DEFAULT 'queued',
  "report" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requested_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE "public"."workspace_external_project_publish_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "canonical_external_project_id" text NOT NULL REFERENCES "public"."canonical_external_projects"("id") ON DELETE RESTRICT,
  "entry_id" uuid REFERENCES "public"."workspace_external_project_entries"("id") ON DELETE SET NULL,
  "event_kind" "public"."external_project_publish_event_kind" NOT NULL DEFAULT 'publish',
  "visibility_scope" text NOT NULL DEFAULT 'public',
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "profile_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "triggered_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX "canonical_external_projects_active_idx"
  ON "public"."canonical_external_projects" ("is_active", "adapter");

CREATE INDEX "workspace_external_project_binding_audits_destination_idx"
  ON "public"."workspace_external_project_binding_audits" ("destination_ws_id", "changed_at" DESC);

CREATE INDEX "workspace_external_project_collections_ws_idx"
  ON "public"."workspace_external_project_collections" ("ws_id", "collection_type");

CREATE INDEX "workspace_external_project_entries_ws_status_idx"
  ON "public"."workspace_external_project_entries" ("ws_id", "status", "published_at" DESC);

CREATE UNIQUE INDEX "workspace_external_project_entries_source_idx"
  ON "public"."workspace_external_project_entries" ("ws_id", "collection_id", "stable_source_id")
  WHERE "stable_source_id" IS NOT NULL;

CREATE UNIQUE INDEX "workspace_external_project_blocks_source_idx"
  ON "public"."workspace_external_project_blocks" ("ws_id", "entry_id", "stable_source_id")
  WHERE "stable_source_id" IS NOT NULL;

CREATE UNIQUE INDEX "workspace_external_project_assets_source_idx"
  ON "public"."workspace_external_project_assets" ("ws_id", "stable_source_id")
  WHERE "stable_source_id" IS NOT NULL;

CREATE INDEX "workspace_external_project_taxonomies_ws_idx"
  ON "public"."workspace_external_project_taxonomies" ("ws_id", "taxonomy_type");

CREATE INDEX "workspace_external_project_import_jobs_ws_idx"
  ON "public"."workspace_external_project_import_jobs" ("ws_id", "created_at" DESC);

CREATE INDEX "workspace_external_project_publish_events_ws_idx"
  ON "public"."workspace_external_project_publish_events" ("ws_id", "created_at" DESC);

ALTER TABLE "public"."canonical_external_projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_binding_audits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_taxonomies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_entry_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_publish_events" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION "public"."is_root_external_project_admin"(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = '00000000-0000-0000-0000-000000000000'::uuid
      AND w.creator_id = p_user_id
  ) OR public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'admin'
  ) OR public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'manage_external_projects'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."can_manage_workspace_external_projects"(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_root_external_project_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = p_ws_id
        AND w.creator_id = p_user_id
    )
    OR public.has_workspace_permission(p_ws_id, p_user_id, 'admin')
    OR public.has_workspace_permission(
      p_ws_id,
      p_user_id,
      'manage_external_projects'
    );
END;
$$;

CREATE OR REPLACE FUNCTION "public"."can_publish_workspace_external_projects"(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.can_manage_workspace_external_projects(p_ws_id, p_user_id)
    OR public.has_workspace_permission(
      p_ws_id,
      p_user_id,
      'publish_external_projects'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."is_root_external_project_admin"(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."can_manage_workspace_external_projects"(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."can_publish_workspace_external_projects"(uuid, uuid) TO authenticated;

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

GRANT EXECUTE ON FUNCTION "public"."set_workspace_external_project_binding"(uuid, text) TO authenticated;

CREATE POLICY "Root external project admins manage canonical registry"
ON "public"."canonical_external_projects"
FOR ALL
TO authenticated
USING (public.is_root_external_project_admin())
WITH CHECK (public.is_root_external_project_admin());

CREATE POLICY "Root external project admins read binding audits"
ON "public"."workspace_external_project_binding_audits"
FOR SELECT
TO authenticated
USING (public.is_root_external_project_admin());

CREATE POLICY "Workspace external project publishers can read collections"
ON "public"."workspace_external_project_collections"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate collections"
ON "public"."workspace_external_project_collections"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read entries"
ON "public"."workspace_external_project_entries"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate entries"
ON "public"."workspace_external_project_entries"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read blocks"
ON "public"."workspace_external_project_blocks"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate blocks"
ON "public"."workspace_external_project_blocks"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read assets"
ON "public"."workspace_external_project_assets"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate assets"
ON "public"."workspace_external_project_assets"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read taxonomies"
ON "public"."workspace_external_project_taxonomies"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate taxonomies"
ON "public"."workspace_external_project_taxonomies"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read relations"
ON "public"."workspace_external_project_entry_relations"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate relations"
ON "public"."workspace_external_project_entry_relations"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read import jobs"
ON "public"."workspace_external_project_import_jobs"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate import jobs"
ON "public"."workspace_external_project_import_jobs"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read publish events"
ON "public"."workspace_external_project_publish_events"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can create publish events"
ON "public"."workspace_external_project_publish_events"
FOR INSERT
TO authenticated
WITH CHECK (public.can_publish_workspace_external_projects(ws_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."canonical_external_projects"
TO authenticated;

GRANT SELECT
ON "public"."workspace_external_project_binding_audits"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_collections"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_entries"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_blocks"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_assets"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_taxonomies"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_entry_relations"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_import_jobs"
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_publish_events"
TO authenticated;

CREATE TRIGGER "canonical_external_projects_updated_at"
  BEFORE UPDATE ON "public"."canonical_external_projects"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "workspace_external_project_collections_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_collections"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "workspace_external_project_entries_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_entries"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "workspace_external_project_blocks_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_blocks"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "workspace_external_project_assets_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_assets"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "workspace_external_project_taxonomies_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_taxonomies"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER "workspace_external_project_import_jobs_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_import_jobs"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
