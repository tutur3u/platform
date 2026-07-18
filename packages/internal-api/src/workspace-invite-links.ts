import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  InternalApiError,
} from './client';

export type WorkspaceInviteLinkPayload = {
  expiresAt?: null | string;
  maxUses?: null | number;
  memberType: 'GUEST' | 'MEMBER';
};

export type WorkspaceInviteLinkApiRow = Record<string, unknown>;

type WorkspaceInviteLinkErrorPayload = {
  code?: string;
  error?: string;
  errorCode?: string;
  message?: string;
};

function workspaceInviteLinksPath(workspaceId: string) {
  return `/api/workspaces/${encodePathSegment(workspaceId)}/invite-links`;
}

async function parseInviteLinkResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const fallbackMessage = `Invite link request failed: ${response.status}`;
    let payload: WorkspaceInviteLinkErrorPayload | null = null;

    try {
      payload = (await response.json()) as WorkspaceInviteLinkErrorPayload;
    } catch {
      payload = null;
    }

    throw new InternalApiError(
      payload?.message || payload?.error || fallbackMessage,
      response.status,
      payload?.errorCode || payload?.code
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function listWorkspaceInviteLinks(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceInviteLinkApiRow[]>(
    workspaceInviteLinksPath(workspaceId),
    { cache: 'no-store' }
  );
}

export async function getWorkspaceInviteLink(
  workspaceId: string,
  linkId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceInviteLinkApiRow>(
    `${workspaceInviteLinksPath(workspaceId)}/${encodePathSegment(linkId)}`,
    { cache: 'no-store' }
  );
}

export async function createWorkspaceInviteLink(
  workspaceId: string,
  payload: WorkspaceInviteLinkPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(workspaceInviteLinksPath(workspaceId), {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  return parseInviteLinkResponse<WorkspaceInviteLinkApiRow>(response);
}

export async function updateWorkspaceInviteLink(
  workspaceId: string,
  linkId: string,
  payload: WorkspaceInviteLinkPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `${workspaceInviteLinksPath(workspaceId)}/${encodePathSegment(linkId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );

  return parseInviteLinkResponse<WorkspaceInviteLinkApiRow>(response);
}

export async function deleteWorkspaceInviteLink(
  workspaceId: string,
  linkId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `${workspaceInviteLinksPath(workspaceId)}/${encodePathSegment(linkId)}`,
    { cache: 'no-store', method: 'DELETE' }
  );

  return parseInviteLinkResponse<{ message?: string }>(response);
}
