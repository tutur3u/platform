// next.config rewrites these to Web `beforeFiles`; the bridge does too.
import { TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS } from '@tuturuuu/utils/next-config';

export const centralFirst = TUTURUUU_WEB_WORKSPACE_API_RESERVED_PATHS.filter(
  (path) => path !== '/api/v1/workspaces/:wsId/users/feedbacks'
);
