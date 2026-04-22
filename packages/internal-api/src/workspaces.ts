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
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InternalApiEnhancedWorkspaceMember[]>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/members/enhanced`,
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
