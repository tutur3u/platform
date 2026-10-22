import '@tanstack/react-start/server-only';
import { fetchSatelliteWorkspaces } from '@tuturuuu/satellite/workspace-actions';
export function listMailWorkspaces() {
  return fetchSatelliteWorkspaces();
}
