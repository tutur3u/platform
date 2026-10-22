-- Service-only projections preserve revoked direct table privileges.
CREATE FUNCTION public.sso_issuance_snapshot(p_client_id uuid, p_actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'client', to_jsonb(c), 'saml', to_jsonb(s), 'key', to_jsonb(k),
    'member', EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.ws_id = c.ws_id
      AND m.user_id = p_actor_id AND m.type = 'MEMBER'),
    'assigned', EXISTS (SELECT 1 FROM private.sso_assignments a WHERE a.ws_id = c.ws_id
      AND a.client_id = c.id AND a.user_id = p_actor_id AND a.active))
  FROM private.sso_clients c
  JOIN public.workspaces w ON w.id = c.ws_id AND NOT w.personal AND w.deleted IS NOT TRUE
  JOIN private.sso_saml_clients s ON s.ws_id = c.ws_id AND s.client_id = c.id
  JOIN private.sso_signing_keys k ON k.ws_id = c.ws_id AND k.client_id = c.id
    AND k.status = 'active' AND k.not_before <= clock_timestamp() AND k.not_after > clock_timestamp()
  WHERE c.id = p_client_id AND c.enabled;
$$;

-- Revalidate authorization and signing custody after signing, before emission.
CREATE FUNCTION public.sso_finalize_issuance(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
  p_actor_id uuid, p_policy_revision bigint, p_key_id uuid, p_key_revision bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_transaction private.sso_transactions;
BEGIN
  PERFORM private.sso_lock_client(p_ws_id, p_client_id, p_policy_revision);
  PERFORM private.sso_assert_assigned(p_ws_id, p_client_id, p_actor_id);
  PERFORM 1 FROM private.sso_signing_keys k WHERE k.ws_id = p_ws_id AND k.client_id = p_client_id
    AND k.id = p_key_id AND k.revision = p_key_revision AND k.status = 'active'
    AND k.not_before <= clock_timestamp() AND k.not_after > clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden'; END IF;
  SELECT t.* INTO v_transaction FROM private.sso_transactions t WHERE t.ws_id = p_ws_id
    AND t.client_id = p_client_id AND t.id = p_transaction_id AND t.actor_id = p_actor_id
    AND t.policy_revision = p_policy_revision AND t.outcome = 'approved'
    AND t.expires_at > clock_timestamp() AND t.consumed_at > clock_timestamp() - interval '5 seconds'
    FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM private.sso_audit_events a WHERE a.transaction_id = p_transaction_id
    AND a.ws_id = p_ws_id AND a.client_id = p_client_id AND a.event_type IN ('issuance.signed', 'issuance.failed')) THEN
    RAISE EXCEPTION USING errcode = '40001', message = 'sso_transaction_unavailable';
  END IF;
  RETURN public.sso_append_audit(p_ws_id, p_client_id, p_transaction_id, p_actor_id, 'issuance.signed', p_policy_revision);
END;
$$;

-- A rejected decision burns its browser-bound transaction even when membership was revoked.
CREATE FUNCTION public.sso_reject_transaction(p_ws_id uuid, p_client_id uuid, p_transaction_id uuid,
  p_browser_binding_hash text, p_actor_id uuid DEFAULT NULL, p_policy_revision bigint DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE private.sso_transactions SET consumed_at = clock_timestamp(), outcome = 'denied'
    WHERE ws_id = p_ws_id AND client_id = p_client_id AND id = p_transaction_id
      AND browser_binding_hash = p_browser_binding_hash AND policy_revision = p_policy_revision
      AND consumed_at IS NULL AND actor_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING errcode = '40001', message = 'sso_transaction_unavailable'; END IF;
  RETURN private.sso_audit(p_ws_id, p_client_id, p_actor_id, p_transaction_id, 'issuance.failed', p_policy_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.sso_issuance_snapshot(uuid, uuid),
  public.sso_finalize_issuance(uuid, uuid, uuid, uuid, bigint, uuid, bigint),
  public.sso_reject_transaction(uuid, uuid, uuid, text, uuid, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sso_issuance_snapshot(uuid, uuid),
  public.sso_finalize_issuance(uuid, uuid, uuid, uuid, bigint, uuid, bigint),
  public.sso_reject_transaction(uuid, uuid, uuid, text, uuid, bigint) TO service_role;
