import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { fetchSatelliteWorkspaces } from '@tuturuuu/satellite/workspace-actions';

export async function fetchAuthorizedWorkspaces() {
  const user = await getSatelliteAppSessionUser('calendar');
  if (!user?.id) throw new Error('Unauthorized');
  return fetchSatelliteWorkspaces();
}
