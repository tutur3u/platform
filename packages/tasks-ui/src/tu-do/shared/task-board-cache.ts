import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ListPaginationState } from './progressive-loader-context';

const TASK_BOARD_CACHE_PREFIX = 'tuturuuu:task-board-cache';
const TASK_BOARD_CACHE_VERSION = 1;
const TASK_BOARD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const TASK_BOARD_CACHE_MAX_TASKS = 2_000;

export interface TaskBoardCacheSnapshot {
  board: WorkspaceTaskBoard;
  pagination: Record<string, ListPaginationState>;
  tasks: Task[];
  updatedAt: number;
}

function getTaskBoardCacheKey(workspaceId: string, boardId: string) {
  return `${TASK_BOARD_CACHE_PREFIX}:${workspaceId}:${boardId}`;
}

function sanitizeCachedTasks(tasks: Task[]) {
  return tasks.slice(0, TASK_BOARD_CACHE_MAX_TASKS).map((task) => {
    const cachedTask = { ...task } as Task & { description?: string };
    delete cachedTask.description;
    return cachedTask;
  });
}

function sanitizeCachedPagination(
  pagination: Record<string, ListPaginationState>
) {
  return Object.fromEntries(
    Object.entries(pagination).map(([listId, state]) => [
      listId,
      {
        ...state,
        isInitialLoad: false,
        isLoading: false,
      },
    ])
  );
}

export function readTaskBoardCache(
  workspaceId: string,
  boardId: string,
  now = Date.now()
): TaskBoardCacheSnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(
      getTaskBoardCacheKey(workspaceId, boardId)
    );
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TaskBoardCacheSnapshot & {
      version?: number;
    };
    if (
      parsed.version !== TASK_BOARD_CACHE_VERSION ||
      !parsed.board?.id ||
      !parsed.pagination ||
      typeof parsed.pagination !== 'object' ||
      !Array.isArray(parsed.tasks) ||
      typeof parsed.updatedAt !== 'number' ||
      now - parsed.updatedAt > TASK_BOARD_CACHE_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(
        getTaskBoardCacheKey(workspaceId, boardId)
      );
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(getTaskBoardCacheKey(workspaceId, boardId));
    return null;
  }
}

export function writeTaskBoardCache(
  workspaceId: string,
  boardId: string,
  snapshot: Omit<TaskBoardCacheSnapshot, 'updatedAt'> & {
    updatedAt?: number;
  }
) {
  if (typeof window === 'undefined' || snapshot.board.id !== boardId) return;

  try {
    window.localStorage.setItem(
      getTaskBoardCacheKey(workspaceId, boardId),
      JSON.stringify({
        version: TASK_BOARD_CACHE_VERSION,
        board: snapshot.board,
        pagination: sanitizeCachedPagination(snapshot.pagination),
        tasks: sanitizeCachedTasks(snapshot.tasks),
        updatedAt: snapshot.updatedAt ?? Date.now(),
      })
    );
  } catch {
    // Storage can be unavailable or full. The in-memory query cache still works.
  }
}
