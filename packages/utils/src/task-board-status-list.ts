export const TASK_STATUS_NAMES = [
  'backlog',
  'todo',
  'in-progress',
  'review',
  'done',
  'cancelled',
] as const;

export type TaskStatusName = (typeof TASK_STATUS_NAMES)[number];

export type StatusListCandidate = {
  id: string;
  name: string | null;
  status: string | null;
  position: number | null;
  archived?: boolean | null;
  deleted?: boolean | null;
};

export type StatusBoardDefaults = {
  default_done_list_id?: string | null;
  default_closed_list_id?: string | null;
};

const BACKLOG_NAME = /backlog/iu;
// Lists that hold work waiting on someone or reference material are never the
// default landing list for new work.
const PARKING_NAME = /\b(?:waiting|blocked|knowledge|on hold)\b/iu;

export function isTaskStatusName(value: string): value is TaskStatusName {
  return (TASK_STATUS_NAMES as readonly string[]).includes(value);
}

function byPosition(a: StatusListCandidate, b: StatusListCandidate) {
  const left = a.position ?? Number.MAX_SAFE_INTEGER;
  const right = b.position ?? Number.MAX_SAFE_INTEGER;
  if (left !== right) return left - right;
  return a.id.localeCompare(b.id);
}

/**
 * Picks the board list a status resolves to. Ties go to the lowest position.
 *
 * - backlog: first not_started list named like a backlog, else the first one
 * - todo: first not_started list that is not a backlog or a parking list
 * - in-progress / review: first list with that status
 * - done / cancelled: the board default when it still points at a list on the
 *   board, else the first done / closed list
 */
export function resolveStatusList(
  lists: readonly StatusListCandidate[],
  status: TaskStatusName,
  defaults: StatusBoardDefaults = {}
): StatusListCandidate | null {
  const live = lists
    .filter((list) => !list.deleted && !list.archived)
    .sort(byPosition);
  const withStatus = (value: string) =>
    live.filter((list) => list.status === value);

  switch (status) {
    case 'backlog': {
      const notStarted = withStatus('not_started');
      return (
        notStarted.find((list) => BACKLOG_NAME.test(list.name ?? '')) ??
        notStarted[0] ??
        null
      );
    }
    case 'todo': {
      const candidates = withStatus('not_started').filter(
        (list) => !BACKLOG_NAME.test(list.name ?? '')
      );
      return (
        candidates.find((list) => !PARKING_NAME.test(list.name ?? '')) ??
        candidates[0] ??
        null
      );
    }
    case 'in-progress':
      return withStatus('active')[0] ?? null;
    case 'review':
      return withStatus('review')[0] ?? null;
    case 'done':
      return (
        live.find((list) => list.id === defaults.default_done_list_id) ??
        withStatus('done')[0] ??
        null
      );
    case 'cancelled':
      return (
        live.find((list) => list.id === defaults.default_closed_list_id) ??
        withStatus('closed')[0] ??
        null
      );
  }
}
