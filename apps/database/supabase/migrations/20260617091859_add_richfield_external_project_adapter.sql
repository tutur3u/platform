ALTER TYPE "public"."external_project_adapter_kind"
ADD VALUE IF NOT EXISTS 'richfield';

GRANT SELECT, INSERT, UPDATE, DELETE
ON "public"."workspace_external_project_bindings"
TO service_role;
