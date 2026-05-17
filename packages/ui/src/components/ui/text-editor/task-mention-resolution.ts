import {
  type CurrentUserTaskDialogResponse,
  getCurrentUserTask,
  listWorkspaceTasks,
  type WorkspaceTaskApiTask,
} from '@tuturuuu/internal-api/tasks';

const LOCALE_SEGMENTS = new Set(['en', 'vi']);

interface ResolveTaskMentionPayloadOptions {
  entityId: string;
  displayNumber: string;
  subtitle?: string | null;
  routeBoardId?: string;
  routeWorkspaceId?: string;
}

interface TaskMentionCandidateContext {
  displayNumber: string;
  routeBoardId?: string;
  subtitle?: string | null;
}

export function getRouteWorkspaceIdFromPathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return undefined;
  }

  return LOCALE_SEGMENTS.has(segments[0] ?? '') ? segments[1] : segments[0];
}

export function getRouteTaskBoardIdFromPathname(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const tasksIndex = segments.indexOf('tasks');

  if (tasksIndex < 0 || segments[tasksIndex + 1] !== 'boards') {
    return undefined;
  }

  return segments[tasksIndex + 2];
}

function normalizeSearchText(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function normalizeIdentifier(value: string) {
  return value.trim().replace(/^#/, '');
}

function getTaskIdentifier(task: WorkspaceTaskApiTask) {
  if (typeof task.display_number !== 'number') {
    return null;
  }

  return task.ticket_prefix
    ? `${task.ticket_prefix}-${task.display_number}`
    : String(task.display_number);
}

function scoreTaskMentionCandidate(
  task: WorkspaceTaskApiTask,
  context: TaskMentionCandidateContext
) {
  const normalizedIdentifier = normalizeIdentifier(context.displayNumber);
  const taskIdentifier = getTaskIdentifier(task);
  let score = 0;

  if (
    normalizedIdentifier &&
    taskIdentifier?.toLowerCase() === normalizedIdentifier.toLowerCase()
  ) {
    score += 10;
  }

  if (
    normalizedIdentifier &&
    typeof task.display_number === 'number' &&
    String(task.display_number) === normalizedIdentifier
  ) {
    score += 8;
  }

  if (context.routeBoardId && task.board_id === context.routeBoardId) {
    score += 6;
  }

  const taskName = normalizeSearchText(task.name);
  const mentionName = normalizeSearchText(context.subtitle);

  if (mentionName && taskName === mentionName) {
    score += 5;
  } else if (mentionName && taskName.includes(mentionName)) {
    score += 2;
  }

  if (!task.deleted_at) {
    score += 1;
  }

  return score;
}

export function chooseTaskMentionCandidate(
  tasks: WorkspaceTaskApiTask[],
  context: TaskMentionCandidateContext
) {
  const scored = tasks
    .map((task) => ({
      score: scoreTaskMentionCandidate(task, context),
      task,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const [best, nextBest] = scored;
  if (!best) {
    return null;
  }

  if (nextBest && nextBest.score === best.score) {
    return null;
  }

  return best.task;
}

async function findTaskMentionCandidate({
  displayNumber,
  routeBoardId,
  routeWorkspaceId,
  subtitle,
}: ResolveTaskMentionPayloadOptions) {
  if (!routeWorkspaceId) {
    return null;
  }

  const identifier = normalizeIdentifier(displayNumber);
  const searches: Array<{
    boardId?: string;
    identifier?: string;
    q?: string;
  }> = [];

  if (identifier) {
    searches.push({ boardId: routeBoardId, identifier });
    searches.push({ identifier });
  }

  const normalizedSubtitle = subtitle?.trim();
  if (normalizedSubtitle) {
    searches.push({ boardId: routeBoardId, q: normalizedSubtitle });
    searches.push({ q: normalizedSubtitle });
  }

  const seenSearches = new Set<string>();
  const candidatesById = new Map<string, WorkspaceTaskApiTask>();

  for (const search of searches) {
    const searchKey = JSON.stringify(search);
    if (seenSearches.has(searchKey)) {
      continue;
    }
    seenSearches.add(searchKey);

    const { tasks } = await listWorkspaceTasks(routeWorkspaceId, {
      boardId: search.boardId,
      q: search.q,
      identifier: search.identifier,
      limit: 20,
      externalIncludeDoneClosed: true,
    });

    for (const task of tasks) {
      candidatesById.set(task.id, task);
    }
  }

  return chooseTaskMentionCandidate([...candidatesById.values()], {
    displayNumber,
    routeBoardId,
    subtitle,
  });
}

function buildFallbackPayload({
  routeWorkspaceId,
  task,
}: {
  routeWorkspaceId: string;
  task: WorkspaceTaskApiTask;
}): CurrentUserTaskDialogResponse {
  return {
    availableLists: [],
    task,
    taskWorkspacePersonal: false,
    taskWorkspaceTier: 'FREE',
    taskWsId: routeWorkspaceId,
  };
}

export async function resolveTaskMentionPayload(
  options: ResolveTaskMentionPayloadOptions
) {
  try {
    return await getCurrentUserTask(options.entityId);
  } catch (originalError) {
    let candidate: WorkspaceTaskApiTask | null;

    try {
      candidate = await findTaskMentionCandidate(options);
    } catch {
      throw originalError;
    }

    if (!candidate) {
      throw originalError;
    }

    try {
      return await getCurrentUserTask(candidate.id);
    } catch {
      if (!options.routeWorkspaceId) {
        throw originalError;
      }

      return buildFallbackPayload({
        routeWorkspaceId: options.routeWorkspaceId,
        task: candidate,
      });
    }
  }
}
