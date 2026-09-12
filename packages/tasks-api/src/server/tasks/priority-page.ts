import type { UnprioritizedPosition } from '@tuturuuu/utils/task-helper/task-sort';

type Page = { count: number; taskIds: string[] };
type PageOptions = { limit: number; offset: number; priorities: string[] };

/** Rotate the existing nulls-last RPC order without loading the entire task set. */
export async function loadPriorityPage(
  options: PageOptions & {
    sortBy?: string;
    unprioritizedPosition?: UnprioritizedPosition;
  },
  load: (page: PageOptions) => Promise<Page>
): Promise<Page> {
  if (
    options.unprioritizedPosition === 'last' ||
    !options.sortBy?.startsWith('priority-') ||
    options.priorities.length > 0
  ) {
    return load(options);
  }
  // Counts are read at offset zero because the RPC returns counts on task rows.
  const total = await load({ ...options, offset: 0, limit: 1 });
  if (total.count === 0 || options.offset >= total.count)
    return { count: total.count, taskIds: [] };
  if (options.limit === 0) return { count: total.count, taskIds: [] };
  const prioritized = await load({
    ...options,
    offset: 0,
    limit: 1,
    priorities: ['critical', 'high', 'normal', 'low'],
  });
  const missingCount = total.count - prioritized.count;
  if (missingCount === 0 || prioritized.count === 0) return load(options);
  const count = Math.min(options.limit, total.count - options.offset);
  const start =
    options.offset < missingCount
      ? prioritized.count + options.offset
      : options.offset - missingCount;
  const firstLength = Math.min(count, total.count - start);
  const first = await load({ ...options, offset: start, limit: firstLength });
  if (firstLength === count)
    return { count: total.count, taskIds: first.taskIds };
  const second = await load({
    ...options,
    offset: 0,
    limit: count - firstLength,
  });
  return { count: total.count, taskIds: [...first.taskIds, ...second.taskIds] };
}
