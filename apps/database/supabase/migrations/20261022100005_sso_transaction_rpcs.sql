CREATE FUNCTION private.sso_lock_client(p_ws_id uuid, p_client_id uuid, p_revision bigint)
RETURNS private.sso_clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client private.sso_clients;
BEGIN
  PERFORM 1 FROM public.workspaces w WHERE w.id = p_ws_id
    AND NOT w.personal AND w.deleted IS NOT TRUE FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  SELECT c.* INTO v_client FROM private.sso_clients c
    WHERE c.ws_id = p_ws_id AND c.id = p_client_id AND c.enabled
      AND c.policy_revision = p_revision FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  RETURN v_client;
END;
$$;
CREATE FUNCTION private.sso_assert_assigned(p_ws_id uuid, p_client_id uuid, p_actor_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.workspace_members m WHERE m.ws_id = p_ws_id
    AND m.user_id = p_actor_id AND m.type = 'MEMBER' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  PERFORM 1 FROM private.sso_assignments a WHERE a.ws_id = p_ws_id
    AND a.client_id = p_client_id AND a.user_id = p_actor_id AND a.active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
END;
$$;
CREATE FUNCTION public.sso_create_transaction(p_ws_id uuid, p_client_id uuid,
  p_policy_revision bigint, p_request_id text, p_handle_hash text, p_browser_binding_hash text,
  p_relay_state_hash text, p_acs_url text, p_expires_at timestamptz, p_allow_create boolean DEFAULT false)
RETURNS private.sso_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction private.sso_transactions;
BEGIN
  PERFORM private.sso_lock_client(p_ws_id, p_client_id, p_policy_revision);
  IF NOT EXISTS (SELECT 1 FROM private.sso_saml_clients s WHERE s.ws_id = p_ws_id
    AND s.client_id = p_client_id AND p_acs_url = ANY(s.acs_urls)) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  INSERT INTO private.sso_transactions(ws_id, client_id, request_id_hash, in_response_to,
    handle_hash, browser_binding_hash, relay_state_hash, acs_url, allow_create, policy_revision, created_at, expires_at)
    VALUES(p_ws_id, p_client_id, encode(extensions.digest(p_request_id, 'sha256'), 'hex'), p_request_id,
      p_handle_hash, p_browser_binding_hash, p_relay_state_hash, p_acs_url, p_allow_create, p_policy_revision, clock_timestamp(), p_expires_at)
    RETURNING * INTO v_transaction;
  PERFORM private.sso_audit(p_ws_id, p_client_id, NULL, v_transaction.id, 'transaction.created', p_policy_revision);
  RETURN v_transaction;
END;
$$;
CREATE FUNCTION private.sso_lock_transaction(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
  p_browser_binding_hash text, p_revision bigint) RETURNS private.sso_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction private.sso_transactions;
BEGIN
  SELECT t.* INTO v_transaction FROM private.sso_transactions t
    WHERE t.ws_id = p_ws_id AND t.client_id = p_client_id AND t.id = p_transaction_id
      AND t.browser_binding_hash = p_browser_binding_hash AND t.policy_revision = p_revision FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  IF v_transaction.consumed_at IS NOT NULL OR v_transaction.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING errcode = '40001', message = 'sso_transaction_unavailable';
  END IF;
  RETURN v_transaction;
END;
$$;
CREATE FUNCTION public.sso_record_consent(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
  p_actor_id uuid, p_browser_binding_hash text, p_session_binding_hash text,
  p_policy_revision bigint, p_approved boolean) RETURNS private.sso_disclosure_grants
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction private.sso_transactions; v_grant private.sso_disclosure_grants;
BEGIN
  PERFORM private.sso_lock_client(p_ws_id, p_client_id, p_policy_revision);
  PERFORM private.sso_assert_assigned(p_ws_id, p_client_id, p_actor_id);
  v_transaction := private.sso_lock_transaction(p_ws_id, p_client_id, p_transaction_id, p_browser_binding_hash, p_policy_revision);
  IF v_transaction.actor_id IS NOT NULL THEN
    RAISE EXCEPTION USING errcode = '40001', message = 'sso_consent_recorded';
  END IF;
  IF p_session_binding_hash IS NULL OR p_session_binding_hash !~ '^[0-9a-f]{64}$' OR p_approved IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'sso_invalid_binding';
  END IF;
  INSERT INTO private.sso_disclosure_grants(ws_id, client_id, transaction_id, actor_id, policy_revision, approved)
    VALUES(p_ws_id, p_client_id, p_transaction_id, p_actor_id, p_policy_revision, p_approved) RETURNING * INTO v_grant;
  UPDATE private.sso_transactions SET actor_id = p_actor_id, session_binding_hash = p_session_binding_hash,
    consumed_at = CASE WHEN NOT p_approved THEN clock_timestamp() END,
    outcome = CASE WHEN NOT p_approved THEN 'denied' END
    WHERE ws_id = p_ws_id AND client_id = p_client_id AND id = p_transaction_id;
  PERFORM private.sso_audit(p_ws_id, p_client_id, p_actor_id, p_transaction_id,
    CASE WHEN p_approved THEN 'consent.approved' ELSE 'consent.denied' END, p_policy_revision);
  RETURN v_grant;
END;
$$;
CREATE FUNCTION public.sso_consume_transaction(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
  p_actor_id uuid, p_browser_binding_hash text, p_session_binding_hash text, p_policy_revision bigint)
RETURNS private.sso_subjects LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction private.sso_transactions; v_subject private.sso_subjects;
BEGIN
  PERFORM private.sso_lock_client(p_ws_id, p_client_id, p_policy_revision);
  PERFORM private.sso_assert_assigned(p_ws_id, p_client_id, p_actor_id);
  v_transaction := private.sso_lock_transaction(p_ws_id, p_client_id, p_transaction_id, p_browser_binding_hash, p_policy_revision);
  IF v_transaction.actor_id IS DISTINCT FROM p_actor_id OR p_actor_id IS NULL
    OR v_transaction.session_binding_hash IS DISTINCT FROM p_session_binding_hash
    OR NOT EXISTS (SELECT 1 FROM private.sso_disclosure_grants g WHERE g.ws_id = p_ws_id
      AND g.client_id = p_client_id AND g.transaction_id = p_transaction_id
      AND g.actor_id = p_actor_id AND g.approved AND g.policy_revision = p_policy_revision) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  UPDATE private.sso_transactions SET consumed_at = clock_timestamp(), outcome = 'approved'
    WHERE ws_id = p_ws_id AND client_id = p_client_id AND id = p_transaction_id;
  SELECT s.* INTO v_subject FROM private.sso_subjects s
    WHERE s.ws_id = p_ws_id AND s.client_id = p_client_id AND s.user_id = p_actor_id;
  IF NOT FOUND THEN
    IF NOT v_transaction.allow_create THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'sso_subject_creation_denied';
    END IF;
    INSERT INTO private.sso_subjects(ws_id, client_id, user_id) VALUES(p_ws_id, p_client_id, p_actor_id)
      ON CONFLICT (ws_id, client_id, user_id) DO NOTHING;
    SELECT s.* INTO STRICT v_subject FROM private.sso_subjects s
      WHERE s.ws_id = p_ws_id AND s.client_id = p_client_id AND s.user_id = p_actor_id;
  END IF;
  PERFORM private.sso_audit(p_ws_id, p_client_id, p_actor_id, p_transaction_id, 'transaction.consumed', p_policy_revision);
  RETURN v_subject;
END;
$$;
CREATE FUNCTION public.sso_append_audit(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
  p_actor_id uuid, p_event_type text, p_policy_revision bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_event_type NOT IN ('issuance.failed', 'issuance.signed') OR p_event_type IS NULL
    OR NOT EXISTS (SELECT 1 FROM private.sso_transactions t WHERE t.ws_id = p_ws_id
      AND t.client_id = p_client_id AND t.id = p_transaction_id AND t.actor_id = p_actor_id
      AND t.policy_revision = p_policy_revision AND t.consumed_at IS NOT NULL AND t.outcome = 'approved') THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  RETURN private.sso_audit(p_ws_id, p_client_id, p_actor_id, p_transaction_id, p_event_type, p_policy_revision);
END;
$$;
REVOKE ALL ON FUNCTION private.sso_lock_client(uuid, uuid, bigint), private.sso_assert_assigned(uuid, uuid, uuid),
  private.sso_lock_transaction(uuid, uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sso_create_transaction(uuid, uuid, bigint, text, text, text, text, text, timestamptz, boolean),
  public.sso_record_consent(uuid, uuid, uuid, uuid, text, text, bigint, boolean),
  public.sso_consume_transaction(uuid, uuid, uuid, uuid, text, text, bigint),
  public.sso_append_audit(uuid, uuid, uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sso_create_transaction(uuid, uuid, bigint, text, text, text, text, text, timestamptz, boolean),
  public.sso_record_consent(uuid, uuid, uuid, uuid, text, text, bigint, boolean),
  public.sso_consume_transaction(uuid, uuid, uuid, uuid, text, text, bigint),
  public.sso_append_audit(uuid, uuid, uuid, uuid, text, bigint) TO service_role;
