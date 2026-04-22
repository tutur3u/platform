import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type WorkspaceRolePermission = {
  enabled: boolean;
  id: string;
};

type WorkspaceRoleSummary = {
  id: string;
  name: string;
};

export type WorkspaceRoleDetails = WorkspaceRoleSummary & {
  created_at?: string | null;
  permissions: WorkspaceRolePermission[];
};

export type WorkspaceRolePayload = {
  name: string;
  permissions: WorkspaceRolePermission[];
};

export async function listWorkspaceRoles(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleSummary[]>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceRole(
  workspaceId: string,
  roleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleDetails>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceDefaultRole(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleDetails>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/default`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceRole(
  workspaceId: string,
  payload: WorkspaceRolePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function updateWorkspaceRole(
  workspaceId: string,
  roleId: string,
  payload: WorkspaceRolePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function updateWorkspaceDefaultRole(
  workspaceId: string,
  payload: WorkspaceRolePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/default`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function deleteWorkspaceRole(
  workspaceId: string,
  roleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function listRoleMembers(
  workspaceId: string,
  roleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const payload = await client.json<{
    data: WorkspaceUser[];
    count: number;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}/members`,
    {
      cache: 'no-store',
    }
  );

  return payload;
}

export async function addRoleMembers(
  workspaceId: string,
  roleId: string,
  memberIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}/members`,
    {
      body: JSON.stringify({ memberIds }),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function removeRoleMember(
  workspaceId: string,
  roleId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}/members/${encodePathSegment(userId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
