-- Fix ambiguous column reference in get_board_task_tags function
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
  WHERE tl.board_id = get_board_task_tags.board_id
    AND t.deleted = false
    AND tl.deleted = false
    AND t.tags IS NOT NULL
    AND array_length(t.tags, 1) > 0;
  
  RETURN COALESCE(all_tags, ARRAY[]::text[]);
END;
$$; 