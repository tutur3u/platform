-- P1 only: no receiver, route, provider configuration or Reply-To activation.
-- Queue rows are reused by retry/send/test. A conservative generation is the
-- immutable (queue, review revision, recipient, kind) tuple, not attempt_count.
-- Repeating a successful test of the same snapshot requires a later explicit
-- send-intent contract; no reset of existing queue columns grants resend here.
CREATE TABLE private.report_email_reply_identities (
  id uuid PRIMARY KEY,
  generation uuid NOT NULL UNIQUE,
  ws_id uuid NOT NULL,
  report_id uuid NOT NULL,
  queue_id uuid NOT NULL,
  subject_user_id uuid NOT NULL,
  recipient_email text NOT NULL CHECK (
    recipient_email = lower(btrim(recipient_email)) AND
    recipient_email <> '' AND recipient_email !~ '[[:cntrl:]]'),
  delivery_kind text NOT NULL CHECK (delivery_kind IN ('send', 'test')),
  review_revision bigint NOT NULL CHECK (review_revision > 0),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  token_digest bytea NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
  token_ciphertext bytea NOT NULL CHECK (octet_length(token_ciphertext) BETWEEN 60 AND 512),
  key_version integer NOT NULL CHECK (key_version > 0),
  reply_domain text NOT NULL CHECK (reply_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
    AND length(reply_domain) <= 253 AND position('.' IN reply_domain) > 0),
  outcome text NOT NULL DEFAULT 'reserved' CHECK (outcome IN
    ('reserved', 'submitting', 'rejected', 'accepted', 'outcome_unknown', 'application_sent')),
  submitting_worker_id text,
  submitting_locked_at timestamptz,
  provider_message_id text CHECK (length(provider_message_id) <= 1024
    AND provider_message_id !~ '[[:cntrl:]]'),
  provider_accepted_at timestamptz,
  application_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (queue_id, review_revision, recipient_email, delivery_kind),
  CHECK (id = generation),
  CHECK ((outcome IN ('reserved')) OR
    (submitting_worker_id IS NOT NULL AND submitting_locked_at IS NOT NULL))
);
-- Snapshot ids deliberately have no cascading live FKs: queue resets/deletion
-- cannot erase provider acceptance/uncertainty. Retention is a later policy.
ALTER TABLE private.report_email_reply_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.report_email_reply_identities
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE private.report_email_reply_identities TO service_role;
CREATE POLICY report_email_reply_service_read
  ON private.report_email_reply_identities FOR SELECT TO service_role USING (true);

CREATE FUNCTION private.guard_report_email_reply_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Report email identity history is immutable' USING ERRCODE = '55000';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['outcome', 'submitting_worker_id', 'submitting_locked_at',
      'provider_message_id', 'provider_accepted_at', 'application_sent_at', 'updated_at'])
    IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['outcome', 'submitting_worker_id', 'submitting_locked_at',
      'provider_message_id', 'provider_accepted_at', 'application_sent_at', 'updated_at']) THEN
    RAISE EXCEPTION 'Report email identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_report_email_reply_identity()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER report_email_reply_identity_immutable
  BEFORE UPDATE OR DELETE ON private.report_email_reply_identities
  FOR EACH ROW EXECUTE FUNCTION private.guard_report_email_reply_identity();
CREATE TRIGGER report_email_reply_identity_no_truncate
  BEFORE TRUNCATE ON private.report_email_reply_identities
  FOR EACH STATEMENT EXECUTE FUNCTION private.guard_report_email_reply_identity();

-- Receiving durable ingestion does not exist in P1. Env/domain alone is never
-- proof of readiness. P2 must replace this only alongside a qualified receiver.
CREATE FUNCTION private.report_email_reply_receiving_ready()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION private.report_email_reply_receiving_ready()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.report_email_reply_receiving_ready() TO service_role;

CREATE FUNCTION private.reserve_report_email_reply_identity(
  p_queue_id uuid, p_ws_id uuid, p_report_id uuid, p_subject_user_id uuid,
  p_worker_id text, p_locked_at timestamptz, p_recipient_email text,
  p_review_revision bigint, p_delivery_kind text, p_generation uuid,
  p_token_digest bytea, p_token_ciphertext bytea, p_key_version integer,
  p_reply_domain text, p_content_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  report private.external_user_monthly_reports%ROWTYPE;
  queue private.user_report_email_queue%ROWTYPE;
  subject public.workspace_users%ROWTYPE;
  identity private.report_email_reply_identities%ROWTYPE;
BEGIN
  -- Lock order matches claim, approval, request and finish: report -> queue.
  SELECT r.* INTO report FROM private.external_user_monthly_reports r
    JOIN public.workspace_users u ON u.id = r.user_id AND u.ws_id = p_ws_id
    JOIN public.workspace_user_groups g ON g.id = r.group_id AND g.ws_id = p_ws_id
    WHERE r.id = p_report_id FOR UPDATE OF r;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report email identity scope mismatch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO queue FROM private.user_report_email_queue
    WHERE id = p_queue_id AND report_id = p_report_id FOR UPDATE;
  SELECT * INTO subject FROM public.workspace_users
    WHERE id = report.user_id AND ws_id = p_ws_id FOR SHARE;
  IF queue.id IS NULL OR queue.ws_id IS DISTINCT FROM p_ws_id
    OR queue.user_id IS DISTINCT FROM p_subject_user_id
    OR report.user_id IS DISTINCT FROM p_subject_user_id
    OR queue.status IS DISTINCT FROM 'processing'
    OR report.delivery_status IS DISTINCT FROM 'processing'
    OR queue.locked_by IS DISTINCT FROM p_worker_id
    OR queue.locked_at IS DISTINCT FROM p_locked_at
    OR p_locked_at IS NULL OR p_locked_at < clock_timestamp() - interval '15 minutes'
    OR p_worker_id IS NULL OR btrim(p_worker_id) = ''
    OR report.report_approval_status IS DISTINCT FROM 'APPROVED'
    OR report.review_revision IS DISTINCT FROM p_review_revision
    OR queue.delivery_kind IS DISTINCT FROM p_delivery_kind
    OR queue.recipient_email IS DISTINCT FROM p_recipient_email
    OR lower(btrim(subject.email)) IS DISTINCT FROM p_recipient_email
    OR p_recipient_email IS NULL OR p_recipient_email <> lower(btrim(p_recipient_email)) THEN
    RAISE EXCEPTION 'Report email identity fence mismatch' USING ERRCODE = '55000';
  END IF;
  -- An operator requeue or changed snapshot cannot undo an uncertain/accepted
  -- submission. Test and real sends are independent, never merged.
  IF EXISTS (SELECT 1 FROM private.report_email_reply_identities i
    WHERE i.ws_id = p_ws_id AND i.report_id = p_report_id AND i.delivery_kind = p_delivery_kind
      AND i.outcome IN ('submitting', 'accepted', 'outcome_unknown', 'application_sent')) THEN
    RAISE EXCEPTION 'Report email outcome forbids resending' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO identity FROM private.report_email_reply_identities
    WHERE queue_id = p_queue_id AND review_revision = p_review_revision
      AND recipient_email = p_recipient_email AND delivery_kind = p_delivery_kind;
  IF FOUND THEN
    IF identity.content_sha256 IS DISTINCT FROM p_content_sha256
      OR identity.ws_id IS DISTINCT FROM p_ws_id
      OR identity.report_id IS DISTINCT FROM p_report_id
      OR identity.subject_user_id IS DISTINCT FROM p_subject_user_id
      OR identity.reply_domain IS DISTINCT FROM p_reply_domain THEN
      RAISE EXCEPTION 'Report email retry snapshot mismatch' USING ERRCODE = '55000';
    END IF;
    RETURN to_jsonb(identity);
  END IF;
  INSERT INTO private.report_email_reply_identities
    (id, generation, ws_id, report_id, queue_id, subject_user_id, recipient_email,
     delivery_kind, review_revision, content_sha256, token_digest, token_ciphertext,
     key_version, reply_domain)
    VALUES (p_generation, p_generation, p_ws_id, p_report_id, p_queue_id,
      p_subject_user_id, p_recipient_email, p_delivery_kind, p_review_revision,
      p_content_sha256, p_token_digest, p_token_ciphertext, p_key_version, p_reply_domain)
    RETURNING * INTO identity;
  RETURN to_jsonb(identity);
END;
$$;
REVOKE ALL ON FUNCTION private.reserve_report_email_reply_identity(
  uuid, uuid, uuid, uuid, text, timestamptz, text, bigint, text, uuid,
  bytea, bytea, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.reserve_report_email_reply_identity(
  uuid, uuid, uuid, uuid, text, timestamptz, text, bigint, text, uuid,
  bytea, bytea, integer, text, text) TO service_role;

CREATE FUNCTION private.transition_report_email_reply_identity(
  p_identity_id uuid, p_ws_id uuid, p_worker_id text, p_locked_at timestamptz,
  p_outcome text, p_provider_message_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  snapshot private.report_email_reply_identities%ROWTYPE;
  identity private.report_email_reply_identities%ROWTYPE;
  report private.external_user_monthly_reports%ROWTYPE;
  queue private.user_report_email_queue%ROWTYPE;
  subject public.workspace_users%ROWTYPE;
BEGIN
  SELECT * INTO snapshot FROM private.report_email_reply_identities
    WHERE id = p_identity_id AND ws_id = p_ws_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report email identity scope mismatch' USING ERRCODE = '22023'; END IF;
  SELECT * INTO report FROM private.external_user_monthly_reports
    WHERE id = snapshot.report_id FOR UPDATE;
  SELECT * INTO queue FROM private.user_report_email_queue
    WHERE id = snapshot.queue_id FOR UPDATE;
  SELECT * INTO identity FROM private.report_email_reply_identities
    WHERE id = p_identity_id AND ws_id = p_ws_id FOR UPDATE;
  IF p_outcome IS NULL OR p_outcome NOT IN
    ('submitting', 'rejected', 'accepted', 'outcome_unknown', 'application_sent') THEN
    RAISE EXCEPTION 'Invalid report email identity outcome' USING ERRCODE = '22023';
  END IF;
  IF p_outcome = 'submitting' THEN
    SELECT * INTO subject FROM public.workspace_users
      WHERE id = identity.subject_user_id AND ws_id = p_ws_id FOR SHARE;
    IF identity.outcome NOT IN ('reserved', 'rejected')
      OR queue.status IS DISTINCT FROM 'processing'
      OR queue.ws_id IS DISTINCT FROM p_ws_id
      OR queue.report_id IS DISTINCT FROM identity.report_id
      OR queue.user_id IS DISTINCT FROM identity.subject_user_id
      OR queue.locked_by IS DISTINCT FROM p_worker_id
      OR queue.locked_at IS DISTINCT FROM p_locked_at
      OR p_locked_at IS NULL OR p_locked_at < clock_timestamp() - interval '15 minutes'
      OR p_worker_id IS NULL OR btrim(p_worker_id) = ''
      OR report.delivery_status IS DISTINCT FROM 'processing'
      OR report.report_approval_status IS DISTINCT FROM 'APPROVED'
      OR report.review_revision IS DISTINCT FROM identity.review_revision
      OR report.user_id IS DISTINCT FROM identity.subject_user_id
      OR NOT EXISTS (SELECT 1 FROM public.workspace_user_groups
        WHERE id = report.group_id AND ws_id = p_ws_id)
      OR queue.recipient_email IS DISTINCT FROM identity.recipient_email
      OR lower(btrim(subject.email)) IS DISTINCT FROM identity.recipient_email
      OR queue.delivery_kind IS DISTINCT FROM identity.delivery_kind
      OR EXISTS (SELECT 1 FROM private.report_email_reply_identities i
        WHERE i.ws_id = p_ws_id AND i.report_id = identity.report_id AND i.delivery_kind = identity.delivery_kind
          AND i.id <> identity.id AND i.outcome IN
          ('submitting', 'accepted', 'outcome_unknown', 'application_sent')) THEN
      RAISE EXCEPTION 'Report email submission fence mismatch' USING ERRCODE = '55000';
    END IF;
    UPDATE private.report_email_reply_identities SET outcome = 'submitting',
      submitting_worker_id = p_worker_id, submitting_locked_at = p_locked_at,
      updated_at = clock_timestamp() WHERE id = p_identity_id RETURNING * INTO identity;
  ELSE
    -- Durable outcomes belong to the lease that actually submitted, even after
    -- queue lease expiry, reclaim, recipient edits or parent deletion.
    IF identity.submitting_worker_id IS DISTINCT FROM p_worker_id
      OR identity.submitting_locked_at IS DISTINCT FROM p_locked_at
      OR p_worker_id IS NULL OR p_locked_at IS NULL THEN
      RAISE EXCEPTION 'Report email submission lease mismatch' USING ERRCODE = '55000';
    END IF;
    IF (p_outcome = 'rejected' AND identity.outcome <> 'submitting')
      OR (p_outcome = 'outcome_unknown' AND identity.outcome NOT IN ('submitting', 'outcome_unknown'))
      OR (p_outcome = 'accepted' AND identity.outcome NOT IN ('submitting', 'outcome_unknown', 'accepted'))
      OR (p_outcome = 'application_sent' AND identity.outcome NOT IN ('accepted', 'application_sent')) THEN
      RAISE EXCEPTION 'Report email outcome transition forbidden' USING ERRCODE = '55000';
    END IF;
    IF identity.provider_message_id IS NOT NULL AND p_provider_message_id IS NOT NULL
      AND identity.provider_message_id <> p_provider_message_id THEN
      RAISE EXCEPTION 'Report email provider identity mismatch' USING ERRCODE = '55000';
    END IF;
    UPDATE private.report_email_reply_identities SET outcome = p_outcome,
      provider_message_id = coalesce(provider_message_id, p_provider_message_id),
      provider_accepted_at = CASE WHEN p_outcome = 'accepted'
        THEN coalesce(provider_accepted_at, clock_timestamp()) ELSE provider_accepted_at END,
      application_sent_at = CASE WHEN p_outcome = 'application_sent'
        THEN coalesce(application_sent_at, clock_timestamp()) ELSE application_sent_at END,
      updated_at = clock_timestamp() WHERE id = p_identity_id RETURNING * INTO identity;
  END IF;
  RETURN to_jsonb(identity);
END;
$$;
REVOKE ALL ON FUNCTION private.transition_report_email_reply_identity(
  uuid, uuid, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.transition_report_email_reply_identity(
  uuid, uuid, text, timestamptz, text, text) TO service_role;
