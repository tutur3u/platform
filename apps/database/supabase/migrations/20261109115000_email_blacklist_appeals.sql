-- Placeholder version: assign above the latest applied migration at merge.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.email_blacklist_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id),
  email text NOT NULL CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_hash text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  suppression jsonb NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dispatching','sent','confirmed','failed','unknown','expired','reblocked','waiting_recipient','unavailable')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
  confirmed_at timestamptz,
  cooldown_until timestamptz NOT NULL DEFAULT clock_timestamp() + interval '48 hours'
);
CREATE INDEX email_blacklist_appeals_workspace_time ON private.email_blacklist_appeals(ws_id, created_at DESC);
CREATE INDEX email_blacklist_appeals_address_time ON private.email_blacklist_appeals(email, created_at DESC);
CREATE INDEX email_blacklist_appeals_event_hash ON private.email_blacklist_appeals(email_hash);
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

CREATE FUNCTION private.email_appeal_hash(p_email text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT substr(encode(sha256(convert_to(lower(btrim(p_email)), 'UTF8')), 'hex'), 1, 16) $$;

CREATE FUNCTION private.email_appeal_admin(p_ws_id uuid, p_actor_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT public.is_org_member(p_actor_id, p_ws_id)
  AND public.has_workspace_permission(p_ws_id, p_actor_id, 'admin') $$;

CREATE FUNCTION private.email_appeal_recipient(p_ws_id uuid, p_email text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.workspace_users WHERE ws_id = p_ws_id AND lower(btrim(email)) = p_email)
  OR EXISTS (SELECT 1 FROM public.email_audit a WHERE a.ws_id = p_ws_id AND p_email = ANY(
    ARRAY(SELECT lower(btrim(e)) FROM unnest(a.to_addresses || a.cc_addresses || a.bcc_addresses) e))) $$;

CREATE FUNCTION private.email_appeal_suppression(p_email text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_entry record; v_event record; v_ids text; v_soft integer; v_reason text;
BEGIN
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
    WHEN v_event.event_type = 'complaint' THEN 'ses_complaint'
    WHEN v_entry.id IS NOT NULL THEN v_entry.reason
    WHEN EXISTS (SELECT 1 FROM private.email_bounce_complaints WHERE email_hash = private.email_appeal_hash(p_email) AND bounce_type = 'hard') THEN 'ses_hard_bounce'
    WHEN v_soft >= 3 THEN 'ses_soft_bounce_threshold' ELSE NULL END;
  IF v_reason IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('reason',v_reason,
    'blocked_at',coalesce(v_entry.created_at,v_event.created_at),
    'source_event',coalesce(v_event.id::text,v_entry.id::text),
    'fingerprint',md5(coalesce(v_ids,'') || coalesce(v_entry.id::text,'') || coalesce(v_entry.updated_at::text,'') || v_reason),
    'appealable',coalesce(v_entry.entry_type::text,'email') = 'email' AND v_reason IN ('ses_hard_bounce','ses_complaint','ses_soft_bounce_threshold'));
END;
$$;

CREATE FUNCTION public.email_appeal_list(p_ws_id uuid, p_actor_id uuid, p_search text DEFAULT '', p_offset integer DEFAULT 0, p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT private.email_appeal_admin(p_ws_id,p_actor_id) THEN RAISE EXCEPTION 'email_appeal_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_offset < 0 OR p_offset > 100000 OR p_limit NOT BETWEEN 1 AND 100 OR length(p_search) > 254 THEN RAISE EXCEPTION 'email_appeal_invalid_request'; END IF;
  WITH recipients AS (
    SELECT lower(btrim(email)) email FROM public.workspace_users WHERE ws_id = p_ws_id AND email IS NOT NULL
    UNION SELECT lower(btrim(e)) FROM public.email_audit a CROSS JOIN LATERAL unnest(a.to_addresses || a.cc_addresses || a.bcc_addresses) e WHERE a.ws_id = p_ws_id
  ), blocked AS (
    SELECT r.email, private.email_appeal_suppression(r.email) suppression FROM recipients r
    WHERE strpos(r.email,lower(p_search)) > 0
  ), rows AS (
    SELECT b.email, b.suppression, a.status, a.cooldown_until FROM blocked b
    LEFT JOIN LATERAL (SELECT status,cooldown_until FROM private.email_blacklist_appeals
      WHERE ws_id = p_ws_id AND email = b.email ORDER BY created_at DESC LIMIT 1) a ON true
    WHERE b.suppression IS NOT NULL
  ) SELECT jsonb_build_object('total',(SELECT count(*) FROM rows),'entries',coalesce((
    SELECT jsonb_agg(jsonb_build_object('email',email,'reason',suppression->>'reason','blocked_at',suppression->'blocked_at',
      'source_event',suppression->'source_event','appealable',suppression->'appealable','status',status,'cooldown_until',cooldown_until))
    FROM (SELECT * FROM rows ORDER BY email OFFSET p_offset LIMIT p_limit) page),'[]'::jsonb)) INTO v_result;
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
  v_suppression := private.email_appeal_suppression(v_email);
  IF v_suppression IS NULL OR NOT (v_suppression->>'appealable')::boolean THEN RAISE EXCEPTION 'email_appeal_not_appealable'; END IF;
  SELECT * INTO v_prior FROM private.email_blacklist_appeals WHERE email = v_email ORDER BY created_at DESC LIMIT 1;
  IF v_prior.cooldown_until > clock_timestamp() OR (v_prior.status IN ('pending','dispatching','sent') AND v_prior.expires_at > clock_timestamp()) THEN RAISE EXCEPTION 'email_appeal_cooldown'; END IF;
  IF (SELECT count(*) FROM private.email_blacklist_appeals WHERE ws_id = p_ws_id AND created_at > clock_timestamp() - interval '24 hours') >= 10 THEN RAISE EXCEPTION 'email_appeal_workspace_limit'; END IF;
  IF (SELECT count(*) FROM private.email_blacklist_appeals WHERE email = v_email AND created_at > clock_timestamp() - interval '7 days') >= 3 THEN RAISE EXCEPTION 'email_appeal_address_limit'; END IF;
  INSERT INTO private.email_blacklist_appeals(ws_id,actor_id,email,email_hash,reason,suppression,token_hash)
  VALUES(p_ws_id,p_actor_id,v_email,private.email_appeal_hash(v_email),btrim(p_reason),v_suppression,p_token_hash) RETURNING * INTO v_row;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,'requested');
  RETURN jsonb_build_object('id',v_row.id,'email',v_email,'reason',v_suppression->>'reason','status',v_row.status,'expires_at',v_row.expires_at);
END;
$$;

CREATE FUNCTION public.email_appeal_claim_delivery(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_row private.email_blacklist_appeals; v_suppression jsonb; v_status text;
BEGIN
  SELECT * INTO v_row FROM private.email_blacklist_appeals WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF v_row.status IN ('reblocked','expired') THEN RETURN jsonb_build_object('status',v_row.status); END IF;
  IF v_row.status <> 'pending' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  v_suppression := private.email_appeal_suppression(v_row.email);
  v_status := CASE
    WHEN v_row.expires_at <= clock_timestamp() THEN 'expired'
    WHEN v_suppression IS NULL OR v_suppression->>'fingerprint' IS DISTINCT FROM v_row.suppression->>'fingerprint'
      OR v_suppression->>'reason' = 'ses_complaint'
      OR EXISTS (SELECT 1 FROM private.email_bounce_complaints WHERE email_hash = v_row.email_hash AND event_type = 'complaint') THEN 'reblocked'
    WHEN NOT EXISTS (SELECT 1 FROM public.workspace_secrets WHERE ws_id = v_row.ws_id AND name = 'email_blacklist_appeals' AND value = 'true') THEN 'failed'
    ELSE 'dispatching' END;
  UPDATE private.email_blacklist_appeals SET status = v_status,
    cooldown_until = CASE WHEN v_status = 'dispatching' THEN cooldown_until ELSE clock_timestamp() + interval '48 hours' END
  WHERE id = v_row.id;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(v_row.id,v_status);
  RETURN jsonb_build_object('status',CASE WHEN v_status = 'failed' THEN 'invalid' ELSE v_status END);
END;
$$;

CREATE FUNCTION public.email_appeal_mark_delivery(p_id uuid,p_outcome text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_status text;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','failed','unknown','waiting_recipient','unavailable') THEN RAISE EXCEPTION 'email_appeal_invalid_request'; END IF;
  UPDATE private.email_blacklist_appeals SET status = p_outcome,
    cooldown_until = CASE WHEN p_outcome = 'sent' THEN cooldown_until ELSE clock_timestamp() + interval '48 hours' END
  WHERE id = p_id AND (
    (status = 'dispatching' AND p_outcome IN ('sent','failed','unknown'))
    OR (status = 'pending' AND p_outcome IN ('failed','waiting_recipient','unavailable'))
  ) RETURNING status INTO v_status;
  IF v_status IS NULL THEN RAISE EXCEPTION 'email_appeal_delivery_state'; END IF;
  INSERT INTO private.email_blacklist_appeal_events(appeal_id,outcome) VALUES(p_id,p_outcome);
  RETURN jsonb_build_object('status',v_status);
END;
$$;

CREATE FUNCTION public.email_appeal_confirm(p_token_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_row private.email_blacklist_appeals; v_suppression jsonb; v_status text;
BEGIN
  SELECT * INTO v_row FROM private.email_blacklist_appeals WHERE token_hash = p_token_hash FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'sent' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  v_suppression := private.email_appeal_suppression(v_row.email);
  v_status := CASE WHEN v_row.expires_at <= clock_timestamp() THEN 'expired'
    WHEN v_suppression IS NULL OR v_suppression->>'fingerprint' IS DISTINCT FROM v_row.suppression->>'fingerprint' THEN 'reblocked'
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
  SELECT coalesce(jsonb_agg(jsonb_build_object('email',e.email,'is_blocked',s.value IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.email_blacklist_appeals a WHERE a.ws_id = p_ws_id AND a.email = e.email
      AND EXISTS (SELECT 1 FROM public.workspace_secrets f WHERE f.ws_id = p_ws_id AND f.name = 'email_blacklist_appeals' AND f.value = 'true')
      AND a.status = 'confirmed' AND (s.value->>'appealable')::boolean
      AND a.suppression->>'fingerprint' = s.value->>'fingerprint'), 'reason',s.value->>'reason')),'[]'::jsonb)
  FROM (SELECT DISTINCT lower(btrim(input)) email FROM unnest(p_emails) input) e
  CROSS JOIN LATERAL (SELECT private.email_appeal_suppression(e.email) value) s
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
    WHERE status IN ('confirmed','pending','dispatching','sent') AND (email_hash = v_hash OR email = v_address OR split_part(email,'@',2) = v_domain)
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

REVOKE ALL ON FUNCTION private.email_appeal_hash(text), private.email_appeal_admin(uuid,uuid), private.email_appeal_recipient(uuid,text), private.email_appeal_suppression(text), private.email_appeal_reblock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_appeal_list(uuid,uuid,text,integer,integer), public.email_appeal_request(uuid,uuid,text,text,text), public.email_appeal_claim_delivery(uuid), public.email_appeal_mark_delivery(uuid,text), public.email_appeal_confirm(text), public.email_appeal_block_statuses(uuid,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_appeal_list(uuid,uuid,text,integer,integer), public.email_appeal_request(uuid,uuid,text,text,text), public.email_appeal_claim_delivery(uuid), public.email_appeal_mark_delivery(uuid,text), public.email_appeal_confirm(text), public.email_appeal_block_statuses(uuid,text[]) TO service_role;
COMMIT;
