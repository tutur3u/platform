import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export interface WorkspacePermissionSetupStatus {
  hasConfiguredPermissions: boolean;
}

export interface WorkspacePermissionsSummary {
  manage_subscription: boolean;
  manage_workspace_settings: boolean;
}

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
