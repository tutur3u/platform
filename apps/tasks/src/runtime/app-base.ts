import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { createAppBaseResolver } from '@tuturuuu/start-bridge/start/app-base';
import { TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS } from '@tuturuuu/utils/next-config';
import { appApiPatterns } from './api-patterns.bridge.gen';

/**
 * The `/api/[...path]` catch-all is not ownership: it 404s Tasks-owned paths
 * that have no explicit route and forwards everything else to Web. Only the
 * explicit routes are Tasks', so only they resolve under the app base
 * (`/tasks/api/...` on `tuturuuu.com/tasks`, `/api/...` on the subdomain);
 * every other `/api` path goes to Web.
 */
export const TASKS_OWNED_API_PATTERNS: readonly string[] =
  appApiPatterns.filter((pattern) => !pattern.includes('[...'));

/** Static Web routes must precede Tasks' dynamic workspace endpoint. */
export const TASKS_CENTRAL_FIRST_API_PATTERNS =
  TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS;

export const tasksAppBaseResolver = createAppBaseResolver(
  TASKS_OWNED_API_PATTERNS,
  TASKS_CENTRAL_FIRST_API_PATTERNS
);

registerDefaultAppBaseResolver(tasksAppBaseResolver, { app: 'tasks' });
