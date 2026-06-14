-- First-class "featured" placements.
--
-- Today, featured content is expressed as arrays of entry slugs stored inside a
-- singleton/section entry's `profile_data` (fields like `featuredEntrySlugs`,
-- `featuredArtworkSlugs`, `featuredGallerySlugs`, ...). Editing these means hand-
-- maintaining slug strings, with no referential integrity and no way to ask
-- "where is this post featured?". This migration adds a typed placement table
-- that references the featured entry directly.
--
-- ROLLOUT SAFETY: purely additive. The editor dual-writes (keeps the
-- profile_data slug arrays populated for the delivery pipeline AND upserts these
-- rows). Delivery reads are unchanged this pass, so there is zero delivery risk.
-- `placement_key` preserves which slot the entry is featured in (the original
-- profile_data field name).

CREATE TABLE "public"."workspace_external_project_entry_placements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "entry_id" uuid NOT NULL REFERENCES "public"."workspace_external_project_entries"("id") ON DELETE CASCADE,
  "placement_key" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_entry_placements_unique"
    UNIQUE ("ws_id", "placement_key", "entry_id")
);

CREATE INDEX "workspace_external_project_entry_placements_entry_idx"
  ON "public"."workspace_external_project_entry_placements" ("entry_id");

CREATE INDEX "workspace_external_project_entry_placements_lookup_idx"
  ON "public"."workspace_external_project_entry_placements"
  ("ws_id", "placement_key", "sort_order");

ALTER TABLE "public"."workspace_external_project_entry_placements"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace external project publishers can read placements"
ON "public"."workspace_external_project_entry_placements"
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate placements"
ON "public"."workspace_external_project_entry_placements"
FOR ALL
TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_entry_placements"
TO authenticated;

-- Best-effort backfill: scan every entry's profile_data for fields whose name
-- ends in "Slugs" and whose value is a string array, resolve each slug to a
-- target entry in the same workspace, and record a placement. Slugs that do not
-- resolve are skipped. When the same target slug appears in multiple sources
-- under the same placement_key, the first occurrence wins.
INSERT INTO public.workspace_external_project_entry_placements (
  ws_id,
  entry_id,
  placement_key,
  sort_order
)
SELECT DISTINCT ON (src.ws_id, kv.key, target.id)
  src.ws_id,
  target.id AS entry_id,
  kv.key AS placement_key,
  (slug.ordinality - 1)::int AS sort_order
FROM public.workspace_external_project_entries src
CROSS JOIN LATERAL jsonb_each(src.profile_data) AS kv(key, value)
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(kv.value) = 'array'
    THEN kv.value
    ELSE '[]'::jsonb
  END
) WITH ORDINALITY AS slug(value, ordinality)
JOIN LATERAL (
  SELECT e.id
  FROM public.workspace_external_project_entries e
  WHERE e.ws_id = src.ws_id
    AND e.slug = btrim(slug.value)
  ORDER BY e.created_at ASC
  LIMIT 1
) AS target ON true
WHERE kv.key LIKE '%Slugs'
  AND jsonb_typeof(kv.value) = 'array'
  AND length(btrim(slug.value)) > 0
ORDER BY src.ws_id, kv.key, target.id, slug.ordinality
ON CONFLICT DO NOTHING;
