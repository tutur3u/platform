-- Text-only account feedback. Service writes, owner-visible receipt only.
CREATE TABLE private.product_feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160 AND title = btrim(title)),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000 AND body = btrim(body)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.product_feedback_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.product_feedback_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON private.product_feedback_reports TO service_role;
CREATE TABLE private.product_feedback_receipts (
  id uuid PRIMARY KEY REFERENCES private.product_feedback_reports(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL CHECK (
    idempotency_key::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id, idempotency_key)
);
ALTER TABLE private.product_feedback_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.product_feedback_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, created_at) ON private.product_feedback_receipts TO authenticated;
GRANT ALL ON private.product_feedback_receipts TO service_role;
CREATE POLICY product_feedback_receipt_owner ON private.product_feedback_receipts
  FOR SELECT TO authenticated USING (actor_id = (SELECT auth.uid()));
CREATE FUNCTION public.submit_product_feedback(
  p_actor uuid, p_key uuid, p_title text, p_body text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '500ms'
SET statement_timeout = '2s'
AS $$
DECLARE
  existing private.product_feedback_receipts%ROWTYPE;
  payload_hash text;
  receipt_id uuid;
  created_at timestamptz;
  now_at timestamptz := clock_timestamp();
  window_id bigint;
  budget bigint[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_actor IS NULL OR p_key IS NULL OR
     p_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR
     p_title IS NULL OR p_body IS NULL OR
     char_length(p_title) NOT BETWEEN 1 AND 160 OR
     char_length(p_body) NOT BETWEEN 1 AND 8000 OR
     p_title <> btrim(p_title) OR p_body <> btrim(p_body) THEN
    RAISE EXCEPTION 'Invalid feedback';
  END IF;
  -- SQL is the sole hash authority; callers never supply an authoritative hash.
  payload_hash := encode(extensions.digest(
    convert_to(jsonb_build_array(1, p_title, p_body)::text, 'UTF8'), 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'product-feedback:v1:' || p_actor::text || ':' || p_key::text, 0));
  SELECT * INTO existing FROM private.product_feedback_receipts r
    WHERE r.actor_id = p_actor AND r.idempotency_key = p_key;
  IF FOUND THEN
    IF existing.payload_hash <> payload_hash THEN
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    RETURN jsonb_build_object('status', 'accepted', 'receipt', jsonb_build_object(
      'id', existing.id, 'createdAt', existing.created_at));
  END IF;
  -- Unverified forwarded headers never enter quota identity. All requests share
  -- the conservative network bucket pending a verified ingress adapter.
  window_id := floor(extract(epoch FROM now_at) / 3600)::bigint;
  budget := public.reserve_security_budget(jsonb_build_array(
    jsonb_build_object('key', 'api-cost:v1:product-feedback:actor:' || p_actor::text || ':' || window_id,
      'amount', 1, 'maximum', 5, 'ttl', 7200),
    jsonb_build_object('key', 'api-cost:v1:product-feedback:network:unverified:' || window_id,
      'amount', 1, 'maximum', 20, 'ttl', 7200),
    jsonb_build_object('key', 'api-cost:v1:product-feedback:global:' || window_id,
      'amount', 1, 'maximum', 1000, 'ttl', 7200)
  ));
  IF budget IS NULL OR cardinality(budget) <> 2 OR
     budget[1] IS NULL OR budget[2] IS NULL OR
     budget[1] NOT IN (0, 1) OR (budget[1] = 0 AND budget[2] NOT BETWEEN 1 AND 3) OR
     (budget[1] = 1 AND budget[2] <> 0) THEN
    RAISE EXCEPTION 'Budget unavailable';
  END IF;
  IF budget[1] = 0 THEN
    RETURN jsonb_build_object('status', 'limited', 'retryAfter',
      greatest(1, ceil((window_id + 1) * 3600 - extract(epoch FROM now_at))::integer));
  END IF;
  -- Inserts and charges commit together. Any exception rolls back the charge.
  INSERT INTO private.product_feedback_reports(actor_id, title, body)
    VALUES (p_actor, p_title, p_body) RETURNING id, product_feedback_reports.created_at
    INTO receipt_id, created_at;
  INSERT INTO private.product_feedback_receipts(id, actor_id, idempotency_key, payload_hash, created_at)
    VALUES (receipt_id, p_actor, p_key, payload_hash, created_at);
  RETURN jsonb_build_object('status', 'accepted', 'receipt', jsonb_build_object(
    'id', receipt_id, 'createdAt', created_at));
END;
$$;
REVOKE ALL ON FUNCTION public.submit_product_feedback(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_product_feedback(uuid, uuid, text, text) TO service_role;

-- Owner receipt access does not expose the shared private schema.
CREATE FUNCTION public.get_product_feedback_receipt(p_key uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
SET statement_timeout = '2s'
AS $$
DECLARE
  actor uuid := auth.uid();
  receipt jsonb;
BEGIN
  IF actor IS NULL OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('id', r.id, 'createdAt', r.created_at)
    INTO receipt FROM private.product_feedback_receipts r
    WHERE r.actor_id = actor AND r.idempotency_key = p_key;
  RETURN receipt;
END;
$$;
REVOKE ALL ON FUNCTION public.get_product_feedback_receipt(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_feedback_receipt(uuid) TO authenticated;
