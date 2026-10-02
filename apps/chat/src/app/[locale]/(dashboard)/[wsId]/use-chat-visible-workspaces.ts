'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { useMemo } from 'react';
import { fetchWorkspaces } from './actions';

/** The server returns the canonical list once; Hidden changes only its UI projection. */
export function useChatVisibleWorkspaces() {
  const actor = useWorkspaceActor();
  const visibility = useWorkspaceVisibility();
  type Page = {
    workspaces: Awaited<ReturnType<typeof fetchWorkspaces>>;
    nextOffset: null;
  };
  const workspacesQuery = useInfiniteQuery<
    Page,
    Error,
    InfiniteData<Page>,
    readonly ['chat-workspaces', string | undefined, 'infinite'],
    number
  >({
    queryKey: ['chat-workspaces', actor?.actorId, 'infinite'] as const,
    enabled: Boolean(actor) && visibility.known,
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    queryFn: async ({ signal }) => {
      actor!.assertActive();
      if (signal.aborted) throw new Error('Workspace discovery cancelled');
      const workspaces = await fetchWorkspaces();
      actor!.assertActive();
      if (signal.aborted) throw new Error('Workspace discovery cancelled');
      return { workspaces, nextOffset: null };
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
