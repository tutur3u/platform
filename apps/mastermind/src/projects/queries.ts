import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ThreadMessages,
  ThreadPage,
  ThreadResult,
  ThreadRow,
} from './contract';
import { PAGE_SIZE, type StateFilter, ThreadError, UNASSIGNED } from './model';
import {
  markThreadReadFn,
  threadMachinesFn,
  threadMessagesFn,
  threadPageFn,
  threadProjectsFn,
} from './server';

/**
 * Thread lists are snapshots: they refresh on window focus, a `threads`
 * notice on the owner socket, or the refresh button, and never on a timer.
 * A refused read throws, so the query keeps its last good data.
 */
const SNAPSHOT = {
  staleTime: 30_000,
  refetchOnWindowFocus: true,
  retry: false,
} as const;

export const THREADS_QUERY_ROOT = ['mastermind-threads'] as const;

function unwrap<T>(result: ThreadResult<T>): T {
  if (result.kind === 'error') throw new ThreadError(result.code);
  return result.data;
}

export function useMachines() {
  return useQuery({
    ...SNAPSHOT,
    queryKey: [...THREADS_QUERY_ROOT, 'machines'],
    queryFn: async () => unwrap(await threadMachinesFn()),
  });
}

export function useProjects(enabled: boolean) {
  return useQuery({
    ...SNAPSHOT,
    enabled,
    queryKey: [...THREADS_QUERY_ROOT, 'projects'],
    queryFn: async () => unwrap(await threadProjectsFn({ data: {} })),
  });
}

export interface ListScope {
  environmentId?: string;
  projectId?: string;
  q?: string;
  state: StateFilter;
}

/** Pages one "Load more" may read while a filter leaves rows out. */
export const MAX_SCAN_PAGES = 4;

/**
 * Whether a row belongs to the scope. Routes that do not filter by project
 * or state yet return every thread, so the client applies the same rule;
 * where the route filters, this keeps every row.
 */
export function inScope(scope: ListScope, row: ThreadRow) {
  if (scope.state !== 'all' && row.state !== scope.state) return false;
  if (scope.projectId === undefined) return true;
  return scope.projectId === UNASSIGNED
    ? !row.projectId
    : row.projectId === scope.projectId;
}

/**
 * Reads pages from `cursor` until a full page of in-scope rows, the end of
 * the list, or {@link MAX_SCAN_PAGES} reads, whichever comes first.
 */
export async function scanPage(
  scope: ListScope,
  cursor: number | undefined,
  read: (cursor: number | undefined) => Promise<ThreadResult<ThreadPage>>
): Promise<ThreadPage> {
  const threads: ThreadRow[] = [];
  let next: number | null | undefined = cursor;
  let total = 0;
  for (let reads = 0; reads < MAX_SCAN_PAGES; reads++) {
    const page: ThreadPage = unwrap(await read(next ?? undefined));
    threads.push(...page.threads.filter((row) => inScope(scope, row)));
    total = page.total;
    next = page.nextCursor;
    if (next === null || threads.length >= PAGE_SIZE) break;
  }
  return { threads, nextCursor: next ?? null, total };
}

export function useThreadPages(scope: ListScope, enabled = true) {
  return useInfiniteQuery<
    ThreadPage,
    Error,
    InfiniteData<ThreadPage>,
    readonly unknown[],
    number | undefined
  >({
    ...SNAPSHOT,
    enabled,
    queryKey: [...THREADS_QUERY_ROOT, 'list', scope],
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      scanPage(scope, pageParam, (cursor) =>
        threadPageFn({
          data: {
            environmentId: scope.environmentId,
            projectId: scope.projectId,
            q: scope.q || undefined,
            state: scope.state === 'all' ? undefined : scope.state,
            cursor,
            limit: PAGE_SIZE,
          },
        })
      ),
  });
}

/** Clears the badge of one thread on one machine in every cached list. */
function markSeen(
  queryClient: QueryClient,
  environmentId: string | undefined,
  threadId: string,
  itemCount: number
) {
  queryClient.setQueriesData<InfiniteData<ThreadPage>>(
    {
      queryKey: [...THREADS_QUERY_ROOT, 'list'],
      predicate: (query) =>
        (query.queryKey[2] as ListScope | undefined)?.environmentId ===
        environmentId,
    },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          threads: page.threads.map((row) =>
            row.threadId === threadId
              ? {
                  ...row,
                  seenItemCount: Math.max(row.seenItemCount ?? 0, itemCount),
                }
              : row
          ),
        })),
      }
  );
}

/**
 * Messages page backwards: the first page is the newest, each next is
 * earlier. Reading the newest page records the read marker; the list badge
 * clears only once the marker is saved, and a refused marker changes
 * nothing (the next open tries again).
 */
export function useThreadMessages(
  environmentId: string | undefined,
  threadId: string
) {
  const queryClient = useQueryClient();
  return useInfiniteQuery<
    ThreadMessages,
    Error,
    InfiniteData<ThreadMessages>,
    readonly unknown[],
    number | undefined
  >({
    ...SNAPSHOT,
    queryKey: [...THREADS_QUERY_ROOT, 'messages', environmentId, threadId],
    initialPageParam: undefined,
    getNextPageParam: (last) => last.earlierPosition ?? undefined,
    queryFn: async ({ pageParam }) => {
      const page = unwrap(
        await threadMessagesFn({
          data: { environmentId, threadId, before: pageParam },
        })
      );
      if (pageParam === undefined) {
        const itemCount = page.thread.itemCount;
        void markThreadReadFn({ data: { environmentId, threadId, itemCount } })
          .then((result) => {
            if (result.kind === 'ok' && result.data.saved)
              markSeen(queryClient, environmentId, threadId, itemCount);
          })
          .catch(() => undefined);
      }
      return page;
    },
  });
}
