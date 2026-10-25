import { TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS } from '@tuturuuu/utils/next-config';

/**
 * Reserved Web workspace API paths that Contacts serves locally with
 * satellite app-session auth instead of forwarding to Web.
 */
export const CONTACTS_LOCAL_RESERVED_API_PATHS: ReadonlySet<string> = new Set([
  '/api/v1/workspaces/:wsId/users/feedbacks',
]);

/**
 * Paths that must reach the central Web API even when a local dynamic route
 * would match them (`/api/workspaces/invitations` vs `[wsId]`). Next applies
 * these as `beforeFiles` rewrites; the native Worker registers them ahead of
 * the generated endpoint registry.
 */
export const CONTACTS_CENTRAL_FIRST_API_PATHS =
  TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS.filter(
    (path) => !CONTACTS_LOCAL_RESERVED_API_PATHS.has(path)
  );
