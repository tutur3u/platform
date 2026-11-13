-- Manual rollback only: removes workspace custom domains added by
-- 20261111120100_workspace_domains.sql. This deletes every domain binding,
-- add-on reconciliation row and domain audit row; export them first if any
-- must be kept. Detach the Cloudflare custom hostnames, DNS records and Worker
-- routes first and deploy app code without the domain routes. Then roll back
-- 20261111120000.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Also drops its policies, grants, indexes and triggers.
DROP TABLE public.workspace_domains;
DROP FUNCTION private.guard_workspace_domain_insert();
DROP FUNCTION private.guard_workspace_domain_update();
DROP FUNCTION private.workspace_domain_serving_allowed(uuid);
DROP FUNCTION private.workspace_domain_entitlement(uuid, uuid);
DROP TABLE private.workspace_domain_audit;
DROP TABLE private.workspace_domain_addons;
DROP TABLE private.workspace_domain_caps;
DROP TABLE private.workspace_domain_settings;

COMMIT;
