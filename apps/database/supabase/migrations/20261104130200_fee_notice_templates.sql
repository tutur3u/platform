BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- One active, versioned plain-text fee notice template per workspace; each save
-- adds a version (last 20 kept) via private.fee_notice_template_save, called
-- only by finance routes after the ENABLE_FEE_LOCK and permission checks.

CREATE TABLE public.fee_notice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Workspace-authored text, not a financial record, so it goes with the workspace.
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  is_active BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL CHECK (char_length(body) <= 2000 AND char_length(trim(body)) >= 1),
  item_format TEXT NOT NULL CHECK (char_length(item_format) <= 200),
  item_separator TEXT NOT NULL CHECK (char_length(item_separator) <= 20),
  payment_line TEXT NOT NULL DEFAULT '' CHECK (char_length(payment_line) <= 300),
  notice_grouping TEXT NOT NULL DEFAULT 'combined'
    CHECK (notice_grouping IN ('combined', 'per_class')),
  locale TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi', 'en')),
  -- A platform user (users has no ws_id), so no same-workspace guard applies.
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fee_notice_templates_ws_version_key UNIQUE (ws_id, version)
);

CREATE UNIQUE INDEX fee_notice_templates_ws_active_key
  ON public.fee_notice_templates (ws_id) WHERE is_active;
CREATE INDEX fee_notice_templates_ws_created_idx
  ON public.fee_notice_templates (ws_id, created_at DESC);
CREATE INDEX fee_notice_templates_created_by_idx
  ON public.fee_notice_templates (created_by);

COMMENT ON TABLE public.fee_notice_templates IS
  'Versioned fee-lock notice templates; at most one active per workspace. Placeholders are allowlisted ({{name}} only, no logic). Written only by private.fee_notice_template_save.';

ALTER TABLE public.fee_notice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_required_mfa ON public.fee_notice_templates AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
REVOKE ALL ON public.fee_notice_templates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fee_notice_templates TO service_role;

-- Saves a new active version; a stale p_expected_version raises 40001.
CREATE FUNCTION private.fee_notice_template_save(
  p_ws_id UUID,
  p_actor_id UUID,
  p_body TEXT,
  p_item_format TEXT,
  p_item_separator TEXT,
  p_payment_line TEXT,
  p_notice_grouping TEXT,
  p_locale TEXT,
  p_expected_version INTEGER DEFAULT NULL,
  p_restored_from INTEGER DEFAULT NULL
)
RETURNS public.fee_notice_templates
LANGUAGE plpgsql
-- Invoker rights: only service_role may call it, and it already owns the writes.
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_placeholder CONSTANT TEXT := '\{\{\s*([A-Za-z0-9_]+)\s*\}\}';
  v_line CONSTANT TEXT[] := ARRAY['centre_name', 'month', 'student_name', 'class_name'];
  v_body CONSTANT TEXT[] := v_line || ARRAY['tuition', 'tuition_amount', 'session_count',
    'items', 'items_with_prefix', 'total', 'payment_line'];
  v_item CONSTANT TEXT[] := ARRAY['name', 'price', 'unit', 'quantity', 'amount'];
  v_active INTEGER;
  v_row public.fee_notice_templates;
BEGIN
  IF p_ws_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_ws_id) THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM regexp_matches(coalesce(p_body, ''), v_placeholder, 'g') m WHERE m[1] <> ALL (v_body))
    OR EXISTS (SELECT 1 FROM regexp_matches(coalesce(p_item_format, ''), v_placeholder, 'g') m WHERE m[1] <> ALL (v_item))
    OR EXISTS (SELECT 1 FROM regexp_matches(coalesce(p_payment_line, ''), v_placeholder, 'g') m WHERE m[1] <> ALL (v_line))
  THEN
    RAISE EXCEPTION 'unknown placeholder in fee notice template' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('fee_notice_template:' || p_ws_id::text, 0));

  SELECT version INTO v_active FROM public.fee_notice_templates WHERE ws_id = p_ws_id AND is_active;
  IF p_expected_version IS NOT NULL AND p_expected_version IS DISTINCT FROM v_active THEN
    RAISE EXCEPTION 'fee notice template version conflict' USING ERRCODE = '40001';
  END IF;

  UPDATE public.fee_notice_templates SET is_active = false WHERE ws_id = p_ws_id AND is_active;
  INSERT INTO public.fee_notice_templates (ws_id, version, is_active, body, item_format,
    item_separator, payment_line, notice_grouping, locale, created_by)
  SELECT p_ws_id, coalesce(max(version), 0) + 1, true, p_body, p_item_format,
    p_item_separator, coalesce(p_payment_line, ''), coalesce(p_notice_grouping, 'combined'),
    coalesce(p_locale, 'vi'), p_actor_id
  FROM public.fee_notice_templates WHERE ws_id = p_ws_id
  RETURNING * INTO v_row;

  DELETE FROM public.fee_notice_templates
  WHERE ws_id = p_ws_id AND version <= v_row.version - 20;

  INSERT INTO public.fee_lock_events (ws_id, event_type, actor_id, metadata)
  VALUES (p_ws_id, 'template_saved', p_actor_id, jsonb_strip_nulls(jsonb_build_object(
    'template_version', v_row.version, 'previous_version', v_active,
    'restored_from', p_restored_from, 'notice_grouping', v_row.notice_grouping)));

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION private.fee_notice_template_save(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fee_notice_template_save(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMIT;
