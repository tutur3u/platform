import { z } from 'zod';

export const BOARD_TASK_PAGE_SIZE = 50;
type Stage = 'board' | 'placed' | 'assigned';
type BoardTaskAnchor = { id: string; createdAt: string | null };

export type BoardTaskCursor =
  | { stage: 'board'; after?: BoardTaskAnchor }
  | { stage: 'placed' | 'assigned'; after?: string };

const taskId = z.guid();
const createdAt = z.iso.datetime({ offset: true });

export function parseBoardTaskCursor(
  value: string
): BoardTaskCursor | undefined {
  if (value === 'start') return { stage: 'board' };
  const [stage, id, date, ...extra] = value.split('~');
  if (!id || extra.length) return;
  if (stage === 'board') {
    if (!taskId.safeParse(id).success || !date) return;
    if (date === 'null') return { stage, after: { id, createdAt: null } };
    if (createdAt.safeParse(date).success)
      return { stage, after: { id, createdAt: date } };
  } else if (
    (stage === 'placed' || stage === 'assigned') &&
    date === undefined
  ) {
    if (id === 'start') return { stage };
    if (taskId.safeParse(id).success) return { stage, after: id };
  }
}

/** Newest first, with nullable dates last and a stable ID tie break. */
export function boardTaskSeekFilter(after: BoardTaskAnchor) {
  const { createdAt, id } = after;
  return createdAt === null
    ? `and(created_at.is.null,id.gt.${id})`
    : `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id}),created_at.is.null`;
}

export function takeBoardTaskPage<T>(
  rows: T[],
  limit: number,
  getCursor: (row: T) => string,
  nextStage?: Stage
) {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    page,
    nextCursor:
      rows.length > limit && last
        ? getCursor(last)
        : nextStage
          ? `${nextStage}~start`
          : null,
  };
}
