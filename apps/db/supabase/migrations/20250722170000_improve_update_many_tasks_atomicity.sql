-- Improve update_many_tasks function for atomicity, accurate counting, and error handling
CREATE OR REPLACE FUNCTION public.update_many_tasks(
  updates jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  rec jsonb;
  updated_count integer := 0;
  rows_affected integer;
BEGIN
  BEGIN
    FOR rec IN SELECT * FROM jsonb_array_elements(updates)
    LOOP
      IF rec->>'id' IS NULL THEN
        RAISE EXCEPTION 'Missing required field: id';
      END IF;

      UPDATE public.tasks
      SET
        priority = COALESCE(rec->>'priority', priority)::integer,
        archived = COALESCE(rec->>'archived', archived)::boolean,
        tags = COALESCE(rec->'tags', to_jsonb(tags))::text[]
      WHERE id = (rec->>'id')::uuid;

      GET DIAGNOSTICS rows_affected = ROW_COUNT;
      updated_count := updated_count + rows_affected;
    END LOOP;
    RETURN updated_count;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Batch update failed: %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_many_tasks(jsonb) TO authenticated; 