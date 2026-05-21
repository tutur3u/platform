import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';

export async function getDriveWorkspace(id: string) {
  const user = await getSatelliteAppSessionUser('drive');

  if (!user?.id) {
    return null;
  }

  return getWorkspace(id, { useAdmin: true, user });
}

export async function getDriveWorkspacePermissions(id: string) {
  const user = await getSatelliteAppSessionUser('drive');

  if (!user?.id) {
    return null;
  }

  return getPermissions({ user, wsId: id });
}
