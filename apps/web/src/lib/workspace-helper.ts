import {
  INTERNAL_WORKSPACE_SLUG,
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

/**
 * Normalizes a workspace identifier (slug or special keyword) into a UUID.
 *
 * - "personal" -> resolves actual personal workspace ID via getWorkspace()
 * - "internal" -> ROOT_WORKSPACE_ID
 * - otherwise -> resolveWorkspaceId(wsId)
 *
 * @param wsIdParam Raw workspace identifier from URL or request
 * @returns Resolved workspace UUID
 */
export const normalizeWorkspaceId = async (
  wsIdParam: string
): Promise<string> => {
  const normalized = wsIdParam.toLowerCase();

  if (normalized === PERSONAL_WORKSPACE_SLUG) {
    const workspace = await getWorkspace(wsIdParam);
    return workspace.id;
  }

  if (normalized === INTERNAL_WORKSPACE_SLUG) {
    return ROOT_WORKSPACE_ID;
  }

  return resolveWorkspaceId(wsIdParam);
};
