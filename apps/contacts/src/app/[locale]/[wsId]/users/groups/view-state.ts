export type UserGroupsViewState =
  | 'data'
  | 'empty'
  | 'error'
  | 'filtered-empty'
  | 'loading'
  | 'restricted-empty';

export function resolveUserGroupsViewState({
  hasError,
  isFiltered,
  isLimitedScope,
  isLoading,
  itemCount,
}: {
  hasError: boolean;
  isFiltered: boolean;
  isLimitedScope: boolean;
  isLoading: boolean;
  itemCount: number;
}): UserGroupsViewState {
  if (hasError) return 'error';
  if (isLoading) return 'loading';
  if (itemCount > 0) return 'data';
  if (isFiltered) return 'filtered-empty';
  if (isLimitedScope) return 'restricted-empty';
  return 'empty';
}
