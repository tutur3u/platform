-- Platform admission is an audited control independent of version activation and the global switch.
ALTER TABLE private.desktop_deployment_environments ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK(revision >= 0);
-- Legacy reservations are conservatively invalidated; new reserves capture the locked environment revision.
ALTER TABLE private.desktop_deployment_fetch_leases ADD COLUMN delivery_revision bigint NOT NULL DEFAULT -1 CHECK(delivery_revision >= -1);
ALTER TABLE private.desktop_deployment_audit_events DROP CONSTRAINT desktop_deployment_audit_events_event_type_check;
ALTER TABLE private.desktop_deployment_audit_events ADD CONSTRAINT desktop_deployment_audit_events_event_type_check
  CHECK(event_type IN ('version.created','resource.saved','resource.removed','version.validated','version.activated','token.created','token.revoked','bundle.reserved','bundle.delivered','bundle.failed','environment.enabled','environment.disabled'));

CREATE FUNCTION private.desktop_deployment_environment_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- Even repeated controls fence an older enable intent or reserved delivery.
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$;
CREATE TRIGGER desktop_environment_revision BEFORE UPDATE OF enabled,active_version_id ON private.desktop_deployment_environments
  FOR EACH ROW EXECUTE FUNCTION private.desktop_deployment_environment_revision();
REVOKE ALL ON FUNCTION private.desktop_deployment_environment_revision() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desktop_deployment_environment_revision() TO service_role;

CREATE FUNCTION private.desktop_deployment_set_delivery(
  p_actor uuid,p_platform text,p_environment_revision bigint,p_enabled boolean,
  p_version uuid DEFAULT NULL,p_version_revision bigint DEFAULT NULL,
  p_verified_at timestamptz DEFAULT NULL,p_material_valid_until timestamptz DEFAULT NULL
) RETURNS private.desktop_deployment_environments
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE env private.desktop_deployment_environments; ver private.desktop_deployment_versions;
BEGIN
  PERFORM private.desktop_deployment_assert_admin(p_actor);
  IF NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE ws_id='00000000-0000-0000-0000-000000000000' AND user_id=p_actor AND type='MEMBER') THEN
    RAISE EXCEPTION 'desktop_vault_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_platform NOT IN ('windows','macos') OR p_platform IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'desktop_admission_invalid' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE platform=p_platform FOR UPDATE;
  IF env.revision IS DISTINCT FROM p_environment_revision THEN RAISE EXCEPTION 'desktop_environment_conflict' USING ERRCODE='40001'; END IF;
  IF p_enabled THEN
    IF env.active_version_id IS DISTINCT FROM p_version OR p_version IS NULL THEN
      RAISE EXCEPTION 'desktop_version_not_ready' USING ERRCODE='40001';
    END IF;
    SELECT * INTO STRICT ver FROM private.desktop_deployment_versions WHERE id=p_version FOR UPDATE;
    IF ver.environment_id <> env.id OR ver.platform <> p_platform OR ver.status <> 'active' OR ver.revision IS DISTINCT FROM p_version_revision
       OR ver.validated_revision IS DISTINCT FROM ver.revision OR cardinality(ver.validation_errors)<>0
       OR (SELECT count(*) FROM private.desktop_deployment_resources WHERE version_id=ver.id) <> (CASE WHEN p_platform='windows' THEN 2 ELSE 7 END) THEN
      RAISE EXCEPTION 'desktop_version_not_ready' USING ERRCODE='40001';
    END IF;
    -- Receipt originates from the trusted server's fresh encrypted-material inspection, never the browser.
    IF p_verified_at IS NULL OR p_material_valid_until IS NULL OR p_verified_at < clock_timestamp()-interval '30 seconds'
       OR p_verified_at > clock_timestamp()+interval '5 seconds' OR p_material_valid_until <= clock_timestamp() THEN
      RAISE EXCEPTION 'desktop_material_not_ready' USING ERRCODE='40001';
    END IF;
  ELSIF p_version IS NOT NULL OR p_version_revision IS NOT NULL OR p_verified_at IS NOT NULL OR p_material_valid_until IS NOT NULL THEN
    RAISE EXCEPTION 'desktop_admission_invalid' USING ERRCODE='22023';
  END IF;
  UPDATE private.desktop_deployment_environments SET enabled=p_enabled WHERE id=env.id RETURNING * INTO env;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,actor_id,event_type)
    VALUES(env.id,env.active_version_id,p_actor,CASE WHEN p_enabled THEN 'environment.enabled' ELSE 'environment.disabled' END);
  RETURN env;
END;
$$;
REVOKE ALL ON FUNCTION private.desktop_deployment_set_delivery(uuid,text,bigint,boolean,uuid,bigint,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.desktop_deployment_set_delivery(uuid,text,bigint,boolean,uuid,bigint,timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION private.desktop_deployment_reserve_bundle(p_token uuid,p_platform text,p_run_id text,p_attempt text,p_sha text) RETURNS private.desktop_deployment_fetch_leases
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE tok private.desktop_deployment_ci_tokens; env private.desktop_deployment_environments; lease private.desktop_deployment_fetch_leases;
BEGIN
  SELECT * INTO STRICT tok FROM private.desktop_deployment_ci_tokens WHERE id=p_token FOR UPDATE;
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE id=tok.environment_id FOR UPDATE;
  IF NOT env.enabled OR tok.platform <> p_platform OR tok.revoked_at IS NOT NULL OR tok.expires_at <= now() OR tok.version_id IS DISTINCT FROM env.active_version_id THEN RAISE EXCEPTION 'desktop_bundle_denied' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM private.desktop_deployment_versions WHERE id=tok.version_id AND status='active' AND validated_revision=revision AND cardinality(validation_errors)=0) THEN RAISE EXCEPTION 'desktop_bundle_denied' USING ERRCODE='42501'; END IF;
  INSERT INTO private.desktop_deployment_fetch_leases(token_id,platform,version_id,run_id,run_attempt,source_sha,delivery_revision)
    VALUES(tok.id,p_platform,tok.version_id,p_run_id,p_attempt,p_sha,env.revision) RETURNING * INTO lease;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,token_id,event_type) VALUES(env.id,tok.version_id,tok.id,'bundle.reserved');
  RETURN lease;
END;
$$;

CREATE OR REPLACE FUNCTION private.desktop_deployment_complete_bundle(p_lease uuid,p_failure_code text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE lease private.desktop_deployment_fetch_leases; tok private.desktop_deployment_ci_tokens; env private.desktop_deployment_environments;
BEGIN
  SELECT * INTO STRICT lease FROM private.desktop_deployment_fetch_leases WHERE id=p_lease;
  SELECT * INTO STRICT tok FROM private.desktop_deployment_ci_tokens WHERE id=lease.token_id FOR UPDATE;
  SELECT * INTO STRICT env FROM private.desktop_deployment_environments WHERE id=tok.environment_id FOR UPDATE;
  SELECT * INTO STRICT lease FROM private.desktop_deployment_fetch_leases WHERE id=p_lease FOR UPDATE;
  IF lease.status <> 'reserved' THEN RAISE EXCEPTION 'desktop_lease_consumed' USING ERRCODE='40001'; END IF;
  IF p_failure_code IS NOT NULL AND p_failure_code !~ '^[a-z_]{1,64}$' THEN RAISE EXCEPTION 'desktop_failure_code_invalid'; END IF;
  IF p_failure_code IS NULL AND (NOT env.enabled OR lease.delivery_revision IS DISTINCT FROM env.revision OR tok.revoked_at IS NOT NULL OR tok.expires_at<=now() OR tok.version_id IS DISTINCT FROM env.active_version_id OR lease.version_id IS DISTINCT FROM tok.version_id OR NOT EXISTS(SELECT 1 FROM private.desktop_deployment_versions WHERE id=tok.version_id AND status='active' AND validated_revision=revision AND cardinality(validation_errors)=0)) THEN
    RAISE EXCEPTION 'desktop_bundle_denied' USING ERRCODE='42501';
  END IF;
  UPDATE private.desktop_deployment_fetch_leases SET status=CASE WHEN p_failure_code IS NULL THEN 'delivered' ELSE 'failed' END,failure_code=p_failure_code,completed_at=now() WHERE id=lease.id;
  INSERT INTO private.desktop_deployment_audit_events(environment_id,version_id,token_id,event_type) VALUES(env.id,lease.version_id,tok.id,CASE WHEN p_failure_code IS NULL THEN 'bundle.delivered' ELSE 'bundle.failed' END);
END;
$$;