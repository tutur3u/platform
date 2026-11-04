-- Manual rollback only: removes CMS page versions and the entry pointer added
-- by 20261104140000_external_project_page_versions.sql. This deletes every
-- saved page version; export the table first if any must be kept, and deploy
-- app code without the page-version routes before running it.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DROP FUNCTION public.publish_workspace_external_project_page_version(uuid, uuid, uuid);

DROP TRIGGER workspace_external_project_entries_published_page_version_check
  ON public.workspace_external_project_entries;
DROP FUNCTION public.check_workspace_external_project_published_page_version();

-- Also drops the pointer foreign key.
ALTER TABLE public.workspace_external_project_entries
  DROP COLUMN published_page_version_id;

-- Also drops its policies, grants, indexes and insert trigger.
DROP TABLE public.workspace_external_project_page_versions;
DROP FUNCTION public.prepare_workspace_external_project_page_version();

COMMIT;
