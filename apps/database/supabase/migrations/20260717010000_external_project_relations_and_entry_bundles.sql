CREATE TABLE "public"."workspace_external_project_relation_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "source_collection_id" uuid NOT NULL,
  "key" text NOT NULL,
  "label" text NOT NULL,
  "inverse_label" text,
  "cardinality" text NOT NULL DEFAULT 'many',
  "is_required" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "updated_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_relation_definitions_key_check"
    CHECK (length(trim("key")) BETWEEN 1 AND 120 AND "key" !~ '\\s'),
  CONSTRAINT "workspace_external_project_relation_definitions_cardinality_check"
    CHECK ("cardinality" IN ('one', 'many')),
  CONSTRAINT "workspace_external_project_relation_definitions_ws_source_fkey"
    FOREIGN KEY ("ws_id", "source_collection_id")
    REFERENCES "public"."workspace_external_project_collections"("ws_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "workspace_external_project_relation_definitions_ws_source_key"
    UNIQUE ("ws_id", "source_collection_id", "key"),
  CONSTRAINT "workspace_external_project_relation_definitions_ws_id_key"
    UNIQUE ("ws_id", "id")
);

CREATE TABLE "public"."workspace_external_project_relation_definition_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ws_id" uuid NOT NULL REFERENCES "public"."workspaces"("id") ON DELETE CASCADE,
  "relation_definition_id" uuid NOT NULL,
  "target_collection_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "workspace_external_project_relation_definition_targets_definition_fkey"
    FOREIGN KEY ("ws_id", "relation_definition_id")
    REFERENCES "public"."workspace_external_project_relation_definitions"("ws_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "workspace_external_project_relation_definition_targets_collection_fkey"
    FOREIGN KEY ("ws_id", "target_collection_id")
    REFERENCES "public"."workspace_external_project_collections"("ws_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "workspace_external_project_relation_definition_targets_unique"
    UNIQUE ("relation_definition_id", "target_collection_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_external_project_entries_ws_id_key"
  ON "public"."workspace_external_project_entries" ("ws_id", "id");

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_external_project_collections_ws_id_key"
  ON "public"."workspace_external_project_collections" ("ws_id", "id");

ALTER TABLE "public"."workspace_external_project_entries"
  ADD CONSTRAINT "workspace_external_project_entries_ws_collection_fkey"
    FOREIGN KEY ("ws_id", "collection_id")
    REFERENCES "public"."workspace_external_project_collections"("ws_id", "id")
    ON DELETE CASCADE;

ALTER TABLE "public"."workspace_external_project_entry_relations"
  ADD COLUMN "relation_definition_id" uuid,
  ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0;

ALTER TABLE "public"."workspace_external_project_entry_relations"
  ADD CONSTRAINT "workspace_external_project_entry_relations_definition_fkey"
    FOREIGN KEY ("ws_id", "relation_definition_id")
    REFERENCES "public"."workspace_external_project_relation_definitions"("ws_id", "id")
    ON DELETE CASCADE,
  ADD CONSTRAINT "workspace_external_project_entry_relations_from_workspace_fkey"
    FOREIGN KEY ("ws_id", "from_entry_id")
    REFERENCES "public"."workspace_external_project_entries"("ws_id", "id")
    ON DELETE CASCADE,
  ADD CONSTRAINT "workspace_external_project_entry_relations_to_workspace_fkey"
    FOREIGN KEY ("ws_id", "to_entry_id")
    REFERENCES "public"."workspace_external_project_entries"("ws_id", "id")
    ON DELETE CASCADE;

CREATE INDEX "workspace_external_project_relation_definitions_source_idx"
  ON "public"."workspace_external_project_relation_definitions"
  ("ws_id", "source_collection_id", "sort_order", "key");

CREATE INDEX "workspace_external_project_relation_definition_targets_definition_idx"
  ON "public"."workspace_external_project_relation_definition_targets"
  ("ws_id", "relation_definition_id");

CREATE INDEX "workspace_external_project_entry_relations_from_idx"
  ON "public"."workspace_external_project_entry_relations"
  ("ws_id", "from_entry_id", "relation_definition_id");

CREATE INDEX "workspace_external_project_entry_relations_to_idx"
  ON "public"."workspace_external_project_entry_relations"
  ("ws_id", "to_entry_id", "relation_definition_id");

ALTER TABLE "public"."workspace_external_project_relation_definitions"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workspace_external_project_relation_definition_targets"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace external project publishers can read relation definitions"
ON "public"."workspace_external_project_relation_definitions"
FOR SELECT TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate relation definitions"
ON "public"."workspace_external_project_relation_definitions"
FOR ALL TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project publishers can read relation targets"
ON "public"."workspace_external_project_relation_definition_targets"
FOR SELECT TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can mutate relation targets"
ON "public"."workspace_external_project_relation_definition_targets"
FOR ALL TO authenticated
USING (public.can_manage_workspace_external_projects(ws_id))
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_relation_definitions"
TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_relation_definition_targets"
TO authenticated;

CREATE TRIGGER "workspace_external_project_relation_definitions_updated_at"
  BEFORE UPDATE ON "public"."workspace_external_project_relation_definitions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION "public"."replace_workspace_external_project_relation_definition_targets"(
  p_ws_id uuid,
  p_definition_id uuid,
  p_target_collection_ids uuid[],
  p_actor_id uuid
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_ids uuid[] := COALESCE(p_target_collection_ids, ARRAY[]::uuid[]);
  v_distinct_count integer;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'authenticated actor is required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_id THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_workspace_external_projects(p_ws_id, p_actor_id) THEN
    RAISE EXCEPTION 'manage external projects permission required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1
  FROM public.workspace_external_project_relation_definitions
  WHERE ws_id = p_ws_id AND id = p_definition_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'relation definition not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(DISTINCT target_id) INTO v_distinct_count
  FROM unnest(v_target_ids) AS requested(target_id);

  IF v_distinct_count <> (
    SELECT count(*)
    FROM public.workspace_external_project_collections collection
    WHERE collection.ws_id = p_ws_id
      AND collection.id IN (SELECT DISTINCT target_id FROM unnest(v_target_ids) AS requested(target_id))
  ) THEN
    RAISE EXCEPTION 'invalid relation target collection' USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.workspace_external_project_relation_definition_targets
  WHERE ws_id = p_ws_id AND relation_definition_id = p_definition_id;

  INSERT INTO public.workspace_external_project_relation_definition_targets (
    ws_id, relation_definition_id, target_collection_id
  )
  SELECT p_ws_id, p_definition_id, target_id
  FROM (
    SELECT DISTINCT target_id
    FROM unnest(v_target_ids) AS requested(target_id)
  ) deduplicated;

  RETURN ARRAY(
    SELECT target_collection_id
    FROM public.workspace_external_project_relation_definition_targets
    WHERE ws_id = p_ws_id AND relation_definition_id = p_definition_id
    ORDER BY target_collection_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_workspace_external_project_relation_definition_targets(
  uuid, uuid, uuid[], uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_workspace_external_project_relation_definition_targets(
  uuid, uuid, uuid[], uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION "public"."touch_workspace_external_project_entry_from_child"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry_id uuid;
  v_ws_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'workspace_external_project_entry_relations' THEN
    v_entry_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.from_entry_id
      ELSE NEW.from_entry_id
    END;
  ELSE
    v_entry_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
  END IF;
  v_ws_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.ws_id ELSE NEW.ws_id END;

  UPDATE public.workspace_external_project_entries
  SET updated_at = timezone('utc'::text, now())
  WHERE ws_id = v_ws_id AND id = v_entry_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "workspace_external_project_blocks_touch_entry"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."workspace_external_project_blocks"
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_external_project_entry_from_child();

CREATE TRIGGER "workspace_external_project_entry_relations_touch_entry"
  AFTER INSERT OR UPDATE OR DELETE ON "public"."workspace_external_project_entry_relations"
  FOR EACH ROW EXECUTE FUNCTION public.touch_workspace_external_project_entry_from_child();

CREATE OR REPLACE FUNCTION "public"."upsert_workspace_external_project_entry_bundle"(
  p_ws_id uuid,
  p_actor_id uuid,
  p_entry jsonb,
  p_blocks jsonb DEFAULT '[]'::jsonb,
  p_relations jsonb DEFAULT '[]'::jsonb,
  p_entry_id uuid DEFAULT NULL,
  p_expected_updated_at timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry public.workspace_external_project_entries%ROWTYPE;
  v_block jsonb;
  v_block_id uuid;
  v_block_ids uuid[] := ARRAY[]::uuid[];
  v_relation jsonb;
  v_definition public.workspace_external_project_relation_definitions%ROWTYPE;
  v_target_entry public.workspace_external_project_entries%ROWTYPE;
  v_relation_count integer;
  v_collection_id uuid;
  v_now timestamp with time zone := timezone('utc'::text, now());
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'authenticated actor is required' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_actor_id THEN
    RAISE EXCEPTION 'actor does not match authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT public.can_manage_workspace_external_projects(p_ws_id, p_actor_id) THEN
    RAISE EXCEPTION 'manage external projects permission required' USING ERRCODE = '42501';
  END IF;
  IF p_entry->>'status' = 'published'
    AND NOT public.can_publish_workspace_external_projects(p_ws_id, p_actor_id)
  THEN
    RAISE EXCEPTION 'publish external projects permission required' USING ERRCODE = '42501';
  END IF;

  IF p_entry IS NULL OR jsonb_typeof(p_entry) <> 'object' THEN
    RAISE EXCEPTION 'entry must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_blocks) <> 'array' OR jsonb_typeof(p_relations) <> 'array' THEN
    RAISE EXCEPTION 'blocks and relations must be JSON arrays' USING ERRCODE = '22023';
  END IF;

  IF p_entry_id IS NULL THEN
    v_collection_id := NULLIF(p_entry->>'collectionId', '')::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_external_project_collections
      WHERE ws_id = p_ws_id AND id = v_collection_id
    ) THEN
      RAISE EXCEPTION 'invalid entry collection' USING ERRCODE = '23503';
    END IF;

    INSERT INTO public.workspace_external_project_entries (
      ws_id, collection_id, slug, title, subtitle, summary, status,
      scheduled_for, published_at, sort_order, profile_data, metadata,
      stable_source_id, source_adapter, created_by, updated_by
    ) VALUES (
      p_ws_id,
      v_collection_id,
      trim(p_entry->>'slug'),
      trim(p_entry->>'title'),
      NULLIF(p_entry->>'subtitle', ''),
      NULLIF(p_entry->>'summary', ''),
      COALESCE((p_entry->>'status')::public.external_project_entry_status, 'draft'),
      NULLIF(p_entry->>'scheduledFor', '')::timestamp with time zone,
      CASE WHEN COALESCE(p_entry->>'status', 'draft') = 'published' THEN v_now ELSE NULL END,
      COALESCE((p_entry->>'sortOrder')::integer, 0),
      COALESCE(p_entry->'profileData', '{}'::jsonb),
      COALESCE(p_entry->'metadata', '{}'::jsonb),
      NULLIF(p_entry->>'stableSourceId', ''),
      NULLIF(p_entry->>'sourceAdapter', '')::public.external_project_adapter_kind,
      p_actor_id,
      p_actor_id
    ) RETURNING * INTO v_entry;
  ELSE
    SELECT * INTO v_entry
    FROM public.workspace_external_project_entries
    WHERE ws_id = p_ws_id AND id = p_entry_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'entry not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_entry.updated_at <> p_expected_updated_at THEN
      RAISE EXCEPTION 'entry update conflict' USING ERRCODE = '40001';
    END IF;
    IF p_entry ? 'collectionId' THEN
      v_collection_id := NULLIF(p_entry->>'collectionId', '')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.workspace_external_project_collections
        WHERE ws_id = p_ws_id AND id = v_collection_id
      ) THEN
        RAISE EXCEPTION 'invalid entry collection' USING ERRCODE = '23503';
      END IF;
    END IF;

    UPDATE public.workspace_external_project_entries SET
      collection_id = COALESCE(NULLIF(p_entry->>'collectionId', '')::uuid, collection_id),
      slug = CASE WHEN p_entry ? 'slug' THEN trim(p_entry->>'slug') ELSE slug END,
      title = CASE WHEN p_entry ? 'title' THEN trim(p_entry->>'title') ELSE title END,
      subtitle = CASE WHEN p_entry ? 'subtitle' THEN NULLIF(p_entry->>'subtitle', '') ELSE subtitle END,
      summary = CASE WHEN p_entry ? 'summary' THEN NULLIF(p_entry->>'summary', '') ELSE summary END,
      status = CASE WHEN p_entry ? 'status' THEN (p_entry->>'status')::public.external_project_entry_status ELSE status END,
      scheduled_for = CASE WHEN p_entry ? 'scheduledFor' THEN NULLIF(p_entry->>'scheduledFor', '')::timestamp with time zone ELSE scheduled_for END,
      published_at = CASE
        WHEN p_entry ? 'status' AND p_entry->>'status' = 'published' AND status <> 'published' THEN v_now
        WHEN p_entry ? 'status' AND p_entry->>'status' <> 'published' THEN NULL
        ELSE published_at
      END,
      sort_order = CASE WHEN p_entry ? 'sortOrder' THEN (p_entry->>'sortOrder')::integer ELSE sort_order END,
      profile_data = CASE WHEN p_entry ? 'profileData' THEN p_entry->'profileData' ELSE profile_data END,
      metadata = CASE WHEN p_entry ? 'metadata' THEN p_entry->'metadata' ELSE metadata END,
      updated_by = p_actor_id
    WHERE ws_id = p_ws_id AND id = p_entry_id
    RETURNING * INTO v_entry;

    -- Move existing blocks out of the caller-provided ordering range before
    -- applying replacements so swapping two block positions remains atomic.
    UPDATE public.workspace_external_project_blocks
    SET sort_order = sort_order + 1000000
    WHERE ws_id = p_ws_id AND entry_id = v_entry.id;
  END IF;

  FOR v_block IN SELECT value FROM jsonb_array_elements(p_blocks)
  LOOP
    v_block_id := NULLIF(v_block->>'id', '')::uuid;
    IF v_block_id IS NULL THEN
      INSERT INTO public.workspace_external_project_blocks (
        ws_id, entry_id, block_type, title, content, sort_order,
        stable_source_id, created_by, updated_by
      ) VALUES (
        p_ws_id, v_entry.id, trim(v_block->>'blockType'),
        NULLIF(v_block->>'title', ''), COALESCE(v_block->'content', '{}'::jsonb),
        COALESCE((v_block->>'sortOrder')::integer, 0),
        NULLIF(v_block->>'stableSourceId', ''), p_actor_id, p_actor_id
      ) RETURNING id INTO v_block_id;
    ELSE
      UPDATE public.workspace_external_project_blocks SET
        block_type = trim(v_block->>'blockType'),
        title = NULLIF(v_block->>'title', ''),
        content = COALESCE(v_block->'content', '{}'::jsonb),
        sort_order = COALESCE((v_block->>'sortOrder')::integer, 0),
        updated_by = p_actor_id
      WHERE ws_id = p_ws_id AND entry_id = v_entry.id AND id = v_block_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'block does not belong to entry' USING ERRCODE = '23503';
      END IF;
    END IF;
    v_block_ids := array_append(v_block_ids, v_block_id);
  END LOOP;

  DELETE FROM public.workspace_external_project_blocks
  WHERE ws_id = p_ws_id AND entry_id = v_entry.id
    AND NOT (id = ANY(v_block_ids));

  DELETE FROM public.workspace_external_project_entry_relations
  WHERE ws_id = p_ws_id AND from_entry_id = v_entry.id;

  FOR v_relation IN SELECT value FROM jsonb_array_elements(p_relations)
  LOOP
    SELECT * INTO v_definition
    FROM public.workspace_external_project_relation_definitions
    WHERE ws_id = p_ws_id
      AND id = NULLIF(v_relation->>'definitionId', '')::uuid
      AND source_collection_id = v_entry.collection_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invalid relation definition' USING ERRCODE = '23503';
    END IF;

    SELECT * INTO v_target_entry
    FROM public.workspace_external_project_entries
    WHERE ws_id = p_ws_id AND id = NULLIF(v_relation->>'toEntryId', '')::uuid;
    IF NOT FOUND OR NOT EXISTS (
      SELECT 1
      FROM public.workspace_external_project_relation_definition_targets
      WHERE ws_id = p_ws_id
        AND relation_definition_id = v_definition.id
        AND target_collection_id = v_target_entry.collection_id
    ) THEN
      RAISE EXCEPTION 'invalid relation target' USING ERRCODE = '23503';
    END IF;

    IF v_definition.cardinality = 'one' THEN
      SELECT count(*) INTO v_relation_count
      FROM public.workspace_external_project_entry_relations
      WHERE ws_id = p_ws_id
        AND from_entry_id = v_entry.id
        AND relation_definition_id = v_definition.id;
      IF v_relation_count > 0 THEN
        RAISE EXCEPTION 'relation cardinality exceeded' USING ERRCODE = '23514';
      END IF;
    END IF;

    INSERT INTO public.workspace_external_project_entry_relations (
      ws_id, from_entry_id, to_entry_id, relation_definition_id,
      relation_type, metadata, sort_order
    ) VALUES (
      p_ws_id, v_entry.id, v_target_entry.id, v_definition.id,
      v_definition.key, COALESCE(v_relation->'metadata', '{}'::jsonb),
      COALESCE((v_relation->>'sortOrder')::integer, 0)
    );
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_external_project_relation_definitions definition
    WHERE definition.ws_id = p_ws_id
      AND definition.source_collection_id = v_entry.collection_id
      AND definition.is_required
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_external_project_entry_relations relation
        WHERE relation.ws_id = p_ws_id
          AND relation.from_entry_id = v_entry.id
          AND relation.relation_definition_id = definition.id
      )
  ) THEN
    RAISE EXCEPTION 'required relation is missing' USING ERRCODE = '23502';
  END IF;

  SELECT * INTO v_entry
  FROM public.workspace_external_project_entries
  WHERE ws_id = p_ws_id AND id = v_entry.id;

  RETURN jsonb_build_object(
    'entry', to_jsonb(v_entry),
    'blocks', COALESCE((
      SELECT jsonb_agg(to_jsonb(block_row) ORDER BY block_row.sort_order, block_row.id)
      FROM public.workspace_external_project_blocks block_row
      WHERE block_row.ws_id = p_ws_id AND block_row.entry_id = v_entry.id
    ), '[]'::jsonb),
    'relations', COALESCE((
      SELECT jsonb_agg(to_jsonb(relation_row) ORDER BY relation_row.created_at, relation_row.id)
      FROM public.workspace_external_project_entry_relations relation_row
      WHERE relation_row.ws_id = p_ws_id AND relation_row.from_entry_id = v_entry.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_workspace_external_project_entry_bundle(
  uuid, uuid, jsonb, jsonb, jsonb, uuid, timestamp with time zone
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_workspace_external_project_entry_bundle(
  uuid, uuid, jsonb, jsonb, jsonb, uuid, timestamp with time zone
) TO authenticated, service_role;
