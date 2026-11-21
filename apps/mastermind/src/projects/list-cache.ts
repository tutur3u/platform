import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { createThreadCache } from '../fleet/thread-cache';
import {
  cacheOwnerFor,
  forgetCacheOwner,
  rememberCacheOwner,
} from './cache-owner';
import { threadErrorOf } from './model';
import { type ListCache, THREADS_QUERY_ROOT, useMachines } from './queries';

/**
 * The machine context and this owner's browser cache. The cache opens only
 * for the owner the server names, even when the bridge cannot answer. A
 * refused session erases the last owner's lists and drops every thread list
 * held in memory, so nothing of theirs stays on screen.
 */
export function useListCache() {
  const queryClient = useQueryClient();
  const machines = useMachines();
  const error = machines.error;
  const denied = threadErrorOf(error) === 'denied';
  const context = denied ? undefined : machines.data;
  const ownerId =
    context?.ownerId ??
    (error && 'ownerId' in error
      ? (error.ownerId as string | undefined)
      : undefined);
  // Read during render only on the client; the server render has no cache.
  const known = useMemo(
    () => (context || denied ? null : cacheOwnerFor(ownerId)),
    [context, denied, ownerId]
  );
  const machineId = context?.machineId ?? known?.machineId;
  const store = useMemo<ListCache | undefined>(
    () =>
      ownerId && machineId && typeof window !== 'undefined'
        ? { cache: createThreadCache(ownerId), ownerId, machineId }
        : undefined,
    [ownerId, machineId]
  );

  useEffect(() => {
    if (denied) {
      forgetCacheOwner();
      queryClient.removeQueries({
        queryKey: THREADS_QUERY_ROOT,
        predicate: (query) => query.queryKey[1] !== 'machines',
      });
    } else if (context) rememberCacheOwner(context.ownerId, context.machineId);
  }, [denied, context?.ownerId, context?.machineId, queryClient]);

  return {
    machines,
    context,
    denied,
    store,
    /** Project groups with a cached page, for an open with no snapshot. */
    cachedProjects: known?.projectIds ?? [],
  };
}
