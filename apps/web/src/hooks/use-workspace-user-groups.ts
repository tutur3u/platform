import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

export interface WorkspaceUserGroup {
  id: string;
  name: string;
  archived: boolean | null;
}

export interface WorkspaceUserGroupWithGuest extends WorkspaceUserGroup {
  is_guest: boolean | null;
}

interface UseWorkspaceUserGroupsOptions {
  /**
   * Whether to include the `is_guest` field in the query
   * @default false
   */
  includeGuest?: boolean;
  ensureGroupIds?: string[];
}

interface FetchWorkspaceUserGroupsPageOptions {
  includeGuest?: boolean;
  page?: number;
  pageSize?: number;
  query?: string;
  groupIds?: string[];
}

interface WorkspaceUserGroupsPage {
  data: WorkspaceUserGroupWithGuest[];
  count: number;
  page: number;
  pageSize: number;
}

const GROUPS_PAGE_SIZE = 200;
const GROUPS_INFINITE_PAGE_SIZE = 50;

async function fetchWorkspaceUserGroupsPage(
  wsId: string,
  options: FetchWorkspaceUserGroupsPageOptions = {}
): Promise<WorkspaceUserGroupsPage> {
  const {
    includeGuest: _includeGuest = false,
    page = 1,
    pageSize = GROUPS_PAGE_SIZE,
    query = '',
    groupIds = [],
  } = options;
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(page));
  searchParams.set('pageSize', String(pageSize));

  if (query.trim()) {
    searchParams.set('q', query.trim());
  }

  if (groupIds.length > 0) {
    searchParams.set('ids', groupIds.join(','));
  }

  const response = await fetch(
    `/api/v1/workspaces/${wsId}/users/groups?${searchParams.toString()}`,
    { cache: 'no-store' }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch workspace user groups');
  }

  const payload = (await response.json()) as {
    data?: WorkspaceUserGroupWithGuest[];
    count?: number;
  };

  return {
    data: payload.data ?? [],
    count: payload.count ?? 0,
    page,
    pageSize,
  };
}

async function fetchAllWorkspaceUserGroups(
  wsId: string
): Promise<WorkspaceUserGroupWithGuest[]> {
  const groups: WorkspaceUserGroupWithGuest[] = [];
  let page = 1;
  let totalCount = Number.POSITIVE_INFINITY;

  while (groups.length < totalCount) {
    const payload = await fetchWorkspaceUserGroupsPage(wsId, {
      page,
      pageSize: GROUPS_PAGE_SIZE,
    });

    const pageData = payload.data;
    totalCount = payload.count;
    groups.push(...pageData);

    if (pageData.length < GROUPS_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return groups;
}

async function fetchWorkspaceUserGroupsByIds(
  wsId: string,
  groupIds: string[]
): Promise<WorkspaceUserGroupWithGuest[]> {
  if (groupIds.length === 0) {
    return [];
  }

  const payload = await fetchWorkspaceUserGroupsPage(wsId, {
    page: 1,
    pageSize: Math.max(groupIds.length, 1),
    groupIds,
  });

  return payload.data;
}

/**
 * Fetches workspace user groups for a given workspace (with is_guest field)
 *
 * @param wsId - Workspace ID
 * @param options - Query options with includeGuest set to true
 * @returns Query result with workspace user groups including is_guest field
 */
export function useWorkspaceUserGroups(
  wsId: string,
  options: { includeGuest: true; ensureGroupIds?: string[] }
): ReturnType<typeof useQuery<WorkspaceUserGroupWithGuest[], Error>>;

/**
 * Fetches workspace user groups for a given workspace (without is_guest field)
 *
 * @param wsId - Workspace ID
 * @param options - Query options with includeGuest set to false or undefined
 * @returns Query result with workspace user groups
 */
export function useWorkspaceUserGroups(
  wsId: string,
  options?: { includeGuest?: false; ensureGroupIds?: string[] }
): ReturnType<typeof useQuery<WorkspaceUserGroup[], Error>>;

/**
 * @example
 * ```tsx
 * // Basic usage without is_guest field
 * const { data, isLoading, error } = useWorkspaceUserGroups(wsId);
 *
 * // With is_guest field
 * const { data, isLoading, error } = useWorkspaceUserGroups(wsId, { includeGuest: true });
 * ```
 */
export function useWorkspaceUserGroups(
  wsId: string,
  options?: UseWorkspaceUserGroupsOptions
) {
  const { includeGuest = false, ensureGroupIds = [] } = options || {};
  const normalizedEnsureGroupIds = [...new Set(ensureGroupIds.filter(Boolean))];

  return useQuery({
    queryKey: [
      'workspace-user-groups',
      wsId,
      includeGuest ? 'guest' : 'basic',
      normalizedEnsureGroupIds,
    ],
    queryFn: async () => {
      const groups = await fetchAllWorkspaceUserGroups(wsId);
      const groupIds = new Set(groups.map((group) => group.id));
      const missingGroupIds = normalizedEnsureGroupIds.filter(
        (groupId) => !groupIds.has(groupId)
      );
      const ensuredGroups = await fetchWorkspaceUserGroupsByIds(
        wsId,
        missingGroupIds
      );
      const mergedGroups = [...groups];

      ensuredGroups.forEach((group) => {
        if (!groupIds.has(group.id)) {
          mergedGroups.push(group);
        }
      });

      return includeGuest
        ? mergedGroups
        : mergedGroups.map(({ is_guest: _isGuest, ...group }) => group);
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useInfiniteWorkspaceUserGroups(
  wsId: string,
  options?: UseWorkspaceUserGroupsOptions & {
    query?: string;
    enabled?: boolean;
  }
) {
  const {
    includeGuest = false,
    ensureGroupIds = [],
    query = '',
    enabled = true,
  } = options || {};
  const normalizedEnsureGroupIds = [...new Set(ensureGroupIds.filter(Boolean))];
  const normalizedQuery = query.trim();

  const infiniteQuery = useInfiniteQuery({
    queryKey: [
      'workspace-user-groups-infinite',
      wsId,
      includeGuest ? 'guest' : 'basic',
      normalizedQuery,
    ],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchWorkspaceUserGroupsPage(wsId, {
        includeGuest,
        page: pageParam,
        pageSize: GROUPS_INFINITE_PAGE_SIZE,
        query: normalizedQuery,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );

      if (loadedCount >= lastPage.count) {
        return undefined;
      }

      return allPages.length + 1;
    },
    enabled: !!wsId && enabled,
    staleTime: 5 * 60 * 1000,
  });

  const ensuredGroupsQuery = useQuery({
    queryKey: [
      'workspace-user-groups-selected',
      wsId,
      includeGuest ? 'guest' : 'basic',
      normalizedEnsureGroupIds,
    ],
    queryFn: () =>
      fetchWorkspaceUserGroupsByIds(wsId, normalizedEnsureGroupIds),
    enabled: !!wsId && normalizedEnsureGroupIds.length > 0 && enabled,
    staleTime: 5 * 60 * 1000,
  });

  const pageGroups = (infiniteQuery.data?.pages ?? []).flatMap(
    (page) => page.data
  );
  const ensuredGroups = ensuredGroupsQuery.data ?? [];
  const mergedGroupMap = new Map<string, WorkspaceUserGroupWithGuest>();

  ensuredGroups.forEach((group) => {
    mergedGroupMap.set(group.id, group);
  });
  pageGroups.forEach((group) => {
    mergedGroupMap.set(group.id, group);
  });

  const mergedGroups = [...mergedGroupMap.values()];

  return {
    ...infiniteQuery,
    data: includeGuest
      ? mergedGroups
      : mergedGroups.map(({ is_guest: _isGuest, ...group }) => group),
    isLoading:
      infiniteQuery.isLoading ||
      (normalizedEnsureGroupIds.length > 0 && ensuredGroupsQuery.isLoading),
    isFetching: infiniteQuery.isFetching || ensuredGroupsQuery.isFetching,
  };
}
