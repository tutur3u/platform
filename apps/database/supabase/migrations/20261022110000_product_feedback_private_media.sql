-- Causal extension to the admitted text intake: one normalized private screenshot,
-- committed with the existing receipt and quota transaction. No public storage URL.
CREATE TABLE private.product_feedback_media (
  report_id uuid PRIMARY KEY REFERENCES private.product_feedback_reports(id) ON DELETE CASCADE,
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 12 AND 524288),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.product_feedback_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.product_feedback_media FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.product_feedback_media TO service_role;

CREATE FUNCTION public.submit_product_feedback_with_media(
  p_actor uuid, p_key uuid, p_title text, p_body text, p_media text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '500ms' AS $$
DECLARE
  existing_id uuid; existing_hash text; supplied_hash text;
  image bytea; result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Service role required';
  END IF;
  IF p_media IS NOT NULL THEN
    IF octet_length(p_media) > 699052 OR p_media !~ '^[A-Za-z0-9+/]+={0,2}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid feedback media';
    END IF;
    image := pg_catalog.decode(p_media, 'base64');
    IF octet_length(image) NOT BETWEEN 12 AND 524288
      OR pg_catalog.substr(image,1,4) <> pg_catalog.decode('52494646','hex')
      OR pg_catalog.substr(image,9,4) <> pg_catalog.decode('57454250','hex')
      OR pg_catalog.replace(pg_catalog.encode(image,'base64'), E'\n','') <> p_media THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid feedback media';
    END IF;
    supplied_hash := pg_catalog.encode(extensions.digest(image,'sha256'),'hex');
  END IF;
  -- Same namespace as the canonical text intake, including text-only callers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'product-feedback:v1:' || p_actor::text || ':' || p_key::text, 0));
  SELECT r.id, m.content_hash INTO existing_id, existing_hash
    FROM private.product_feedback_receipts r
    LEFT JOIN private.product_feedback_media m ON m.report_id=r.id
    WHERE r.actor_id=p_actor AND r.idempotency_key=p_key;
  IF existing_id IS NOT NULL AND existing_hash IS DISTINCT FROM supplied_hash THEN
    RETURN pg_catalog.jsonb_build_object('status','conflict');
  END IF;
  result := public.submit_product_feedback(p_actor,p_key,p_title,p_body);
  IF result->>'status'='accepted' AND existing_id IS NULL AND image IS NOT NULL THEN
    INSERT INTO private.product_feedback_media(report_id,content,content_hash)
      VALUES ((result->'receipt'->>'id')::uuid,image,supplied_hash);
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_product_feedback_with_media(uuid,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_product_feedback_with_media(uuid,uuid,text,text,text) TO service_role;

CREATE FUNCTION public.get_product_feedback_media_staff(p_actor uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
SET statement_timeout = '3s' SET lock_timeout = '500ms' AS $$
DECLARE result jsonb;
BEGIN
  PERFORM private.assert_product_feedback_staff(p_actor);
  SELECT pg_catalog.jsonb_build_object('contentType','image/webp',
    'data',pg_catalog.replace(pg_catalog.encode(content,'base64'),E'\n',''))
    INTO result FROM private.product_feedback_media WHERE report_id=p_id;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_product_feedback_media_staff(uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_feedback_media_staff(uuid,uuid) TO service_role;
