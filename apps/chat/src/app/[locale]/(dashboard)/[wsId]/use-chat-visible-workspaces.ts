'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useMemo } from 'react';
import { fetchWorkspacesPage } from './actions';

/** Paginate canonical discovery, then project only the current actor's choices. */
export function useChatVisibleWorkspaces() {
  const actor = useWorkspaceActor();
  const visibility = useWorkspaceVisibility();
  type Page = Awaited<ReturnType<typeof fetchWorkspacesPage>>;
  const workspacesQuery = useInfiniteQuery<
    Page,
    Error,
    InfiniteData<Page>,
    readonly ['chat-workspaces', string | undefined, 'infinite'],
    number
  >({
    queryKey: ['chat-workspaces', actor?.actorId, 'infinite'] as const,
    enabled: Boolean(actor),
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    queryFn: async ({ pageParam }) => {
      actor!.assertActive();
      const page = await fetchWorkspacesPage({ limit: 48, offset: pageParam });
      actor!.assertActive();
      return page;
    },
  });
  const workspaces = useMemo(
    () =>
      visibility.known
        ? (
            workspacesQuery.data?.pages.flatMap((page) => page.workspaces) ?? []
          ).filter((workspace) => !visibility.hiddenIds.includes(workspace.id))
        : [],
    [visibility.known, visibility.hiddenIds, workspacesQuery.data]
  );
  return { workspacesQuery, workspaces };
}
