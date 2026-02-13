import {
  PERSONAL_WORKSPACE_SLUG,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getWorkspace,
  getWorkspaceConfig as getWorkspaceConfigUtil,
  isPersonalWorkspace as isPersonalWorkspaceUtil,
} from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

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
    if (!workspace) notFound();
    return workspace.id;
  }

  return resolveWorkspaceId(wsIdParam);
};

/**
 * Check if a workspace ID corresponds to a personal workspace
 * @param workspaceId - The workspace ID to check
 * @returns true if the workspace is personal, false otherwise
 */
export const isPersonalWorkspace = async (
  workspaceId: string
): Promise<boolean> => {
  return isPersonalWorkspaceUtil(workspaceId);
};

/**
 * Fetches a workspace configuration by ID.
 *
 * @param wsId - The workspace ID
 * @param configId - The configuration ID
 * @returns The configuration value or null if not found
 */
export const getWorkspaceConfig = async (
  wsId: string,
  configId: string
): Promise<string | null> => {
  return getWorkspaceConfigUtil(wsId, configId);
};
