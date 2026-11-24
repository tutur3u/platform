-- Owner-only listing of the caller's own feedback receipts. The private tables
-- stay closed; this definer function is the single read path and projects only
-- the receipt id, creation time and the submitter's own title.
CREATE FUNCTION public.list_product_feedback_receipts(
  p_limit integer DEFAULT 20,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
SET statement_timeout = '2s'
AS $$
DECLARE
  actor uuid := auth.uid();
  page_size integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  result jsonb;
BEGIN
  IF actor IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('items', '[]'::pg_catalog.jsonb, 'hasMore', false);
  END IF;
  WITH page AS (
    SELECT r.id, r.created_at, f.title,
      pg_catalog.row_number() OVER (ORDER BY r.created_at DESC, r.id DESC) AS rn
    FROM private.product_feedback_receipts r
    JOIN private.product_feedback_reports f ON f.id = r.id
    WHERE r.actor_id = actor AND f.actor_id = actor
      AND (p_cursor_created_at IS NULL OR p_cursor_id IS NULL
        OR (r.created_at, r.id) < (p_cursor_created_at, p_cursor_id))
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT page_size + 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'items', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', p.id, 'createdAt', p.created_at, 'title', p.title)
        ORDER BY p.created_at DESC, p.id DESC
      ) FILTER (WHERE p.rn <= page_size),
      '[]'::pg_catalog.jsonb),
    'hasMore', coalesce(pg_catalog.bool_or(p.rn > page_size), false))
  INTO result FROM page p;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_product_feedback_receipts(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.list_product_feedback_receipts(integer,timestamptz,uuid) review=owner-2026-11-24-feedback-own-receipts-caller-bound
GRANT EXECUTE ON FUNCTION public.list_product_feedback_receipts(integer, timestamptz, uuid)
  TO authenticated;
