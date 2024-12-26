alter type "public"."workspace_role_permission" rename to "workspace_role_permission__old_version_to_be_dropped";

create type "public"."workspace_role_permission" as enum ('view_infrastructure', 'manage_workspace_secrets', 'manage_external_migrations', 'manage_workspace_roles', 'manage_workspace_members', 'manage_workspace_settings', 'manage_workspace_integrations', 'manage_workspace_billing', 'manage_workspace_security', 'manage_workspace_audit_logs', 'manage_user_report_templates', 'ai_chat');

alter table "public"."workspace_default_permissions" alter column permission type "public"."workspace_role_permission" using permission::text::"public"."workspace_role_permission";

alter table "public"."workspace_role_permissions" alter column permission type "public"."workspace_role_permission" using permission::text::"public"."workspace_role_permission";

drop type "public"."workspace_role_permission__old_version_to_be_dropped";


