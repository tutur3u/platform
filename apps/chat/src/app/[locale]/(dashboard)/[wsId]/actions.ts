'use server';

import { fetchSatelliteWorkspaces } from '@tuturuuu/satellite/workspace-actions';

const TUTURUUU_PRODUCTION_LOGO_URL =
  'https://tuturuuu.com/media/logos/transparent.png';
const TUTURUUU_LOCAL_LOGO_URL = '/media/logos/transparent.png';

export async function fetchWorkspaces() {
  const workspaces = await fetchSatelliteWorkspaces();

  return workspaces.map((workspace) => ({
    ...workspace,
    avatar_url:
      workspace.avatar_url === TUTURUUU_PRODUCTION_LOGO_URL
        ? TUTURUUU_LOCAL_LOGO_URL
        : workspace.avatar_url,
  }));
}
