import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

/**
 * Normalizes a workspace identifier (slug or special keyword) into a UUID.
 *
 * - "personal" -> resolves actual personal workspace ID via getWorkspace()
 * - All other identifiers (including "internal") -> delegated to resolveWorkspaceId()
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

  return resolveWorkspaceId(wsIdParam);
};
