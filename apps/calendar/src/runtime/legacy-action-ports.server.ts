import '@tanstack/react-start/server-only';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { fetchSatelliteWorkspaces } from '@tuturuuu/satellite/workspace-actions';
import { createAuthorizedWorkspaceReader } from '@tuturuuu/tasks-ui/tu-do/shared/workspace-actions';
export const fetchAuthorizedWorkspaces = createAuthorizedWorkspaceReader({
  getActor: () => getSatelliteAppSessionUser('calendar'),
  readWorkspaces: fetchSatelliteWorkspaces,
});
