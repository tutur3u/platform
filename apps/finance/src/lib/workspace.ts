import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';

export async function getFinanceWorkspace(id: string) {
  const user = await getSatelliteAppSessionUser('finance');

  if (!user?.id) {
    return null;
  }

  return getWorkspace(id, { useAdmin: true, user });
}

export async function getFinanceWorkspacePermissions(id: string) {
  const user = await getSatelliteAppSessionUser('finance');

  if (!user?.id) {
    return null;
  }

  return getPermissions({ user, wsId: id });
}
