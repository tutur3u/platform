import type { QueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import type { Json } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import {
  fetchWorkspaceTaskDescription,
  updateWorkspaceTaskDescription,
} from './hooks/task-api';

function isErrorWithMessage(error: unknown): error is {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
  status?: number;
} {
  return typeof error === 'object' && error !== null;
}

export function shouldPreserveNativeContextMenu(
  target: EventTarget | null
): boolean {
  if (!(target instanceof Node)) return false;

  const element =
    target instanceof Element ? target : (target.parentElement ?? null);

  if (!element) return false;

  return Boolean(
    element.closest(
      'input, textarea, [contenteditable]:not([contenteditable="false"]), .ProseMirror'
    )
  );
}

export function serializeTaskDescriptionContent(
  content: JSONContent | null
): string | null {
  if (!content) return null;

  try {
    return JSON.stringify(content);
  } catch {
    return null;
  }
}

export function getTaskDescriptionStorageLength(
  content: JSONContent | null
): number {
  return serializeTaskDescriptionContent(content)?.length ?? 0;
}

export function getTaskDescriptionPercentLeft(
  storageLength: number,
  descriptionLimit: number
): number {
  if (descriptionLimit <= 0) return 0;

  const remaining =
    ((descriptionLimit - storageLength) / descriptionLimit) * 100;
  return Math.max(0, Math.min(100, Math.round(remaining)));
}

export function buildTaskDescriptionUpdatePayload({
  content,
  yjsState,
}: {
  content: JSONContent | null;
  yjsState?: number[] | null;
}): TaskDescriptionUpdatePayload {
  const descriptionString = serializeTaskDescriptionContent(content);
  const payload: TaskDescriptionUpdatePayload = {};

  if (descriptionString === null) {
    payload.description = null;
  } else if (descriptionString.length <= MAX_TASK_DESCRIPTION_LENGTH) {
    payload.description = descriptionString;
  }

  if (yjsState !== undefined) {
    payload.description_yjs_state = yjsState;
  }

  return payload;
}

export function updateTaskDescriptionCaches({
  taskId,
  descriptionString,
  boardId,
  queryClient,
}: {
  taskId: string;
  descriptionString: string | null;
  boardId?: string;
  queryClient?: QueryClient;
}) {
  if (!queryClient) return;

  queryClient.setQueryData<Task | undefined>(['task', taskId], (oldTask) =>
    oldTask
      ? { ...oldTask, description: descriptionString ?? undefined }
      : oldTask
  );

  if (!boardId) return;

  queryClient.setQueryData<Task[]>(['tasks', boardId], (oldTasks) => {
    if (!oldTasks) return oldTasks;

    return oldTasks.map((task) =>
      task.id === taskId
        ? { ...task, description: descriptionString ?? undefined }
        : task
    );
  });
}

function describeTaskPersistenceError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  if (isErrorWithMessage(error)) {
    return {
      code: error.code,
      details: error.details,
      hint: error.hint,
      message: error.message,
      status: error.status,
    };
  }

  return { error };
}

function yjsStatesMatch(
  expected: number[] | null | undefined,
  actual: number[] | null | undefined
): boolean {
  if (expected === undefined) return true;
  if (expected === null) return actual === null;
  if (!Array.isArray(actual)) return false;
  if (actual.length !== expected.length) return false;

  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) return false;
  }

  return true;
}

export function broadcastTaskDescriptionUpsert({
  taskId,
  descriptionString,
  broadcast,
}: {
  taskId: string;
  descriptionString: string | null;
  broadcast?: (event: string, payload: Record<string, unknown>) => void;
}) {
  if (!broadcast) return;

  broadcast('task:upsert', {
    task: {
      id: taskId,
      description: descriptionString ?? null,
    },
  });
}

/**
 * Helper function to parse task description from various formats
 * Handles both JSONContent objects and string formats
 * @param desc - Description in object, string, or null format
 * @returns Parsed JSONContent or null
 */
export function getDescriptionContent(desc: any): JSONContent | null {
  if (!desc) return null;

  // If it's already an object (from Supabase), use it directly
  if (typeof desc === 'object') {
    return desc as JSONContent;
  }

  // If it's a string, try to parse it
  try {
    return JSON.parse(desc);
  } catch {
    // If it's not valid JSON, treat it as plain text and wrap in doc structure
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: desc }],
        },
      ],
    };
  }
}

/**
 * Saves Yjs-derived description to the database for embeddings and analytics.
 * After a successful save, optimistically updates the task's description in the
 * ['tasks', boardId] React Query cache so that task card badges (e.g. checkbox
 * counts) reflect the latest state without a full cache invalidation.
 *
 * @param taskId - The task ID to update
 * @param getContent - Function that returns the current editor content (can be null if empty)
 * @param boardId - Board ID used to locate the task in the React Query cache
 * @param queryClient - React Query client for optimistic cache updates
 * @param context - Optional context string for logging (e.g., 'close', 'force-close', 'auto-close')
 */
export async function saveYjsDescriptionToDatabase({
  wsId,
  taskId,
  getContent,
  getYjsState,
  boardId,
  queryClient,
  context = 'save',
}: {
  wsId: string;
  taskId: string;
  getContent: () => JSONContent | null;
  getYjsState?: () => number[] | null | undefined;
  boardId?: string;
  queryClient?: QueryClient;
  context?: string;
}): Promise<boolean> {
  try {
    const currentDescription = getContent();
    const descriptionString =
      serializeTaskDescriptionContent(currentDescription);
    const yjsState = getYjsState?.();
    const payload = buildTaskDescriptionUpdatePayload({
      content: currentDescription,
      yjsState,
    });

    if (Object.keys(payload).length === 0) {
      return true;
    }

    await updateWorkspaceTaskDescription(wsId, taskId, payload);

    updateTaskDescriptionCaches({
      taskId,
      descriptionString,
      boardId,
      queryClient,
    });

    return true;
  } catch (error) {
    console.error(
      `Failed to save Yjs description (${context}):`,
      describeTaskPersistenceError(error)
    );
    return false;
  }
}

/**
 * Persists the latest editor state and verifies that the read-back task
 * description matches the state the user had before closing the dialog.
 */
export async function saveAndVerifyYjsDescriptionToDatabase({
  wsId,
  taskId,
  getContent,
  getYjsState,
  boardId,
  queryClient,
  context = 'save-and-verify',
}: {
  wsId: string;
  taskId: string;
  getContent: () => JSONContent | null;
  getYjsState?: () => number[] | null | undefined;
  boardId?: string;
  queryClient?: QueryClient;
  context?: string;
}): Promise<boolean> {
  try {
    const currentDescription = getContent();
    const descriptionString =
      serializeTaskDescriptionContent(currentDescription);
    const yjsState = getYjsState?.();
    const payload = buildTaskDescriptionUpdatePayload({
      content: currentDescription,
      yjsState,
    });

    if (Object.keys(payload).length === 0) {
      return true;
    }

    await updateWorkspaceTaskDescription(wsId, taskId, payload);

    updateTaskDescriptionCaches({
      taskId,
      descriptionString,
      boardId,
      queryClient,
    });

    const persistedDescription = await fetchWorkspaceTaskDescription(
      wsId,
      taskId
    );
    const descriptionMatches =
      payload.description === undefined ||
      persistedDescription.description === payload.description;
    const shouldVerifyYjsState = payload.description_yjs_state !== undefined;
    const yjsMatches = shouldVerifyYjsState
      ? yjsStatesMatch(
          payload.description_yjs_state,
          persistedDescription.description_yjs_state
        )
      : true;

    if (!descriptionMatches || !yjsMatches) {
      console.error(`Task description verification failed (${context})`, {
        descriptionMatches,
        expectedDescription: payload.description,
        persistedDescription: persistedDescription.description,
        yjsMatches,
        expectedYjsStateLength: payload.description_yjs_state?.length ?? null,
        persistedYjsStateLength:
          persistedDescription.description_yjs_state?.length ?? null,
        taskId,
        wsId,
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error(
      `Failed to save and verify Yjs description (${context}):`,
      describeTaskPersistenceError(error)
    );
    return false;
  }
}

export function getTaskDescriptionPreviewText(
  content: JSONContent | null
): string {
  return getDescriptionText(content as Json);
}

/**
 * Generate draft storage key for a board
 */
export function getDraftStorageKey(boardId: string): string {
  return `tu-do:task-draft:${boardId}`;
}

/**
 * Check if draft has any content worth saving
 */
export function hasDraftContent(draft: any): boolean {
  if (!draft || typeof draft !== 'object') return false;

  return (
    (draft.name && draft.name.trim().length > 0) ||
    draft.description != null ||
    draft.priority ||
    draft.startDate ||
    draft.endDate ||
    draft.estimationPoints != null ||
    (Array.isArray(draft.selectedLabels) && draft.selectedLabels.length > 0)
  );
}

/**
 * Clean up draft from local storage
 */
export function clearDraft(storageKey: string): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Save draft to local storage
 */
export function saveDraft(storageKey: string, draft: any): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    }
  } catch {
    // Silently fail
  }
}

/**
 * Load draft from local storage
 */
export function loadDraft(storageKey: string): any | null {
  try {
    const raw =
      typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
type TaskDescriptionUpdatePayload = {
  description?: string | null;
  description_yjs_state?: number[] | null;
};
