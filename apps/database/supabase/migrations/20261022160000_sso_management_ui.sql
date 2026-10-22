-- NULL preserves the deployment-pinned request policy for pre-management clients.
ALTER TABLE private.sso_saml_clients
  ADD COLUMN request_signing_mode text CHECK (request_signing_mode IN ('unsigned', 'required')),
  ADD COLUMN sp_certificate text,
  ADD CONSTRAINT sso_sp_request_certificate CHECK (
    CASE WHEN request_signing_mode IS NULL THEN sp_certificate IS NULL
    WHEN request_signing_mode = 'unsigned' THEN sp_certificate IS NULL
    ELSE sp_certificate IS NOT NULL
      AND length(sp_certificate) <= 16384
      AND sp_certificate ~ '^-----BEGIN CERTIFICATE-----[\r\n]+[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----[\r\n]*$' END);

-- One transaction updates trust, increments the policy revision, and audits through
-- the existing phase-2 writer. No browser role receives table access.
CREATE FUNCTION public.sso_save_saml_client(p_ws_id uuid, p_actor_id uuid,
  p_expected_revision bigint, p_display_name text,
  p_approved_email_domains text[], p_entity_id text, p_acs_url text,
  p_request_signing_mode text, p_sp_certificate text DEFAULT NULL, p_enabled boolean DEFAULT false, p_client_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client private.sso_clients;
BEGIN
  IF p_request_signing_mode IS NULL OR p_request_signing_mode NOT IN ('unsigned', 'required') THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'sso_invalid_profile';
  END IF;
  SELECT * INTO v_client FROM public.sso_manage_client(p_ws_id, p_actor_id,
    p_client_id, p_expected_revision, p_display_name, p_approved_email_domains,
    p_entity_id, ARRAY[p_acs_url], p_enabled);
  UPDATE private.sso_saml_clients SET request_signing_mode = p_request_signing_mode,
    sp_certificate = p_sp_certificate WHERE ws_id = p_ws_id AND client_id = v_client.id;
  RETURN jsonb_build_object('id', v_client.id, 'revision', v_client.policy_revision);
END;
$$;

CREATE FUNCTION public.sso_management_overview(p_ws_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.sso_assert_manager(p_ws_id, p_actor_id);
  RETURN jsonb_build_object('clients', COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id', c.id, 'displayName', c.display_name, 'enabled', c.enabled,
    'revision', c.policy_revision, 'domains', c.approved_email_domains,
    'entityId', s.entity_id, 'acsUrl', s.acs_urls[1], 'nameIdFormat', s.name_id_format,
    'requestSigningMode', s.request_signing_mode, 'spCertificate', s.sp_certificate)
    ORDER BY c.created_at DESC) FROM private.sso_clients c
    JOIN private.sso_saml_clients s ON s.ws_id = c.ws_id AND s.client_id = c.id
    WHERE c.ws_id = p_ws_id), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.sso_management_detail(p_ws_id uuid, p_actor_id uuid, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.sso_assert_manager(p_ws_id, p_actor_id);
  PERFORM 1 FROM private.sso_clients WHERE ws_id = p_ws_id AND id = p_client_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  RETURN jsonb_build_object(
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'userId', m.user_id, 'displayName', u.display_name,
      'active', COALESCE(a.active, false), 'revision', COALESCE(a.revision, 0))
      ORDER BY m.user_id) FROM public.workspace_members m
      LEFT JOIN public.users u ON u.id = m.user_id
      LEFT JOIN private.sso_assignments a ON a.ws_id = m.ws_id
        AND a.client_id = p_client_id AND a.user_id = m.user_id
      WHERE m.ws_id = p_ws_id AND m.type = 'MEMBER'), '[]'::jsonb),
    'keys', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'kid', k.kid, 'status', k.status, 'publicCertificate', k.public_certificate,
      'notBefore', k.not_before, 'notAfter', k.not_after, 'createdAt', k.created_at,
      'activatedAt', k.activated_at, 'retiredAt', k.retired_at, 'revokedAt', k.revoked_at)
      ORDER BY k.created_at DESC) FROM private.sso_signing_keys k
      WHERE k.ws_id = p_ws_id AND k.client_id = p_client_id), '[]'::jsonb),
    'audit', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e."createdAt" DESC) FROM (
      SELECT id, event_type AS "eventType", policy_revision AS revision, created_at AS "createdAt"
      FROM private.sso_audit_events WHERE ws_id = p_ws_id AND client_id = p_client_id
      ORDER BY created_at DESC, id DESC LIMIT 50) e), '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.sso_save_saml_client(uuid, uuid, bigint, text, text[], text, text, text, text, boolean, uuid),
  public.sso_management_overview(uuid, uuid), public.sso_management_detail(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sso_save_saml_client(uuid, uuid, bigint, text, text[], text, text, text, text, boolean, uuid),
  public.sso_management_overview(uuid, uuid), public.sso_management_detail(uuid, uuid, uuid) TO service_role;

CREATE FUNCTION public.sso_set_client_enabled(p_ws_id uuid, p_actor_id uuid,
  p_client_id uuid, p_expected_revision bigint, p_enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client private.sso_clients;
BEGIN
  PERFORM private.sso_assert_manager(p_ws_id, p_actor_id);
  SELECT * INTO v_client FROM private.sso_clients
    WHERE ws_id=p_ws_id AND id=p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  IF p_enabled AND NOT EXISTS (SELECT 1 FROM private.sso_saml_clients
    WHERE ws_id=p_ws_id AND client_id=p_client_id AND request_signing_mode IS NOT NULL) THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'sso_invalid_profile';
  END IF;
  UPDATE private.sso_clients SET enabled=p_enabled, policy_revision=policy_revision+1,
    updated_at=clock_timestamp() WHERE ws_id=p_ws_id AND id=p_client_id
    AND policy_revision=p_expected_revision RETURNING * INTO v_client;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '40001', message = 'sso_revision_conflict';
  END IF;
  PERFORM private.sso_audit(p_ws_id,p_client_id,p_actor_id,NULL,'client.updated',v_client.policy_revision);
  RETURN jsonb_build_object('id',v_client.id,'revision',v_client.policy_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.sso_set_client_enabled(uuid,uuid,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sso_set_client_enabled(uuid,uuid,uuid,bigint,boolean) TO service_role;
