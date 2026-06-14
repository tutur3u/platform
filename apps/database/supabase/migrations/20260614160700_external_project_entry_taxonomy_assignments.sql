-- First-class category/tag assignments per entry.
--
-- Today, an entry's category lives in `profile_data.category` (single string)
-- and its tags in `profile_data.tags` (string array), as free-text labels. This
-- is hard to query (e.g. "all posts tagged X"), impossible to rename a tag
-- globally, and gives no normalized vocabulary. This migration adds a typed
-- assignment table.
--
-- ROLLOUT SAFETY: purely additive. The editor dual-writes (keeps
-- profile_data.category/tags populated for the delivery pipeline AND upserts
-- these rows). Delivery reads are unchanged this pass, so there is zero delivery
-- risk. `value` is the source of truth (denormalized label); the optional
-- `taxonomy_id` is reserved for a future cutover to the vocabulary table.

CREATE TYPE "public"."external_project_taxonomy_assignment_kind" AS ENUM (
  'category',
  'tag'
);

CREATE TABLE "public"."workspace_external_project_entry_taxonomy_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "entry_id" uuid NOT NULL REFERENCES "public"."workspace_external_project_entries"("id") ON DELETE CASCADE,
  "assignment_type" "public"."external_project_taxonomy_assignment_kind" NOT NULL,
  "value" text NOT NULL,
  "taxonomy_id" uuid REFERENCES "public"."workspace_external_project_taxonomies"("id") ON DELETE SET NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_entry_taxonomy_assignments_unique"
    UNIQUE ("ws_id", "entry_id", "assignment_type", "value")
);

CREATE INDEX "workspace_external_project_entry_taxonomy_assignments_entry_idx"
  ON "public"."workspace_external_project_entry_taxonomy_assignments" ("entry_id");

CREATE INDEX "workspace_external_project_entry_taxonomy_assignments_lookup_idx"
  ON "public"."workspace_external_project_entry_taxonomy_assignments"
  ("ws_id", "assignment_type", "value");

ALTER TABLE "public"."workspace_external_project_entry_taxonomy_assignments"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace external project publishers can read taxonomy assignments"
ON "public"."workspace_external_project_entry_taxonomy_assignments"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate taxonomy assignments"
ON "public"."workspace_external_project_entry_taxonomy_assignments"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_entry_taxonomy_assignments"
TO authenticated;

-- Backfill categories (single string per entry).
INSERT INTO public.workspace_external_project_entry_taxonomy_assignments (
  ws_id,
  entry_id,
  assignment_type,
  value
)
SELECT
  e.ws_id,
  e.id,
  'category'::public.external_project_taxonomy_assignment_kind,
  btrim(e.profile_data ->> 'category')
FROM public.workspace_external_project_entries e
WHERE jsonb_typeof(e.profile_data -> 'category') = 'string'
  AND length(btrim(e.profile_data ->> 'category')) > 0
ON CONFLICT DO NOTHING;

-- Backfill tags (string array per entry).
INSERT INTO public.workspace_external_project_entry_taxonomy_assignments (
  ws_id,
  entry_id,
  assignment_type,
  value,
  sort_order
)
SELECT DISTINCT ON (e.ws_id, e.id, btrim(tag.value))
  e.ws_id,
  e.id,
  'tag'::public.external_project_taxonomy_assignment_kind,
  btrim(tag.value),
  (tag.ordinality - 1)::int
FROM public.workspace_external_project_entries e
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(e.profile_data -> 'tags') = 'array'
    THEN e.profile_data -> 'tags'
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS tag(value, ordinality)
WHERE length(btrim(tag.value)) > 0
ON CONFLICT DO NOTHING;
