BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.workspace_user_org_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE
    CHECK (ws_id = '00000000-0000-0000-0000-000000000000'::uuid),
  workspace_user_id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('agent_role','team','project')),
  subject_key text NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 64 AND subject_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  relation text NOT NULL CHECK (relation IN ('owns','manages','reviews','member_of','customer_of','stakeholder_of')),
  title text CHECK (length(title) <= 80),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (ws_id,workspace_user_id) REFERENCES public.workspace_users(ws_id,id) ON DELETE CASCADE,
  UNIQUE (workspace_user_id,subject_kind,subject_key,relation)
);
CREATE INDEX workspace_user_org_links_ws_idx ON public.workspace_user_org_links(ws_id);
CREATE INDEX workspace_user_org_links_user_idx ON public.workspace_user_org_links(workspace_user_id);
CREATE INDEX workspace_user_org_links_subject_idx ON public.workspace_user_org_links(subject_kind,subject_key);

-- tuturuuu: no-grant (internal)
CREATE FUNCTION private.guard_workspace_user_org_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'org link creator must be the authenticated actor' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'org link creation fields are immutable' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_workspace_user_org_link() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER guard_workspace_user_org_link BEFORE INSERT OR UPDATE ON public.workspace_user_org_links
FOR EACH ROW EXECUTE FUNCTION private.guard_workspace_user_org_link();

ALTER TABLE public.workspace_user_org_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY manage_mastermind ON public.workspace_user_org_links FOR ALL TO authenticated
USING (public.has_workspace_permission(ws_id,(SELECT auth.uid()),'manage_mastermind'))
WITH CHECK (public.has_workspace_permission(ws_id,(SELECT auth.uid()),'manage_mastermind'));
CREATE POLICY account_required_mfa ON public.workspace_user_org_links AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT public.account_required_mfa_satisfied()) AND (SELECT auth.jwt()->>'aal') = 'aal2')
WITH CHECK ((SELECT public.account_required_mfa_satisfied()) AND (SELECT auth.jwt()->>'aal') = 'aal2');
REVOKE ALL ON public.workspace_user_org_links FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_user_org_links TO authenticated;
COMMIT;
