-- Keep workspace_external_project_entry_taxonomy_assignments in sync with each
-- entry's profile_data (category + tags) on every write.
--
-- The assignments table is a normalized, queryable index over the free-text
-- category/tag values that live in entry.profile_data. The initial migration
-- backfilled existing rows; this trigger keeps them current for ALL writers
-- (the CMS editor, imports, and the sync pipeline) without any application code,
-- atomically within the same transaction as the entry write.
--
-- profile_data remains the source of truth (delivery still reads it); this table
-- is derived. The function is pure JSON extraction so it cannot realistically
-- fail and break entry writes.

CREATE OR REPLACE FUNCTION "public"."sync_external_project_entry_taxonomy_assignments"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.workspace_external_project_entry_taxonomy_assignments
  WHERE ws_id = NEW.ws_id
    AND entry_id = NEW.id;

  -- Category (single string value).
  IF jsonb_typeof(NEW.profile_data -> 'category') = 'string'
     AND length(btrim(NEW.profile_data ->> 'category')) > 0 THEN
    INSERT INTO public.workspace_external_project_entry_taxonomy_assignments (
      ws_id,
      entry_id,
      assignment_type,
      value
    )
    VALUES (
      NEW.ws_id,
      NEW.id,
      'category'::public.external_project_taxonomy_assignment_kind,
      btrim(NEW.profile_data ->> 'category')
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Tags (string array; deduped, first occurrence keeps its order).
  INSERT INTO public.workspace_external_project_entry_taxonomy_assignments (
    ws_id,
    entry_id,
    assignment_type,
    value,
    sort_order
  )
  SELECT DISTINCT ON (btrim(tag.value))
    NEW.ws_id,
    NEW.id,
    'tag'::public.external_project_taxonomy_assignment_kind,
    btrim(tag.value),
    (tag.ordinality - 1)::int
  FROM jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(NEW.profile_data -> 'tags') = 'array'
      THEN NEW.profile_data -> 'tags'
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS tag(value, ordinality)
  WHERE length(btrim(tag.value)) > 0
  ORDER BY btrim(tag.value), tag.ordinality
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "workspace_external_project_entries_sync_taxonomy_insert"
  AFTER INSERT ON "public"."workspace_external_project_entries"
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_external_project_entry_taxonomy_assignments();

CREATE TRIGGER "workspace_external_project_entries_sync_taxonomy_update"
  AFTER UPDATE OF "profile_data" ON "public"."workspace_external_project_entries"
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_external_project_entry_taxonomy_assignments();
