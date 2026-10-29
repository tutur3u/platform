BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE private.password_vault_lifecycle_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('member','archive','account','workspace')),
  ws_id uuid,
  user_id uuid,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  last_error_code text CHECK (last_error_code ~ '^[0-9A-Z]{5}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  CHECK ((kind = 'account' OR ws_id IS NOT NULL) AND (kind = 'workspace' OR user_id IS NOT NULL))
);
ALTER TABLE private.password_vault_lifecycle_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.password_vault_lifecycle_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.password_vault_lifecycle_jobs FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
CREATE INDEX password_vault_lifecycle_pending_idx ON private.password_vault_lifecycle_jobs(next_attempt_at, id)
  WHERE completed_at IS NULL;
-- Capture only metadata: no vault row, audit or cross-domain FK write is on the user path.
CREATE FUNCTION private.password_vault_enqueue_lifecycle(p_kind text,p_ws uuid,p_user uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO private.password_vault_lifecycle_jobs(kind,ws_id,user_id) VALUES(p_kind,p_ws,p_user);
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Password vault lifecycle capture unavailable (SQLSTATE %); reconcile retained references', SQLSTATE;
END $$;
CREATE FUNCTION private.password_vault_invalidate_workspace_member(p_ws uuid,p_user uuid)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN PERFORM private.password_vault_enqueue_lifecycle('member',p_ws,p_user); END $$;
CREATE FUNCTION private.password_vault_workspace_member_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '100ms' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.ws_id = OLD.ws_id AND NEW.user_id = OLD.user_id AND NEW.type = 'MEMBER' THEN RETURN NEW; END IF;
  END IF;
  PERFORM private.password_vault_invalidate_workspace_member(OLD.ws_id,OLD.user_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE FUNCTION private.password_vault_workspace_user_archived() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '100ms' AS $$
BEGIN
  IF NEW.archived AND NOT OLD.archived THEN
    PERFORM private.password_vault_enqueue_lifecycle('archive',NEW.ws_id,NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION private.password_vault_workspace_user_unlinked() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '100ms' AS $$
BEGIN PERFORM private.password_vault_invalidate_workspace_member(OLD.ws_id,OLD.platform_user_id); RETURN OLD; END $$;
CREATE FUNCTION private.password_vault_account_erased() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '100ms' AS $$
BEGIN PERFORM private.password_vault_enqueue_lifecycle('account',NULL,OLD.id); RETURN OLD; END $$;
CREATE FUNCTION private.password_vault_workspace_erased() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '100ms' AS $$
BEGIN PERFORM private.password_vault_enqueue_lifecycle('workspace',OLD.id,OLD.creator_id); RETURN OLD; END $$;
CREATE TRIGGER password_vault_workspace_member_changed AFTER DELETE OR UPDATE OF type,ws_id,user_id
  ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION private.password_vault_workspace_member_changed();
CREATE TRIGGER password_vault_workspace_user_archived AFTER UPDATE OF archived ON public.workspace_users
  FOR EACH ROW EXECUTE FUNCTION private.password_vault_workspace_user_archived();
CREATE TRIGGER password_vault_workspace_user_unlinked AFTER DELETE ON public.workspace_user_linked_users
  FOR EACH ROW EXECUTE FUNCTION private.password_vault_workspace_user_unlinked();
CREATE TRIGGER password_vault_account_erased BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.password_vault_account_erased();
CREATE TRIGGER password_vault_workspace_erased BEFORE DELETE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION private.password_vault_workspace_erased();
CREATE FUNCTION private.password_vault_require_lifecycle_clean(p_ws uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM private.password_vault_lifecycle_jobs j WHERE j.completed_at IS NULL
    AND (j.ws_id = p_ws OR (j.kind = 'account' AND j.user_id IN (
      SELECT created_by FROM private.password_vaults WHERE ws_id=p_ws
      UNION SELECT user_id FROM private.password_vault_members WHERE ws_id=p_ws
      UNION SELECT issuer_user_id FROM private.password_vault_machine_grants WHERE ws_id=p_ws))))
    OR EXISTS (SELECT 1 FROM private.password_vaults v WHERE v.ws_id=p_ws AND (
      (v.created_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v.created_by))
      OR EXISTS (SELECT 1 FROM private.password_vault_members m WHERE m.vault_id=v.id AND m.revoked_at IS NULL
        AND m.user_id IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=m.user_id)
          OR NOT EXISTS(SELECT 1 FROM public.workspace_members w WHERE w.ws_id=p_ws AND w.user_id=m.user_id AND w.type='MEMBER')
          OR EXISTS(SELECT 1 FROM public.workspace_user_linked_users l JOIN public.workspace_users u
            ON u.ws_id=l.ws_id AND u.id=l.virtual_user_id
            WHERE l.ws_id=p_ws AND l.platform_user_id=m.user_id AND u.archived))))) THEN
    RAISE EXCEPTION 'Vault lifecycle reconciliation required' USING ERRCODE='55000';
  END IF;
END $$;
CREATE FUNCTION private.password_vault_apply_lifecycle(p_job uuid) RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE j private.password_vault_lifecycle_jobs; v private.password_vaults; processed integer:=0; actor uuid;
BEGIN
  SELECT * INTO STRICT j FROM private.password_vault_lifecycle_jobs WHERE id=p_job FOR UPDATE;
  FOR v IN SELECT x.* FROM private.password_vaults x WHERE
    (j.kind='workspace' AND x.ws_id=j.ws_id)
    OR (j.kind='account' AND (x.created_by=j.user_id
      OR EXISTS(SELECT 1 FROM private.password_vault_members m WHERE m.vault_id=x.id AND m.user_id=j.user_id)
      OR EXISTS(SELECT 1 FROM private.password_vault_machine_grants g WHERE g.vault_id=x.id AND g.issuer_user_id=j.user_id)))
    OR (j.kind IN ('member','archive') AND x.ws_id=j.ws_id AND EXISTS(
      SELECT 1 FROM private.password_vault_members m WHERE m.vault_id=x.id AND m.revoked_at IS NULL
        AND (j.kind='member' AND m.user_id=j.user_id OR j.kind='archive' AND m.user_id IN (
          SELECT l.platform_user_id FROM public.workspace_user_linked_users l WHERE l.ws_id=j.ws_id AND l.virtual_user_id=j.user_id))))
    ORDER BY x.id LIMIT 25 FOR UPDATE OF x NOWAIT LOOP
    actor:=COALESCE(j.user_id,'00000000-0000-0000-0000-000000000000'::uuid);
    IF j.kind='archive' THEN
      SELECT platform_user_id INTO actor FROM public.workspace_user_linked_users
        WHERE ws_id=j.ws_id AND virtual_user_id=j.user_id ORDER BY platform_user_id LIMIT 1;
    END IF;
    UPDATE private.password_vault_members m SET revoked_at=COALESCE(m.revoked_at,now())
      WHERE m.vault_id=v.id AND (j.kind='workspace' OR j.kind IN ('member','account') AND m.user_id=j.user_id
        OR j.kind='archive' AND m.user_id IN (SELECT l.platform_user_id FROM public.workspace_user_linked_users l
          WHERE l.ws_id=j.ws_id AND l.virtual_user_id=j.user_id));
    IF j.kind IN ('account','workspace') THEN
      UPDATE private.password_vault_machine_tokens t SET revoked_at=COALESCE(t.revoked_at,now())
        WHERE t.vault_id=v.id AND (j.kind='workspace' OR t.grant_id IN (
          SELECT g.id FROM private.password_vault_machine_grants g WHERE g.vault_id=v.id AND g.issuer_user_id=j.user_id));
      UPDATE private.password_vault_machine_grants g SET revoked_at=COALESCE(g.revoked_at,now())
        WHERE g.vault_id=v.id AND (j.kind='workspace' OR g.issuer_user_id=j.user_id);
    END IF;
    IF j.kind='account' THEN
      UPDATE private.password_vault_members SET user_id=NULL WHERE vault_id=v.id AND user_id=j.user_id;
      UPDATE private.password_vault_machine_grants SET issuer_user_id=NULL WHERE vault_id=v.id AND issuer_user_id=j.user_id;
    END IF;
    UPDATE private.password_vaults SET
      created_by=CASE WHEN j.kind='account' AND created_by=j.user_id THEN NULL ELSE created_by END,
      ws_id=CASE WHEN j.kind='workspace' THEN NULL ELSE ws_id END,
      retired_at=CASE WHEN j.kind='workspace' THEN now() ELSE retired_at END,
      revision=revision+1,authorization_epoch=authorization_epoch+1,rotation_required=true,updated_at=now()
      WHERE id=v.id RETURNING * INTO v;
    INSERT INTO private.password_vault_audit_events(ws_id,vault_id,request_id,actor_user_id,actor_type,event_type,metadata)
      VALUES(v.scope_ws_id,v.id,j.id,actor,'system',CASE j.kind WHEN 'account' THEN 'member.account_erased'
        WHEN 'workspace' THEN 'vault.workspace_erased' ELSE 'member.workspace_revoke' END,
        jsonb_build_object('revision',v.revision,'authorizationEpoch',v.authorization_epoch));
    processed:=processed+1;
  END LOOP;
  IF processed<25 THEN
    UPDATE private.password_vault_lifecycle_jobs SET completed_at=clock_timestamp(),last_error_code=NULL WHERE id=j.id;
  END IF;
  RETURN processed;
END $$;
CREATE FUNCTION private.password_vault_reconcile_lifecycle() RETURNS integer
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE inserted integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('password-vault-lifecycle-reconcile',0)) THEN RETURN 0; END IF;
  INSERT INTO private.password_vault_lifecycle_jobs(kind,ws_id,user_id)
    SELECT q.kind,q.ws_id,q.user_id FROM (
      SELECT 'workspace'::text AS kind,v.ws_id,NULL::uuid AS user_id FROM private.password_vaults v
        WHERE v.ws_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.workspaces w WHERE w.id=v.ws_id)
      UNION SELECT 'account',NULL,v.created_by FROM private.password_vaults v
        WHERE v.created_by IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=v.created_by)
      UNION SELECT 'account',NULL,m.user_id FROM private.password_vault_members m
        WHERE m.user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=m.user_id)
      UNION SELECT 'account',NULL,g.issuer_user_id FROM private.password_vault_machine_grants g
        WHERE g.issuer_user_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=g.issuer_user_id)
      UNION SELECT 'member',m.ws_id,m.user_id FROM private.password_vault_members m
        WHERE m.revoked_at IS NULL AND m.user_id IS NOT NULL AND (
          NOT EXISTS(SELECT 1 FROM public.workspace_members w WHERE w.ws_id=m.ws_id AND w.user_id=m.user_id AND w.type='MEMBER')
          OR EXISTS(SELECT 1 FROM public.workspace_user_linked_users l JOIN public.workspace_users u
            ON u.ws_id=l.ws_id AND u.id=l.virtual_user_id
            WHERE l.ws_id=m.ws_id AND l.platform_user_id=m.user_id AND u.archived))
    ) q WHERE NOT EXISTS(SELECT 1 FROM private.password_vault_lifecycle_jobs j WHERE j.completed_at IS NULL
      AND j.kind=q.kind AND j.ws_id IS NOT DISTINCT FROM q.ws_id AND j.user_id IS NOT DISTINCT FROM q.user_id)
    ORDER BY q.kind,q.ws_id,q.user_id LIMIT 25;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  RETURN inserted;
END $$;
CREATE FUNCTION private.password_vault_retry_lifecycle(p_limit integer DEFAULT 25) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout='100ms' AS $$
DECLARE j private.password_vault_lifecycle_jobs; processed integer:=0; failed integer:=0;
BEGIN
  IF COALESCE(NULLIF(current_setting('role',true),'none'),session_user::text)<>'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 THEN
    RAISE EXCEPTION 'Invalid lifecycle batch limit' USING ERRCODE='22023'; END IF;
  PERFORM private.password_vault_reconcile_lifecycle();
  FOR j IN SELECT * FROM private.password_vault_lifecycle_jobs WHERE completed_at IS NULL AND attempts<5
    AND next_attempt_at<=clock_timestamp() ORDER BY created_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
    BEGIN
      PERFORM private.password_vault_apply_lifecycle(j.id);
      processed:=processed+1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE private.password_vault_lifecycle_jobs SET attempts=attempts+1,last_error_code=SQLSTATE,
        next_attempt_at=clock_timestamp()+interval '30 seconds' WHERE id=j.id;
      failed:=failed+1;
    END;
  END LOOP;
  RETURN jsonb_build_object('processed',processed,'failed',failed,
    'remaining',(SELECT count(*) FROM private.password_vault_lifecycle_jobs WHERE completed_at IS NULL),
    'terminal',(SELECT count(*) FROM private.password_vault_lifecycle_jobs WHERE completed_at IS NULL AND attempts=5),
    'oldestPendingAt',(SELECT min(created_at) FROM private.password_vault_lifecycle_jobs WHERE completed_at IS NULL));
END $$;
DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname LIKE 'password_vault_%' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role',f.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION private.password_vault_execute(uuid,uuid,uuid,uuid,text,jsonb,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION private.password_vault_list(uuid,uuid,uuid,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION private.password_vault_retry_lifecycle(integer) TO service_role;
COMMIT;
