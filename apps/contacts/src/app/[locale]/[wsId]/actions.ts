'use server';

import { fetchSatelliteWorkspaces } from '@tuturuuu/satellite/workspace-actions';

export async function fetchWorkspaces() {
  return fetchSatelliteWorkspaces();
}
