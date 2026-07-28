import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  getPermissions,
  getWorkspace,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';

export async function getGitWorkspace(id: string) {
  const user = await getSatelliteAppSessionUser('git');
  if (!user?.id) return null;
  return getWorkspace(id, { useAdmin: true, user });
}

export async function getGitWorkspacePermissions(
  wsId: string
): Promise<PermissionsResult | null> {
  const user = await getSatelliteAppSessionUser('git');
  if (!user?.id) return null;
  return getPermissions({ user, wsId });
}
