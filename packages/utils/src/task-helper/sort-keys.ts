import { updateWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';

import { getMutationApiOptions, listAllActiveTasksForList } from './shared';

export function priorityCompare(
  priorityA: TaskPriority | null | undefined,
  priorityB: TaskPriority | null | undefined
) {
  const priorityOrder = {
    critical: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  const getOrderValue = (priority: TaskPriority | null | undefined): number => {
    return priority ? priorityOrder[priority] : 5;
  };

  const valueA = getOrderValue(priorityA);
  const valueB = getOrderValue(priorityB);

  return valueB - valueA;
}

const SORT_KEY_BASE_UNIT = 1000000;
const SORT_KEY_DEFAULT = SORT_KEY_BASE_UNIT * 1000;
const SORT_KEY_MIN_GAP = 1000;

let sortKeySequence = 0;

export class SortKeyGapExhaustedError extends Error {
  constructor(
    public readonly prevSortKey: number | null | undefined,
    public readonly nextSortKey: number | null | undefined,
    message: string
  ) {
    super(message);
    this.name = 'SortKeyGapExhaustedError';
  }
}

export function calculateSortKey(
  prevSortKey: number | null | undefined,
  nextSortKey: number | null | undefined
): number {
  sortKeySequence = (sortKeySequence % 999) + 1;

  if (prevSortKey === null || prevSortKey === undefined) {
    if (nextSortKey === null || nextSortKey === undefined) {
      return SORT_KEY_DEFAULT + sortKeySequence;
    }

    if (nextSortKey <= 1) {
      throw new SortKeyGapExhaustedError(
        null,
        nextSortKey,
        `Cannot insert before sort key ${nextSortKey}. No positive integer exists strictly less than it. Normalization required.`
      );
    }

    const halfNext = Math.floor(nextSortKey / 2);

    if (nextSortKey <= SORT_KEY_MIN_GAP) {
      const result = Math.max(1, Math.min(halfNext, nextSortKey - 1));
      return result;
    } else {
      const baseKey = Math.max(
        halfNext,
        Math.min(SORT_KEY_BASE_UNIT, nextSortKey - SORT_KEY_MIN_GAP)
      );
      const maxSequence = nextSortKey - baseKey - 1;
      const safeSequence = Math.min(sortKeySequence, Math.max(0, maxSequence));
      return baseKey + safeSequence;
    }
  }

  if (nextSortKey === null || nextSortKey === undefined) {
    return prevSortKey + SORT_KEY_BASE_UNIT + sortKeySequence;
  }

  const gap = nextSortKey - prevSortKey;

  if (gap <= 0) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Cannot insert between inverted sort keys ${prevSortKey} and ${nextSortKey}. Gap (${gap}) is inverted or zero. Normalization required.`
    );
  }

  if (gap <= 1) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Cannot insert between sort keys ${prevSortKey} and ${nextSortKey}. Gap (${gap}) is too small. Normalization required.`
    );
  }

  const midpoint = Math.floor((prevSortKey + nextSortKey) / 2);

  if (midpoint <= prevSortKey || midpoint >= nextSortKey) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Calculated midpoint ${midpoint} is not strictly between ${prevSortKey} and ${nextSortKey}. Gap exhausted. Normalization required.`
    );
  }

  if (gap <= sortKeySequence) {
    console.warn(
      '⚠️ Gap too small for sequence offset, using midpoint - normalization recommended',
      { prevSortKey, nextSortKey, gap, sortKeySequence, midpoint }
    );
    return midpoint;
  }

  if (gap <= SORT_KEY_MIN_GAP) {
    console.warn(
      '⚠️ Sort key gap small, task ordering may need renormalization',
      { prevSortKey, nextSortKey, gap, threshold: SORT_KEY_MIN_GAP }
    );

    const maxOffsetUp = nextSortKey - 1 - midpoint;
    const maxOffsetDown = midpoint - prevSortKey - 1;
    const maxSafeOffset = Math.min(maxOffsetUp, maxOffsetDown);
    const safeOffset = Math.min(sortKeySequence, Math.max(0, maxSafeOffset));

    const result = midpoint + safeOffset;

    if (result <= prevSortKey || result >= nextSortKey) {
      throw new SortKeyGapExhaustedError(
        prevSortKey,
        nextSortKey,
        `Calculated result ${result} with offset is not strictly between ${prevSortKey} and ${nextSortKey}. Normalization required.`
      );
    }

    return result;
  }

  const halfGap = Math.floor(gap / 2);
  const offset = Math.min(sortKeySequence, halfGap - 1);

  const result = midpoint + offset;

  if (result <= prevSortKey || result >= nextSortKey) {
    throw new SortKeyGapExhaustedError(
      prevSortKey,
      nextSortKey,
      `Calculated result ${result} with offset is not strictly between ${prevSortKey} and ${nextSortKey}. Normalization required.`
    );
  }

  return result;
}

export function resetSortKeySequence(): void {
  sortKeySequence = 0;
}

export function getSortKeyConfig(): {
  BASE_UNIT: number;
  DEFAULT: number;
  MIN_GAP: number;
} {
  return {
    BASE_UNIT: SORT_KEY_BASE_UNIT,
    DEFAULT: SORT_KEY_DEFAULT,
    MIN_GAP: SORT_KEY_MIN_GAP,
  };
}

export function hasSortKeyCollisions(tasks: Task[]): boolean {
  const sortKeys = tasks
    .map((t) => t.sort_key)
    .filter((key): key is number => key !== null && key !== undefined);

  if (sortKeys.length === 0) return false;

  const sorted = [...sortKeys].sort((a, b) => a - b);

  for (let i = 1; i < sorted.length; i++) {
    const prevKey = sorted[i - 1];
    const currKey = sorted[i];
    if (prevKey !== undefined && currKey !== undefined) {
      const gap = currKey - prevKey;
      if (gap < SORT_KEY_MIN_GAP) {
        return true;
      }
    }
  }

  return false;
}

export function normalizeSortKeys(tasks: Task[]): Task[] {
  const sorted = [...tasks].sort((a, b) => {
    const sortA = a.sort_key ?? Number.MAX_SAFE_INTEGER;
    const sortB = b.sort_key ?? Number.MAX_SAFE_INTEGER;
    if (sortA !== sortB) return sortA - sortB;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return sorted.map((task, index) => ({
    ...task,
    sort_key: (index + 1) * SORT_KEY_BASE_UNIT,
  }));
}

export async function normalizeListSortKeys(
  wsId: string,
  listId: string,
  visualOrderTasks?: Pick<Task, 'id' | 'sort_key' | 'created_at'>[]
): Promise<void> {
  let tasks: Pick<Task, 'id' | 'sort_key' | 'created_at'>[];

  if (visualOrderTasks && visualOrderTasks.length > 0) {
    tasks = visualOrderTasks;
  } else {
    const fetchedTasks = await listAllActiveTasksForList(wsId, listId);

    if (!fetchedTasks.length) {
      return;
    }

    tasks = fetchedTasks
      .map((task) => ({
        id: task.id,
        sort_key: task.sort_key ?? null,
        created_at: task.created_at,
      }))
      .sort((a, b) => {
        const sortA = a.sort_key ?? Number.MAX_SAFE_INTEGER;
        const sortB = b.sort_key ?? Number.MAX_SAFE_INTEGER;
        if (sortA !== sortB) return sortA - sortB;
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
  }

  if (tasks.length === 0) {
    return;
  }

  if (!visualOrderTasks) {
    const needsNormalization = hasSortKeyCollisions(tasks as unknown as Task[]);

    if (!needsNormalization) {
      return;
    }
  }

  const updates = tasks.map((task, index) => ({
    id: task.id,
    sort_key: (index + 1) * SORT_KEY_BASE_UNIT,
  }));

  const options = await getMutationApiOptions();

  await Promise.all(
    updates.map((update) =>
      updateWorkspaceTask(
        wsId,
        update.id,
        { sort_key: update.sort_key },
        options
      )
    )
  );
}
