'use server';

import { fetchSatelliteWorkspaces } from '@tuturuuu/satellite/workspace-actions';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

const TUTURUUU_PRODUCTION_LOGO_URL =
  'https://tuturuuu.com/media/logos/transparent.png';
const TUTURUUU_LOCAL_LOGO_URL = '/media/logos/transparent.png';

export async function fetchWorkspaces() {
  const workspaces = await fetchSatelliteWorkspaces();

  return orderChatWorkspaces(
    workspaces.map((workspace) => ({
      ...workspace,
      avatar_url:
        workspace.avatar_url === TUTURUUU_PRODUCTION_LOGO_URL
          ? TUTURUUU_LOCAL_LOGO_URL
          : workspace.avatar_url,
    }))
  );
}

export async function fetchWorkspacesPage({
  limit = 40,
  offset = 0,
}: {
  limit?: number;
  offset?: number;
} = {}) {
  const normalizedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const normalizedOffset = Math.max(Math.trunc(offset), 0);
  const workspaces = await fetchWorkspaces();
  const nextOffset =
    workspaces.length > normalizedOffset + normalizedLimit
      ? normalizedOffset + normalizedLimit
      : null;

  return {
    nextOffset,
    workspaces: workspaces.slice(
      normalizedOffset,
      normalizedOffset + normalizedLimit
    ),
  };
}

function orderChatWorkspaces(workspaces: InternalApiWorkspaceSummary[]) {
  return [...workspaces].sort((left, right) => {
    const rankDelta = getChatWorkspaceRank(left) - getChatWorkspaceRank(right);
    if (rankDelta !== 0) return rankDelta;

    return (left.name || '').localeCompare(right.name || '');
  });
}

function getChatWorkspaceRank(workspace: InternalApiWorkspaceSummary) {
  if (workspace.id === ROOT_WORKSPACE_ID) return 0;
  if (workspace.personal) return 1;
  return 2;
}
