import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  createRequestLocal,
  maybeBridgeRequest,
} from '@tuturuuu/start-bridge/request-context/reader';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';

const driveUser =
  createRequestLocal<ReturnType<typeof getSatelliteAppSessionUser>>(
    'Drive actor'
  );
const driveWorkspaces = createRequestLocal<
  Map<string, Promise<Awaited<ReturnType<typeof getWorkspace>>>>
>('Drive workspace lookups');

export function getDriveUser() {
  if (!maybeBridgeRequest()) return getSatelliteAppSessionUser('drive');

  const existing = driveUser.get();
  if (existing) return existing;
  const user = getSatelliteAppSessionUser('drive');
  driveUser.set(user);
  return user;
}

async function loadDriveWorkspace(id: string) {
  const user = await getDriveUser();
  return user?.id ? getWorkspace(id, { useAdmin: true, user }) : null;
}

export function getDriveWorkspace(id: string) {
  if (!maybeBridgeRequest()) return loadDriveWorkspace(id);

  let workspaces = driveWorkspaces.get();
  if (!workspaces) {
    workspaces = new Map();
    driveWorkspaces.set(workspaces);
  }
  const existing = workspaces.get(id);
  if (existing) return existing;
  const workspace = loadDriveWorkspace(id);
  workspaces.set(id, workspace);
  return workspace;
}

export async function getDriveWorkspacePermissions(id: string) {
  const user = await getDriveUser();

  if (!user?.id) {
    return null;
  }

  return getPermissions({ user, wsId: id });
}
