// Task creation defaults manager for command palette

export interface TaskDefaults {
  boardId: string;
  listId: string;
  timestamp: number;
}

const TASK_DEFAULTS_KEY = 'cmdk_task_defaults';
const EXPIRY_DAYS = 30;

function isExpired(timestamp: number): boolean {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  return now - timestamp > EXPIRY_DAYS * dayInMs;
}

/**
 * Get saved task creation defaults
 * Returns null if no defaults exist or they've expired
 */
export function getTaskDefaults(wsId: string): TaskDefaults | null {
  if (typeof window === 'undefined') return null;

  try {
    const key = `${TASK_DEFAULTS_KEY}_${wsId}`;
    const stored = window.localStorage.getItem(key);
    if (!stored) return null;

    const defaults = JSON.parse(stored) as TaskDefaults;

    // Check if expired
    if (isExpired(defaults.timestamp)) {
      clearTaskDefaults(wsId);
      return null;
    }

    return defaults;
  } catch {
    return null;
  }
}

/**
 * Save task creation defaults for a workspace
 */
export function saveTaskDefaults(
  wsId: string,
  boardId: string,
  listId: string
) {
  if (typeof window === 'undefined') return;

  try {
    const key = `${TASK_DEFAULTS_KEY}_${wsId}`;
    const defaults: TaskDefaults = {
      boardId,
      listId,
      timestamp: Date.now(),
    };

    window.localStorage.setItem(key, JSON.stringify(defaults));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear task creation defaults for a workspace
 */
export function clearTaskDefaults(wsId: string) {
  if (typeof window === 'undefined') return;

  try {
    const key = `${TASK_DEFAULTS_KEY}_${wsId}`;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

/**
 * Check if a board/list combination is still valid
 * Used to verify saved defaults against current boards
 */
export function isValidDefault(
  defaults: TaskDefaults | null,
  boards: Array<{ id: string; task_lists: Array<{ id: string }> }>
): boolean {
  if (!defaults) return false;

  const board = boards.find((b) => b.id === defaults.boardId);
  if (!board) return false;

  const list = board.task_lists.find((l) => l.id === defaults.listId);
  return !!list;
}
