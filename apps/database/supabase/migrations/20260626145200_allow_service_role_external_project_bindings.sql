-- Allow server-owned CMS/admin API routes to dual-write the first-class
-- workspace external-project binding table through the service-role client.
-- RLS remains enabled; this does not grant browser/authenticated users any new
-- mutation path.

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_bindings"
TO service_role;
