BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Which locked fee revision an invoice was pre-filled from (suggested vs charged
-- total), without altering finance_invoices. Its FK briefly locks
-- finance_invoices (5 s lock timeout): apply off-peak. Links are financial
-- records: deleting a linked invoice, fee lock or workspace fails until the
-- route deletes the link first, including in its compensating cleanup.

CREATE TABLE public.fee_lock_invoice_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE NO ACTION NOT DEFERRABLE,
  invoice_id UUID NOT NULL REFERENCES public.finance_invoices(id) ON DELETE NO ACTION NOT DEFERRABLE,
  fee_lock_id UUID NOT NULL,
  fee_lock_revision INTEGER NOT NULL CHECK (fee_lock_revision BETWEEN 1 AND 100000),
  suggested_total NUMERIC(20, 6) NOT NULL CHECK (suggested_total >= 0),
  charged_total NUMERIC(20, 6) NOT NULL CHECK (charged_total >= 0),
  created_by UUID, -- audit actor; no FK, so no SET NULL and no blocked account deletion
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Every FK is NO ACTION and NOT DEFERRABLE; nothing here is SET NULL.
  CONSTRAINT fee_lock_invoice_links_fee_lock_fkey FOREIGN KEY (fee_lock_id, ws_id)
    REFERENCES public.fee_locks (id, ws_id) ON DELETE NO ACTION NOT DEFERRABLE,
  -- The linked revision must be a real locked revision of that fee lock.
  CONSTRAINT fee_lock_invoice_links_revision_fkey FOREIGN KEY (fee_lock_id, fee_lock_revision)
    REFERENCES public.fee_lock_revisions (fee_lock_id, revision) ON DELETE NO ACTION NOT DEFERRABLE,
  CONSTRAINT fee_lock_invoice_links_invoice_fee_lock_key UNIQUE (invoice_id, fee_lock_id),
  -- One locked revision pre-fills at most one invoice.
  CONSTRAINT fee_lock_invoice_links_revision_key UNIQUE (fee_lock_id, fee_lock_revision)
);

CREATE INDEX fee_lock_invoice_links_ws_created_idx ON public.fee_lock_invoice_links (ws_id, created_at DESC);
CREATE INDEX fee_lock_invoice_links_created_by_idx ON public.fee_lock_invoice_links (created_by);

COMMENT ON TABLE public.fee_lock_invoice_links IS
  'Invoice to fee-lock revision links (suggested vs charged total). The invoice and the fee lock must both belong to ws_id. Deletes never cascade into or out of this table.';

-- Same-workspace guard per reference (pattern of 20261026193000).
CREATE FUNCTION private.fee_lock_invoice_links_same_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.finance_invoices WHERE id = NEW.invoice_id AND ws_id = NEW.ws_id
  ) THEN
    RAISE EXCEPTION 'invoice_id does not belong to ws_id' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fee_locks WHERE id = NEW.fee_lock_id AND ws_id = NEW.ws_id
  ) THEN
    RAISE EXCEPTION 'fee_lock_id does not belong to ws_id' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.fee_lock_invoice_links_same_workspace() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fee_lock_invoice_links_same_workspace
  BEFORE INSERT ON public.fee_lock_invoice_links
  FOR EACH ROW EXECUTE FUNCTION private.fee_lock_invoice_links_same_workspace();

-- Immutable after insert, never truncated (M1's guard, 55000); only deletable.
CREATE TRIGGER fee_lock_invoice_links_immutable BEFORE UPDATE ON public.fee_lock_invoice_links
  FOR EACH ROW EXECUTE FUNCTION private.fee_lock_append_only();
CREATE TRIGGER fee_lock_invoice_links_no_truncate BEFORE TRUNCATE ON public.fee_lock_invoice_links
  FOR EACH STATEMENT EXECUTE FUNCTION private.fee_lock_append_only();

ALTER TABLE public.fee_lock_invoice_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_required_mfa ON public.fee_lock_invoice_links AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
REVOKE ALL ON public.fee_lock_invoice_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fee_lock_invoice_links TO service_role;

COMMIT;
