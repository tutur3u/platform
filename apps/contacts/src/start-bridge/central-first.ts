import { TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS } from '@tuturuuu/utils/next-config';

// Match Contacts' Next beforeFiles exclusions so its local feedback auth wins.
export const centralFirst = TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS.filter(
  (path) => path !== '/api/v1/workspaces/:wsId/users/feedbacks'
);
