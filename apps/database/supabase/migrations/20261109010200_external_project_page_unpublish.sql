BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.unpublish_workspace_external_project_page(
  p_ws_id uuid, p_entry_id uuid, p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.workspace_external_project_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_entry public.workspace_external_project_entries;
  v_canonical_id text;
BEGIN
  IF public.can_publish_workspace_external_projects(p_ws_id, p_actor_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'not allowed to unpublish in this workspace' USING ERRCODE = '42501';
  END IF;
  SELECT e.* INTO v_entry FROM public.workspace_external_project_entries e
  WHERE e.id = p_entry_id AND e.ws_id = p_ws_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT b.canonical_project_id INTO v_canonical_id
  FROM public.workspace_external_project_bindings b WHERE b.ws_id = p_ws_id;
  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'workspace has no external project binding' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.workspace_external_project_publish_events (
    ws_id, canonical_external_project_id, entry_id, event_kind,
    visibility_scope, payload, triggered_by
  ) VALUES (
    p_ws_id, v_canonical_id, p_entry_id, 'unpublish', 'public',
    jsonb_build_object('replaced_page_version_id', v_entry.published_page_version_id), p_actor_id
  );
  UPDATE public.workspace_external_project_entries e
  SET published_page_version_id = NULL, status = 'draft', published_at = NULL,
    updated_by = p_actor_id
  WHERE e.id = p_entry_id AND e.ws_id = p_ws_id RETURNING e.* INTO v_entry;
  RETURN v_entry;
END;
$$;
REVOKE ALL ON FUNCTION public.unpublish_workspace_external_project_page(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.unpublish_workspace_external_project_page(uuid,uuid,uuid) review=CMS-L1-caller-bound-unpublish
GRANT EXECUTE ON FUNCTION public.unpublish_workspace_external_project_page(uuid, uuid, uuid) TO authenticated, service_role;
COMMIT;
