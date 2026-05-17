CREATE TYPE "public"."external_project_field_type" AS ENUM (
  'string',
  'markdown',
  'number',
  'boolean',
  'date',
  'datetime',
  'json',
  'string-array'
);

CREATE TYPE "public"."external_project_field_scope" AS ENUM (
  'profile_data',
  'metadata'
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_external_project_collections_ws_id_id_key"
  ON "public"."workspace_external_project_collections" ("ws_id", "id");

CREATE TABLE "public"."workspace_external_project_field_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "collection_id" uuid REFERENCES "public"."workspace_external_project_collections"("id") ON DELETE CASCADE,
  "field_scope" "public"."external_project_field_scope" NOT NULL,
  "key" text NOT NULL,
  "label" text,
  "description" text,
  "field_type" "public"."external_project_field_type" NOT NULL,
  "options" text[] NOT NULL DEFAULT '{}'::text[],
  "default_value" jsonb,
  "is_required" boolean NOT NULL DEFAULT false,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "source" text NOT NULL DEFAULT 'cms',
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_field_definitions_key_check"
    CHECK (length(trim("key")) BETWEEN 1 AND 120 AND "key" !~ '\s'),
  CONSTRAINT "workspace_external_project_field_definitions_label_check"
    CHECK ("label" IS NULL OR length("label") <= 160),
  CONSTRAINT "workspace_external_project_field_definitions_description_check"
    CHECK ("description" IS NULL OR length("description") <= 500),
  CONSTRAINT "workspace_external_project_field_definitions_source_check"
    CHECK ("source" IN ('cms', 'manifest', 'system')),
  CONSTRAINT "workspace_external_project_field_definitions_ws_collection_fkey"
    FOREIGN KEY ("ws_id", "collection_id")
    REFERENCES "public"."workspace_external_project_collections" ("ws_id", "id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX "workspace_external_project_field_definitions_global_key"
  ON "public"."workspace_external_project_field_definitions" (
    "ws_id",
    "field_scope",
    "key"
  )
  WHERE "collection_id" IS NULL;

CREATE UNIQUE INDEX "workspace_external_project_field_definitions_collection_key"
  ON "public"."workspace_external_project_field_definitions" (
    "ws_id",
    "collection_id",
    "field_scope",
    "key"
  )
  WHERE "collection_id" IS NOT NULL;

CREATE INDEX "workspace_external_project_field_definitions_ws_idx"
  ON "public"."workspace_external_project_field_definitions" (
    "ws_id",
    "collection_id",
    "field_scope",
    "sort_order"
  );

ALTER TABLE "public"."workspace_external_project_field_definitions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace external project publishers can read field definitions"
ON "public"."workspace_external_project_field_definitions"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate field definitions"
ON "public"."workspace_external_project_field_definitions"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_field_definitions"
TO authenticated;

CREATE TRIGGER "workspace_external_project_field_definitions_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_field_definitions"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
