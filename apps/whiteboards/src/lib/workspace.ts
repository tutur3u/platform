import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  createRequestLocal,
  maybeBridgeRequest,
} from '@tuturuuu/start-bridge/request-context/reader';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';

const whiteboardsUser =
  createRequestLocal<ReturnType<typeof getSatelliteAppSessionUser>>(
    'Whiteboards actor'
  );
const whiteboardsWorkspaces = createRequestLocal<
  Map<string, Promise<Awaited<ReturnType<typeof getWorkspace>>>>
>('Whiteboards workspace lookups');

export function getWhiteboardsUser() {
  if (!maybeBridgeRequest()) return getSatelliteAppSessionUser('whiteboards');

  const existing = whiteboardsUser.get();
  if (existing) return existing;
  const user = getSatelliteAppSessionUser('whiteboards');
  whiteboardsUser.set(user);
  return user;
}

async function loadWhiteboardsWorkspace(id: string) {
  const user = await getWhiteboardsUser();
  return user?.id ? getWorkspace(id, { useAdmin: true, user }) : null;
}

export function getWhiteboardsWorkspace(id: string) {
  if (!maybeBridgeRequest()) return loadWhiteboardsWorkspace(id);

  let workspaces = whiteboardsWorkspaces.get();
  if (!workspaces) {
    workspaces = new Map();
    whiteboardsWorkspaces.set(workspaces);
  }
  const existing = workspaces.get(id);
  if (existing) return existing;
  const workspace = loadWhiteboardsWorkspace(id);
  workspaces.set(id, workspace);
  return workspace;
}
