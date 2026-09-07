'use client';

import { useCallback, useRef } from 'react';
import type { PendingRelationship } from '../types/pending-relationship';

export interface UseTaskDialogCloseProps {
  taskId?: string;
  isCreateMode: boolean;
  isSaving?: boolean;
  collaborationMode: boolean;
  synced: boolean;
  connected: boolean;
  draftStorageKey: string;
  parentTaskId?: string;
  pendingRelationship?: PendingRelationship;

  // Callbacks
  onClose: () => void;
  onNavigateToTask?: (taskId: string) => Promise<void>;
  flushNameUpdate: () => Promise<void>;
  persistTaskDescription?: () => Promise<boolean>;
  hasPendingRealtimeDescriptionChanges?: () => boolean;
  onCloseBlocked?: () => void;

  // State setters
  setShowSyncWarning: (value: boolean) => void;
}

export interface UseTaskDialogCloseReturn {
  handleClose: () => Promise<boolean>;
  handleForceClose: () => Promise<void>;
  handleNavigateBack: () => Promise<void>;
  handleDialogOpenChange: (open: boolean) => void;
  handleCloseRef: React.MutableRefObject<() => void>;
}

/**
 * Hook to manage dialog close handlers including:
 * - Normal close with background saves
 * - Force close bypassing sync warning
 * - Navigate back to related task
 * - Dialog open change handler
 */
export function useTaskDialogClose({
  taskId,
  isCreateMode,
  isSaving = false,
  collaborationMode,
  synced,
  connected,
  parentTaskId,
  pendingRelationship,
  onClose,
  onNavigateToTask,
  flushNameUpdate,
  persistTaskDescription,
  hasPendingRealtimeDescriptionChanges,
  onCloseBlocked,
  setShowSyncWarning,
}: UseTaskDialogCloseProps): UseTaskDialogCloseReturn {
  const handleCloseRef = useRef<() => void>(() => {});
  const isClosingRef = useRef(false);

  // Main close handler
  const handleClose = useCallback(async (): Promise<boolean> => {
    if (isSaving || isClosingRef.current) return false;

    // Show warning if not synced in collaboration mode
    if (
      collaborationMode &&
      !isCreateMode &&
      (!synced || !connected) &&
      (hasPendingRealtimeDescriptionChanges?.() ?? false)
    ) {
      setShowSyncWarning(true);
      return false;
    }

    isClosingRef.current = true;

    try {
      await flushNameUpdate();

      if (!isCreateMode && taskId) {
        const descriptionPersisted = (await persistTaskDescription?.()) ?? true;

        if (!descriptionPersisted) {
          onCloseBlocked?.();
          return false;
        }
      }

      onClose();
      return true;
    } catch (error) {
      console.error('Error during close save:', error);
      onCloseBlocked?.();
      return false;
    } finally {
      isClosingRef.current = false;
    }
  }, [
    isSaving,
    collaborationMode,
    isCreateMode,
    synced,
    connected,
    flushNameUpdate,
    taskId,
    persistTaskDescription,
    hasPendingRealtimeDescriptionChanges,
    onCloseBlocked,
    onClose,
    setShowSyncWarning,
  ]);

  // Force close handler (bypasses sync warning)
  const handleForceClose = useCallback(async () => {
    if (isSaving) return;
    setShowSyncWarning(false);
    onClose();

    const performBackgroundSaves = async () => {
      try {
        await flushNameUpdate();

        if (!isCreateMode && taskId) {
          await persistTaskDescription?.();
        }
      } catch (error) {
        console.error('Error during background save on force close:', error);
      }
    };

    performBackgroundSaves();
  }, [
    isSaving,
    setShowSyncWarning,
    onClose,
    flushNameUpdate,
    isCreateMode,
    taskId,
    persistTaskDescription,
  ]);

  // Navigate back to related task (for create mode with pending relationship)
  const handleNavigateBack = useCallback(async () => {
    if (isSaving) return;
    const taskIdToNavigateTo =
      pendingRelationship?.relatedTaskId ?? parentTaskId;

    if (!taskIdToNavigateTo || !onNavigateToTask) {
      onClose();
      return;
    }

    await onNavigateToTask(taskIdToNavigateTo);
  }, [
    isSaving,
    pendingRelationship?.relatedTaskId,
    parentTaskId,
    onNavigateToTask,
    onClose,
  ]);

  // Dialog open change handler - only close if no menus are open
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleClose();
      }
    },
    [handleClose]
  );

  // Keep ref updated
  handleCloseRef.current = () => {
    void handleClose();
  };

  return {
    handleClose,
    handleForceClose,
    handleNavigateBack,
    handleDialogOpenChange,
    handleCloseRef,
  };
}
