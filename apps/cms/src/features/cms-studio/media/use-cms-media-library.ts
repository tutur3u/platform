'use client';

import { type InfiniteData, useInfiniteQuery } from '@tanstack/react-query';
import {
  listWorkspaceExternalProjectMedia,
  type WorkspaceExternalProjectMediaAttachment,
  type WorkspaceExternalProjectMediaPage,
  type WorkspaceExternalProjectMediaType,
} from '@tuturuuu/internal-api';
import { useCallback, useDeferredValue, useRef } from 'react';

export const getCmsMediaQueryKey = (workspaceId: string) => [
  'cms-media',
  workspaceId,
];

export function useCmsMediaLibrary({
  attachment,
  query,
  type,
  workspaceId,
}: {
  attachment: WorkspaceExternalProjectMediaAttachment;
  query: string;
  type: WorkspaceExternalProjectMediaType;
  workspaceId: string;
}) {
  const deferredQuery = useDeferredValue(query.trim());
  return useInfiniteQuery<
    WorkspaceExternalProjectMediaPage,
    Error,
    InfiniteData<WorkspaceExternalProjectMediaPage, number>,
    readonly unknown[],
    number
  >({
    gcTime: 30 * 60 * 1000,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextPage ?? undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }): Promise<WorkspaceExternalProjectMediaPage> =>
      listWorkspaceExternalProjectMedia(workspaceId, {
        attachment,
        page: pageParam,
        pageSize: 24,
        query: deferredQuery,
        type,
      }),
    queryKey: [
      ...getCmsMediaQueryKey(workspaceId),
      type,
      attachment,
      deferredQuery,
    ],
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
  });
}

export function useInfiniteLoadTrigger({
  enabled,
  loadMore,
}: {
  enabled: boolean;
  loadMore: () => void;
}) {
  const observerRef = useRef<IntersectionObserver | null>(null);

  return useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!(node && enabled)) return;

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) loadMore();
        },
        { rootMargin: '320px 0px' }
      );
      observerRef.current.observe(node);
    },
    [enabled, loadMore]
  );
}
