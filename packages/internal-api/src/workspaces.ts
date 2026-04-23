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

export async function listWorkspaces(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<InternalApiWorkspaceSummary[]>('/api/v1/workspaces', {
    cache: 'no-store',
  });
}

export async function listCmsWorkspaces(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<InternalApiWorkspaceSummary[]>('/api/v1/cms/workspaces', {
    cache: 'no-store',
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
    const fallbackMessage = `Internal API request failed: ${response.status}`;
    let data: { errorCode?: string; message?: string } | null = null;

    try {
      data = (await response.json()) as {
        errorCode?: string;
        message?: string;
      };
    } catch {
      data = null;
    }

    const error = new Error(data?.message || fallbackMessage) as Error & {
      errorCode?: string;
    };
    error.errorCode = data?.errorCode;
    throw error;
  }

  return (await response.json()) as {
    message?: string;
    errorCode?: string;
  };
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
