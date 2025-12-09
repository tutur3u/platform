'use client';

import type { JSONContent } from '@tiptap/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { useCallback, useMemo } from 'react';

export interface UseTaskChangeDetectionProps {
  task?: Task;
  name: string;
  description: JSONContent | null;
  priority: 'critical' | 'high' | 'low' | 'normal' | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  isCreateMode: boolean;
  isLoading: boolean;
  collaborationMode: boolean;
}

export interface UseTaskChangeDetectionReturn {
  hasUnsavedChanges: boolean;
  canSave: boolean;
  parseDescription: (desc?: string) => JSONContent | null;
}

/**
 * Hook to detect changes between the current form state and the original task.
 * Used to determine if save button should be enabled and if there are unsaved changes.
 */
export function useTaskChangeDetection({
  task,
  name,
  description,
  priority,
  startDate,
  endDate,
  selectedListId,
  estimationPoints,
  isCreateMode,
  isLoading,
  collaborationMode,
}: UseTaskChangeDetectionProps): UseTaskChangeDetectionReturn {
  // Parse description from string to JSONContent
  const parseDescription = useCallback((desc?: string): JSONContent | null => {
    if (!desc) return null;
    try {
      return JSON.parse(desc);
    } catch {
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
  }, []);

  // Snapshot of the original task values
  const initialSnapshot = useMemo(() => {
    return {
      name: (task?.name || '').trim(),
      description: JSON.stringify(parseDescription(task?.description) || null),
      priority: task?.priority || null,
      start: task?.start_date
        ? new Date(task?.start_date).toISOString()
        : undefined,
      end: task?.end_date ? new Date(task?.end_date).toISOString() : undefined,
      listId: task?.list_id,
      estimationPoints: task?.estimation_points ?? null,
    } as const;
  }, [task, parseDescription]);

  // Snapshot of current form values
  const currentSnapshot = useMemo(() => {
    return {
      name: (name || '').trim(),
      description: JSON.stringify(description || null),
      priority: priority || null,
      start: startDate?.toISOString(),
      end: endDate?.toISOString(),
      listId: selectedListId,
      estimationPoints: estimationPoints ?? null,
    } as const;
  }, [
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
  ]);

  // Detect if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    // When collaboration is enabled, description is managed by Yjs - don't track it
    const descriptionChanged = collaborationMode
      ? false
      : initialSnapshot.description !== currentSnapshot.description;

    return (
      initialSnapshot.name !== currentSnapshot.name ||
      descriptionChanged ||
      initialSnapshot.priority !== currentSnapshot.priority ||
      initialSnapshot.start !== currentSnapshot.start ||
      initialSnapshot.end !== currentSnapshot.end ||
      initialSnapshot.listId !== currentSnapshot.listId ||
      initialSnapshot.estimationPoints !== currentSnapshot.estimationPoints
    );
  }, [initialSnapshot, currentSnapshot, collaborationMode]);

  // Determine if save is allowed
  const canSave = useMemo(() => {
    const hasName = !!(name || '').trim();
    if (isCreateMode) return hasName && !isLoading;
    return hasName && hasUnsavedChanges && !isLoading;
  }, [isCreateMode, name, hasUnsavedChanges, isLoading]);

  return {
    hasUnsavedChanges,
    canSave,
    parseDescription,
  };
}
