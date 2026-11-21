import {
  createThreadCache,
  THREAD_CACHE_LIMITS,
  type ThreadCache,
} from '../fleet/thread-cache';

/**
 * Who the browser's thread cache was last filled for, and which project
 * groups it holds. Only ids are kept here, never titles or project names, so
 * an open with the bridge offline can still find this owner's sealed lists,
 * and any other owner (or a refused session) erases them.
 */
const KEY = 'mastermind-projects:last-context';

const EPOCH_KEY = 'mastermind-projects:erase-epoch';
const caches = new Map<string, ThreadCache>();
let generation = 0;

/**
 * The one cache object of an owner, so an erase and a write share its queue
 * and the erase cannot be overtaken by a write that was already waiting.
 */
export function ownerThreadCache(ownerId: string) {
  let cache = caches.get(ownerId);
  if (!cache) {
    cache = createThreadCache(ownerId);
    caches.set(ownerId, cache);
  }
  return cache;
}

/**
 * Moves on each erase, in this tab and, through local storage, in every tab
 * of this browser; a read that started before an erase writes nothing.
 */
export function cacheGeneration() {
  try {
    return `${generation}:${localStorage.getItem(EPOCH_KEY) ?? '0'}`;
  } catch {
    return `${generation}:`;
  }
}

export type CacheOwner = {
  ownerId: string;
  machineId: string;
  /** Project groups with a cached page, newest first. */
  projectIds: string[];
};

function read(): CacheOwner | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!value || typeof value !== 'object') return null;
    const { ownerId, machineId, projectIds } = value as Record<string, unknown>;
    if (typeof ownerId !== 'string' || typeof machineId !== 'string')
      return null;
    return {
      ownerId,
      machineId,
      projectIds: Array.isArray(projectIds)
        ? projectIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return null;
  }
}

function write(owner: CacheOwner) {
  try {
    localStorage.setItem(KEY, JSON.stringify(owner));
  } catch {
    // Without storage the cache still works for this page view.
  }
}

/** Erases the last owner's lists and what is known about them. */
export function forgetCacheOwner() {
  generation += 1;
  // The epoch moves before the erase, so a write in another tab that lands
  // after it sees the move and erases again.
  try {
    localStorage.setItem(EPOCH_KEY, String(Date.now()));
  } catch {
    // This tab's own counter still fences its reads.
  }
  const previous = read();
  if (previous) void ownerThreadCache(previous.ownerId).clear();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to remove.
  }
}

/**
 * The cache context for the signed-in owner, or null. A context filled for
 * anyone else is erased, never opened.
 */
export function cacheOwnerFor(ownerId: string | undefined) {
  if (typeof window === 'undefined' || !ownerId) return null;
  const previous = read();
  if (previous && previous.ownerId !== ownerId) {
    forgetCacheOwner();
    return null;
  }
  return previous;
}

/** Records the signed-in owner and bridge machine, keeping known groups. */
export function rememberCacheOwner(ownerId: string, machineId: string) {
  const previous = cacheOwnerFor(ownerId);
  write({
    ownerId,
    machineId,
    projectIds: previous?.machineId === machineId ? previous.projectIds : [],
  });
}

/** Notes a project group whose first page was just cached. */
export function rememberCachedProject(ownerId: string, projectId: string) {
  const previous = cacheOwnerFor(ownerId);
  if (!previous) return;
  write({
    ...previous,
    projectIds: [
      projectId,
      ...previous.projectIds.filter((id) => id !== projectId),
    ].slice(0, THREAD_CACHE_LIMITS.lists),
  });
}
