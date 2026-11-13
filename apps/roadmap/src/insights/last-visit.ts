/**
 * "Since your last visit": the time of this browser's previous visit, kept in
 * localStorage. Every access is guarded; without storage (private mode,
 * blocked site data, server render) there is simply no marker.
 */
export const LAST_VISIT_KEY = 'roadmap:last-visit';

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLastVisit(
  store: Storage | null = storage()
): number | null {
  try {
    const value = Number(store?.getItem(LAST_VISIT_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberVisit(now: number, store: Storage | null = storage()) {
  try {
    store?.setItem(LAST_VISIT_KEY, String(now));
  } catch {
    // Storage full or blocked: the marker is optional.
  }
}

let previous: number | null | undefined;

/** The previous visit, read once per page load (before it is overwritten). */
export function previousVisit(): number | null {
  if (previous === undefined) previous = readLastVisit();
  return previous;
}

/**
 * How many of the (newest-first) updates are new since the last visit: the
 * divider goes before the first older one. Null when there was no earlier
 * visit, so nothing is marked.
 */
export function sinceIndex(
  times: readonly string[],
  lastVisit: number | null
): number | null {
  if (lastVisit === null) return null;
  const index = times.findIndex((at) => Date.parse(at) <= lastVisit);
  return index === -1 ? times.length : index;
}
