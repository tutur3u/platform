-- Desktop signing administration is distinct from mobile Store credentials.
ALTER TYPE public.workspace_role_permission ADD VALUE IF NOT EXISTS 'manage_desktop_deployment_vault';
