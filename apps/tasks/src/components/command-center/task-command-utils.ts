import type {
  ListWorkspaceTasksOptions,
  WorkspaceTaskBoardWithLists,
} from '@tuturuuu/internal-api/tasks';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';

export type TaskCommandStatus =
  | 'all'
  | 'open'
  | 'completed'
  | 'mine'
  | 'overdue'
  | 'today'
  | 'soon';

export type ParsedTaskCommandQuery = {
  priority: TaskPriority | null;
  query: string;
  status: TaskCommandStatus;
  tokens: string[];
};

const PRIORITIES = new Set<TaskPriority>(['critical', 'high', 'normal', 'low']);

export function parseTaskCommandQuery(input: string): ParsedTaskCommandQuery {
  let priority: TaskPriority | null = null;
  let status: TaskCommandStatus = 'all';
  const queryParts: string[] = [];
  const tokens: string[] = [];

  for (const part of input.trim().split(/\s+/).filter(Boolean)) {
    const normalized = part.toLowerCase();
    const priorityValue = normalized.match(/^priority:(.+)$/)?.[1];
    if (priorityValue && PRIORITIES.has(priorityValue as TaskPriority)) {
      priority = priorityValue as TaskPriority;
      tokens.push(part);
      continue;
    }

    const statusValue = normalized.match(/^(?:is|due|assignee):(.+)$/)?.[1];
    const nextStatus = resolveStatusToken(statusValue);
    if (nextStatus) {
      status = nextStatus;
      tokens.push(part);
      continue;
    }

    queryParts.push(part);
  }

  return { priority, query: queryParts.join(' '), status, tokens };
}

function resolveStatusToken(value?: string): TaskCommandStatus | null {
  if (value === 'open') return 'open';
  if (value === 'completed' || value === 'done') return 'completed';
  if (value === 'me' || value === 'mine') return 'mine';
  if (value === 'overdue') return 'overdue';
  if (value === 'today') return 'today';
  if (value === 'soon' || value === 'upcoming') return 'soon';
  return null;
}

export function buildTaskCommandListOptions(
  parsed: ParsedTaskCommandQuery,
  now = new Date()
): ListWorkspaceTasksOptions {
  const options: ListWorkspaceTasksOptions = {
    limit: parsed.query || parsed.tokens.length ? 40 : 12,
    priorities: parsed.priority ? [parsed.priority] : undefined,
    q: parsed.query || undefined,
    sortBy: parsed.status === 'overdue' ? 'due-date-asc' : 'created-date-desc',
  };

  if (parsed.status === 'completed') options.completed = 'only';
  if (parsed.status === 'all' && !parsed.query) {
    options.closed = 'exclude';
    options.completed = 'exclude';
  }
  if (parsed.status === 'open' || parsed.status === 'mine') {
    options.closed = 'exclude';
    options.completed = 'exclude';
  }
  if (parsed.status === 'mine') options.assignedToMe = true;

  if (['overdue', 'today', 'soon'].includes(parsed.status)) {
    options.closed = 'exclude';
    options.completed = 'exclude';
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    if (parsed.status === 'overdue') {
      options.dueDateTo = new Date(start.getTime() - 1).toISOString();
    } else {
      if (parsed.status === 'soon') end.setDate(end.getDate() + 3);
      options.dueDateFrom = start.toISOString();
      options.dueDateTo = end.toISOString();
    }
  }

  return options;
}

export function selectQuickCreateTarget(
  boards: readonly WorkspaceTaskBoardWithLists[],
  preferredBoardId?: string | null
) {
  const board =
    boards.find((item) => item.id === preferredBoardId) ?? boards.at(0);
  if (!board) return null;
  const list =
    board.task_lists.find((item) => item.id === board.default_list_id) ??
    board.task_lists.find(
      (item) => item.status !== 'done' && item.status !== 'closed'
    ) ??
    board.task_lists.at(0);
  return list ? { board, list } : null;
}
