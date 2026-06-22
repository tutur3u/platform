import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getNextWorkspaceUserGroupsPageParam,
  listAllWorkspaceUserGroups,
  listWorkspaceUserGroups,
  listWorkspaceUserGroupsByIds,
} from '@tuturuuu/internal-api/user-groups';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';

export interface WorkspaceUserGroup {
  id: string;
  name: string;
  archived?: boolean | null;
}

export interface WorkspaceUserGroupWithGuest extends WorkspaceUserGroup {
  is_guest: boolean;
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

function toWorkspaceUserGroupWithGuest(
  group: UserGroup
): WorkspaceUserGroupWithGuest {
  return {
    archived: group.archived ?? null,
    id: group.id,
    is_guest: group.is_guest,
    name: group.name,
  };
}

async function fetchWorkspaceUserGroupsPage(
  wsId: string,
  options: FetchWorkspaceUserGroupsPageOptions = {}
): Promise<WorkspaceUserGroupsPage> {
  const {
    page = 1,
    pageSize = GROUPS_PAGE_SIZE,
    query = '',
    groupIds = [],
  } = options;
  const payload = await listWorkspaceUserGroups(wsId, {
    ids: groupIds.length > 0 ? groupIds : undefined,
    page,
    pageSize,
    q: query.trim() || undefined,
  });

  return {
    count: payload.count,
    data: payload.data.map(toWorkspaceUserGroupWithGuest),
    page,
    pageSize,
  };
}

async function fetchAllWorkspaceUserGroups(
  wsId: string
): Promise<WorkspaceUserGroupWithGuest[]> {
  const groups = await listAllWorkspaceUserGroups(wsId);
  return groups.map(toWorkspaceUserGroupWithGuest);
}

async function fetchWorkspaceUserGroupsByIds(
  wsId: string,
  groupIds: string[]
): Promise<WorkspaceUserGroupWithGuest[]> {
  if (groupIds.length === 0) {
    return [];
  }

  const groups = await listWorkspaceUserGroupsByIds(wsId, groupIds);
  return groups.map(toWorkspaceUserGroupWithGuest);
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
        page: pageParam,
        pageSize: GROUPS_INFINITE_PAGE_SIZE,
        query: normalizedQuery,
      }),
    getNextPageParam: getNextWorkspaceUserGroupsPageParam,
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
