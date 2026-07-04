import { removeWorkspaceGroupTagUserGroup } from '@tuturuuu/internal-api';

type TagUserGroupsQueryParams = {
  page?: number;
  pageSize?: number;
  q?: string;
};

export function tagUserGroupsQueryKey(
  wsId: string,
  tagId: string,
  params?: TagUserGroupsQueryParams
) {
  const key = ['workspaces', wsId, 'group-tags', tagId, 'user-groups'] as const;

  return params ? ([...key, params] as const) : key;
}

export function removeWorkspaceGroupFromTag(
  wsId: string,
  tagId: string,
  groupId: string
) {
  return removeWorkspaceGroupTagUserGroup(wsId, tagId, groupId);
}
