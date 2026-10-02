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
  -- One bounded transaction makes all dimensions atomic across replicas. Check
  -- caller-ordered global limits first, so denied floods cannot create new keys.
  PERFORM pg_advisory_xact_lock(1734829102);
  FOR dimension IN SELECT value FROM jsonb_array_elements(p_dimensions) LOOP
    position := position + 1;
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
    INSERT INTO private.security_budget_counters(key, used, expires_at)
      VALUES (bucket, 0, now_at + make_interval(secs => ttl))
      ON CONFLICT (key) DO NOTHING;
    SELECT used INTO current_usage FROM private.security_budget_counters
      WHERE key = bucket FOR UPDATE;
    IF amount > maximum OR current_usage > maximum - amount THEN
      RETURN ARRAY[0::bigint, position::bigint];
    END IF;
  END LOOP;
  FOR dimension IN SELECT value FROM jsonb_array_elements(p_dimensions) LOOP
    UPDATE private.security_budget_counters
      SET used = used + (dimension->>'amount')::bigint
      WHERE key = dimension->>'key';
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
