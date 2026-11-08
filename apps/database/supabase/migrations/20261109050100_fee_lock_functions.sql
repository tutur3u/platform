BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fee lock functions: monthly baseline plus save-draft, lock and reopen, called as service_role by
-- finance routes after the ENABLE_FEE_LOCK and permission checks, with the platform user as p_actor_id.
-- They check workspace ownership of every id, compute every amount, enforce the version and log events.
-- Errors: PT404 not found, PT409 version conflict (DETAIL = current version), 55000 wrong status,
-- 22023 invalid input, 22003 amount over FEE_LOCK_MAX_MONEY 99,999,999,999,999 (DETAIL = line number).
-- Kinds stay tuition | extra: books and events are extras staff add (decision "Trà 15:12 Q1").

-- Rounds to the currency's minor unit, half away from zero.
CREATE FUNCTION private.fee_lock_round(p_amount NUMERIC, p_currency TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT round(p_amount, CASE WHEN upper(p_currency) IN ('VND', 'JPY', 'KRW', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF') THEN 0 ELSE 2 END) $$;

-- Expected tuition per student and class for any month: scheduled session days (Asia/Ho_Chi_Minh) from
-- the later of class start and join date to class end, times the class price (sum of each linked
-- product's best inventory match, ranked as in 20260601101948). Archived students are excluded.
CREATE FUNCTION private.fee_lock_baseline(p_ws_id UUID, p_month DATE, p_student_id UUID DEFAULT NULL, p_currency TEXT DEFAULT 'VND')
RETURNS TABLE (
  student_id UUID, student_name TEXT, group_id UUID, group_name TEXT, product_id UUID, unit_id UUID,
  warehouse_id UUID, unit_price NUMERIC, session_count INTEGER, baseline_amount NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH bounds AS (
    SELECT date_trunc('month', p_month)::date AS m_start, (date_trunc('month', p_month) + interval '1 month')::date AS m_next
  ),
  active AS (
    SELECT * FROM (
      SELECT wu.id AS student_id, coalesce(wu.full_name, wu.display_name) AS student_name, wug.id AS group_id, wug.name AS group_name,
        greatest(b.m_start, (wug.starting_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, (wugu.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS from_day,
        least(b.m_next - 1, (wug.ending_date AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS to_day
      FROM bounds b
      JOIN public.workspace_user_groups wug ON wug.ws_id = p_ws_id
      JOIN public.workspace_user_groups_users wugu ON wugu.group_id = wug.id AND wugu.role = 'STUDENT'
      JOIN public.workspace_users wu ON wu.id = wugu.user_id AND wu.ws_id = p_ws_id AND wu.archived IS NOT TRUE
      WHERE p_student_id IS NULL OR wu.id = p_student_id
    ) e
    WHERE from_day <= to_day
  ),
  sessions AS (
    SELECT a.student_id, a.group_id, count(DISTINCT (s.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int AS n
    FROM active a
    CROSS JOIN bounds b
    JOIN private.workspace_user_group_sessions s ON s.group_id = a.group_id AND s.ws_id = p_ws_id AND s.status = 'scheduled'
      AND s.starts_at >= (b.m_start::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
      AND s.starts_at < (b.m_next::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
    WHERE (s.starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN a.from_day AND a.to_day
    GROUP BY a.student_id, a.group_id
  ),
  best AS (
    SELECT DISTINCT ON (uglp.group_id, uglp.product_id, uglp.unit_id, uglp.warehouse_id)
      uglp.group_id, uglp.product_id, uglp.unit_id, coalesce(uglp.warehouse_id, ip.warehouse_id) AS warehouse_id,
      coalesce(ip.price, 0) AS price
    FROM public.user_group_linked_products uglp
    LEFT JOIN private.inventory_products ip ON ip.product_id = uglp.product_id
    WHERE uglp.group_id IN (SELECT a.group_id FROM active a)
    ORDER BY uglp.group_id, uglp.product_id, uglp.unit_id, uglp.warehouse_id,
      CASE WHEN ip.unit_id = uglp.unit_id AND ip.warehouse_id = uglp.warehouse_id THEN 1 WHEN ip.unit_id = uglp.unit_id THEN 2 ELSE 3 END,
      CASE WHEN ip.amount IS NULL OR ip.amount > 0 THEN 0 ELSE 1 END,
      ip.warehouse_id
  ),
  prices AS (
    SELECT DISTINCT ON (best.group_id) best.group_id, best.product_id, best.unit_id, best.warehouse_id,
      sum(best.price) OVER (PARTITION BY best.group_id) AS unit_price
    FROM best
    ORDER BY best.group_id, best.product_id, best.unit_id
  )
  SELECT a.student_id, a.student_name, a.group_id, a.group_name, p.product_id, p.unit_id, p.warehouse_id,
    coalesce(p.unit_price, 0), coalesce(s.n, 0), private.fee_lock_round(coalesce(p.unit_price, 0) * coalesce(s.n, 0), p_currency)
  FROM active a
  LEFT JOIN sessions s ON s.student_id = a.student_id AND s.group_id = a.group_id
  LEFT JOIN prices p ON p.group_id = a.group_id
  ORDER BY a.student_name, a.student_id, a.group_name, a.group_id;
$$;

-- Row-locks one fee lock of the workspace and checks its version and status.
CREATE FUNCTION private.fee_lock_claim(p_ws_id UUID, p_lock_id UUID, p_expected_version INTEGER, p_status TEXT)
RETURNS public.fee_locks LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_lock public.fee_locks;
BEGIN
  SELECT * INTO v_lock FROM public.fee_locks WHERE id = p_lock_id AND ws_id = p_ws_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FEE_LOCK_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  IF p_expected_version IS DISTINCT FROM v_lock.version THEN RAISE EXCEPTION 'FEE_LOCK_VERSION_CONFLICT' USING ERRCODE = 'PT409', DETAIL = v_lock.version::text; END IF;
  IF v_lock.status <> p_status THEN RAISE EXCEPTION 'FEE_LOCK_WRONG_STATUS' USING ERRCODE = '55000', DETAIL = v_lock.status; END IF;
  RETURN v_lock;
END;
$$;

-- Creates or replaces a student-month draft (p_expected_version NULL = new). Line keys: kind, group_id,
-- quantity, adjustment_amount, reason, unit_label, sort_order; catalogue extras add product_id, unit_id,
-- warehouse_id; free-text extras add label, unit_price. A reason is required when sessions differ from
-- the baseline or the adjustment is non-zero.
CREATE FUNCTION private.fee_lock_save_draft(
  p_ws_id UUID, p_actor_id UUID, p_student_id UUID, p_month DATE, p_expected_version INTEGER,
  p_lines JSONB, p_note TEXT DEFAULT NULL, p_currency TEXT DEFAULT 'VND'
)
RETURNS public.fee_locks LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_lock public.fee_locks; v_group public.workspace_user_groups; v_base RECORD; v_line JSONB;
  v_new BOOLEAN := false; v_n INTEGER := 0; v_kind TEXT; v_reason TEXT; v_label TEXT;
  v_before NUMERIC; v_total NUMERIC; v_qty NUMERIC; v_adj NUMERIC; v_price NUMERIC; v_amount NUMERIC; v_base_qty NUMERIC; v_base_amount NUMERIC;
  v_product UUID; v_unit UUID; v_wh UUID;
BEGIN
  IF p_actor_id IS NULL OR p_month IS NULL OR p_month <> date_trunc('month', p_month)::date
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) > 50 THEN
    RAISE EXCEPTION 'FEE_LOCK_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = p_student_id AND ws_id = p_ws_id) THEN
    RAISE EXCEPTION 'FEE_LOCK_STUDENT_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_lock FROM public.fee_locks
  WHERE ws_id = p_ws_id AND student_id = p_student_id AND period_month = p_month FOR UPDATE;
  IF FOUND THEN
    v_lock := private.fee_lock_claim(p_ws_id, v_lock.id, p_expected_version, 'draft');
    v_before := v_lock.total_amount;
    DELETE FROM public.fee_lock_lines WHERE fee_lock_id = v_lock.id;
  ELSIF p_expected_version IS NOT NULL THEN
    RAISE EXCEPTION 'FEE_LOCK_VERSION_CONFLICT' USING ERRCODE = 'PT409', DETAIL = '0';
  ELSE
    INSERT INTO public.fee_locks (ws_id, student_id, period_month, currency, created_by, updated_by)
    VALUES (p_ws_id, p_student_id, p_month, upper(coalesce(p_currency, 'VND')), p_actor_id, p_actor_id)
    ON CONFLICT (ws_id, student_id, period_month) DO NOTHING RETURNING * INTO v_lock;
    IF NOT FOUND THEN RAISE EXCEPTION 'FEE_LOCK_VERSION_CONFLICT' USING ERRCODE = 'PT409', DETAIL = '1'; END IF;
    v_new := true;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_n := v_n + 1;
    v_kind := v_line->>'kind';
    v_qty := (v_line->>'quantity')::numeric;
    v_adj := coalesce((v_line->>'adjustment_amount')::numeric, 0);
    v_reason := nullif(trim(v_line->>'reason'), '');
    v_label := nullif(trim(v_line->>'label'), '');
    v_group := NULL; v_product := NULL; v_unit := NULL; v_wh := NULL; v_base_qty := NULL; v_base_amount := NULL;
    IF v_qty IS NULL OR v_qty <= 0 OR v_kind IS NULL OR v_kind NOT IN ('tuition', 'extra') THEN
      RAISE EXCEPTION 'FEE_LOCK_INVALID_LINE' USING ERRCODE = '22023', DETAIL = v_n::text;
    END IF;
    IF v_line->>'group_id' IS NOT NULL THEN
      SELECT * INTO v_group FROM public.workspace_user_groups WHERE id = (v_line->>'group_id')::uuid AND ws_id = p_ws_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'FEE_LOCK_GROUP_NOT_FOUND' USING ERRCODE = '22023', DETAIL = v_n::text; END IF;
    END IF;

    IF v_kind = 'tuition' THEN
      SELECT * INTO v_base FROM private.fee_lock_baseline(p_ws_id, p_month, p_student_id, v_lock.currency) b WHERE b.group_id = v_group.id;
      IF v_group.id IS NULL OR NOT FOUND THEN RAISE EXCEPTION 'FEE_LOCK_NOT_ENROLLED' USING ERRCODE = '22023', DETAIL = v_n::text; END IF;
      IF v_qty <> v_base.session_count AND v_reason IS NULL THEN RAISE EXCEPTION 'FEE_LOCK_REASON_REQUIRED' USING ERRCODE = '22023', DETAIL = v_n::text; END IF;
      v_price := v_base.unit_price; v_label := left(v_group.name, 200);
      v_product := v_base.product_id; v_unit := v_base.unit_id; v_wh := v_base.warehouse_id;
      v_base_qty := v_base.session_count; v_base_amount := v_base.baseline_amount;
    ELSIF v_line->>'product_id' IS NOT NULL THEN
      -- Product, unit and warehouse must all belong to the workspace.
      SELECT p.id, coalesce(v_label, left(p.name, 200)), ip.unit_id, ip.warehouse_id, ip.price INTO v_product, v_label, v_unit, v_wh, v_price
      FROM public.workspace_products p
      JOIN private.inventory_products ip ON ip.product_id = p.id
        AND ip.unit_id = (v_line->>'unit_id')::uuid AND ip.warehouse_id = (v_line->>'warehouse_id')::uuid
      JOIN private.inventory_units u ON u.id = ip.unit_id AND u.ws_id = p_ws_id
      JOIN private.inventory_warehouses w ON w.id = ip.warehouse_id AND w.ws_id = p_ws_id
      WHERE p.id = (v_line->>'product_id')::uuid AND p.ws_id = p_ws_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'FEE_LOCK_PRODUCT_NOT_FOUND' USING ERRCODE = '22023', DETAIL = v_n::text; END IF;
    ELSE
      v_price := (v_line->>'unit_price')::numeric;
      IF v_label IS NULL OR char_length(v_label) > 200 OR v_price IS NULL OR v_price < 0 THEN RAISE EXCEPTION 'FEE_LOCK_INVALID_LINE' USING ERRCODE = '22023', DETAIL = v_n::text; END IF;
    END IF;

    IF v_adj <> 0 AND v_reason IS NULL THEN RAISE EXCEPTION 'FEE_LOCK_REASON_REQUIRED' USING ERRCODE = '22023', DETAIL = v_n::text; END IF;
    v_amount := private.fee_lock_round(v_price * v_qty + v_adj, v_lock.currency);
    IF greatest(abs(v_adj), v_price * v_qty, abs(v_amount)) > 99999999999999 THEN RAISE EXCEPTION 'FEE_LOCK_AMOUNT_OUT_OF_RANGE' USING ERRCODE = '22003', DETAIL = v_n::text; END IF;
    IF v_amount < 0 THEN RAISE EXCEPTION 'FEE_LOCK_NEGATIVE_LINE' USING ERRCODE = '22023', DETAIL = v_n::text; END IF;

    INSERT INTO public.fee_lock_lines (
      fee_lock_id, ws_id, kind, group_id, group_name_snapshot, label, unit_label, product_id, unit_id, warehouse_id,
      baseline_quantity, baseline_amount, unit_price, quantity, adjustment_amount, reason, line_amount, sort_order
    ) VALUES (
      v_lock.id, p_ws_id, v_kind, v_group.id, left(v_group.name, 200), v_label, nullif(trim(v_line->>'unit_label'), ''),
      v_product, v_unit, v_wh, v_base_qty, v_base_amount, v_price, v_qty, v_adj, v_reason, v_amount,
      coalesce((v_line->>'sort_order')::smallint, v_n::smallint)
    );
  END LOOP;

  SELECT coalesce(sum(line_amount), 0) INTO v_total FROM public.fee_lock_lines WHERE fee_lock_id = v_lock.id;
  IF v_total > 99999999999999 THEN RAISE EXCEPTION 'FEE_LOCK_AMOUNT_OUT_OF_RANGE' USING ERRCODE = '22003'; END IF;
  UPDATE public.fee_locks
  SET total_amount = v_total,
    note = nullif(trim(p_note), ''), version = CASE WHEN v_new THEN version ELSE version + 1 END,
    updated_by = p_actor_id, updated_at = now()
  WHERE id = v_lock.id RETURNING * INTO v_lock;

  INSERT INTO public.fee_lock_events (ws_id, fee_lock_id, event_type, actor_id, revision, before_total, after_total, metadata)
  VALUES (p_ws_id, v_lock.id, 'draft_saved', p_actor_id, v_lock.revision, v_before, v_lock.total_amount,
    jsonb_build_object('line_count', v_n, 'version', v_lock.version));
  RETURN v_lock;
END;
$$;

CREATE FUNCTION private.fee_lock_lock(p_ws_id UUID, p_actor_id UUID, p_lock_id UUID, p_expected_version INTEGER) -- revision + 1, immutable snapshot
RETURNS public.fee_locks LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_lock public.fee_locks; v_snapshot JSONB;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'FEE_LOCK_INVALID_INPUT' USING ERRCODE = '22023'; END IF;
  v_lock := private.fee_lock_claim(p_ws_id, p_lock_id, p_expected_version, 'draft');
  IF NOT EXISTS (SELECT 1 FROM public.fee_lock_lines WHERE fee_lock_id = v_lock.id) THEN RAISE EXCEPTION 'FEE_LOCK_EMPTY' USING ERRCODE = '22023'; END IF;

  UPDATE public.fee_locks SET status = 'locked', revision = revision + 1, version = version + 1, locked_by = p_actor_id,
    locked_at = now(), updated_by = p_actor_id, updated_at = now() WHERE id = v_lock.id RETURNING * INTO v_lock;

  -- Shape: feeLockSnapshotSchema (schema_version 1) in @tuturuuu/internal-api.
  SELECT jsonb_build_object('schema_version', 1, 'fee_lock_id', v_lock.id, 'ws_id', v_lock.ws_id, 'student_id', v_lock.student_id,
    'student_name', left(coalesce(wu.full_name, wu.display_name), 200), 'period_month', v_lock.period_month, 'currency', v_lock.currency,
    'total_amount', v_lock.total_amount, 'note', v_lock.note, 'revision', v_lock.revision, 'locked_by', v_lock.locked_by, 'locked_at', v_lock.locked_at,
    'lines', coalesce((SELECT jsonb_agg((to_jsonb(l) - 'ws_id' - 'fee_lock_id' - 'group_name_snapshot') || jsonb_build_object('group_name', l.group_name_snapshot)
      ORDER BY l.sort_order, l.id) FROM public.fee_lock_lines l WHERE l.fee_lock_id = v_lock.id), '[]'::jsonb)
  ) INTO v_snapshot
  FROM public.workspace_users wu WHERE wu.id = v_lock.student_id;

  INSERT INTO public.fee_lock_revisions (fee_lock_id, ws_id, revision, total_amount, snapshot, locked_by, locked_at)
  VALUES (v_lock.id, p_ws_id, v_lock.revision, v_lock.total_amount, v_snapshot, p_actor_id, v_lock.locked_at);
  INSERT INTO public.fee_lock_events (ws_id, fee_lock_id, event_type, actor_id, revision, before_total, after_total, metadata)
  VALUES (p_ws_id, v_lock.id, 'locked', p_actor_id, v_lock.revision, v_lock.total_amount, v_lock.total_amount,
    jsonb_build_object('line_count', jsonb_array_length(v_snapshot->'lines'), 'version', v_lock.version));
  RETURN v_lock;
END;
$$;

-- Reopens a locked fee as a draft; the revision is kept and the next lock writes revision + 1.
CREATE FUNCTION private.fee_lock_reopen(p_ws_id UUID, p_actor_id UUID, p_lock_id UUID, p_expected_version INTEGER, p_reason TEXT)
RETURNS public.fee_locks LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_lock public.fee_locks;
BEGIN
  IF p_actor_id IS NULL OR char_length(trim(coalesce(p_reason, ''))) = 0 OR char_length(p_reason) > 500 THEN RAISE EXCEPTION 'FEE_LOCK_REASON_REQUIRED' USING ERRCODE = '22023'; END IF;
  v_lock := private.fee_lock_claim(p_ws_id, p_lock_id, p_expected_version, 'locked');
  UPDATE public.fee_locks SET status = 'draft', version = version + 1, updated_by = p_actor_id, updated_at = now()
  WHERE id = v_lock.id RETURNING * INTO v_lock;
  INSERT INTO public.fee_lock_events (ws_id, fee_lock_id, event_type, actor_id, revision, before_total, after_total, reason, metadata)
  VALUES (p_ws_id, v_lock.id, 'reopened', p_actor_id, v_lock.revision, v_lock.total_amount, v_lock.total_amount,
    trim(p_reason), jsonb_build_object('version', v_lock.version));
  RETURN v_lock;
END;
$$;

-- tuturuuu: no-grant (internal)
REVOKE ALL ON FUNCTION private.fee_lock_round(NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
-- tuturuuu: no-grant (internal)
REVOKE ALL ON FUNCTION private.fee_lock_claim(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.fee_lock_baseline(UUID, DATE, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fee_lock_baseline(UUID, DATE, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.fee_lock_save_draft(UUID, UUID, UUID, DATE, INTEGER, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fee_lock_save_draft(UUID, UUID, UUID, DATE, INTEGER, JSONB, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION private.fee_lock_lock(UUID, UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fee_lock_lock(UUID, UUID, UUID, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION private.fee_lock_reopen(UUID, UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fee_lock_reopen(UUID, UUID, UUID, INTEGER, TEXT) TO service_role;

COMMIT;
