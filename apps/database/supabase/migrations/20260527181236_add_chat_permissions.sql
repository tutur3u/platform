ALTER TYPE public.workspace_role_permission ADD VALUE IF NOT EXISTS 'view_chat';
ALTER TYPE public.workspace_role_permission ADD VALUE IF NOT EXISTS 'create_chat';
ALTER TYPE public.workspace_role_permission ADD VALUE IF NOT EXISTS 'manage_chat';
ALTER TYPE public.workspace_role_permission ADD VALUE IF NOT EXISTS 'moderate_chat';
