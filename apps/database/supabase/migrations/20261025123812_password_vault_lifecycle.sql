-- Requires 001 through 003. The cross-cutting lifecycle hooks require migration approval.
BEGIN;
CREATE FUNCTION private.password_vault_invalidate_workspace_member(p_ws uuid, p_user uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE v private.password_vaults; request uuid;
BEGIN
  FOR v IN SELECT x.* FROM private.password_vaults x JOIN private.password_vault_members m
    ON m.ws_id = x.ws_id AND m.vault_id = x.id
    WHERE m.ws_id = p_ws AND m.user_id = p_user AND m.revoked_at IS NULL
    ORDER BY x.id FOR UPDATE OF x LOOP
    request := gen_random_uuid();
    UPDATE private.password_vault_members SET revoked_at = now()
      WHERE ws_id = p_ws AND vault_id = v.id AND user_id = p_user AND revoked_at IS NULL;
    UPDATE private.password_vaults SET revision = revision + 1, authorization_epoch = authorization_epoch + 1,
      rotation_required = true, updated_at = now() WHERE ws_id = p_ws AND id = v.id
      RETURNING * INTO v;
    INSERT INTO private.password_vault_audit_events(ws_id, vault_id, request_id, actor_user_id,
      actor_type, event_type, metadata) VALUES (p_ws, v.id, request, p_user, 'system', 'member.workspace_revoke',
      jsonb_build_object('revision', v.revision, 'authorizationEpoch', v.authorization_epoch));
  END LOOP;
END $$;
CREATE FUNCTION private.password_vault_workspace_member_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.ws_id = OLD.ws_id AND NEW.user_id = OLD.user_id AND NEW.type = 'MEMBER' THEN RETURN NEW; END IF;
  END IF;
  PERFORM private.password_vault_invalidate_workspace_member(OLD.ws_id, OLD.user_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION private.password_vault_workspace_user_archived() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE platform_id uuid;
BEGIN
  IF NEW.archived AND NOT OLD.archived THEN
    FOR platform_id IN SELECT platform_user_id FROM public.workspace_user_linked_users
      WHERE ws_id = NEW.ws_id AND virtual_user_id = NEW.id LOOP
      PERFORM private.password_vault_invalidate_workspace_member(NEW.ws_id, platform_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION private.password_vault_workspace_user_unlinked() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  PERFORM private.password_vault_invalidate_workspace_member(OLD.ws_id, OLD.platform_user_id);
  RETURN OLD;
END $$;
CREATE TRIGGER password_vault_workspace_member_changed
  AFTER DELETE OR UPDATE OF type, ws_id, user_id ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION private.password_vault_workspace_member_changed();
CREATE TRIGGER password_vault_workspace_user_archived
  AFTER UPDATE OF archived ON public.workspace_users
  FOR EACH ROW EXECUTE FUNCTION private.password_vault_workspace_user_archived();
CREATE TRIGGER password_vault_workspace_user_unlinked
  AFTER DELETE ON public.workspace_user_linked_users
  FOR EACH ROW EXECUTE FUNCTION private.password_vault_workspace_user_unlinked();
ALTER FUNCTION private.password_vault_workspace_member_changed() OWNER TO postgres;
ALTER FUNCTION private.password_vault_workspace_user_archived() OWNER TO postgres;
ALTER FUNCTION private.password_vault_workspace_user_unlinked() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.password_vault_invalidate_workspace_member(uuid, uuid)
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
REVOKE ALL ON FUNCTION private.password_vault_workspace_member_changed()
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
REVOKE ALL ON FUNCTION private.password_vault_workspace_user_archived()
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
REVOKE ALL ON FUNCTION private.password_vault_workspace_user_unlinked()
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
COMMIT;
