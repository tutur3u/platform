'use server';

import { fetchSatelliteWorkspaces } from '@tuturuuu/satellite/workspace-actions';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export async function fetchWorkspaces() {
  const workspaces = await fetchSatelliteWorkspaces();
  return workspaces.filter((workspace) => workspace.id === ROOT_WORKSPACE_ID);
}
