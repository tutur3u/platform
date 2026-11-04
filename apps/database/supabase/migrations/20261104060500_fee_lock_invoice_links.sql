BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Records which locked fee (and revision) an invoice was pre-filled from, with
-- the suggested and charged totals. A link table keeps finance_invoices, its
-- audit triggers and its generated types untouched. Written by the finance
-- subscription-invoice route (admin client) inside its compensating cleanup.
-- The invoice FK takes a brief SHARE ROW EXCLUSIVE lock on finance_invoices,
-- bounded by the 5 s lock timeout: apply off-peak and retry if it times out.

CREATE TABLE public.fee_lock_invoice_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.finance_invoices(id) ON DELETE CASCADE,
  fee_lock_id UUID,
  fee_lock_revision INTEGER NOT NULL CHECK (fee_lock_revision >= 1),
  suggested_total NUMERIC(20, 6) NOT NULL CHECK (suggested_total >= 0),
  charged_total NUMERIC(20, 6) NOT NULL CHECK (charged_total >= 0),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The fee lock must belong to the link's workspace; deleting it keeps the
  -- link with fee_lock_id cleared.
  CONSTRAINT fee_lock_invoice_links_fee_lock_fkey FOREIGN KEY (fee_lock_id, ws_id)
    REFERENCES public.fee_locks (id, ws_id) ON DELETE SET NULL (fee_lock_id),
  CONSTRAINT fee_lock_invoice_links_invoice_fee_lock_key UNIQUE (invoice_id, fee_lock_id)
);

CREATE INDEX fee_lock_invoice_links_fee_lock_id_idx ON public.fee_lock_invoice_links (fee_lock_id);
CREATE INDEX fee_lock_invoice_links_ws_created_idx ON public.fee_lock_invoice_links (ws_id, created_at DESC);
CREATE INDEX fee_lock_invoice_links_created_by_idx ON public.fee_lock_invoice_links (created_by);

COMMENT ON TABLE public.fee_lock_invoice_links IS
  'Invoice to fee-lock revision links (suggested vs charged total). Same workspace as both the invoice and the fee lock.';

-- finance_invoices has no (id, ws_id) key to reference, and adding one would
-- alter a busy table, so the invoice workspace is checked here instead.
CREATE FUNCTION private.fee_lock_invoice_links_check_ws()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_invoices WHERE id = NEW.invoice_id AND ws_id = NEW.ws_id
  ) THEN
    RAISE EXCEPTION 'invoice does not belong to this workspace' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.fee_lock_invoice_links_check_ws() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fee_lock_invoice_links_check_ws
  BEFORE INSERT OR UPDATE OF ws_id, invoice_id ON public.fee_lock_invoice_links
  FOR EACH ROW EXECUTE FUNCTION private.fee_lock_invoice_links_check_ws();

ALTER TABLE public.fee_lock_invoice_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_required_mfa ON public.fee_lock_invoice_links AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
REVOKE ALL ON public.fee_lock_invoice_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fee_lock_invoice_links TO service_role;

COMMIT;
