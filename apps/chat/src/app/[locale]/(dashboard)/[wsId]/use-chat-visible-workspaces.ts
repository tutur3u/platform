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
    readonly ['chat-workspaces', string | undefined, 'infinite', string],
    number
  >({
    queryKey: [
      'chat-workspaces',
      actor?.actorId,
      'infinite',
      [...visibility.hiddenIds].sort().join(','),
    ] as const,
    enabled: Boolean(actor) && visibility.known,
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const hidden = new Set(visibility.hiddenIds);
      const workspaces: Page['workspaces'] = [];
      let nextOffset: number | null = pageParam;
      let visibleRailCount = 0;
      // Fill a usable rail even if a canonical page contains only Hidden rows.
      // Bound each request; the explicit Load more action handles the remainder.
      for (let pages = 0; pages < 8 && nextOffset !== null; pages++) {
        actor!.assertActive();
        if (signal.aborted) throw new Error('Workspace pagination cancelled');
        const page = await fetchWorkspacesPage({
          limit: 48,
          offset: nextOffset,
        });
        actor!.assertActive();
        if (signal.aborted) throw new Error('Workspace pagination cancelled');
        workspaces.push(...page.workspaces);
        visibleRailCount += page.workspaces.filter(
          (workspace) => !workspace.personal && !hidden.has(workspace.id)
        ).length;
        if (page.nextOffset !== null && page.nextOffset <= nextOffset) {
          throw new Error('Invalid workspace pagination cursor');
        }
        nextOffset = page.nextOffset;
        if (visibleRailCount >= 12) break;
      }
      return { workspaces, nextOffset };
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
