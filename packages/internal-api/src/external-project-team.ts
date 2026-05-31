import type {
  InternalApiEnhancedWorkspaceMember,
  WorkspaceDefaultPermissionMemberType,
} from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';
import type { WorkspaceRoleDetails, WorkspaceRolePayload } from './roles';

export type WorkspaceExternalProjectMembersContext = {
  boundProjectName: null | string;
  canManageMembers: boolean;
  canManageRoles: boolean;
  currentUserEmail: null | string;
  workspaceId: string;
};

function externalProjectMembersPath(workspaceId: string) {
  return `/api/v1/workspaces/${encodePathSegment(workspaceId)}/external-projects/members`;
}

export async function getWorkspaceExternalProjectMembersContext(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceExternalProjectMembersContext>(
    externalProjectMembersPath(workspaceId),
    {
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceExternalProjectMembers(
  workspaceId: string,
  status?: 'all' | 'joined' | 'invited',
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);

  return client.json<InternalApiEnhancedWorkspaceMember[]>(
    `${externalProjectMembersPath(workspaceId)}/enhanced`,
    {
      cache: 'no-store',
      query: {
        status: status && status !== 'all' ? status : undefined,
      },
    }
  );
}

export async function inviteWorkspaceExternalProjectMembers(
  workspaceId: string,
  emails: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    message: string;
    results: Array<{ email: string; error?: string; success: boolean }>;
    successCount: number;
    totalRequested: number;
  }>(`${externalProjectMembersPath(workspaceId)}/invite`, {
    body: JSON.stringify({ emails }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
}

export async function removeWorkspaceExternalProjectMember(
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
    `${externalProjectMembersPath(workspaceId)}/access?${searchParams.toString()}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function listWorkspaceExternalProjectRoles(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleDetails[]>(
    `${externalProjectMembersPath(workspaceId)}/roles`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceExternalProjectRole(
  workspaceId: string,
  roleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleDetails>(
    `${externalProjectMembersPath(workspaceId)}/roles/${encodePathSegment(roleId)}`,
    {
      cache: 'no-store',
    }
  );
}

export async function createWorkspaceExternalProjectRole(
  workspaceId: string,
  payload: WorkspaceRolePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${externalProjectMembersPath(workspaceId)}/roles`,
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

export async function updateWorkspaceExternalProjectRole(
  workspaceId: string,
  roleId: string,
  payload: WorkspaceRolePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${externalProjectMembersPath(workspaceId)}/roles/${encodePathSegment(roleId)}`,
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

export async function deleteWorkspaceExternalProjectRole(
  workspaceId: string,
  roleId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${externalProjectMembersPath(workspaceId)}/roles/${encodePathSegment(roleId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function getWorkspaceExternalProjectDefaultRole(
  workspaceId: string,
  memberType: WorkspaceDefaultPermissionMemberType = 'MEMBER',
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleDetails>(
    `${externalProjectMembersPath(workspaceId)}/roles/default`,
    {
      cache: 'no-store',
      query: { memberType },
    }
  );
}

export async function updateWorkspaceExternalProjectDefaultRole(
  workspaceId: string,
  memberType: WorkspaceDefaultPermissionMemberType,
  payload: WorkspaceRolePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${externalProjectMembersPath(workspaceId)}/roles/default`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
      query: { memberType },
    }
  );
}

export async function addWorkspaceExternalProjectRoleMembers(
  workspaceId: string,
  roleId: string,
  memberIds: string[],
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${externalProjectMembersPath(workspaceId)}/roles/${encodePathSegment(roleId)}/members`,
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

export async function removeWorkspaceExternalProjectRoleMember(
  workspaceId: string,
  roleId: string,
  userId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `${externalProjectMembersPath(workspaceId)}/roles/${encodePathSegment(roleId)}/members/${encodePathSegment(userId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
