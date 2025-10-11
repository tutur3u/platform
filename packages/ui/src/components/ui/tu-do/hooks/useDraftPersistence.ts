import type { JSONContent } from '@tiptap/react';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DRAFT_SAVE_DEBOUNCE } from '../utils/taskConstants';

interface DraftData {
  name: string;
  description: JSONContent | null;
  priority: TaskPriority | null;
  startDate: string | null;
  endDate: string | null;
  selectedListId: string;
  estimationPoints: number | null;
  selectedLabels: any[];
}

interface UseDraftPersistenceProps {
  boardId: string;
  isOpen: boolean;
  isCreateMode: boolean;
  isSaving: boolean;
  name: string;
  description: JSONContent | null;
  priority: TaskPriority | null;
  startDate: Date | undefined;
  endDate: Date | undefined;
  selectedListId: string;
  estimationPoints: number | null | undefined;
  selectedLabels: any[];
}

/**
 * Hook to manage draft persistence for task creation
 * Only works in create mode - automatically saves/loads drafts
 */
export function useDraftPersistence({
  boardId,
  isOpen,
  isCreateMode,
  isSaving,
  name,
  description,
  priority,
  startDate,
  endDate,
  selectedListId,
  estimationPoints,
  selectedLabels,
}: UseDraftPersistenceProps) {
  const [hasDraft, setHasDraft] = useState(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draftStorageKey = useMemo(
    () => `tu-do:task-draft:${boardId}`,
    [boardId]
  );

  // Load draft when opening in create mode
  useEffect(() => {
    if (!isOpen || !isCreateMode) return;

    try {
      const raw =
        typeof window !== 'undefined'
          ? localStorage.getItem(draftStorageKey)
          : null;
      if (!raw) return;

      const draft = JSON.parse(raw || '{}') as Partial<DraftData>;
      if (!draft || typeof draft !== 'object') return;

      // Check if draft has meaningful content
      const hasContent =
        (draft.name && draft.name.trim().length > 0) ||
        draft.description != null ||
        draft.priority ||
        draft.startDate ||
        draft.endDate ||
        draft.estimationPoints != null ||
        (Array.isArray(draft.selectedLabels) &&
          draft.selectedLabels.length > 0);

      if (hasContent) {
        setHasDraft(true);
      } else {
        // Clear empty draft
        if (typeof window !== 'undefined') {
          localStorage.removeItem(draftStorageKey);
        }
      }
    } catch {
      // Ignore draft load errors
    }
  }, [isOpen, isCreateMode, draftStorageKey]);

  // Clear draft when opening in edit mode
  useEffect(() => {
    if (isOpen && !isCreateMode) {
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(draftStorageKey);
        }
        setHasDraft(false);
      } catch {
        // Ignore errors
      }
    }
  }, [isOpen, isCreateMode, draftStorageKey]);

  // Debounced auto-save draft while editing in create mode
  useEffect(() => {
    if (!isOpen || !isCreateMode || isSaving) return;

    const hasAny =
      (name || '').trim().length > 0 ||
      !!description ||
      !!priority ||
      !!startDate ||
      !!endDate ||
      !!estimationPoints ||
      (selectedLabels && selectedLabels.length > 0);

    if (!hasAny) {
      // Clear empty draft to avoid stale noise
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(draftStorageKey);
        }
      } catch {
        // Ignore errors
      }
      setHasDraft(false);
      return;
    }

    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = setTimeout(() => {
      try {
        const toSave: DraftData = {
          name: (name || '').trim(),
          description: description,
          priority,
          startDate: startDate?.toISOString() || null,
          endDate: endDate?.toISOString() || null,
          selectedListId,
          estimationPoints: estimationPoints ?? null,
          selectedLabels,
        };
        if (typeof window !== 'undefined') {
          localStorage.setItem(draftStorageKey, JSON.stringify(toSave));
        }
        setHasDraft(true);
      } catch {
        // Ignore save errors
      }
    }, DRAFT_SAVE_DEBOUNCE);

    return () => {
      if (draftSaveTimerRef.current) {
        clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [
    isOpen,
    isCreateMode,
    isSaving,
    draftStorageKey,
    name,
    description,
    priority,
    startDate,
    endDate,
    selectedListId,
    estimationPoints,
    selectedLabels,
  ]);

  const clearDraft = () => {
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
    }
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(draftStorageKey);
      }
      setHasDraft(false);
    } catch {
      // Ignore errors
    }
  };

  return {
    hasDraft,
    clearDraft,
  };
}
