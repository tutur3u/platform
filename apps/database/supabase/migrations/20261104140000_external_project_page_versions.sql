-- CMS page versions: immutable block-layout snapshots of an external project
-- entry, plus the entry's published version pointer. Editors, publishers and
-- managers of the owning workspace read and save drafts (private preview);
-- publishers and managers publish through one function that writes the
-- public publish event, the version status and the pointer together. The
-- pointer is the only public state of a page: nothing else, including a
-- preview, can move it. Publishing an older version is the content rollback.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.workspace_external_project_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  data jsonb NOT NULL CHECK (
    jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 2097152
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  published_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_at timestamp with time zone,
  -- (ws_id, id) is unique on entries (20260717010000), so a version can never
  -- belong to an entry in another workspace.
  CONSTRAINT workspace_external_project_page_versions_entry_fkey
    FOREIGN KEY (ws_id, entry_id)
    REFERENCES public.workspace_external_project_entries(ws_id, id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_external_project_page_versions_number_key
    UNIQUE (ws_id, entry_id, version_number),
  CONSTRAINT workspace_external_project_page_versions_id_entry_key
    UNIQUE (id, entry_id),
  CONSTRAINT workspace_external_project_page_versions_published_check
    CHECK ((status = 'published') = (published_at IS NOT NULL))
);

-- The pointer can only name a version of the same entry.
ALTER TABLE public.workspace_external_project_entries
  ADD COLUMN published_page_version_id uuid,
  ADD CONSTRAINT workspace_external_project_entries_published_page_version_fkey
    FOREIGN KEY (published_page_version_id, id)
    REFERENCES public.workspace_external_project_page_versions(id, entry_id)
    ON DELETE SET NULL (published_page_version_id);

ALTER TABLE public.workspace_external_project_page_versions
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace external project editors can read page versions"
ON public.workspace_external_project_page_versions
FOR SELECT
TO authenticated
USING (public.can_edit_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project editors can save page versions"
ON public.workspace_external_project_page_versions
FOR INSERT
TO authenticated
WITH CHECK (public.can_edit_workspace_external_projects(ws_id));

-- No UPDATE or DELETE grant: versions are immutable; entry deletion cascades.
GRANT SELECT, INSERT
ON public.workspace_external_project_page_versions
TO authenticated, service_role;

-- New versions get the next number per entry, serialized per entry, start as
-- drafts and record the time of saving. RLS and the foreign key still decide
-- whether the row may exist.
CREATE FUNCTION public.prepare_workspace_external_project_page_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.entry_id::text, 0));

  SELECT coalesce(max(v.version_number), 0) + 1
  INTO NEW.version_number
  FROM public.workspace_external_project_page_versions v
  WHERE v.ws_id = NEW.ws_id AND v.entry_id = NEW.entry_id;

  NEW.status := 'draft';
  NEW.published_at := NULL;
  NEW.published_by := NULL;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION public.prepare_workspace_external_project_page_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_external_project_page_versions_prepare
  BEFORE INSERT ON public.workspace_external_project_page_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_workspace_external_project_page_version();

-- Client roles cannot move the pointer, even managers who may update entries
-- (or the legacy entry publish and preview paths). Only the publish function
-- (running as its owner) and foreign key actions change it.
CREATE FUNCTION public.guard_workspace_external_project_published_page_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role') THEN
    RAISE EXCEPTION 'publish page versions with publish_workspace_external_project_page_version'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_workspace_external_project_published_page_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_external_project_entries_published_page_version_guard
  BEFORE UPDATE OF published_page_version_id
  ON public.workspace_external_project_entries
  FOR EACH ROW
  WHEN (OLD.published_page_version_id IS DISTINCT FROM NEW.published_page_version_id)
  EXECUTE FUNCTION public.guard_workspace_external_project_published_page_version();

-- Publishes one version of an entry in p_ws_id: one public publish event, the
-- version status and the entry pointer, all or nothing. Client callers act
-- only as themselves (the helper is caller-bound); the service role passes
-- the acting user. Republishing an older version keeps its first publish time.
CREATE FUNCTION public.publish_workspace_external_project_page_version(
  p_ws_id uuid,
  p_version_id uuid,
  p_actor_id uuid DEFAULT auth.uid()
)
RETURNS public.workspace_external_project_page_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_canonical_id text;
  v_version public.workspace_external_project_page_versions;
BEGIN
  IF public.can_publish_workspace_external_projects(p_ws_id, p_actor_id)
    IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'not allowed to publish in this workspace'
      USING ERRCODE = '42501';
  END IF;

  SELECT b.canonical_project_id INTO v_canonical_id
  FROM public.workspace_external_project_bindings b
  WHERE b.ws_id = p_ws_id AND b.is_enabled
    AND b.canonical_project_id IS NOT NULL;
  IF v_canonical_id IS NULL THEN
    RAISE EXCEPTION 'workspace has no enabled external project binding'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.workspace_external_project_page_versions v
  SET status = 'published',
      published_at = coalesce(v.published_at, now()),
      published_by = coalesce(v.published_by, p_actor_id)
  WHERE v.id = p_version_id AND v.ws_id = p_ws_id
  RETURNING v.* INTO v_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'page version not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.workspace_external_project_publish_events (
    ws_id, canonical_external_project_id, entry_id, event_kind,
    visibility_scope, payload, triggered_by
  ) VALUES (
    p_ws_id, v_canonical_id, v_version.entry_id, 'publish', 'public',
    jsonb_build_object(
      'page_version_id', v_version.id,
      'version_number', v_version.version_number,
      'schema_version', v_version.schema_version
    ),
    p_actor_id
  );

  UPDATE public.workspace_external_project_entries e
  SET published_page_version_id = v_version.id,
      updated_by = coalesce(p_actor_id, e.updated_by)
  WHERE e.id = v_version.entry_id AND e.ws_id = p_ws_id;

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_workspace_external_project_page_version(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.publish_workspace_external_project_page_version(uuid,uuid,uuid) review=CMS-M1-DATA-caller-bound-can-publish
GRANT EXECUTE ON FUNCTION public.publish_workspace_external_project_page_version(uuid, uuid, uuid) TO authenticated, service_role;

-- Delivery read: the entry's published version and nothing else, whatever
-- drafts exist. Service role only; the renderer reads through delivery.
CREATE FUNCTION public.get_published_workspace_external_project_page_version(
  p_ws_id uuid,
  p_entry_id uuid
)
RETURNS SETOF public.workspace_external_project_page_versions
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT v.*
  FROM public.workspace_external_project_entries e
  JOIN public.workspace_external_project_page_versions v
    ON v.id = e.published_page_version_id AND v.entry_id = e.id
  WHERE e.ws_id = p_ws_id AND e.id = p_entry_id AND v.status = 'published';
$$;

REVOKE ALL ON FUNCTION public.get_published_workspace_external_project_page_version(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_published_workspace_external_project_page_version(uuid, uuid) TO service_role;

COMMIT;
