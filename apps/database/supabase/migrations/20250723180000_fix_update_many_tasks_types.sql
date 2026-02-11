-- Fix update_many_tasks function to handle type casting for priority, archived, and tags

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
        priority = COALESCE((rec->>'priority')::integer, priority),
        archived = COALESCE((rec->>'archived')::boolean, archived),
        tags = COALESCE(
          CASE
            WHEN jsonb_typeof(rec->'tags') = 'array' THEN
              ARRAY(
                SELECT jsonb_array_elements_text(rec->'tags')
              )
            ELSE tags
          END,
          tags
        )
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