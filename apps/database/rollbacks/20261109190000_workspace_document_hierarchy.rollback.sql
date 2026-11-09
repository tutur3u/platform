-- Rollback: 20261109190000_workspace_document_hierarchy.sql
-- Drops the hierarchy trigger, parent link, and sibling position.
-- Children are not rewritten; dropping parent_id discards the tree links.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP TRIGGER IF EXISTS workspace_documents_hierarchy_check
  ON public.workspace_documents;

DROP FUNCTION IF EXISTS public.enforce_workspace_document_hierarchy();

ALTER TABLE public.workspace_documents
  DROP CONSTRAINT IF EXISTS workspace_documents_parent_id_fkey;

DROP INDEX IF EXISTS public.workspace_documents_parent_id_idx;

ALTER TABLE public.workspace_documents
  DROP COLUMN IF EXISTS parent_id,
  DROP COLUMN IF EXISTS position;

COMMIT;
