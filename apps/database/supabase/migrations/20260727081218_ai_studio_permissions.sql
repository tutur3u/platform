-- Dedicated AI Studio permissions. These are intentionally separate from the
-- legacy workspace AI credit permissions so access can be delegated narrowly.

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'use_ai_studio';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_ai_keys';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_ai_policy';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_ai_prompts';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_ai_agents';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'manage_ai_evaluations';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'view_ai_usage';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'view_ai_logs';
