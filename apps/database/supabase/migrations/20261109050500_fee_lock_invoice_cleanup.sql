BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Compensating cleanup for an invoice a finance route created in the SAME
-- request and must discard because a later step failed. fee_lock_invoice_links
-- references invoices with NO ACTION (20261104130300), so the link and then the
-- invoice are deleted in ONE transaction here, never as separate API calls.
-- Only such an invoice qualifies: created by p_actor_id at or after
-- p_request_started_at (taken by the route just before its insert, at most 15
-- minutes ago), and not completed or paid outside that window. Anything else,
-- or an invoice of another workspace, returns false and changes nothing.
-- Every discard writes an `invoice_discarded` event (ids, actor and reason;
-- no amounts or names). User-facing deletes keep admin_delete_finance_invoice.

-- 1. The event type. NOT VALID: no scan; existing rows already pass.
ALTER TABLE public.fee_lock_events DROP CONSTRAINT fee_lock_events_event_type_check;
ALTER TABLE public.fee_lock_events ADD CONSTRAINT fee_lock_events_event_type_check CHECK (event_type IN (
  'draft_saved', 'locked', 'reopened', 'exported', 'template_saved', 'prefill_applied', 'invoice_linked', 'invoice_discarded'
)) NOT VALID;

-- 2. The cleanup.
CREATE FUNCTION private.fee_lock_discard_new_invoice(
  p_ws_id UUID, p_invoice_id UUID, p_actor_id UUID, p_request_started_at TIMESTAMPTZ, p_reason TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_invoice public.finance_invoices;
  v_links INTEGER;
BEGIN
  IF p_actor_id IS NULL OR p_request_started_at IS NULL OR p_request_started_at < now() - interval '15 minutes'
    OR char_length(trim(coalesce(p_reason, ''))) = 0 OR char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'FEE_LOCK_INVALID_INPUT' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_invoice FROM public.finance_invoices WHERE id = p_invoice_id AND ws_id = p_ws_id FOR UPDATE;
  IF NOT FOUND
    OR v_invoice.platform_creator_id IS DISTINCT FROM p_actor_id
    OR v_invoice.created_at IS NULL OR v_invoice.created_at < p_request_started_at
    OR (v_invoice.completed_at IS NOT NULL AND v_invoice.completed_at NOT BETWEEN p_request_started_at AND now())
  THEN
    RETURN false;
  END IF;

  WITH gone AS (
    DELETE FROM public.fee_lock_invoice_links WHERE invoice_id = p_invoice_id AND ws_id = p_ws_id
    RETURNING fee_lock_id, fee_lock_revision
  ), logged AS (
    INSERT INTO public.fee_lock_events (ws_id, fee_lock_id, event_type, actor_id, revision, reason, metadata)
    SELECT p_ws_id, fee_lock_id, 'invoice_discarded', p_actor_id, fee_lock_revision, trim(p_reason),
      jsonb_build_object('invoice_id', p_invoice_id)
    FROM gone
    RETURNING 1
  )
  SELECT count(*) INTO v_links FROM logged;
  IF v_links = 0 THEN
    INSERT INTO public.fee_lock_events (ws_id, event_type, actor_id, reason, metadata)
    VALUES (p_ws_id, 'invoice_discarded', p_actor_id, trim(p_reason), jsonb_build_object('invoice_id', p_invoice_id));
  END IF;

  DELETE FROM public.finance_invoice_promotions WHERE invoice_id = p_invoice_id;
  DELETE FROM public.finance_invoice_products WHERE invoice_id = p_invoice_id;
  DELETE FROM public.finance_invoice_user_groups WHERE invoice_id = p_invoice_id;
  DELETE FROM public.finance_invoices WHERE id = p_invoice_id AND ws_id = p_ws_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.fee_lock_discard_new_invoice(UUID, UUID, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fee_lock_discard_new_invoice(UUID, UUID, UUID, TIMESTAMPTZ, TEXT) TO service_role;

COMMIT;
