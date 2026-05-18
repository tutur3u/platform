import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type UserGroupStatusFilter = 'all' | 'active' | 'archived';

export type WorkspaceUserGroupsParams = {
  ids?: string[];
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
  q?: string;
  status?: UserGroupStatusFilter;
  userId?: string;
};

export type WorkspaceUserGroupsResponse = {
  count: number;
  data: UserGroup[];
  error?: boolean;
  errorMessage?: string;
};

export type WorkspaceUserGroupsPageResponse = WorkspaceUserGroupsResponse & {
  page: number;
  pageSize: number;
};

export type RemoveWorkspaceUserGroupIndicatorCategoryResponse = {
  message: string;
};

const DEFAULT_PAGE_SIZE = 50;
const ALL_GROUPS_PAGE_SIZE = 200;

function resolveStatus(
  params: WorkspaceUserGroupsParams
): UserGroupStatusFilter {
  return params.status ?? (params.includeArchived ? 'all' : 'active');
}

export function getNextWorkspaceUserGroupsPageParam<
  TPage extends { count: number; data: unknown[]; pageSize: number },
>(lastPage: TPage, allPages: TPage[]) {
  if (lastPage.data.length === 0 || lastPage.data.length < lastPage.pageSize) {
    return undefined;
  }

  const loadedCount = allPages.reduce(
    (total, currentPage) => total + currentPage.data.length,
    0
  );

  if (loadedCount >= lastPage.count) {
    return undefined;
  }

  return allPages.length + 1;
}

export async function listWorkspaceUserGroups(
  workspaceId: string,
  params: WorkspaceUserGroupsParams = {},
  options?: InternalApiClientOptions
): Promise<WorkspaceUserGroupsPageResponse> {
  const client = getInternalApiClient(options);
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;
  const status = resolveStatus(params);

  const payload = await client.json<WorkspaceUserGroupsResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/groups`,
    {
      cache: 'no-store',
      query: {
        ids: params.ids?.join(','),
        page,
        pageSize,
        q: params.q,
        status: status === 'active' ? undefined : status,
        userId: params.userId,
      },
    }
  );

  if (payload.error) {
    throw new Error(
      payload.errorMessage || 'Failed to fetch workspace user groups'
    );
  }

  return {
    ...payload,
    page,
    pageSize,
  };
}

export async function listAllWorkspaceUserGroups(
  workspaceId: string,
  params: Omit<WorkspaceUserGroupsParams, 'page' | 'pageSize'> = {},
  options?: InternalApiClientOptions
) {
  const groups: UserGroup[] = [];
  const pages: WorkspaceUserGroupsPageResponse[] = [];
  let page = 1;

  while (true) {
    const payload = await listWorkspaceUserGroups(
      workspaceId,
      {
        ...params,
        page,
        pageSize: ALL_GROUPS_PAGE_SIZE,
      },
      options
    );

    pages.push(payload);
    groups.push(...payload.data);

    const nextPage = getNextWorkspaceUserGroupsPageParam(payload, pages);
    if (nextPage === undefined) {
      break;
    }

    page = nextPage;
  }

  return groups;
}

export async function listWorkspaceUserGroupsByIds(
  workspaceId: string,
  groupIds: string[],
  options?: InternalApiClientOptions
) {
  if (groupIds.length === 0) {
    return [];
  }

  const payload = await listWorkspaceUserGroups(
    workspaceId,
    {
      ids: groupIds,
      page: 1,
      pageSize: Math.max(groupIds.length, 1),
      status: 'all',
    },
    options
  );

  return payload.data;
}

export function removeWorkspaceUserGroupIndicatorCategory(
  workspaceId: string,
  groupId: string,
  categoryId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RemoveWorkspaceUserGroupIndicatorCategoryResponse>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/user-groups/${encodePathSegment(groupId)}/indicators/categories/${encodePathSegment(categoryId)}`,
    { cache: 'no-store', method: 'DELETE' }
  );
}
