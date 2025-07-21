-- Atomic batch update for tasks
CREATE OR REPLACE FUNCTION public.update_many_tasks(
  updates jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  rec jsonb;
  updated_count integer := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE public.tasks
    SET
      priority = COALESCE(rec->>'priority', priority)::integer,
      archived = COALESCE(rec->>'archived', archived)::boolean,
      tags = COALESCE(rec->'tags', to_jsonb(tags))::text[]
    WHERE id = (rec->>'id')::uuid;
    updated_count := updated_count + 1;
  END LOOP;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_many_tasks(jsonb) TO authenticated; 