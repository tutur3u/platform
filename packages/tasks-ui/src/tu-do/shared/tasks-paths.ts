import { resolveOwnAppApiPath } from '@tuturuuu/internal-api/client';

/**
 * A Tasks API path for browser fetches from tasks-ui. Inside Tasks, its own
 * routes resolve under the app base (`/tasks/api/...` on `tuturuuu.com/tasks`,
 * unchanged on the subdomain); in any other app (Web), the path is unchanged.
 */
export function tasksApiPath(path: string): string {
  return resolveOwnAppApiPath('tasks', path);
}

/** Global the start-bridge head script sets to the document's app base. */
const APP_BASE_GLOBAL = '__tuturuuuAppBase';

/**
 * A root-absolute page path under the current document's app base
 * (`/tasks/...` inside mounted Tasks, unchanged at a host root).
 */
export function withDocumentAppBase(path: string): string {
  const base = (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL];
  if (typeof base !== 'string' || !base || !path.startsWith('/')) return path;
  if (path.startsWith('//')) return path;
  if (path === base || path.startsWith(`${base}/`)) return path;
  return path === '/' ? base : `${base}${path}`;
}
