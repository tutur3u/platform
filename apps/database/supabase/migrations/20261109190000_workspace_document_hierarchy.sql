-- Nested workspace documents. parent_id is null for a root. position is the
-- sibling order; null sorts after numbered siblings. Deleting a page sets its
-- children's parent_id to null (they become roots) and does not delete them.
-- Existing rows stay roots. No RLS change.
--
-- The trigger is the tenant check: a parent must be in the same workspace
-- (both null counts as the same), a page cannot parent itself or its own
-- descendant, and no node can sit deeper than 16 (a root is depth 1).
-- Rollback: apps/database/rollbacks/20261109190000_workspace_document_hierarchy.rollback.sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.workspace_documents
  ADD COLUMN parent_id uuid,
  ADD COLUMN position integer;

ALTER TABLE public.workspace_documents
  ADD CONSTRAINT workspace_documents_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES public.workspace_documents (id)
  ON DELETE SET NULL;

CREATE INDEX workspace_documents_parent_id_idx
  ON public.workspace_documents (parent_id)
  WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_workspace_document_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_depth integer := 1;
  v_extra integer := 0;
  v_cursor uuid;
  v_next uuid;
  v_ancestor_ws uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.ws_id IS DISTINCT FROM OLD.ws_id THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('public.workspace_documents.hierarchy', 20261109190000)
    );
    IF EXISTS (
      SELECT 1
      FROM public.workspace_documents AS child
      WHERE child.parent_id = NEW.id
        AND child.ws_id IS DISTINCT FROM NEW.ws_id
    ) THEN
      RAISE EXCEPTION 'A document cannot move to another workspace while it has children'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A document cannot be its own parent'
      USING ERRCODE = '23514';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.workspace_documents.hierarchy', 20261109190000)
  );

  v_cursor := NEW.parent_id;
  WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'Document parent would create a cycle'
        USING ERRCODE = '23514';
    END IF;

    SELECT ancestor.parent_id, ancestor.ws_id
      INTO v_next, v_ancestor_ws
    FROM public.workspace_documents AS ancestor
    WHERE ancestor.id = v_cursor
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent document does not exist'
        USING ERRCODE = '23503';
    END IF;

    IF v_ancestor_ws IS DISTINCT FROM NEW.ws_id THEN
      RAISE EXCEPTION 'A document and its parent must belong to the same workspace'
        USING ERRCODE = '42501';
    END IF;

    v_depth := v_depth + 1;
    IF v_depth > 16 THEN
      RAISE EXCEPTION 'Document hierarchy cannot be deeper than 16'
        USING ERRCODE = '23514';
    END IF;

    v_cursor := v_next;
  END LOOP;

  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE descendants AS (
      SELECT child.id, 1 AS edge
      FROM public.workspace_documents AS child
      WHERE child.parent_id = NEW.id
      UNION ALL
      SELECT next_child.id, descendants.edge + 1
      FROM public.workspace_documents AS next_child
      JOIN descendants ON next_child.parent_id = descendants.id
      WHERE descendants.edge < 16
    )
    SELECT coalesce(pg_catalog.max(descendants.edge), 0)
      INTO v_extra
    FROM descendants;

    IF v_depth + v_extra > 16 THEN
      RAISE EXCEPTION 'Document hierarchy cannot be deeper than 16'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION public.enforce_workspace_document_hierarchy()
FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_workspace_document_hierarchy() IS
  'Keeps a document parent in the same workspace, rejects cycles, and caps depth at 16.';

DROP TRIGGER IF EXISTS workspace_documents_hierarchy_check
  ON public.workspace_documents;
CREATE TRIGGER workspace_documents_hierarchy_check
  BEFORE INSERT OR UPDATE OF parent_id, ws_id
  ON public.workspace_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_document_hierarchy();

COMMIT;
