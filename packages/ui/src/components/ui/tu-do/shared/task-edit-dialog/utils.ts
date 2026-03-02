import type { QueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';

const supabase = createClient();

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
  taskId,
  getContent,
  boardId,
  queryClient,
  context = 'save',
}: {
  taskId: string;
  getContent: () => JSONContent | null;
  boardId?: string;
  queryClient?: QueryClient;
  context?: string;
}): Promise<boolean> {
  try {
    const currentDescription = getContent();

    // Always update: null if empty, JSON string if has content
    // This ensures clearing content is properly reflected in the database
    const descriptionString = currentDescription
      ? JSON.stringify(currentDescription)
      : null;

    const { error } = await supabase
      .from('tasks')
      .update({ description: descriptionString })
      .eq('id', taskId);

    if (error) {
      console.error(`Error saving Yjs description (${context}):`, error);
      return false;
    }

    // Optimistically update the task's description in the cache so the task
    // card badge (checkbox counts, etc.) reflects the latest editor state.
    // This avoids full invalidation which would cause all tasks to flicker.
    if (boardId && queryClient) {
      queryClient.setQueryData<Task[]>(['tasks', boardId], (oldTasks) => {
        if (!oldTasks) return oldTasks;
        return oldTasks.map((t) =>
          t.id === taskId
            ? { ...t, description: descriptionString ?? undefined }
            : t
        );
      });
    }

    return true;
  } catch (error) {
    console.error(`Failed to save Yjs description (${context}):`, error);
    return false;
  }
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
