import type { WorkspaceCalendarEvent } from '@tuturuuu/types';
// Add a type for the cache
export type CalendarCache = {
  [key: string]: {
    dbEvents: WorkspaceCalendarEvent[];
    googleEvents: WorkspaceCalendarEvent[];
    dbLastUpdated: number;
    googleLastUpdated: number;
  };
};

// Helper type for cache updates
export type CacheUpdate = {
  dbEvents?: WorkspaceCalendarEvent[];
  googleEvents?: WorkspaceCalendarEvent[];
  dbLastUpdated?: number;
  googleLastUpdated?: number;
};

/** Bound private in-memory snapshots; nothing is persisted to browser disk. */
export function updateCalendarRangeCache(
  previous: CalendarCache,
  key: string,
  update: CacheUpdate
): CalendarCache {
  const existing = previous[key] ?? {
    dbEvents: [],
    googleEvents: [],
    dbLastUpdated: 0,
    googleLastUpdated: 0,
  };
  const next = {
    ...previous,
    [key]: {
      ...existing,
      ...Object.fromEntries(
        Object.entries(update).filter(([, value]) => value !== undefined)
      ),
    },
  };
  return Object.fromEntries(
    Object.entries(next)
      .sort(
        (a, b) =>
          Math.max(b[1].dbLastUpdated, b[1].googleLastUpdated) -
          Math.max(a[1].dbLastUpdated, a[1].googleLastUpdated)
      )
      .slice(0, 12)
  );
}
