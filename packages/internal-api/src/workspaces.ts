import {
  createInternalApiClient,
  type InternalApiClientOptions,
  internalApiClient,
} from './client';

export interface InternalWorkspaceSummary {
  id: string;
  name: string;
  personal?: boolean;
  avatar_url?: string | null;
  logo_url?: string | null;
}

export interface InternalWorkspaceMember {
  id: string;
  user_id?: string;
  workspace_id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

function getClient(options?: InternalApiClientOptions) {
  return options ? createInternalApiClient(options) : internalApiClient;
}

export async function listWorkspaces(options?: InternalApiClientOptions) {
  const client = getClient(options);
  return client.json<InternalWorkspaceSummary[]>('/api/v1/workspaces', {
    cache: 'no-store',
  });
}

export async function listWorkspaceMembers(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getClient(options);
  const payload = await client.json<{ members: InternalWorkspaceMember[] }>(
    `/api/workspaces/${workspaceId}/members`,
    {
      cache: 'no-store',
    }
  );

  return payload.members ?? [];
}
