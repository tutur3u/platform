import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ThreadCache } from '../fleet/thread-cache';
import { threadListKey } from '../fleet/thread-cache';
import { cacheGeneration, rememberCachedProject } from './cache-owner';
import type {
  ThreadErrorCode,
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
  if (result.kind === 'error')
    throw new ThreadError(result.code, result.ownerId);
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
  let last: ThreadPage | undefined;
  let next: number | null | undefined = cursor;
  for (let reads = 0; reads < MAX_SCAN_PAGES; reads++) {
    last = unwrap(await read(next ?? undefined));
    threads.push(...last.threads.filter((row) => inScope(scope, row)));
    next = last.nextCursor;
    if (next === null || threads.length >= PAGE_SIZE) break;
  }
  // The loop runs at least once, so `last` holds the final page read.
  return { ...(last as ThreadPage), threads, nextCursor: next ?? null };
}

/** Refusals after which a cached first page stands in for the live one. */
const CACHE_FALLBACK: ReadonlySet<ThreadErrorCode> = new Set([
  'machine_offline',
  'timeout',
  'unavailable',
]);

/**
 * The browser cache of one owner's lists on one bridge machine. Searches
 * are never cached.
 */
export interface ListCache {
  cache: ThreadCache;
  ownerId: string;
  machineId: string;
}

function cacheKey(scope: ListScope, machineId: string) {
  return threadListKey({
    machineId,
    environmentId: scope.environmentId,
    projectId: scope.projectId,
    state: scope.state === 'all' ? undefined : scope.state,
  });
}

/**
 * The first page of a list: saved to the cache when it reads, and read from
 * the cache, marked with `cachedAt`, when the machine cannot answer.
 */
export async function firstPage(
  scope: ListScope,
  read: () => Promise<ThreadPage>,
  store?: ListCache
): Promise<ThreadPage> {
  const key = store && !scope.q ? cacheKey(scope, store.machineId) : undefined;
  const started = cacheGeneration();
  let page: ThreadPage;
  try {
    page = await read();
  } catch (error) {
    if (
      key &&
      store &&
      error instanceof ThreadError &&
      CACHE_FALLBACK.has(error.code)
    ) {
      const cached = await store.cache.read(key);
      if (cached) return { ...cached.page, cachedAt: cached.savedAt };
    }
    throw error;
  }
  // Saving is best effort: a failure here never costs the page just read.
  // A session refused while this read ran has erased the cache; it stays so.
  if (key && store && cacheGeneration() === started) {
    const cache = store.cache;
    // Another tab may erase while this write is under way: its epoch moves
    // first, so a write that finds it moved erases what it just wrote.
    void cache
      .write(key, page)
      .then(() => {
        if (cacheGeneration() !== started) return cache.clear();
      })
      .catch(() => undefined);
    try {
      if (scope.projectId && !scope.environmentId)
        rememberCachedProject(store.ownerId, scope.projectId);
    } catch {
      // The group stays cached; only the offline group list misses it.
    }
  }
  return page;
}

export function useThreadPages(
  scope: ListScope,
  enabled = true,
  store?: ListCache
) {
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
    queryFn: ({ pageParam }) => {
      const read = () =>
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
        );
      return pageParam === undefined ? firstPage(scope, read, store) : read();
    },
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
