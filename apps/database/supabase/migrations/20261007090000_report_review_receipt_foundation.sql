-- Inert review provenance foundation. No receipt minting RPC or delivery caller.
-- Snapshot identifiers deliberately have no live FKs: authorized teardown does
-- not erase audit history or become blocked by immutable receipt constraints.
-- A later product-managed retention/export/deletion policy remains required.
ALTER TABLE private.external_user_monthly_reports
  ADD COLUMN review_revision bigint NOT NULL DEFAULT 1 CHECK (review_revision > 0);
ALTER TABLE private.user_group_posts
  ADD COLUMN review_revision bigint NOT NULL DEFAULT 1 CHECK (review_revision > 0);
ALTER TABLE private.user_group_post_checks
  ADD COLUMN review_revision bigint NOT NULL DEFAULT 1 CHECK (review_revision > 0);

CREATE FUNCTION private.advance_report_review_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  field_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.review_revision := 1;
    RETURN NEW;
  END IF;
  -- Ignore caller-supplied versions, including bookkeeping-only writes.
  NEW.review_revision := OLD.review_revision;
  FOREACH field_name IN ARRAY TG_ARGV LOOP
    IF (to_jsonb(NEW) -> field_name) IS DISTINCT FROM
       (to_jsonb(OLD) -> field_name) THEN
      -- Native bigint overflow aborts the entire mutation, never wraps/reset.
      NEW.review_revision := OLD.review_revision + 1;
      EXIT;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_report_review_revision()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER zz_report_review_revision BEFORE INSERT OR UPDATE
ON private.external_user_monthly_reports FOR EACH ROW
EXECUTE FUNCTION private.advance_report_review_revision(
  'title', 'content', 'feedback', 'score', 'scores', 'cadence', 'period_start',
  'period_end', 'group_id', 'user_id', 'manager_instruction', 'generation_mode',
  'generation_status', 'source_context', 'report_approval_status', 'approved_by',
  'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason');
CREATE TRIGGER zz_report_review_revision BEFORE INSERT OR UPDATE
ON private.user_group_posts FOR EACH ROW
EXECUTE FUNCTION private.advance_report_review_revision(
  'title', 'content', 'notes', 'group_id', 'post_approval_status', 'approved_by',
  'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason');
CREATE TRIGGER zz_report_review_revision BEFORE INSERT OR UPDATE
ON private.user_group_post_checks FOR EACH ROW
EXECUTE FUNCTION private.advance_report_review_revision(
  'post_id', 'user_id', 'notes', 'is_completed', 'approval_status', 'approved_by',
  'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason');

CREATE TABLE private.report_review_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('periodic', 'daily')),
  ws_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  report_id uuid,
  post_id uuid,
  review_revision bigint NOT NULL CHECK (review_revision > 0),
  parent_review_revision bigint,
  reviewed_payload_sha256 text NOT NULL
    CHECK (length(reviewed_payload_sha256) = 64 AND reviewed_payload_sha256 ~ '^[0-9a-f]{64}$'),
  recipient_sha256 text NOT NULL CHECK (length(recipient_sha256) = 64 AND recipient_sha256 ~ '^[0-9a-f]{64}$'),
  actor_auth_uid uuid NOT NULL,
  actor_workspace_user_id uuid NOT NULL,
  required_permission text NOT NULL,
  action_id uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_review_receipt_identity CHECK (
    (kind = 'periodic' AND report_id IS NOT NULL AND post_id IS NULL
      AND parent_review_revision IS NULL AND required_permission = 'approve_reports')
    OR (kind = 'daily' AND report_id IS NULL AND post_id IS NOT NULL
      AND parent_review_revision IS NOT NULL AND parent_review_revision > 0 AND required_permission = 'approve_posts'))
);
CREATE UNIQUE INDEX report_review_receipt_periodic_action
  ON private.report_review_receipts (action_id, report_id) WHERE kind = 'periodic';
CREATE UNIQUE INDEX report_review_receipt_daily_action
  ON private.report_review_receipts (action_id, post_id, subject_user_id)
  WHERE kind = 'daily';
ALTER TABLE private.report_review_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.report_review_receipts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.report_review_receipts TO service_role;
CREATE POLICY report_review_receipt_service_read
  ON private.report_review_receipts FOR SELECT TO service_role USING (true);
COMMENT ON TABLE private.report_review_receipts IS
  'Immutable server audit snapshots, no live parent FKs and no customer access. '
  'Teardown preserves history. Service reads never restore access or prove current '
  'permission. No mint RPC, backfill or delivery activation. Managed retention pending.';

CREATE FUNCTION private.reject_report_review_receipt_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Review receipts are immutable' USING ERRCODE = '55000';
END;
$$;
REVOKE ALL ON FUNCTION private.reject_report_review_receipt_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER report_review_receipt_immutable
  BEFORE UPDATE OR DELETE ON private.report_review_receipts
  FOR EACH ROW EXECUTE FUNCTION private.reject_report_review_receipt_mutation();
CREATE TRIGGER report_review_receipt_no_truncate
  BEFORE TRUNCATE ON private.report_review_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION private.reject_report_review_receipt_mutation();

-- Match application getPermissions, including GUEST typed defaults. Actor is
-- admitted by an existing verified server route, never a request body identity.
-- The virtual link is an additional provenance requirement, not a permission grant.
CREATE FUNCTION private.can_review_report_entry(
  p_ws_id uuid, p_actor_auth_uid uuid, p_actor_workspace_user_id uuid, p_kind text
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_member_type public.workspace_member_type;
  v_permission public.workspace_role_permission;
BEGIN
  IF p_kind NOT IN ('periodic', 'daily') OR p_kind IS NULL THEN RETURN false; END IF;
  v_permission := CASE p_kind WHEN 'periodic' THEN 'approve_reports' ELSE 'approve_posts' END;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_user_linked_users link
    JOIN public.workspace_users actor ON actor.id = link.virtual_user_id
      AND actor.ws_id = link.ws_id
    WHERE link.ws_id = p_ws_id AND link.platform_user_id = p_actor_auth_uid
      AND link.virtual_user_id = p_actor_workspace_user_id
  ) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.workspaces ws
    WHERE ws.id = p_ws_id AND ws.creator_id = p_actor_auth_uid)
  THEN RETURN true; END IF;
  SELECT wm.type INTO v_member_type FROM public.workspace_members wm
    WHERE wm.ws_id = p_ws_id AND wm.user_id = p_actor_auth_uid;
  IF v_member_type IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_default_permissions defaults
    WHERE defaults.ws_id = p_ws_id AND defaults.member_type = v_member_type
      AND defaults.enabled AND defaults.permission IN (v_permission, 'admin'))
  THEN RETURN true; END IF;
  IF v_member_type = 'MEMBER' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.workspace_role_members rm
      JOIN public.workspace_roles wr ON wr.id = rm.role_id
        AND wr.ws_id = p_ws_id
      JOIN public.workspace_role_permissions grant_row ON grant_row.role_id = wr.id
      WHERE rm.user_id = p_actor_auth_uid AND grant_row.enabled
        AND grant_row.permission IN (v_permission, 'admin')
    );
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.can_review_report_entry(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_review_report_entry(uuid, uuid, uuid, text)
  TO service_role;

CREATE FUNCTION private.report_review_delivery_ready(uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT false;
$$;
REVOKE ALL ON FUNCTION private.report_review_delivery_ready(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.report_review_delivery_ready(uuid) TO service_role;
COMMENT ON FUNCTION private.report_review_delivery_ready(uuid) IS
  'Always false inert prerequisite. Requires future canonical approval and complete '
  'database/caller/queue/worker closure before any delivery activation.';
