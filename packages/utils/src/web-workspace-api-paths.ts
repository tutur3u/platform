/**
 * Workspace API paths the central Web app owns ahead of a satellite's own
 * routes. Dependency-free so client bundles can import it.
 */
export const TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS = [
  '/api/workspaces/invitations',
  '/api/v1/workspaces/:wsId/settings/permissions',
  '/api/v1/workspaces/:wsId/users/feedbacks',
] as const;
