import type {
  WorkspaceDefaultPermissionMemberType,
  WorkspaceDefaultPermissionsRole,
  WorkspaceRole,
} from '@tuturuuu/types';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiQuery,
} from './client';

export interface WorkspacePermissionSetupStatus {
  hasConfiguredPermissions: boolean;
}

export type WorkspaceSettingsAvailabilityKey =
  | 'api_keys'
  | 'billing'
  | 'inquiries'
  | 'integrations'
  | 'reports'
  | 'secrets'
  | 'usage'
  | 'workspace_members'
  | 'workspace_roles'
  | 'workspace_settings';

/**
 * The complete `/settings/permissions` response.
 *
 * Every field is required on purpose. Consumers read these flags as
 * `?? false`, so a payload that omits one is indistinguishable from a denial —
 * apps/contacts once answered this endpoint with a single field and locked its
 * whole settings dialog to read-only. Keeping the contract total means the
 * producer fails to compile rather than the UI failing quietly.
 */
export interface WorkspacePermissionsSummary {
  allow_discord_integrations: boolean;
  available: Record<WorkspaceSettingsAvailabilityKey, boolean>;
  can_access_api_keys: boolean;
  can_access_billing: boolean;
  can_access_inquiries: boolean;
  can_access_integrations: boolean;
  can_access_secrets: boolean;
  enable_api_keys: boolean;
  is_root_workspace: boolean;
  is_tuturuuu_member: boolean;
  manage_api_keys: boolean;
  manage_subscription: boolean;
  manage_user_report_templates: boolean;
  manage_workspace_billing: boolean;
  manage_workspace_integrations: boolean;
  manage_workspace_members: boolean;
  manage_workspace_roles: boolean;
  manage_workspace_secrets: boolean;
  manage_workspace_settings: boolean;
  view_usage: boolean;
}

/**
 * The summary for someone with no access at all, for callers that treat a 403
 * as a denial rather than a failure. Lives beside the type so widening the
 * contract updates every caller at once.
 */
export const DENIED_WORKSPACE_PERMISSIONS: WorkspacePermissionsSummary = {
  allow_discord_integrations: false,
  available: {
    api_keys: false,
    billing: false,
    inquiries: false,
    integrations: false,
    reports: false,
    secrets: false,
    usage: false,
    workspace_members: false,
    workspace_roles: false,
    workspace_settings: false,
  },
  can_access_api_keys: false,
  can_access_billing: false,
  can_access_inquiries: false,
  can_access_integrations: false,
  can_access_secrets: false,
  enable_api_keys: false,
  is_root_workspace: false,
  is_tuturuuu_member: false,
  manage_api_keys: false,
  manage_subscription: false,
  manage_user_report_templates: false,
  manage_workspace_billing: false,
  manage_workspace_integrations: false,
  manage_workspace_members: false,
  manage_workspace_roles: false,
  manage_workspace_secrets: false,
  manage_workspace_settings: false,
  view_usage: false,
};

export interface WorkspaceSettingsAiCreditStatus {
  included: {
    remaining: number;
    totalAllocated: number;
    totalUsed: number;
  };
  payg: {
    nextExpiry: string | null;
    remaining: number;
    totalGranted: number;
    totalUsed: number;
  };
  percentUsed: number;
  remaining: number;
  tier: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';
  totalAllocated: number;
  totalUsed: number;
}

export interface WorkspaceRolesListResponse {
  count: number;
  data: WorkspaceRole[];
}

export interface WorkspaceRoleOptionsListResponse {
  count: number;
  data: Array<{ id: string; name: string }>;
}

export interface WorkspaceRolesListQuery extends InternalApiQuery {
  page?: string | number;
  pageSize?: string | number;
  q?: string;
}

export type WorkspaceRoleMutationPayload = Pick<
  WorkspaceRole,
  'name' | 'permissions'
> & {
  id?: string;
};

export async function getWorkspacePermissionSetupStatus(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspacePermissionSetupStatus>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/permissions/setup-status`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspacePermissionsSummary(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspacePermissionsSummary>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/permissions`,
    {
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceAiCreditStatus(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceSettingsAiCreditStatus>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/ai/credits`,
    {
      cache: 'no-store',
    }
  );
}

export async function checkWorkspacePermission(
  workspaceId: string,
  permission: string,
  userId?: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ hasPermission: boolean }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/settings/permissions/check`,
    {
      query: {
        permission,
        userId,
      },
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceRoles(
  workspaceId: string,
  query?: WorkspaceRolesListQuery,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRolesListResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles`,
    {
      query,
      cache: 'no-store',
    }
  );
}

export async function listWorkspaceRoleOptions(
  workspaceId: string,
  query?: Pick<WorkspaceRolesListQuery, 'page' | 'pageSize'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceRoleOptionsListResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/options`,
    { query, cache: 'no-store' }
  );
}

export async function createWorkspaceRole(
  workspaceId: string,
  payload: WorkspaceRoleMutationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ id: string; message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles`,
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

export async function updateWorkspaceRole(
  workspaceId: string,
  roleId: string,
  payload: WorkspaceRoleMutationPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/${encodePathSegment(roleId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
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
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceDefaultPermissions(
  workspaceId: string,
  memberType: WorkspaceDefaultPermissionMemberType = 'MEMBER',
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WorkspaceDefaultPermissionsRole>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/default`,
    {
      query: {
        memberType,
      },
      cache: 'no-store',
    }
  );
}

export async function updateWorkspaceDefaultPermissions(
  workspaceId: string,
  memberType: WorkspaceDefaultPermissionMemberType,
  payload: Pick<WorkspaceDefaultPermissionsRole, 'permissions'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/roles/default`,
    {
      method: 'PUT',
      query: {
        memberType,
      },
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        member_type: memberType,
      }),
      cache: 'no-store',
    }
  );
}

export async function getWorkspaceCalendarHours(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    personalHours: Record<string, unknown>;
    workHours: Record<string, unknown>;
    meetingHours: Record<string, unknown>;
  }>(`/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar-hours`, {
    cache: 'no-store',
  });
}

export async function getWorkspaceCalendarSettings(
  workspaceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    timezone?: string | null;
    first_day_of_week?: string | null;
  }>(`/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar-settings`, {
    cache: 'no-store',
  });
}

export async function updateWorkspaceCalendarHours(
  workspaceId: string,
  payload: { type: 'PERSONAL' | 'WORK' | 'MEETING'; hours: unknown },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{ success: true }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/calendar-hours`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function getPostsFilterOptions(
  workspaceId: string,
  query?: { includedGroups?: string[] },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const search = new URLSearchParams();

  for (const groupId of query?.includedGroups ?? []) {
    search.append('includedGroups', groupId);
  }

  const suffix = search.toString() ? `?${search.toString()}` : '';

  return client.json<{
    userGroups: Array<{ id: string; name: string | null; amount: number }>;
    excludedUserGroups: Array<{
      id: string;
      name: string | null;
      amount: number;
    }>;
    users: Array<{ id: string; full_name: string | null }>;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/posts/filter-options${suffix}`,
    {
      cache: 'no-store',
    }
  );
}
