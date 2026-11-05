SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'create_task_sprints';
ALTER TYPE public.workspace_role_permission
  ADD VALUE IF NOT EXISTS 'delete_task_sprints';
