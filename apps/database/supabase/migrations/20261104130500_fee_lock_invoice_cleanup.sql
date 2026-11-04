BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Compensating cleanup for an invoice a finance route just created and must
-- discard (a later step failed). fee_lock_invoice_links references invoices
-- with NO ACTION (20261104130300), so the link and the invoice are deleted in
-- ONE transaction here, never as separate API calls: both go, or neither.
-- Deletes the same child rows as the routes' existing cleanup blocks. Not for
-- user-facing deletes, which keep admin_delete_finance_invoice and its
-- recovery snapshot. Returns false when the invoice is not in the workspace.
CREATE FUNCTION private.fee_lock_discard_new_invoice(p_ws_id UUID, p_invoice_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.finance_invoices WHERE id = p_invoice_id AND ws_id = p_ws_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM public.fee_lock_invoice_links WHERE invoice_id = p_invoice_id AND ws_id = p_ws_id;
  DELETE FROM public.finance_invoice_promotions WHERE invoice_id = p_invoice_id;
  DELETE FROM public.finance_invoice_products WHERE invoice_id = p_invoice_id;
  DELETE FROM public.finance_invoice_user_groups WHERE invoice_id = p_invoice_id;
  DELETE FROM public.finance_invoices WHERE id = p_invoice_id AND ws_id = p_ws_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.fee_lock_discard_new_invoice(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.fee_lock_discard_new_invoice(UUID, UUID) TO service_role;

COMMIT;
