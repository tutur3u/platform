import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import type {
  WorkspaceUserPlatformLinkRepairPayload,
  WorkspaceUserPlatformLinkRepairResponse,
} from './users';

export async function repairWorkspaceUserPlatformLinks(
  workspaceId: string,
  payload: WorkspaceUserPlatformLinkRepairPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceUserPlatformLinkRepairResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/links/repair`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export function respondToWorkspaceContactAccountLink(
  workspaceId: string,
  invitation: {
    action: 'confirm' | 'decline';
    workspaceUserId: string;
    invitationId: string;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(options).json<{ outcome: 'linked' | 'declined' }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/links/repair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invitation),
      cache: 'no-store',
    }
  );
}
