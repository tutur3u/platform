BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Fee lock ("chốt học phí"): staff lock each student's tuition for a month
-- before invoicing. Tables: the student-month header, its lines (tuition per
-- class and extra items), immutable locked revisions and a business event log.
--
-- Served only by finance routes with the admin client, after the
-- ENABLE_FEE_LOCK workspace secret and permission checks. Writes go through
-- service-role private.fee_lock_* functions (next migration), which compute
-- every amount. audit.enable_tracking is deliberately not enabled: it would
-- copy names and amounts into the generic audit log under a service-role
-- actor, while fee_lock_events records the real platform actor.

-- 1. Header: one row per student and month.
CREATE TABLE public.fee_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.workspace_users(id) ON DELETE CASCADE,
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
  -- Target of the child (fee_lock_id, ws_id) keys: a child row can never
  -- claim another workspace than its header.
  CONSTRAINT fee_locks_id_ws_key UNIQUE (id, ws_id),
  CONSTRAINT fee_locks_locked_state_check
    CHECK (status <> 'locked' OR (revision >= 1 AND locked_at IS NOT NULL))
);

CREATE INDEX fee_locks_ws_period_status_idx ON public.fee_locks (ws_id, period_month, status);
CREATE INDEX fee_locks_student_id_idx ON public.fee_locks (student_id);

COMMENT ON TABLE public.fee_locks IS
  'Fee lock header, one per student and month (period_month = first day, Asia/Ho_Chi_Minh). revision = last locked revision; version = optimistic concurrency counter; total_amount is server-computed. Written only by private.fee_lock_* functions.';

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
  unit_id UUID,
  warehouse_id UUID,
  baseline_quantity NUMERIC(12, 3),
  baseline_amount NUMERIC(20, 6),
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
CREATE INDEX fee_lock_lines_ws_id_idx ON public.fee_lock_lines (ws_id);
CREATE UNIQUE INDEX fee_lock_lines_tuition_group_key
  ON public.fee_lock_lines (fee_lock_id, group_id) WHERE kind = 'tuition';

COMMENT ON TABLE public.fee_lock_lines IS
  'Fee lock lines. line_amount = round(unit_price * quantity + adjustment_amount), computed on the server. adjustment_amount is signed (negative = discount) and needs a reason when non-zero.';

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

COMMENT ON TABLE public.fee_lock_revisions IS
  'Append-only snapshot of a fee lock at each lock (header, lines, student and class names at lock time). Phase 2 sends from these, never from live rows.';

-- Append-only. The one allowed update is the foreign key clearing locked_by
-- when that user is deleted; deletes stay possible through the cascades.
CREATE FUNCTION private.fee_lock_revisions_block_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.locked_by IS NULL AND OLD.locked_by IS NOT NULL
    AND (to_jsonb(NEW) - 'locked_by') = (to_jsonb(OLD) - 'locked_by')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'fee_lock_revisions is append-only' USING ERRCODE = '55000';
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION private.fee_lock_revisions_block_update() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER fee_lock_revisions_append_only
  BEFORE UPDATE ON public.fee_lock_revisions
  FOR EACH ROW EXECUTE FUNCTION private.fee_lock_revisions_block_update();

-- 4. Business events. Metadata holds ids, counts and digests only: no names
-- or phone numbers. The full Phase 1 event list is set now.
CREATE TABLE public.fee_lock_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ws_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  fee_lock_id UUID REFERENCES public.fee_locks(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'draft_saved', 'locked', 'reopened', 'exported', 'template_saved', 'prefill_applied', 'invoice_linked'
  )),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revision INTEGER,
  before_total NUMERIC(20, 6),
  after_total NUMERIC(20, 6),
  reason TEXT CHECK (char_length(reason) <= 500),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND octet_length(metadata::text) <= 8192),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX fee_lock_events_ws_created_idx ON public.fee_lock_events (ws_id, created_at DESC);
CREATE INDEX fee_lock_events_fee_lock_created_idx ON public.fee_lock_events (fee_lock_id, created_at DESC);
CREATE INDEX fee_lock_events_actor_id_idx ON public.fee_lock_events (actor_id);

COMMENT ON TABLE public.fee_lock_events IS
  'Fee lock business audit. actor_id is the authenticated platform user passed by the finance route, not the service role.';

-- 5. Access: service role only. RLS is on with no permissive policy, so a
-- mistaken grant still exposes nothing. The restrictive MFA policy keeps these
-- relations consistent with every other public relation (see 20260923130000).
ALTER TABLE public.fee_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_lock_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_lock_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_lock_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_required_mfa ON public.fee_locks AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
CREATE POLICY account_required_mfa ON public.fee_lock_lines AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
CREATE POLICY account_required_mfa ON public.fee_lock_revisions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));
CREATE POLICY account_required_mfa ON public.fee_lock_events AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.account_required_mfa_satisfied()))
  WITH CHECK ((SELECT public.account_required_mfa_satisfied()));

REVOKE ALL ON public.fee_locks, public.fee_lock_lines, public.fee_lock_revisions, public.fee_lock_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fee_locks, public.fee_lock_lines, public.fee_lock_revisions, public.fee_lock_events
  TO service_role;
REVOKE ALL ON SEQUENCE public.fee_lock_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.fee_lock_events_id_seq TO service_role;

COMMIT;
