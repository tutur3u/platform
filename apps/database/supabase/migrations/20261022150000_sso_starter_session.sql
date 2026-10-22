-- Keep the starter separate from the actor's later immutable consent receipt.
ALTER TABLE private.sso_transactions ADD COLUMN starter_binding_hash text
  CHECK (starter_binding_hash ~ '^[0-9a-f]{64}$');
DROP FUNCTION public.sso_create_transaction(uuid, uuid, bigint, text, text, text, text, text, timestamptz, boolean);
CREATE FUNCTION public.sso_create_transaction(p_ws_id uuid, p_client_id uuid,
  p_policy_revision bigint, p_request_id text, p_handle_hash text, p_browser_binding_hash text,
  p_relay_state_hash text, p_acs_url text, p_expires_at timestamptz, p_allow_create boolean DEFAULT false,
  p_starter_binding_hash text DEFAULT NULL)
RETURNS private.sso_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction private.sso_transactions;
BEGIN
  PERFORM private.sso_lock_client(p_ws_id, p_client_id, p_policy_revision);
  IF NOT EXISTS (SELECT 1 FROM private.sso_saml_clients s WHERE s.ws_id = p_ws_id
    AND s.client_id = p_client_id AND p_acs_url = ANY(s.acs_urls)) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  INSERT INTO private.sso_transactions(ws_id, client_id, request_id_hash, in_response_to,
    handle_hash, browser_binding_hash, relay_state_hash, acs_url, allow_create, policy_revision, created_at, expires_at, starter_binding_hash)
    VALUES(p_ws_id, p_client_id, encode(extensions.digest(p_request_id, 'sha256'), 'hex'), p_request_id,
      p_handle_hash, p_browser_binding_hash, p_relay_state_hash, p_acs_url, p_allow_create, p_policy_revision, clock_timestamp(), p_expires_at, p_starter_binding_hash)
    RETURNING * INTO v_transaction;
  PERFORM private.sso_audit(p_ws_id, p_client_id, NULL, v_transaction.id, 'transaction.created', p_policy_revision);
  RETURN v_transaction;
END;
$$;

-- False commits the rejection and audit; raising here would roll them back.
CREATE FUNCTION public.sso_bind_transaction(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
  p_actor_id uuid, p_browser_binding_hash text, p_session_binding_hash text, p_policy_revision bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction private.sso_transactions;
BEGIN
  IF p_actor_id IS NULL OR p_session_binding_hash IS NULL OR p_session_binding_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'sso_invalid_binding';
  END IF;
  v_transaction := private.sso_lock_transaction(p_ws_id, p_client_id, p_transaction_id,
    p_browser_binding_hash, p_policy_revision);
  IF v_transaction.actor_id IS NOT NULL THEN
    RAISE EXCEPTION USING errcode = '40001', message = 'sso_consent_recorded';
  END IF;
  IF v_transaction.starter_binding_hash IS NOT NULL
    AND v_transaction.starter_binding_hash IS DISTINCT FROM p_session_binding_hash THEN
    PERFORM public.sso_reject_transaction(p_ws_id, p_client_id, p_transaction_id,
      p_browser_binding_hash, p_actor_id, p_policy_revision);
    RETURN false;
  END IF;
  UPDATE private.sso_transactions SET starter_binding_hash = p_session_binding_hash
    WHERE id = p_transaction_id AND ws_id = p_ws_id AND client_id = p_client_id;
  RETURN true;
END;
$$;
CREATE OR REPLACE FUNCTION public.sso_record_consent(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
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
  IF v_transaction.starter_binding_hash IS NOT NULL
    AND v_transaction.starter_binding_hash IS DISTINCT FROM p_session_binding_hash THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_session_changed';
  END IF;
  INSERT INTO private.sso_disclosure_grants(ws_id, client_id, transaction_id, actor_id, policy_revision, approved)
    VALUES(p_ws_id, p_client_id, p_transaction_id, p_actor_id, p_policy_revision, p_approved) RETURNING * INTO v_grant;
  UPDATE private.sso_transactions SET starter_binding_hash = p_session_binding_hash, actor_id = p_actor_id, session_binding_hash = p_session_binding_hash,
    consumed_at = CASE WHEN NOT p_approved THEN clock_timestamp() END,
    outcome = CASE WHEN NOT p_approved THEN 'denied' END
    WHERE ws_id = p_ws_id AND client_id = p_client_id AND id = p_transaction_id;
  PERFORM private.sso_audit(p_ws_id, p_client_id, p_actor_id, p_transaction_id,
    CASE WHEN p_approved THEN 'consent.approved' ELSE 'consent.denied' END, p_policy_revision);
  RETURN v_grant;
END;
$$;

REVOKE ALL ON FUNCTION public.sso_create_transaction(uuid, uuid, bigint, text, text, text, text, text, timestamptz, boolean, text),
  public.sso_bind_transaction(uuid, uuid, uuid, uuid, text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sso_create_transaction(uuid, uuid, bigint, text, text, text, text, text, timestamptz, boolean, text),
  public.sso_bind_transaction(uuid, uuid, uuid, uuid, text, text, bigint) TO service_role;
