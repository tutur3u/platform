-- Fix issues with task tags functions

-- Fix normalize_task_tags function - properly alias the unnest output
CREATE OR REPLACE FUNCTION normalize_task_tags(tags text[])
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Remove empty strings, trim whitespace, and convert to lowercase
  RETURN (
    SELECT array_agg(lower(trim(tag)) ORDER BY lower(trim(tag)))
    FROM (
      SELECT DISTINCT lower(trim(tag_value)) AS tag
      FROM unnest(tags) AS tag_value
      WHERE trim(tag_value) <> ''
    ) AS dedup
  );
END;
$$;

-- Fix get_board_task_tags function - use LATERAL to properly handle set-returning function
CREATE OR REPLACE FUNCTION get_board_task_tags(board_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  all_tags text[];
BEGIN
  SELECT array_agg(DISTINCT tag_value)
  INTO all_tags
  FROM "public"."tasks" t
  JOIN "public"."task_lists" tl ON t.list_id = tl.id
  CROSS JOIN LATERAL unnest(t.tags) AS tag_value
  WHERE tl.board_id = board_id
    AND t.deleted = false
    AND tl.deleted = false
    AND t.tags IS NOT NULL
    AND array_length(t.tags, 1) > 0;
  
  RETURN COALESCE(all_tags, ARRAY[]::text[]);
END;
$$;
