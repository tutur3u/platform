import type { QueryClient } from '@tanstack/react-query';

export function workspaceInvitationsQueryKey(cacheScope?: string) {
  return ['workspace-invitations', ...(cacheScope ? [cacheScope] : [])];
}

export async function invalidateWorkspaceInvitationCaches(
  queryClient: QueryClient,
  cacheScope?: string
) {
  await Promise.all(
    [
      workspaceInvitationsQueryKey(cacheScope),
      ['workspace-ui-list', cacheScope],
      ['workspaces'],
      ['user-workspaces'],
      ['workspace-user'],
      ['current-user'],
      ['user'],
      ['notifications'],
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  );
}
