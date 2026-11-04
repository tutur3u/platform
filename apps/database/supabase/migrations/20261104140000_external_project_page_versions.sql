-- CMS page versions: immutable block-layout snapshots of an external project
-- entry, plus the entry's published version pointer. Access follows the entry
-- tables: publishers and managers of the owning workspace read, managers save
-- drafts, and publishing goes through one caller-bound function. Versions
-- start as drafts and are never edited; publishing an older version is the
-- content rollback.
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
  CONSTRAINT workspace_external_project_page_versions_entry_number_key
    UNIQUE (entry_id, version_number),
  CONSTRAINT workspace_external_project_page_versions_id_entry_key
    UNIQUE (id, entry_id),
  CONSTRAINT workspace_external_project_page_versions_published_check
    CHECK ((status = 'published') = (published_at IS NOT NULL))
);

CREATE INDEX workspace_external_project_page_versions_ws_idx
  ON public.workspace_external_project_page_versions (ws_id, entry_id);

-- The pointer can only name a version of the same entry.
ALTER TABLE public.workspace_external_project_entries
  ADD COLUMN published_page_version_id uuid,
  ADD CONSTRAINT workspace_external_project_entries_published_page_version_fkey
    FOREIGN KEY (published_page_version_id, id)
    REFERENCES public.workspace_external_project_page_versions(id, entry_id)
    ON DELETE SET NULL (published_page_version_id);

ALTER TABLE public.workspace_external_project_page_versions
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace external project publishers can read page versions"
ON public.workspace_external_project_page_versions
FOR SELECT
TO authenticated
USING (public.can_publish_workspace_external_projects(ws_id));

CREATE POLICY "Workspace external project managers can save page versions"
ON public.workspace_external_project_page_versions
FOR INSERT
TO authenticated
WITH CHECK (public.can_manage_workspace_external_projects(ws_id));

-- No UPDATE or DELETE grant: versions are immutable; entry deletion cascades.
GRANT SELECT, INSERT
ON public.workspace_external_project_page_versions
TO authenticated, service_role;

-- New versions get the next number under the entry row lock, start as drafts
-- and record the time of saving.
CREATE FUNCTION public.prepare_workspace_external_project_page_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  PERFORM 1
  FROM public.workspace_external_project_entries e
  WHERE e.id = NEW.entry_id AND e.ws_id = NEW.ws_id
  FOR UPDATE;

  -- An entry the caller cannot update gets no number, so the insert fails
  -- (RLS, then NOT NULL) without revealing versions in another workspace.
  IF FOUND THEN
    SELECT coalesce(max(v.version_number), 0) + 1
    INTO NEW.version_number
    FROM public.workspace_external_project_page_versions v
    WHERE v.entry_id = NEW.entry_id;
  ELSE
    NEW.version_number := NULL;
  END IF;

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

-- The pointer may only name a published version, even when a manager updates
-- the entry row directly.
CREATE FUNCTION public.check_workspace_external_project_published_page_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.published_page_version_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_external_project_page_versions v
    WHERE v.id = NEW.published_page_version_id
      AND v.status = 'published'
  ) THEN
    RAISE EXCEPTION 'page version % is not published', NEW.published_page_version_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_workspace_external_project_published_page_version() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER workspace_external_project_entries_published_page_version_check
  BEFORE UPDATE OF published_page_version_id
  ON public.workspace_external_project_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.check_workspace_external_project_published_page_version();

-- Publishes one version of an entry in p_ws_id and points the entry at it.
-- Client callers act only as themselves (the helper is caller-bound); the
-- service role passes the acting user. Republishing an older version keeps
-- its first publish time and is the content rollback.
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
  v_version public.workspace_external_project_page_versions;
BEGIN
  IF public.can_publish_workspace_external_projects(p_ws_id, p_actor_id)
    IS DISTINCT FROM true
  THEN
    RAISE EXCEPTION 'not allowed to publish in this workspace'
      USING ERRCODE = '42501';
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

COMMIT;
