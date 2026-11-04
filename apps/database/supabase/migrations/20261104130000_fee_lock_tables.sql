BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fee lock ("chốt học phí"): staff lock each student's tuition for a month
-- before invoicing. Tables: the student-month header, its lines (tuition per
-- class and extra items), immutable locked revisions and a business event log.
--
-- Served only by finance routes with the admin client after the ENABLE_FEE_LOCK
-- and permission checks; writes go through service-role private.fee_lock_*
-- functions (next migration). audit.enable_tracking is deliberately off: it would
-- log names and amounts under a service-role actor; fee_lock_events records the
-- real actor. Every workspace-scoped reference is checked against ws_id.

-- 1. Header: one row per student and month.
CREATE TABLE public.fee_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- NO ACTION: a student with fee locks cannot be deleted; a workspace delete still cascades.
  student_id UUID NOT NULL REFERENCES public.workspace_users(id) ON DELETE NO ACTION,
  period_month DATE NOT NULL CHECK (period_month = date_trunc('month', period_month)::date),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'locked')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  currency TEXT NOT NULL DEFAULT 'VND' CHECK (char_length(currency) = 3),
  total_amount NUMERIC(20, 6) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  note TEXT CHECK (char_length(note) <= 2000),
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  locked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  CONSTRAINT fee_locks_ws_student_period_key UNIQUE (ws_id, student_id, period_month),
  -- Target of the child (fee_lock_id, ws_id) keys: children stay in the header's workspace.
  CONSTRAINT fee_locks_id_ws_key UNIQUE (id, ws_id),
  CONSTRAINT fee_locks_locked_state_check
    CHECK (status <> 'locked' OR (revision >= 1 AND locked_at IS NOT NULL))
);

CREATE INDEX fee_locks_ws_period_status_idx ON public.fee_locks (ws_id, period_month, status);
CREATE INDEX fee_locks_student_id_idx ON public.fee_locks (student_id);

COMMENT ON TABLE public.fee_locks IS 'Fee lock header, one per student and month (period_month = first day, Asia/Ho_Chi_Minh). revision = last locked revision; version = optimistic concurrency counter; total_amount is server-computed. Written only by private.fee_lock_* functions.';

-- 2. Lines: one tuition line per class (quantity = sessions), plus extras.
CREATE TABLE public.fee_lock_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_lock_id UUID NOT NULL,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tuition', 'extra')),
  group_id UUID REFERENCES public.workspace_user_groups(id) ON DELETE SET NULL,
  group_name_snapshot TEXT,
  label TEXT NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 200),
  unit_label TEXT CHECK (char_length(unit_label) <= 40),
  product_id UUID REFERENCES public.workspace_products(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES private.inventory_units(id) ON DELETE SET NULL,
  warehouse_id UUID REFERENCES private.inventory_warehouses(id) ON DELETE SET NULL,
  baseline_quantity NUMERIC(12, 3) CHECK (baseline_quantity >= 0),
  baseline_amount NUMERIC(20, 6) CHECK (baseline_amount >= 0),
  unit_price NUMERIC(20, 6) NOT NULL CHECK (unit_price >= 0),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  adjustment_amount NUMERIC(20, 6) NOT NULL DEFAULT 0,
  reason TEXT CHECK (char_length(reason) <= 500),
  line_amount NUMERIC(20, 6) NOT NULL CHECK (line_amount >= 0),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT fee_lock_lines_fee_lock_fkey FOREIGN KEY (fee_lock_id, ws_id)
    REFERENCES public.fee_locks (id, ws_id) ON DELETE CASCADE,
  CONSTRAINT fee_lock_lines_reason_required_check
    CHECK (adjustment_amount = 0 OR char_length(trim(coalesce(reason, ''))) > 0),
  CONSTRAINT fee_lock_lines_tuition_group_check
    CHECK (kind <> 'tuition' OR group_name_snapshot IS NOT NULL)
);

CREATE INDEX fee_lock_lines_fee_lock_sort_idx ON public.fee_lock_lines (fee_lock_id, sort_order);
CREATE INDEX fee_lock_lines_group_id_idx ON public.fee_lock_lines (group_id);
CREATE INDEX fee_lock_lines_product_id_idx ON public.fee_lock_lines (product_id);
CREATE INDEX fee_lock_lines_unit_id_idx ON public.fee_lock_lines (unit_id);
CREATE INDEX fee_lock_lines_warehouse_id_idx ON public.fee_lock_lines (warehouse_id);
CREATE INDEX fee_lock_lines_ws_id_idx ON public.fee_lock_lines (ws_id);
CREATE UNIQUE INDEX fee_lock_lines_tuition_group_key
  ON public.fee_lock_lines (fee_lock_id, group_id) WHERE kind = 'tuition';

COMMENT ON TABLE public.fee_lock_lines IS 'Fee lock lines. line_amount = round(unit_price * quantity + adjustment_amount), computed on the server. adjustment_amount is signed (negative = discount) and needs a reason when non-zero.';

-- 3. Revisions: immutable snapshots written at each lock.
CREATE TABLE public.fee_lock_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_lock_id UUID NOT NULL,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  total_amount NUMERIC(20, 6) NOT NULL CHECK (total_amount >= 0),
  snapshot JSONB NOT NULL
    CHECK (jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 65536),
  locked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fee_lock_revisions_fee_lock_fkey FOREIGN KEY (fee_lock_id, ws_id)
    REFERENCES public.fee_locks (id, ws_id) ON DELETE CASCADE,
  CONSTRAINT fee_lock_revisions_fee_lock_revision_key UNIQUE (fee_lock_id, revision)
);

CREATE INDEX fee_lock_revisions_ws_id_idx ON public.fee_lock_revisions (ws_id);
CREATE INDEX fee_lock_revisions_locked_by_idx ON public.fee_lock_revisions (locked_by);

COMMENT ON TABLE public.fee_lock_revisions IS 'Append-only snapshot of a fee lock at each lock (header, lines, student and class names at lock time). Phase 2 sends from these, never from live rows.';

-- 4. Business events (full Phase 1 list). Metadata: ids, counts, digests only; no names or phones.
CREATE TABLE public.fee_lock_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fee_lock_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'draft_saved', 'locked', 'reopened', 'exported', 'template_saved', 'prefill_applied', 'invoice_linked'
  )),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revision INTEGER CHECK (revision >= 0),
  before_total NUMERIC(20, 6) CHECK (before_total >= 0),
  after_total NUMERIC(20, 6) CHECK (after_total >= 0),
  reason TEXT CHECK (char_length(reason) <= 500),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8192),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- An event names a fee lock of its own workspace; deleting the lock clears only fee_lock_id.
  CONSTRAINT fee_lock_events_fee_lock_fkey FOREIGN KEY (fee_lock_id, ws_id)
    REFERENCES public.fee_locks (id, ws_id) ON DELETE SET NULL (fee_lock_id)
);

CREATE INDEX fee_lock_events_ws_created_idx ON public.fee_lock_events (ws_id, created_at DESC);
CREATE INDEX fee_lock_events_fee_lock_created_idx ON public.fee_lock_events (fee_lock_id, created_at DESC);
CREATE INDEX fee_lock_events_actor_id_idx ON public.fee_lock_events (actor_id);

COMMENT ON TABLE public.fee_lock_events IS 'Fee lock business audit. actor_id is the authenticated platform user passed by the finance route, not the service role.';

-- Immutable history: locked fee locks, revisions and events cannot be deleted or truncated, a fee
-- lock never lowers its revision or changes workspace, and revisions and events cannot change.
-- Allowed: cascades (workspace, or a revision's fee lock, gone), deleting a never-locked draft, and
-- FKs clearing locked_by, actor_id or fee_lock_id.
CREATE FUNCTION private.fee_lock_append_only()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = OLD.ws_id) THEN RETURN OLD; END IF;
    IF TG_TABLE_NAME = 'fee_locks' THEN
      IF OLD.revision = 0 THEN RETURN OLD; END IF;
    ELSIF TG_TABLE_NAME = 'fee_lock_revisions' THEN
      IF NOT EXISTS (SELECT 1 FROM public.fee_locks WHERE id = OLD.fee_lock_id) THEN RETURN OLD; END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'fee_locks' THEN
    IF NEW.revision >= OLD.revision AND NEW.ws_id = OLD.ws_id THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'fee_lock_revisions' THEN
    IF NEW.locked_by IS NULL AND (to_jsonb(NEW) - 'locked_by') = (to_jsonb(OLD) - 'locked_by') THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'fee_lock_events' THEN
    IF (NEW.fee_lock_id IS NULL OR NEW.fee_lock_id = OLD.fee_lock_id) AND (NEW.actor_id IS NULL OR NEW.actor_id = OLD.actor_id)
      AND (to_jsonb(NEW) - 'fee_lock_id' - 'actor_id') = (to_jsonb(OLD) - 'fee_lock_id' - 'actor_id') THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.fee_lock_append_only() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fee_locks_keep_locked BEFORE UPDATE OR DELETE ON public.fee_locks FOR EACH ROW EXECUTE FUNCTION private.fee_lock_append_only();
CREATE TRIGGER fee_lock_revisions_append_only BEFORE UPDATE OR DELETE ON public.fee_lock_revisions FOR EACH ROW EXECUTE FUNCTION private.fee_lock_append_only();
CREATE TRIGGER fee_lock_events_append_only BEFORE UPDATE OR DELETE ON public.fee_lock_events FOR EACH ROW EXECUTE FUNCTION private.fee_lock_append_only();
CREATE TRIGGER fee_locks_no_truncate BEFORE TRUNCATE ON public.fee_locks FOR EACH STATEMENT EXECUTE FUNCTION private.fee_lock_append_only();
CREATE TRIGGER fee_lock_revisions_no_truncate BEFORE TRUNCATE ON public.fee_lock_revisions FOR EACH STATEMENT EXECUTE FUNCTION private.fee_lock_append_only();
CREATE TRIGGER fee_lock_events_no_truncate BEFORE TRUNCATE ON public.fee_lock_events FOR EACH STATEMENT EXECUTE FUNCTION private.fee_lock_append_only();

-- 5. Same-workspace guards: the referenced tables have no (id, ws_id) key, so a
-- trigger checks them (as in 20261026193000).
CREATE FUNCTION private.fee_lock_same_workspace()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_column TEXT;
BEGIN
  IF TG_TABLE_NAME = 'fee_locks' THEN
    IF NOT EXISTS (SELECT 1 FROM public.workspace_users WHERE id = NEW.student_id AND ws_id = NEW.ws_id) THEN v_column := 'student_id'; END IF;
  ELSIF NEW.group_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.workspace_user_groups WHERE id = NEW.group_id AND ws_id = NEW.ws_id) THEN
    v_column := 'group_id';
  ELSIF NEW.product_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.workspace_products WHERE id = NEW.product_id AND ws_id = NEW.ws_id) THEN
    v_column := 'product_id';
  ELSIF NEW.unit_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM private.inventory_units WHERE id = NEW.unit_id AND ws_id = NEW.ws_id) THEN
    v_column := 'unit_id';
  ELSIF NEW.warehouse_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM private.inventory_warehouses WHERE id = NEW.warehouse_id AND ws_id = NEW.ws_id) THEN
    v_column := 'warehouse_id';
  END IF;
  IF v_column IS NOT NULL THEN RAISE EXCEPTION '% does not belong to ws_id', v_column USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.fee_lock_same_workspace() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fee_locks_same_workspace BEFORE INSERT OR UPDATE OF ws_id, student_id ON public.fee_locks
  FOR EACH ROW EXECUTE FUNCTION private.fee_lock_same_workspace();
CREATE TRIGGER fee_lock_lines_same_workspace BEFORE INSERT OR UPDATE OF ws_id, group_id, product_id, unit_id, warehouse_id
  ON public.fee_lock_lines FOR EACH ROW EXECUTE FUNCTION private.fee_lock_same_workspace();

-- 6. Access: service role only. RLS is on with no permissive policy, so a
-- mistaken grant still exposes nothing. The restrictive MFA policy keeps these
-- relations consistent with every other public relation (see 20260923130000).
ALTER TABLE public.fee_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_lock_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_lock_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_lock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_required_mfa ON public.fee_locks AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied())) WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
CREATE POLICY account_required_mfa ON public.fee_lock_lines AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied())) WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
CREATE POLICY account_required_mfa ON public.fee_lock_revisions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied())) WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
CREATE POLICY account_required_mfa ON public.fee_lock_events AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied())) WITH CHECK ((SELECT public.account_required_mfa_satisfied()));

REVOKE ALL ON public.fee_locks, public.fee_lock_lines, public.fee_lock_revisions, public.fee_lock_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fee_locks, public.fee_lock_lines, public.fee_lock_revisions, public.fee_lock_events
  TO service_role;
REVOKE ALL ON SEQUENCE public.fee_lock_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fee_lock_events_id_seq TO service_role;

COMMIT;
