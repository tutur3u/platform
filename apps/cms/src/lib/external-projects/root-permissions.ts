import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { cache } from 'react';

/**
 * Root-workspace permissions for one user, memoized for the current request
 * only (React `cache()` never crosses requests). The layout and the access
 * resolver both need them, so a single read serves both.
 */
export const getCmsRootPermissions = cache(
  async (userId: string, email: string | null) =>
    getPermissions({ user: { email, id: userId }, wsId: ROOT_WORKSPACE_ID })
);
