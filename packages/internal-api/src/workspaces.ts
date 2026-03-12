import type { Workspace } from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type InternalWorkspaceSummary = Pick<
  Workspace,
  'id' | 'name' | 'personal' | 'avatar_url' | 'logo_url'
>;

export interface InternalWorkspaceMember {
  id: string;
  user_id?: string;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  is_creator?: boolean;
}

export async function listWorkspaces(options?: InternalApiClientOptions) {
  const client = getInternalApiClient(options);
  return client.json<InternalWorkspaceSummary[]>('/api/v1/workspaces', {
    cache: 'no-store',
  });
}

export async function listWorkspaceMembers(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{ members: InternalWorkspaceMember[] }>(
    `/api/workspaces/${encodePathSegment(workspaceId)}/members`,
    {
      cache: 'no-store',
    }
  );

  return payload.members ?? [];
}
