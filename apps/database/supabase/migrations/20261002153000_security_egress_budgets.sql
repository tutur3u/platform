-- Compact shared counters: existing Postgres only, no paid Redis requirement.
CREATE TABLE private.security_budget_counters (
  key text PRIMARY KEY CHECK (length(key) <= 256),
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX security_budget_counters_expiry_idx
  ON private.security_budget_counters (expires_at);
ALTER TABLE private.security_budget_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.security_budget_counters FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.reserve_security_budget(p_dimensions jsonb)
RETURNS bigint[] LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
SET lock_timeout = '500ms'
SET statement_timeout = '2s'
AS $$
DECLARE
  dimension jsonb;
  bucket text;
  amount bigint;
  maximum bigint;
  ttl integer;
  current_usage bigint;
  position integer := 0;
  now_at timestamptz := clock_timestamp();
BEGIN
  -- Only server credentials may reserve budgets, never browser JWTs.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_dimensions) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_dimensions) NOT BETWEEN 1 AND 8 THEN
    RAISE EXCEPTION 'Invalid budget dimensions';
  END IF;
  IF (SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(p_dimensions))
     <> jsonb_array_length(p_dimensions) THEN
    RAISE EXCEPTION 'Duplicate budget keys';
  END IF;
  -- Validate before locking or allocating counters.
  FOR dimension IN SELECT value FROM jsonb_array_elements(p_dimensions) LOOP
    bucket := dimension->>'key';
    amount := (dimension->>'amount')::bigint;
    maximum := (dimension->>'maximum')::bigint;
    ttl := (dimension->>'ttl')::integer;
    IF bucket IS NULL OR bucket !~ '^(api-cost|storage-download):v1:'
       OR length(bucket) > 256 OR amount IS NULL OR amount < 0
       OR maximum IS NULL OR maximum < 1 OR maximum > 9007199254740991
       OR ttl IS NULL OR ttl NOT BETWEEN 1 AND 2764800 THEN
      RAISE EXCEPTION 'Invalid budget dimension';
    END IF;
  END LOOP;
  -- Deterministic per-key ordering prevents deadlocks without serializing
  -- unrelated API families, workspaces or storage windows.
  FOR bucket IN SELECT value->>'key' FROM jsonb_array_elements(p_dimensions)
    ORDER BY value->>'key' LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('security-budget:v1:' || bucket, 0));
  END LOOP;
  -- Check every dimension before allocating any row. A rejected fresh key
  -- must not consume storage, nor increment an earlier accepted dimension.
  FOR dimension IN SELECT value FROM jsonb_array_elements(p_dimensions) LOOP
    position := position + 1;
    amount := (dimension->>'amount')::bigint;
    maximum := (dimension->>'maximum')::bigint;
    SELECT COALESCE((SELECT used FROM private.security_budget_counters
      WHERE key = dimension->>'key'), 0) INTO current_usage;
    IF amount > maximum OR current_usage > maximum - amount THEN
      RETURN ARRAY[0::bigint, position::bigint];
    END IF;
  END LOOP;
  FOR dimension IN SELECT value FROM jsonb_array_elements(p_dimensions) LOOP
    INSERT INTO private.security_budget_counters(key, used, expires_at)
      VALUES (dimension->>'key', (dimension->>'amount')::bigint,
        now_at + make_interval(secs => (dimension->>'ttl')::integer))
      ON CONFLICT (key) DO UPDATE SET used =
        private.security_budget_counters.used + EXCLUDED.used;
  END LOOP;
  RETURN ARRAY[1::bigint, 0::bigint];
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_security_budget(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_security_budget(jsonb) TO service_role;

-- Expiry is retention only: calendar-window keys are never reset or refunded.
-- Bound each cleanup run so maintenance cannot monopolize the database.
SELECT cron.schedule('security-budget-cleanup', '* * * * *', $job$
  DELETE FROM private.security_budget_counters WHERE key IN (
    SELECT key FROM private.security_budget_counters
    WHERE expires_at < now() ORDER BY expires_at LIMIT 20000
  );
$job$);

-- Only authoritative active paid subscriptions confer higher abuse allowances.
-- Personal workspaces inherit their owner's current paid memberships; public
-- team/CMS delivery inherits only the target workspace's subscription.
CREATE FUNCTION public.get_security_budget_entitlement(
  p_ws_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
SET statement_timeout = '2s'
AS $$
DECLARE
  account_id uuid := p_user_id;
  result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF account_id IS NULL THEN
    SELECT creator_id INTO account_id FROM public.workspaces
      WHERE id = p_ws_id AND personal AND NOT deleted;
  END IF;
  WITH eligible AS (
    SELECT w.id FROM public.workspaces w WHERE w.id = p_ws_id AND NOT w.deleted
    UNION
    SELECT w.id FROM public.workspace_members m
      JOIN public.workspaces w ON w.id = m.ws_id
      WHERE m.user_id = account_id AND NOT w.deleted
    UNION
    SELECT w.id FROM public.workspaces w
      WHERE w.personal AND w.creator_id = account_id AND NOT w.deleted
  ), latest AS (
    SELECT DISTINCT ON (s.ws_id) s.ws_id, s.product_id, s.current_period_end
    FROM public.workspace_subscriptions s JOIN eligible e ON e.id = s.ws_id
    WHERE s.status = 'active'
    ORDER BY s.ws_id, s.created_at DESC, s.id DESC
  ), paid AS (
    SELECT l.ws_id, CASE p.tier::text
      WHEN 'ENTERPRISE' THEN 3 WHEN 'PRO' THEN 2 WHEN 'PLUS' THEN 1 ELSE 0 END AS rank
    FROM latest l JOIN private.workspace_subscription_products p ON p.id = l.product_id
    WHERE (l.current_period_end IS NULL OR l.current_period_end::timestamptz > now())
      AND p.tier::text <> 'FREE' AND p.pricing_model::text <> 'free'
      AND (COALESCE(p.price, 0) > 0 OR COALESCE(p.price_per_seat, 0) > 0)
  )
  SELECT jsonb_build_object(
    'tier', CASE COALESCE(max(rank), 0)
      WHEN 3 THEN 'ENTERPRISE' WHEN 2 THEN 'PRO' WHEN 1 THEN 'PLUS' ELSE 'FREE' END,
    'paidWorkspaceCount', count(*)
  ) INTO result FROM paid;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_security_budget_entitlement(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_security_budget_entitlement(uuid, uuid) TO service_role;
