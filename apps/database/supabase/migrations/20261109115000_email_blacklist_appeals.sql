-- Placeholder version: assign above the latest applied migration at merge.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.email_blacklist_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  recipient_id uuid REFERENCES auth.users(id),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_hash text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  suppression jsonb NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'waiting_recipient' CHECK (status IN ('waiting_recipient','verifying','dispatching','sent','confirmed','failed','unknown','expired','reblocked','unavailable')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
  confirmed_at timestamptz,
  dispatched_at timestamptz,
  verification_started_at timestamptz,
  provider_generation text,
  transport_binding jsonb,
  dispatch_id uuid UNIQUE,
  provider_message_id text,
  cooldown_until timestamptz NOT NULL DEFAULT clock_timestamp() + interval '48 hours'
);
CREATE INDEX email_blacklist_appeals_workspace_time ON private.email_blacklist_appeals(ws_id, created_at DESC);
CREATE INDEX email_blacklist_appeals_address_time ON private.email_blacklist_appeals(email, created_at DESC);
CREATE INDEX email_blacklist_appeals_event_hash ON private.email_blacklist_appeals(email_hash);
CREATE UNIQUE INDEX email_blacklist_appeals_provider_message ON private.email_blacklist_appeals((transport_binding->>'account_id'),(transport_binding->>'region'),provider_message_id) WHERE provider_message_id IS NOT NULL;
ALTER TABLE private.email_blacklist_appeals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_blacklist_appeals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.email_blacklist_appeals TO service_role;

CREATE TABLE private.email_blacklist_appeal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES private.email_blacklist_appeals(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.email_blacklist_appeal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_blacklist_appeal_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON private.email_blacklist_appeal_events TO service_role;

CREATE TABLE private.email_appeal_transport_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  binding jsonb,
  provider_policy_approved boolean NOT NULL DEFAULT false,
  report_policy_approved boolean NOT NULL DEFAULT false,
  report_binding jsonb
);
INSERT INTO private.email_appeal_transport_control(id) VALUES (true);
ALTER TABLE private.email_appeal_transport_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_appeal_transport_control FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON private.email_appeal_transport_control TO service_role;

CREATE TABLE private.email_appeal_feedback (
  account_id text NOT NULL,
  region text NOT NULL,
  event_id text NOT NULL,
  appeal_id uuid NOT NULL REFERENCES private.email_blacklist_appeals(id) ON DELETE CASCADE,
  dispatch_id uuid NOT NULL,
  dispatch_kind text NOT NULL CHECK (dispatch_kind IN ('confirmation','report')),
  message_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('bounce','complaint')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (account_id,region,event_id)
);
ALTER TABLE private.email_appeal_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_appeal_feedback FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON private.email_appeal_feedback TO service_role;

CREATE TABLE private.email_appeal_provider_status (
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  status jsonb NOT NULL,
  generation uuid NOT NULL DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (ws_id,email)
);
ALTER TABLE private.email_appeal_provider_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_appeal_provider_status FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.email_appeal_provider_status TO service_role;

CREATE TABLE private.email_appeal_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.email_appeal_inventory_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_appeal_inventory_reservations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON private.email_appeal_inventory_reservations TO service_role;

CREATE TABLE private.email_appeal_report_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES private.email_blacklist_appeals(id) ON DELETE CASCADE,
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  queue_id uuid NOT NULL UNIQUE,
  generation text NOT NULL,
  provider_generation text NOT NULL CHECK (provider_generation ~ '^[a-f0-9]{64}$'),
  binding jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  locked_by text NOT NULL,
  locked_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'dispatching' CHECK (status IN ('dispatching','sent','failed','unknown','reblocked')),
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.email_appeal_report_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.email_appeal_report_dispatches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private.email_appeal_report_dispatches TO service_role;

CREATE FUNCTION private.email_appeal_verified_recipient(p_actor_id uuid,p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_actor_id
  AND lower(btrim(u.email)) = p_email AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL AND NOT coalesce(u.is_anonymous,false)
  AND (u.banned_until IS NULL OR u.banned_until <= now())) $$;

CREATE FUNCTION private.email_appeal_hash(p_email text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT substr(encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex'), 1, 16) $$;

CREATE FUNCTION private.email_appeal_claims_match(p_row private.email_blacklist_appeals,p_claims jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT coalesce(p_claims = jsonb_build_object('appealId',p_row.id,'wsId',p_row.ws_id,
  'recipientHash',encode(sha256(convert_to(p_row.email,'UTF8')),'hex'),
  'purpose','workspace_report_reenable','generation',p_row.suppression->>'fingerprint',
  'expiresAt',floor(extract(epoch FROM p_row.expires_at)*1000)::bigint),false) $$;

CREATE FUNCTION private.email_appeal_admin(p_ws_id uuid, p_actor_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT public.is_org_member(p_actor_id, p_ws_id)
  AND public.has_workspace_permission(p_ws_id, p_actor_id, 'admin') $$;

CREATE FUNCTION private.email_appeal_recipient(p_ws_id uuid, p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.workspace_users WHERE ws_id = p_ws_id AND lower(btrim(email)) = p_email)
  OR EXISTS (SELECT 1 FROM public.email_audit a WHERE a.ws_id = p_ws_id AND p_email = ANY(
    ARRAY(SELECT lower(btrim(e)) FROM unnest(a.to_addresses || a.cc_addresses || a.bcc_addresses) e))) $$;

CREATE FUNCTION private.email_appeal_suppression(p_email text,p_ws_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_entry record; v_event record; v_ids text; v_soft integer; v_reason text; v_provider private.email_appeal_provider_status;
BEGIN
  SELECT * INTO v_provider FROM private.email_appeal_provider_status WHERE ws_id = p_ws_id AND email = p_email;
  SELECT * INTO v_entry FROM public.email_blacklist
  WHERE (entry_type = 'email' AND value = p_email)
    OR (entry_type = 'domain' AND value = split_part(p_email, '@', 2))
  ORDER BY (entry_type = 'domain' OR coalesce(reason,'') NOT IN ('ses_hard_bounce','ses_complaint','ses_soft_bounce_threshold')) DESC, created_at DESC LIMIT 1;
  SELECT * INTO v_event FROM private.email_bounce_complaints
  WHERE email_hash = private.email_appeal_hash(p_email)
    AND (event_type = 'complaint' OR bounce_type = 'hard' OR (bounce_type = 'soft' AND created_at > now() - interval '7 days'))
  ORDER BY (event_type = 'complaint') DESC, (bounce_type = 'hard') DESC NULLS LAST, created_at DESC, id DESC LIMIT 1;
  SELECT count(*) INTO v_soft FROM private.email_bounce_complaints
  WHERE email_hash = private.email_appeal_hash(p_email) AND bounce_type = 'soft' AND created_at > now() - interval '7 days';
  SELECT string_agg(id::text, ',' ORDER BY id) INTO v_ids FROM private.email_bounce_complaints
  WHERE email_hash = private.email_appeal_hash(p_email) AND (event_type = 'complaint' OR bounce_type IN ('hard','soft'));
  v_reason := CASE WHEN v_entry.id IS NOT NULL AND (v_entry.entry_type = 'domain' OR coalesce(v_entry.reason,'manual') NOT IN ('ses_hard_bounce','ses_complaint','ses_soft_bounce_threshold')) THEN coalesce(v_entry.reason,'manual')
    WHEN v_event.event_type = 'complaint' OR (v_provider.status->>'suppressed' = 'true' AND v_provider.status->>'reason' = 'COMPLAINT') THEN 'ses_complaint'
    WHEN v_entry.id IS NOT NULL THEN v_entry.reason
    WHEN EXISTS (SELECT 1 FROM private.email_bounce_complaints WHERE email_hash = private.email_appeal_hash(p_email) AND bounce_type = 'hard') THEN 'ses_hard_bounce'
    WHEN v_soft >= 3 THEN 'ses_soft_bounce_threshold'
    WHEN v_provider.status->>'suppressed' = 'true' THEN 'ses_hard_bounce' ELSE NULL END;
  IF v_reason IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('reason',v_reason,
    'blocked_at',coalesce(v_entry.created_at,v_event.created_at,v_provider.checked_at),
    'source_event',coalesce(v_event.id::text,v_entry.id::text,'ses-provider:' || v_provider.generation::text),
    'fingerprint',md5(coalesce(v_ids,'') || coalesce(v_entry.id::text,'') || coalesce(v_entry.updated_at::text,'') || coalesce(v_provider.generation::text,'') || v_reason),
    'appealable',coalesce(v_entry.entry_type::text,'email') = 'email' AND v_reason IN ('ses_hard_bounce','ses_complaint','ses_soft_bounce_threshold'));
END;
$$;

CREATE FUNCTION public.email_appeal_list(p_ws_id uuid, p_actor_id uuid, p_search text DEFAULT '', p_offset integer DEFAULT 0, p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT private.email_appeal_admin(p_ws_id,p_actor_id) THEN RAISE EXCEPTION 'email_appeal_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_offset < 0 OR p_offset > 100000 OR p_limit NOT BETWEEN 1 AND 25 OR length(p_search) > 254 THEN RAISE EXCEPTION 'email_appeal_invalid_request'; END IF;
  WITH known_recipients AS (
    SELECT lower(btrim(email)) email FROM public.workspace_users WHERE ws_id = p_ws_id AND email IS NOT NULL
    UNION SELECT lower(btrim(e)) FROM public.email_audit a CROSS JOIN LATERAL unnest(a.to_addresses || a.cc_addresses || a.bcc_addresses) e WHERE a.ws_id = p_ws_id
  ), recipients AS (
    SELECT email FROM known_recipients WHERE strpos(email,lower(p_search)) > 0 ORDER BY email OFFSET p_offset LIMIT p_limit
  ), blocked AS (
    SELECT r.email, private.email_appeal_suppression(r.email,p_ws_id) suppression FROM recipients r
  ), rows AS (
    SELECT b.email, b.suppression, a.status, a.cooldown_until FROM blocked b
    LEFT JOIN LATERAL (SELECT CASE WHEN status IN ('waiting_recipient','verifying','sent') AND expires_at <= clock_timestamp()
      THEN 'expired' ELSE status END AS status,cooldown_until FROM private.email_blacklist_appeals
      WHERE ws_id = p_ws_id AND email = b.email ORDER BY created_at DESC LIMIT 1) a ON true
    WHERE b.suppression IS NOT NULL
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM known_recipients WHERE strpos(email,lower(p_search)) > 0),'entries',coalesce((
    SELECT jsonb_agg(jsonb_build_object('email',email,'reason',suppression->>'reason','blocked_at',suppression->'blocked_at',
      'source_event',suppression->'source_event','appealable',suppression->'appealable','status',status,'cooldown_until',cooldown_until))
    FROM (SELECT * FROM rows ORDER BY email) page),'[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.email_appeal_request(p_ws_id uuid, p_actor_id uuid, p_email text, p_reason text, p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_email text := lower(btrim(p_email)); v_suppression jsonb; v_row private.email_blacklist_appeals; v_prior private.email_blacklist_appeals;
BEGIN
  IF NOT private.email_appeal_admin(p_ws_id,p_actor_id) THEN RAISE EXCEPTION 'email_appeal_forbidden' USING ERRCODE = '42501'; END IF;
  IF length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 OR p_token_hash !~ '^[a-f0-9]{64}$' OR p_reason IS NULL OR p_token_hash IS NULL THEN RAISE EXCEPTION 'email_appeal_invalid_request'; END IF;
  IF NOT private.email_appeal_recipient(p_ws_id,v_email) THEN RAISE EXCEPTION 'email_appeal_recipient'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-address:' || v_email,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-workspace:' || p_ws_id::text,0));
  v_suppression := private.email_appeal_suppression(v_email,p_ws_id);
  IF v_suppression IS NULL OR NOT (v_suppression->>'appealable')::boolean THEN RAISE EXCEPTION 'email_appeal_not_appealable'; END IF;
  SELECT * INTO v_prior FROM private.email_blacklist_appeals WHERE email = v_email ORDER BY created_at DESC LIMIT 1;
  IF v_prior.status IN ('unknown','dispatching') THEN RAISE EXCEPTION 'email_appeal_cooldown'; END IF;
  IF v_prior.cooldown_until > clock_timestamp() OR (v_prior.status IN ('waiting_recipient','verifying','dispatching','sent') AND v_prior.expires_at > clock_timestamp()) THEN RAISE EXCEPTION 'email_appeal_cooldown'; END IF;
  IF (SELECT count(*) FROM private.email_blacklist_appeals WHERE ws_id = p_ws_id AND created_at > clock_timestamp() - interval '24 hours') >= 10 THEN RAISE EXCEPTION 'email_appeal_workspace_limit'; END IF;
  IF (SELECT count(*) FROM private.email_blacklist_appeals WHERE email = v_email AND created_at > clock_timestamp() - interval '7 days') >= 3 THEN RAISE EXCEPTION 'email_appeal_address_limit'; END IF;
  INSERT INTO private.email_blacklist_appeals(ws_id,actor_id,email,email_hash,reason,suppression,token_hash)
  VALUES(p_ws_id,p_actor_id,v_email,private.email_appeal_hash(v_email),btrim(p_reason),v_suppression,p_token_hash) RETURNING * INTO v_row;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,'requested');
  RETURN jsonb_build_object('id',v_row.id,'email',v_email,'reason',v_suppression->>'reason','status',v_row.status,'expires_at',v_row.expires_at);
END;
$$;

CREATE FUNCTION public.email_appeal_recipient_view(p_appeal_id uuid,p_actor_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_row private.email_blacklist_appeals; v_name text;
BEGIN
  SELECT * INTO v_row FROM private.email_blacklist_appeals WHERE id = p_appeal_id;
  IF v_row.id IS NULL OR NOT private.email_appeal_verified_recipient(p_actor_id,v_row.email) THEN
    RAISE EXCEPTION 'email_appeal_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM public.workspaces WHERE id = v_row.ws_id;
  RETURN jsonb_build_object('id',v_row.id,'ws_id',v_row.ws_id,'email',v_row.email,'reason',v_row.suppression->>'reason',
    'expires_at',v_row.expires_at,'workspace_name',v_name,'suppression',v_row.suppression,'generation',v_row.suppression->>'fingerprint','status',v_row.status);
END;
$$;

CREATE FUNCTION public.email_appeal_claim_bootstrap(p_id uuid,p_actor_id uuid,p_token_hash text,p_claims jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_row private.email_blacklist_appeals; v_suppression jsonb; v_status text;
BEGIN
  SELECT * INTO v_row FROM private.email_blacklist_appeals WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL OR NOT private.email_appeal_verified_recipient(p_actor_id,v_row.email) THEN
    RAISE EXCEPTION 'email_appeal_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'waiting_recipient' OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
    OR p_token_hash = v_row.token_hash OR NOT private.email_appeal_claims_match(v_row,p_claims) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-global-verification',0));
  v_suppression := private.email_appeal_suppression(v_row.email,v_row.ws_id);
  v_status := CASE WHEN v_row.expires_at <= clock_timestamp() THEN 'expired'
    WHEN v_suppression IS NULL OR v_suppression->>'fingerprint' IS DISTINCT FROM v_row.suppression->>'fingerprint' THEN 'reblocked'
    WHEN NOT EXISTS (SELECT 1 FROM public.workspace_secrets WHERE ws_id = v_row.ws_id AND name = 'email_blacklist_appeals' AND value = 'true') THEN 'unavailable'
    WHEN (SELECT count(*) FROM private.email_blacklist_appeals WHERE verification_started_at > clock_timestamp() - interval '1 hour') >= 20 THEN 'unavailable'
    ELSE 'verifying' END;
  UPDATE private.email_blacklist_appeals SET status = v_status,recipient_id = p_actor_id,
    verification_started_at = CASE WHEN v_status = 'verifying' THEN clock_timestamp() END,
    token_hash = CASE WHEN v_status = 'verifying' THEN p_token_hash ELSE token_hash END
  WHERE id = v_row.id;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,v_status);
  RETURN jsonb_build_object('status',v_status,'id',v_row.id,'ws_id',v_row.ws_id,'email',v_row.email,
    'reason',v_row.suppression->>'reason','expires_at',v_row.expires_at);
END;
$$;

CREATE FUNCTION public.email_appeal_claim_delivery(p_id uuid,p_binding jsonb DEFAULT NULL,p_provider_generation text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_row private.email_blacklist_appeals; v_suppression jsonb; v_status text;
BEGIN
  SELECT * INTO v_row FROM private.email_blacklist_appeals WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF v_row.status IN ('reblocked','expired') THEN RETURN jsonb_build_object('status',v_row.status); END IF;
  IF v_row.status <> 'verifying' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-global-transport',0));
  v_suppression := private.email_appeal_suppression(v_row.email,v_row.ws_id);
  v_status := CASE
    WHEN v_row.expires_at <= clock_timestamp() THEN 'expired'
    WHEN v_suppression IS NULL OR v_suppression->>'fingerprint' IS DISTINCT FROM v_row.suppression->>'fingerprint'
      OR NOT private.email_appeal_verified_recipient(v_row.recipient_id,v_row.email) THEN 'reblocked'
    WHEN NOT EXISTS (SELECT 1 FROM public.workspace_secrets WHERE ws_id = v_row.ws_id AND name = 'email_blacklist_appeals' AND value = 'true') THEN 'failed'
    WHEN NOT EXISTS (SELECT 1 FROM private.email_appeal_provider_status WHERE ws_id = v_row.ws_id AND email = v_row.email
      AND checked_at > clock_timestamp() - interval '10 minutes'
      AND status->>'provider_generation' = p_provider_generation
      AND ((status->>'account_id' = p_binding->>'source_account_id' AND status->>'region' = p_binding->>'source_region')
        OR (status->>'account_id' = p_binding->>'account_id' AND status->>'region' = p_binding->>'region'))) THEN 'unavailable'
    WHEN p_provider_generation IS NULL OR p_provider_generation !~ '^[a-f0-9]{64}$'
      OR p_binding IS NULL OR p_binding->>'purpose' IS DISTINCT FROM 'workspace_report_reenable'
      OR p_binding->>'account_id' IS NOT DISTINCT FROM p_binding->>'source_account_id'
      OR NOT EXISTS (SELECT 1 FROM private.email_appeal_transport_control WHERE enabled AND provider_policy_approved AND binding = p_binding) THEN 'unavailable'
    WHEN (SELECT count(*) FROM private.email_blacklist_appeals WHERE dispatched_at > clock_timestamp() - interval '1 hour')
      + (SELECT count(*) FROM private.email_appeal_report_dispatches WHERE created_at > clock_timestamp() - interval '1 hour') >= 20 THEN 'unavailable'
    ELSE 'dispatching' END;
  UPDATE private.email_blacklist_appeals SET status = v_status,
    dispatched_at = CASE WHEN v_status = 'dispatching' THEN clock_timestamp() END,
    dispatch_id = CASE WHEN v_status = 'dispatching' THEN gen_random_uuid() END,
    transport_binding = CASE WHEN v_status = 'dispatching' THEN p_binding END,
    provider_generation = CASE WHEN v_status = 'dispatching' THEN p_provider_generation END,
    cooldown_until = CASE WHEN v_status = 'dispatching' THEN cooldown_until ELSE clock_timestamp() + interval '48 hours' END
  WHERE id = v_row.id;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,v_status);
  RETURN (SELECT jsonb_build_object('status',CASE WHEN v_status = 'failed' THEN 'invalid' ELSE v_status END,'dispatch_id',dispatch_id) FROM private.email_blacklist_appeals WHERE id = v_row.id);
END;
$$;

CREATE FUNCTION public.email_appeal_mark_delivery(p_id uuid,p_outcome text,p_message_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','failed','unknown','unavailable')
    OR (p_outcome = 'sent' AND (p_message_id IS NULL OR length(btrim(p_message_id)) NOT BETWEEN 1 AND 200)) THEN RAISE EXCEPTION 'email_appeal_invalid_request'; END IF;
  UPDATE private.email_blacklist_appeals SET status = CASE WHEN status = 'reblocked' AND p_outcome <> 'unknown' THEN status ELSE p_outcome END,
    provider_message_id = coalesce(provider_message_id,p_message_id),
    cooldown_until = CASE WHEN p_outcome = 'sent' THEN cooldown_until ELSE greatest(cooldown_until,clock_timestamp() + interval '48 hours') END
  WHERE id = p_id AND (provider_message_id IS NULL OR p_message_id IS NULL OR provider_message_id = p_message_id) AND (
    (status = 'dispatching' AND p_outcome IN ('sent','failed','unknown'))
    OR (status = 'reblocked' AND dispatched_at IS NOT NULL AND p_outcome IN ('sent','failed','unknown'))
    OR (status = 'verifying' AND p_outcome IN ('failed','unavailable'))
  ) RETURNING status INTO v_status;
  IF v_status IS NULL THEN RAISE EXCEPTION 'email_appeal_delivery_state'; END IF;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(p_id,p_outcome);
  RETURN jsonb_build_object('status',v_status);
END;
$$;

CREATE FUNCTION public.email_appeal_preview(p_token_hash text,p_claims jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_row private.email_blacklist_appeals; v_suppression jsonb; v_name text;
BEGIN
  SELECT * INTO v_row FROM private.email_blacklist_appeals WHERE token_hash = p_token_hash;
  IF v_row.id IS NULL OR v_row.status <> 'sent' OR NOT private.email_appeal_claims_match(v_row,p_claims)
    OR NOT private.email_appeal_verified_recipient(v_row.recipient_id,v_row.email) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF v_row.expires_at <= clock_timestamp() THEN RETURN jsonb_build_object('status','expired'); END IF;
  v_suppression := private.email_appeal_suppression(v_row.email,v_row.ws_id);
  IF v_suppression IS NULL OR v_suppression->>'fingerprint' IS DISTINCT FROM v_row.suppression->>'fingerprint' THEN RETURN jsonb_build_object('status','reblocked'); END IF;
  SELECT name INTO v_name FROM public.workspaces WHERE id = v_row.ws_id;
  RETURN jsonb_build_object('status','ready','workspace_name',v_name,'email',v_row.email);
END;
$$;

CREATE FUNCTION public.email_appeal_confirm(p_token_hash text,p_claims jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_row private.email_blacklist_appeals; v_suppression jsonb; v_status text;
BEGIN
  SELECT * INTO v_row FROM private.email_blacklist_appeals WHERE token_hash = p_token_hash FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'sent' OR NOT private.email_appeal_claims_match(v_row,p_claims)
    OR NOT private.email_appeal_verified_recipient(v_row.recipient_id,v_row.email) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  v_suppression := private.email_appeal_suppression(v_row.email,v_row.ws_id);
  v_status := CASE WHEN v_row.expires_at <= clock_timestamp() THEN 'expired'
    WHEN v_suppression IS NULL OR v_suppression->>'fingerprint' IS DISTINCT FROM v_row.suppression->>'fingerprint' THEN 'reblocked'
    WHEN NOT EXISTS (SELECT 1 FROM public.workspace_secrets WHERE ws_id = v_row.ws_id AND name = 'email_blacklist_appeals' AND value = 'true') THEN 'unavailable'
    ELSE 'confirmed' END;
  UPDATE private.email_blacklist_appeals SET status = v_status,
    confirmed_at = CASE WHEN v_status = 'confirmed' THEN clock_timestamp() END,
    cooldown_until = CASE WHEN v_status = 'confirmed' THEN cooldown_until ELSE clock_timestamp() + interval '48 hours' END
  WHERE id = v_row.id;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,v_status);
  RETURN jsonb_build_object('status',v_status,'ws_id',v_row.ws_id,'email',v_row.email);
END;
$$;

CREATE FUNCTION public.email_appeal_block_statuses(p_ws_id uuid,p_emails text[]) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('email',e.email,'has_workspace_grant',EXISTS (
    SELECT 1 FROM private.email_blacklist_appeals a WHERE a.ws_id = p_ws_id AND a.email = e.email AND a.status = 'confirmed'
      AND (s.value->>'appealable')::boolean AND a.suppression->>'fingerprint' = s.value->>'fingerprint'
      AND EXISTS (SELECT 1 FROM public.workspace_secrets f WHERE f.ws_id = p_ws_id AND f.name = 'email_blacklist_appeals' AND f.value = 'true')),
    'is_blocked',s.value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.email_blacklist_appeals a WHERE a.ws_id = p_ws_id AND a.email = e.email
      AND EXISTS (SELECT 1 FROM public.workspace_secrets f WHERE f.ws_id = p_ws_id AND f.name = 'email_blacklist_appeals' AND f.value = 'true')
      AND a.status = 'confirmed' AND (s.value->>'appealable')::boolean
      AND a.suppression->>'fingerprint' = s.value->>'fingerprint'), 'reason',s.value->>'reason')),'[]'::jsonb)
  FROM (SELECT DISTINCT lower(btrim(input)) email FROM unnest(p_emails) input) e
  CROSS JOIN LATERAL (SELECT private.email_appeal_suppression(e.email,p_ws_id) value) s
$$;

CREATE FUNCTION public.email_appeal_transport_binding() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT binding FROM private.email_appeal_transport_control WHERE enabled AND provider_policy_approved $$;

CREATE FUNCTION public.email_appeal_feedback_bindings() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT coalesce(jsonb_agg(value),'[]'::jsonb) FROM (
  SELECT value FROM (
    SELECT binding value,clock_timestamp() observed_at FROM private.email_appeal_transport_control WHERE provider_policy_approved
    UNION ALL SELECT report_binding,clock_timestamp() FROM private.email_appeal_transport_control WHERE provider_policy_approved AND report_policy_approved
      AND report_binding->>'account_id' = binding->>'account_id' AND report_binding->>'region' = binding->>'region'
      AND report_binding->>'purpose' = 'workspace_report'
    UNION ALL SELECT transport_binding,dispatched_at FROM private.email_blacklist_appeals
      WHERE transport_binding IS NOT NULL AND (provider_message_id IS NOT NULL OR status = 'unknown')
    UNION ALL SELECT binding,created_at FROM private.email_appeal_report_dispatches
  ) history WHERE value IS NOT NULL GROUP BY value ORDER BY max(observed_at) DESC,value::text LIMIT 32
) bindings $$;

CREATE FUNCTION public.email_appeal_recipient_candidates(p_ws_id uuid,p_actor_id uuid,p_search text DEFAULT '',p_offset integer DEFAULT 0,p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_result jsonb; v_count integer;
BEGIN
  IF NOT private.email_appeal_admin(p_ws_id,p_actor_id) THEN RAISE EXCEPTION 'email_appeal_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_offset < 0 OR p_offset > 100000 OR p_limit NOT BETWEEN 1 AND 25 OR length(p_search) > 254 THEN RAISE EXCEPTION 'email_appeal_invalid_request'; END IF;
  IF public.email_appeal_transport_binding() IS NULL THEN RAISE EXCEPTION 'email_appeal_unavailable'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-global-inventory',0));
  WITH recipients AS (
    SELECT lower(btrim(email)) email FROM public.workspace_users WHERE ws_id = p_ws_id AND email IS NOT NULL
    UNION SELECT lower(btrim(e)) FROM public.email_audit a CROSS JOIN LATERAL unnest(a.to_addresses || a.cc_addresses || a.bcc_addresses) e WHERE a.ws_id = p_ws_id
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM recipients WHERE strpos(email,lower(p_search)) > 0),
    'entries',coalesce(jsonb_agg(email),'[]'::jsonb)) INTO v_result
    FROM (SELECT email FROM recipients WHERE strpos(email,lower(p_search)) > 0 ORDER BY email OFFSET p_offset LIMIT p_limit) page;
  v_count := jsonb_array_length(v_result->'entries');
  IF (SELECT count(*) FROM private.email_appeal_inventory_reservations WHERE created_at > clock_timestamp() - interval '1 hour') + v_count > 100 THEN RAISE EXCEPTION 'email_appeal_inventory_limit'; END IF;
  INSERT INTO private.email_appeal_inventory_reservations(ws_id,actor_id) SELECT p_ws_id,p_actor_id FROM generate_series(1,v_count);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.email_appeal_record_provider_status(p_ws_id uuid,p_actor_id uuid,p_email text,p_status_json jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_email text := lower(btrim(p_email)); v_binding jsonb; v_row record; v_previous jsonb; v_count integer;
BEGIN
  IF NOT private.email_appeal_admin(p_ws_id,p_actor_id) AND NOT EXISTS (
    SELECT 1 FROM private.email_blacklist_appeals WHERE ws_id = p_ws_id AND email = v_email AND recipient_id = p_actor_id
      AND status = 'verifying' AND private.email_appeal_verified_recipient(p_actor_id,v_email)
  ) THEN RAISE EXCEPTION 'email_appeal_forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT private.email_appeal_recipient(p_ws_id,v_email) THEN RAISE EXCEPTION 'email_appeal_recipient'; END IF;
  v_binding := public.email_appeal_transport_binding();
  IF v_binding IS NULL OR p_status_json IS NULL
    OR ((p_status_json->>'account_id' = v_binding->>'source_account_id' AND p_status_json->>'region' = v_binding->>'source_region')
      OR (p_status_json->>'account_id' = v_binding->>'account_id' AND p_status_json->>'region' = v_binding->>'region')) IS NOT TRUE
    OR jsonb_typeof(p_status_json->'suppressed') IS DISTINCT FROM 'boolean'
    OR coalesce(p_status_json->>'provider_generation','') !~ '^[a-f0-9]{64}$'
    OR (p_status_json->>'suppressed' = 'true' AND coalesce(p_status_json->>'reason','') NOT IN ('BOUNCE','COMPLAINT')) THEN RAISE EXCEPTION 'email_appeal_inventory_unknown'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-address:' || v_email,0));
  SELECT status INTO v_previous FROM private.email_appeal_provider_status WHERE ws_id = p_ws_id AND email = v_email;
  INSERT INTO private.email_appeal_provider_status(ws_id,email,status) VALUES(p_ws_id,v_email,p_status_json)
    ON CONFLICT (ws_id,email) DO UPDATE SET status = excluded.status,checked_at = clock_timestamp(),
      generation = CASE WHEN email_appeal_provider_status.status = excluded.status THEN email_appeal_provider_status.generation ELSE gen_random_uuid() END;
  IF v_previous IS DISTINCT FROM p_status_json THEN
    FOR v_row IN SELECT id FROM private.email_blacklist_appeals WHERE ws_id = p_ws_id AND email = v_email
      AND status IN ('waiting_recipient','verifying','dispatching','sent','confirmed') ORDER BY id FOR UPDATE
    LOOP
      SELECT count(*) INTO v_count FROM private.email_blacklist_appeals WHERE email = v_email AND status = 'reblocked';
      UPDATE private.email_blacklist_appeals SET status = 'reblocked',cooldown_until = clock_timestamp() + interval '48 hours' * power(2,least(v_count,5)) WHERE id = v_row.id;
      INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,'provider_status_changed');
    END LOOP;
  END IF;
  RETURN jsonb_build_object('status','recorded');
END;
$$;

CREATE FUNCTION public.email_appeal_authorize_dispatch(p_id uuid,p_ws_id uuid,p_email text,p_generation text,p_provider_generation text,p_binding jsonb,p_dispatch_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM private.email_blacklist_appeals a
  JOIN private.email_appeal_transport_control c ON c.enabled AND c.provider_policy_approved AND c.binding = a.transport_binding
  WHERE a.id = p_id AND a.dispatch_id = p_dispatch_id AND a.ws_id = p_ws_id AND a.email = lower(btrim(p_email)) AND a.status = 'dispatching'
    AND a.expires_at > clock_timestamp() AND a.transport_binding = p_binding AND a.provider_generation = p_provider_generation
    AND private.email_appeal_verified_recipient(a.recipient_id,a.email)
    AND EXISTS (SELECT 1 FROM public.workspace_secrets f WHERE f.ws_id = p_ws_id AND f.name = 'email_blacklist_appeals' AND f.value = 'true')
    AND a.suppression->>'fingerprint' = p_generation
    AND a.suppression->>'fingerprint' = private.email_appeal_suppression(a.email,a.ws_id)->>'fingerprint') $$;

CREATE FUNCTION public.email_appeal_report_grant(p_ws_id uuid,p_email text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT jsonb_build_object('appeal_id',a.id,'generation',a.suppression->>'fingerprint','provider_generation',a.provider_generation,'binding',a.transport_binding,'report_binding',c.report_binding)
  FROM private.email_blacklist_appeals a JOIN private.email_appeal_transport_control c ON c.enabled AND c.provider_policy_approved AND c.report_policy_approved AND c.binding = a.transport_binding
    AND c.report_binding->>'purpose' = 'workspace_report' AND c.report_binding->>'account_id' = a.transport_binding->>'account_id'
    AND c.report_binding->>'region' = a.transport_binding->>'region'
  WHERE a.ws_id = p_ws_id AND a.email = lower(btrim(p_email)) AND a.status = 'confirmed'
    AND private.email_appeal_verified_recipient(a.recipient_id,a.email)
    AND EXISTS (SELECT 1 FROM public.workspace_secrets f WHERE f.ws_id = p_ws_id AND f.name = 'email_blacklist_appeals' AND f.value = 'true')
    AND a.suppression->>'fingerprint' = private.email_appeal_suppression(a.email,a.ws_id)->>'fingerprint'
  ORDER BY a.confirmed_at DESC LIMIT 1 $$;

CREATE FUNCTION public.email_appeal_claim_report(p_appeal_id uuid,p_ws_id uuid,p_email text,p_queue_id uuid,p_generation text,p_binding jsonb,p_content_hash text,p_provider_generation text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_grant jsonb; v_id uuid; v_report_id uuid; v_valid boolean;
BEGIN
  IF p_content_hash IS NULL OR p_content_hash !~ '^[a-f0-9]{64}$' OR p_provider_generation IS NULL OR p_provider_generation !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT report_id INTO v_report_id FROM private.user_report_email_queue WHERE id = p_queue_id;
  PERFORM id FROM private.external_user_monthly_reports WHERE id = v_report_id FOR SHARE;
  PERFORM id FROM private.user_report_email_queue WHERE id = p_queue_id FOR UPDATE;
  SELECT EXISTS (SELECT 1 FROM private.user_report_email_queue q
    JOIN private.external_user_monthly_reports r ON r.id = q.report_id AND r.user_id = q.user_id
    JOIN public.workspace_users u ON u.id = q.user_id AND u.ws_id = q.ws_id
    WHERE q.id = p_queue_id AND q.ws_id = p_ws_id AND q.status = 'processing' AND q.delivery_kind = 'send'
      AND q.locked_at > clock_timestamp() - interval '15 minutes' AND q.locked_by IS NOT NULL
      AND lower(btrim(u.email)) = lower(btrim(p_email)) AND r.report_approval_status = 'APPROVED') INTO v_valid;
  IF NOT v_valid THEN RETURN jsonb_build_object('status','invalid'); END IF;
  v_grant := public.email_appeal_report_grant(p_ws_id,p_email);
  IF v_grant IS NULL OR v_grant->>'appeal_id' IS DISTINCT FROM p_appeal_id::text
    OR v_grant->>'generation' IS DISTINCT FROM p_generation OR v_grant->>'provider_generation' IS DISTINCT FROM p_provider_generation
    OR v_grant->'report_binding' IS DISTINCT FROM p_binding THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-global-transport',0));
  IF EXISTS (SELECT 1 FROM private.email_appeal_report_dispatches d JOIN private.user_report_email_queue q ON q.id = d.queue_id
    WHERE q.report_id = v_report_id AND d.ws_id = p_ws_id AND d.email = lower(btrim(p_email))
      AND d.status IN ('unknown','dispatching')) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF (SELECT count(*) FROM private.email_blacklist_appeals WHERE dispatched_at > clock_timestamp() - interval '1 hour')
    + (SELECT count(*) FROM private.email_appeal_report_dispatches WHERE created_at > clock_timestamp() - interval '1 hour') >= 20 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  INSERT INTO private.email_appeal_report_dispatches(appeal_id,ws_id,email,queue_id,generation,provider_generation,binding,content_hash,locked_by,locked_at)
    SELECT p_appeal_id,p_ws_id,lower(btrim(p_email)),p_queue_id,p_generation,p_provider_generation,p_binding,p_content_hash,q.locked_by,q.locked_at
      FROM private.user_report_email_queue q WHERE q.id = p_queue_id
    ON CONFLICT (queue_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  RETURN jsonb_build_object('status','dispatching','id',v_id);
END;
$$;

CREATE FUNCTION public.email_appeal_mark_report(p_dispatch_id uuid,p_outcome text,p_message_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_status text; v_appeal_id uuid; v_email text; v_count integer;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','failed','unknown','reblocked') OR (p_outcome = 'sent' AND (p_message_id IS NULL OR length(btrim(p_message_id)) NOT BETWEEN 1 AND 200)) THEN RAISE EXCEPTION 'email_appeal_invalid_request'; END IF;
  UPDATE private.email_appeal_report_dispatches SET status = p_outcome,provider_message_id = coalesce(provider_message_id,p_message_id)
    WHERE id = p_dispatch_id AND status = 'dispatching' AND (provider_message_id IS NULL OR p_message_id IS NULL OR provider_message_id = p_message_id) RETURNING status,appeal_id,email INTO v_status,v_appeal_id,v_email;
  IF v_status IS NULL THEN RAISE EXCEPTION 'email_appeal_delivery_state'; END IF;
  IF p_outcome = 'reblocked' THEN
    SELECT count(*) INTO v_count FROM private.email_blacklist_appeals WHERE email = v_email AND status = 'reblocked';
    UPDATE private.email_blacklist_appeals SET status = 'reblocked',cooldown_until = clock_timestamp() + interval '48 hours' * power(2,least(v_count,5)) WHERE id = v_appeal_id AND status = 'confirmed';
    INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_appeal_id,'provider_generation_changed');
  END IF;
  RETURN jsonb_build_object('status',v_status);
END;
$$;

CREATE FUNCTION public.email_appeal_authorize_report_dispatch(p_dispatch_id uuid,p_ws_id uuid,p_email text,p_generation text,p_provider_generation text,p_binding jsonb) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM private.email_appeal_report_dispatches d
  JOIN private.user_report_email_queue q ON q.id = d.queue_id
  JOIN private.external_user_monthly_reports r ON r.id = q.report_id AND r.user_id = q.user_id
  JOIN public.workspace_users u ON u.id = q.user_id AND u.ws_id = q.ws_id
  WHERE d.id = p_dispatch_id AND d.ws_id = p_ws_id AND d.email = lower(btrim(p_email)) AND d.status = 'dispatching'
    AND d.generation = p_generation AND d.provider_generation = p_provider_generation AND d.binding = p_binding
    AND q.ws_id = d.ws_id AND q.status = 'processing' AND q.delivery_kind = 'send' AND q.locked_by = d.locked_by AND q.locked_at = d.locked_at AND q.locked_at > clock_timestamp() - interval '15 minutes'
    AND lower(btrim(u.email)) = d.email AND r.report_approval_status = 'APPROVED'
    AND public.email_appeal_report_grant(p_ws_id,p_email)->>'appeal_id' = d.appeal_id::text
    AND public.email_appeal_report_grant(p_ws_id,p_email)->>'generation' = p_generation
    AND public.email_appeal_report_grant(p_ws_id,p_email)->'report_binding' = p_binding) $$;

CREATE FUNCTION public.email_appeal_feedback(p_event_id text,p_message_id text,p_account_id text,p_region text,p_email text,p_ws_id uuid,p_event_type text,p_bounce_type text,p_appeal_id uuid,p_dispatch_id uuid,p_dispatch_kind text,p_identity text,p_configuration_set text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_id uuid; v_inserted uuid;
BEGIN
  IF p_event_id IS NULL OR length(p_event_id) NOT BETWEEN 1 AND 200 OR p_event_type IS NULL
    OR p_message_id IS NULL OR length(btrim(p_message_id)) NOT BETWEEN 1 AND 200
    OR p_dispatch_kind IS NULL OR p_dispatch_kind NOT IN ('confirmation','report')
    OR p_event_type NOT IN ('bounce','complaint') OR (p_event_type = 'bounce' AND coalesce(p_bounce_type,'') NOT IN ('hard','soft','transient')) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-appeal-address:' || lower(btrim(p_email)),0));
  -- A random durable dispatch tag binds feedback even when the send response is lost.
  IF p_dispatch_kind = 'confirmation' THEN
    SELECT id INTO v_id FROM private.email_blacklist_appeals WHERE id = p_appeal_id AND dispatch_id = p_dispatch_id AND dispatched_at IS NOT NULL
      AND (provider_message_id IS NULL OR provider_message_id = p_message_id)
      AND transport_binding->>'account_id' = p_account_id AND transport_binding->>'region' = p_region
      AND transport_binding->>'identity' = p_identity AND transport_binding->>'configuration_set' = p_configuration_set
      AND email = lower(btrim(p_email)) AND ws_id = p_ws_id FOR UPDATE;
  ELSE
    SELECT appeal_id INTO v_id FROM private.email_appeal_report_dispatches WHERE appeal_id = p_appeal_id AND id = p_dispatch_id
      AND (provider_message_id IS NULL OR provider_message_id = p_message_id)
      AND binding->>'account_id' = p_account_id AND binding->>'region' = p_region
      AND binding->>'identity' = p_identity AND binding->>'configuration_set' = p_configuration_set
      AND email = lower(btrim(p_email)) AND ws_id = p_ws_id FOR UPDATE;
  END IF;
  IF v_id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  INSERT INTO private.email_appeal_feedback(account_id,region,event_id,appeal_id,dispatch_id,dispatch_kind,message_id,event_type)
    VALUES(p_account_id,p_region,p_event_id,v_id,p_dispatch_id,p_dispatch_kind,p_message_id,p_event_type)
    ON CONFLICT DO NOTHING RETURNING appeal_id INTO v_inserted;
  IF v_inserted IS NULL THEN RETURN jsonb_build_object('status','duplicate'); END IF;
  IF p_dispatch_kind = 'confirmation' THEN
    UPDATE private.email_blacklist_appeals SET provider_message_id = coalesce(provider_message_id,p_message_id) WHERE id = v_id;
  ELSE
    UPDATE private.email_appeal_report_dispatches SET provider_message_id = coalesce(provider_message_id,p_message_id) WHERE id = p_dispatch_id;
  END IF;
  INSERT INTO private.email_bounce_complaints(email_hash,event_type,bounce_type)
    VALUES(private.email_appeal_hash(p_email),p_event_type,p_bounce_type);
  RETURN jsonb_build_object('status','recorded');
END;
$$;

CREATE FUNCTION private.email_appeal_reblock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_hash text; v_address text; v_domain text; v_row record; v_count integer;
BEGIN
  IF TG_TABLE_NAME = 'email_bounce_complaints' THEN
    IF NEW.event_type <> 'complaint' AND coalesce(NEW.bounce_type,'') NOT IN ('hard','soft') THEN RETURN NEW; END IF;
    v_hash := NEW.email_hash;
  ELSE
    IF NEW.entry_type = 'domain' THEN v_domain := NEW.value; ELSE v_address := NEW.value; END IF;
  END IF;
  FOR v_row IN SELECT * FROM private.email_blacklist_appeals
    WHERE status IN ('confirmed','waiting_recipient','verifying','dispatching','sent') AND (email_hash = v_hash OR email = v_address OR split_part(email,'@',2) = v_domain)
    ORDER BY id FOR UPDATE
  LOOP
    SELECT count(*) INTO v_count FROM private.email_blacklist_appeals WHERE email = v_row.email AND status = 'reblocked';
    UPDATE private.email_blacklist_appeals SET status = 'reblocked',
      cooldown_until = clock_timestamp() + interval '48 hours' * power(2,least(v_count,5)) WHERE id = v_row.id;
    INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,'reblocked');
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER email_appeal_bounce_reblock AFTER INSERT ON private.email_bounce_complaints FOR EACH ROW EXECUTE FUNCTION private.email_appeal_reblock();
CREATE TRIGGER email_appeal_blacklist_reblock AFTER INSERT OR UPDATE ON public.email_blacklist FOR EACH ROW EXECUTE FUNCTION private.email_appeal_reblock();

REVOKE ALL ON FUNCTION private.email_appeal_hash(text), private.email_appeal_admin(uuid,uuid), private.email_appeal_recipient(uuid,text), private.email_appeal_suppression(text,uuid), private.email_appeal_reblock(), private.email_appeal_verified_recipient(uuid,text), private.email_appeal_claims_match(private.email_blacklist_appeals,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_appeal_list(uuid,uuid,text,integer,integer), public.email_appeal_request(uuid,uuid,text,text,text), public.email_appeal_claim_delivery(uuid,jsonb,text), public.email_appeal_mark_delivery(uuid,text,text), public.email_appeal_confirm(text,jsonb), public.email_appeal_preview(text,jsonb), public.email_appeal_block_statuses(uuid,text[]), public.email_appeal_recipient_view(uuid,uuid), public.email_appeal_claim_bootstrap(uuid,uuid,text,jsonb), public.email_appeal_transport_binding(), public.email_appeal_feedback_bindings(), public.email_appeal_recipient_candidates(uuid,uuid,text,integer,integer), public.email_appeal_record_provider_status(uuid,uuid,text,jsonb), public.email_appeal_report_grant(uuid,text), public.email_appeal_authorize_dispatch(uuid,uuid,text,text,text,jsonb,uuid), public.email_appeal_claim_report(uuid,uuid,text,uuid,text,jsonb,text,text), public.email_appeal_mark_report(uuid,text,text), public.email_appeal_authorize_report_dispatch(uuid,uuid,text,text,text,jsonb), public.email_appeal_feedback(text,text,text,text,text,uuid,text,text,uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_appeal_list(uuid,uuid,text,integer,integer), public.email_appeal_request(uuid,uuid,text,text,text), public.email_appeal_claim_delivery(uuid,jsonb,text), public.email_appeal_mark_delivery(uuid,text,text), public.email_appeal_confirm(text,jsonb), public.email_appeal_preview(text,jsonb), public.email_appeal_block_statuses(uuid,text[]), public.email_appeal_recipient_view(uuid,uuid), public.email_appeal_claim_bootstrap(uuid,uuid,text,jsonb), public.email_appeal_transport_binding(), public.email_appeal_feedback_bindings(), public.email_appeal_recipient_candidates(uuid,uuid,text,integer,integer), public.email_appeal_record_provider_status(uuid,uuid,text,jsonb), public.email_appeal_report_grant(uuid,text), public.email_appeal_authorize_dispatch(uuid,uuid,text,text,text,jsonb,uuid), public.email_appeal_claim_report(uuid,uuid,text,uuid,text,jsonb,text,text), public.email_appeal_mark_report(uuid,text,text), public.email_appeal_authorize_report_dispatch(uuid,uuid,text,text,text,jsonb), public.email_appeal_feedback(text,text,text,text,text,uuid,text,text,uuid,uuid,text,text,text) TO service_role;
COMMIT;
