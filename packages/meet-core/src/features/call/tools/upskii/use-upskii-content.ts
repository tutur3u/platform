'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import {
  listUpskiiContent,
  type UpskiiContentKind,
} from '@tuturuuu/internal-api/upskii-content';
import { isSettledUpskiiRefusal, upskiiListState } from './upskii-list-state';

export const upskiiContentKey = (
  kind: UpskiiContentKind,
  classId: string | null
) => ['meet', 'upskii-content', kind, classId] as const;

/**
 * One Upskii list through the presenter's own session. Only a presenter
 * enables it, so nobody else's session ever asks Upskii for anything.
 */
export function useUpskiiContent({
  kind,
  classId = null,
  enabled,
}: {
  kind: UpskiiContentKind;
  classId?: string | null;
  enabled: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey: upskiiContentKey(kind, classId),
    queryFn: ({ pageParam }) =>
      listUpskiiContent({
        kind,
        classId: classId ?? undefined,
        cursor: pageParam,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: enabled && (kind === 'classes' || !!classId),
    staleTime: 60_000,
    retry: (count, error) => !isSettledUpskiiRefusal(error) && count < 2,
  });
  const seen = new Set<string>();
  const items = query.data?.pages
    .flatMap((page) => page.items)
    .filter((item) => !seen.has(item.id) && !!seen.add(item.id));
  return {
    state: upskiiListState({
      isPending: query.isPending,
      isFetching: query.isFetching,
      error: query.error,
      items,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
    }),
    retry: () => void query.refetch(),
    loadMore: () => void query.fetchNextPage(),
  };
}
