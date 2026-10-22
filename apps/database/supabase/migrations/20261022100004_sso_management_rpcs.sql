CREATE FUNCTION private.sso_assert_manager(p_ws_id uuid, p_actor_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.workspaces w WHERE w.id = p_ws_id
    AND NOT w.personal AND w.deleted IS NOT TRUE FOR SHARE;
  IF NOT FOUND OR p_actor_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  PERFORM 1 FROM public.workspace_members m WHERE m.ws_id = p_ws_id
    AND m.user_id = p_actor_id AND m.type = 'MEMBER' FOR SHARE;
  IF NOT FOUND OR public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_sso_clients') IS NOT TRUE THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
END;
$$;
CREATE FUNCTION private.sso_audit(p_ws_id uuid, p_client_id uuid, p_actor_id uuid,
  p_transaction_id uuid, p_event_type text, p_revision bigint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO private.sso_audit_events(ws_id, client_id, actor_id, transaction_id, event_type, policy_revision)
    VALUES(p_ws_id, p_client_id, p_actor_id, p_transaction_id, p_event_type, p_revision)
    RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
CREATE FUNCTION public.sso_manage_client(p_ws_id uuid, p_actor_id uuid,
  p_client_id uuid, p_expected_revision bigint, p_display_name text,
  p_approved_email_domains text[], p_entity_id text, p_acs_urls text[], p_enabled boolean DEFAULT false)
RETURNS private.sso_clients LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_client private.sso_clients;
BEGIN
  PERFORM private.sso_assert_manager(p_ws_id, p_actor_id);
  IF p_client_id IS NULL THEN
    IF p_expected_revision IS DISTINCT FROM 0 OR p_enabled IS DISTINCT FROM false THEN
      RAISE EXCEPTION USING errcode = '22023', message = 'sso_create_disabled';
    END IF;
    INSERT INTO private.sso_clients(ws_id, display_name, approved_email_domains, created_by)
      VALUES(p_ws_id, p_display_name, p_approved_email_domains, p_actor_id) RETURNING * INTO v_client;
    INSERT INTO private.sso_saml_clients(ws_id, client_id, entity_id, acs_urls)
      VALUES(p_ws_id, v_client.id, p_entity_id, p_acs_urls);
    PERFORM private.sso_audit(p_ws_id, v_client.id, p_actor_id, NULL, 'client.created', v_client.policy_revision);
  ELSE
    UPDATE private.sso_clients SET display_name = p_display_name, enabled = p_enabled,
      approved_email_domains = p_approved_email_domains, policy_revision = policy_revision + 1, updated_at = clock_timestamp()
      WHERE ws_id = p_ws_id AND id = p_client_id AND policy_revision = p_expected_revision RETURNING * INTO v_client;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = '40001', message = 'sso_revision_conflict';
    END IF;
    UPDATE private.sso_saml_clients SET entity_id = p_entity_id, acs_urls = p_acs_urls
      WHERE ws_id = p_ws_id AND client_id = p_client_id;
    PERFORM private.sso_audit(p_ws_id, v_client.id, p_actor_id, NULL, 'client.updated', v_client.policy_revision);
  END IF;
  RETURN v_client;
END;
$$;
CREATE FUNCTION public.sso_set_assignment(p_ws_id uuid, p_client_id uuid,
  p_actor_id uuid, p_user_id uuid, p_expected_revision bigint, p_active boolean)
RETURNS private.sso_assignments LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_revision bigint; v_assignment private.sso_assignments;
BEGIN
  PERFORM private.sso_assert_manager(p_ws_id, p_actor_id);
  SELECT c.policy_revision INTO v_revision FROM private.sso_clients c
    WHERE c.ws_id = p_ws_id AND c.id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
  END IF;
  IF p_active IS TRUE THEN
    PERFORM 1 FROM public.workspace_members m WHERE m.ws_id = p_ws_id
      AND m.user_id = p_user_id AND m.type = 'MEMBER' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = '42501', message = 'sso_forbidden';
    END IF;
  END IF;
  IF p_expected_revision = 0 THEN
    INSERT INTO private.sso_assignments(ws_id, client_id, user_id, active, created_by)
      VALUES(p_ws_id, p_client_id, p_user_id, p_active, p_actor_id) RETURNING * INTO v_assignment;
  ELSE
    UPDATE private.sso_assignments SET active = p_active, revision = revision + 1
      WHERE ws_id = p_ws_id AND client_id = p_client_id AND user_id = p_user_id
        AND revision = p_expected_revision RETURNING * INTO v_assignment;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING errcode = '40001', message = 'sso_revision_conflict';
    END IF;
  END IF;
  PERFORM private.sso_audit(p_ws_id, p_client_id, p_actor_id, NULL, 'assignment.updated', v_revision);
  RETURN v_assignment;
END;
$$;
CREATE FUNCTION public.sso_read_own_disclosures(p_ws_id uuid)
RETURNS SETOF private.sso_disclosure_grants LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT g.* FROM private.sso_disclosure_grants g
    WHERE g.ws_id = p_ws_id AND g.actor_id = (SELECT auth.uid()) ORDER BY g.created_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION private.sso_assert_manager(uuid, uuid), private.sso_audit(uuid, uuid, uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sso_manage_client(uuid, uuid, uuid, bigint, text, text[], text, text[], boolean),
  public.sso_set_assignment(uuid, uuid, uuid, uuid, bigint, boolean), public.sso_read_own_disclosures(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sso_manage_client(uuid, uuid, uuid, bigint, text, text[], text, text[], boolean),
  public.sso_set_assignment(uuid, uuid, uuid, uuid, bigint, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.sso_read_own_disclosures(uuid) TO authenticated;
