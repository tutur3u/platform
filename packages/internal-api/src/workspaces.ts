import type {
  InternalApiEnhancedWorkspaceMember,
  InternalApiWorkspaceMember,
  InternalApiWorkspaceSummary,
  Workspace,
} from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

type InternalApiErrorPayload = {
  error?: string;
  errorCode?: string;
  message?: string;
};

export type WorkspaceInvitationStatus = 'member' | 'pending_invite' | 'none';
export type WorkspaceInvitationSource = 'direct' | 'email';
export type WorkspaceInvitationMemberType = 'MEMBER' | 'GUEST';

export type WorkspaceInvitationWorkspace = {
  avatar_url: string | null;
  handle: string | null;
  id: string;
  logo_url: string | null;
  name: string | null;
  personal: boolean;
};

export type WorkspaceInvitationRecord = {
  createdAt: string | null;
  matchedEmail: string | null;
  source: WorkspaceInvitationSource;
  type: WorkspaceInvitationMemberType;
  workspace: WorkspaceInvitationWorkspace;
};

export type WorkspaceInviteStatusResponse =
  | {
      status: 'member';
      workspace: WorkspaceInvitationWorkspace;
    }
  | {
      invitation: WorkspaceInvitationRecord;
      status: 'pending_invite';
      workspace: WorkspaceInvitationWorkspace;
    }
  | {
      status: 'none';
      workspace: WorkspaceInvitationWorkspace | null;
    };

export type WorkspaceInvitationsResponse = {
  invitations: WorkspaceInvitationRecord[];
};

export type WorkspaceMemberSettingsResponse = {
  disableInvite: boolean;
};

export type WorkspaceSecretSummary = {
  created_at?: string | null;
  id?: string;
  name?: string | null;
  updated_at?: string | null;
};

export type ListWorkspacesParams = {
  limit?: number;
  q?: string;
};

export type CreateTeamWorkspacePayload = {
  avatar_url?: string;
  name: string;
};

export type CreateTeamWorkspaceResponse = {
  id: string;
  name: string;
};

function isInternalApiClientOptions(
  value: InternalApiClientOptions | ListWorkspacesParams | undefined
): value is InternalApiClientOptions {
  if (!value || typeof value !== 'object') return false;

  return 'baseUrl' in value || 'defaultHeaders' in value || 'fetch' in value;
}

async function parseAndThrowInternalApiError(
  response: Response
): Promise<never> {
  const fallbackMessage = `Internal API request failed: ${response.status}`;
  let data: InternalApiErrorPayload | null = null;

  try {
    data = (await response.json()) as InternalApiErrorPayload;
  } catch {
    data = null;
  }

  const error = new Error(
    data?.message || data?.error || fallbackMessage
  ) as Error & { errorCode?: string };
  error.errorCode = data?.errorCode;
  throw error;
}

export async function listWorkspaces(
  options?: InternalApiClientOptions
): Promise<InternalApiWorkspaceSummary[]>;
export async function listWorkspaces(
  params?: ListWorkspacesParams,
  options?: InternalApiClientOptions
): Promise<InternalApiWorkspaceSummary[]>;
export async function listWorkspaces(
  paramsOrOptions?: InternalApiClientOptions | ListWorkspacesParams,
  maybeOptions?: InternalApiClientOptions
) {
  const params = isInternalApiClientOptions(paramsOrOptions)
    ? undefined
    : paramsOrOptions;
  const options = isInternalApiClientOptions(paramsOrOptions)
    ? paramsOrOptions
    : maybeOptions;
  const client = getInternalApiClient(options);
  return client.json<InternalApiWorkspaceSummary[]>('/api/v1/workspaces', {
    cache: 'no-store',
    query: {
      limit: params?.limit,
      q: params?.q?.trim() || undefined,
    },
  });
}

export async function listCmsWorkspaces(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<InternalApiWorkspaceSummary[]>('/api/v1/cms/workspaces', {
    cache: 'no-store',
  });
}

export async function createTeamWorkspace(
  payload: CreateTeamWorkspacePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CreateTeamWorkspaceResponse>('/api/v1/workspaces/team', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

export async function getWorkspace(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<Workspace>(
    `/api/workspaces/${encodePathSegment(workspaceId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceInviteStatus(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceInviteStatusResponse>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/invite-status`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceInvitations(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceInvitationsResponse>(
    '/api/workspaces/invitations',
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspace(
  workspaceId: string,
  payload: {
    handle?: string;
    name: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/workspaces/${encodePathSegment(workspaceId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );

  if (!response.ok) {
    await parseAndThrowInternalApiError(response);
  }

  return (await response.json()) as { message: string };
}

export type WorkspaceAvatarUploadTarget = {
  filePath: string;
  publicUrl: string;
  signedUrl: string;
  token: string;
};

export async function createWorkspaceAvatarUploadTarget(
  workspaceId: string,
  filename: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceAvatarUploadTarget>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/avatar/upload-url`,
    {
      body: JSON.stringify({ filename }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }
  );
}

export async function uploadWorkspaceAvatarFile(
  target: Pick<WorkspaceAvatarUploadTarget, 'signedUrl' | 'token'>,
  file: Blob
) {
  const response = await fetch(target.signedUrl, {
    body: file,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${target.token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    method: 'PUT',
  });

  if (!response.ok) {
    throw new Error(`Workspace avatar upload failed: ${response.status}`);
  }
}

export async function updateWorkspaceAvatar(
  workspaceId: string,
  filePath: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ avatarUrl: string; success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/avatar`,
    {
      body: JSON.stringify({ filePath }),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

export async function deleteWorkspaceAvatar(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/avatar`,
    { cache: 'no-store', method: 'DELETE' }
  );
}

export async function getWorkspaceExternalProjectMembersContext(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    boundProjectName: null | string;
    canManageMembers: boolean;
    canManageRoles: boolean;
    currentUserEmail: null | string;
    workspaceId: string;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/members`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceMembers(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ members: InternalApiWorkspaceMember[] }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/members`,
    {
      cache: 'no-store',
    }
  );

  return payload.members ?? [];
}

export async function getWorkspaceMemberSettings(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceMemberSettingsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/members`,
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceSecrets(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<WorkspaceSecretSummary[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/secrets`,
    {
      cache: 'no-store',
    }
  );
}

export async function listEnhancedWorkspaceMembers(
  workspaceId: string,
  status?: 'all' | 'joined' | 'invited',
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (status && status !== 'all') {
    searchParams.set('status', status);
  }

  const suffix = searchParams.toString();
  return client.json<InternalApiEnhancedWorkspaceMember[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/members/enhanced${suffix ? `?${suffix}` : ''}`,
    {
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceMemberProfile(
  workspaceId: string,
  payload: {
    displayName: string | null;
    email?: string | null;
    userId?: string | null;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    message: string;
    workspaceUser: {
      id: string;
      display_name: string | null;
    };
  }>(`/api/workspaces/${encodePathSegment(workspaceId)}/members/profile`, {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  });
}

export async function inviteWorkspaceMembers(
  workspaceId: string,
  emails: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    message: string;
    results: Array<{ email: string; success: boolean; error?: string }>;
    successCount: number;
    totalRequested: number;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/members/batch-invite`,
    {
      body: JSON.stringify({ emails }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  payload: { email: string; memberType: 'MEMBER' | 'GUEST' },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/workspaces/${encodePathSegment(workspaceId)}/members/invite`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );

  if (!response.ok) {
    await parseAndThrowInternalApiError(response);
  }

  return (await response.json()) as {
    message?: string;
    errorCode?: string;
  };
}

export async function acceptWorkspaceInvite(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/workspaces/${encodePathSegment(workspaceId)}/accept-invite`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );

  if (!response.ok) {
    await parseAndThrowInternalApiError(response);
  }

  return (await response.json().catch(() => ({}))) as { message?: string };
}

export async function declineWorkspaceInvite(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/workspaces/${encodePathSegment(workspaceId)}/decline-invite`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );

  if (!response.ok) {
    await parseAndThrowInternalApiError(response);
  }

  return (await response.json().catch(() => ({}))) as { message?: string };
}

export async function removeWorkspaceMember(
  workspaceId: string,
  payload: { email?: string | null; userId?: string | null },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (payload.userId) {
    searchParams.set('id', payload.userId);
  }

  if (payload.email) {
    searchParams.set('email', payload.email);
  }

  return client.json<{ message: string; workspace_deleted?: boolean }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/members?${searchParams.toString()}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
