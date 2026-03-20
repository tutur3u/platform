'use client';

import { useCallback, useRef } from 'react';
import type { PendingRelationship } from '../types/pending-relationship';
import { clearDraft } from '../utils';

export interface UseTaskDialogCloseProps {
  taskId?: string;
  isCreateMode: boolean;
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
  onCloseBlocked?: () => void;

  // State setters
  setShowSyncWarning: (value: boolean) => void;
}

export interface UseTaskDialogCloseReturn {
  handleClose: () => Promise<void>;
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
  collaborationMode,
  synced,
  connected,
  draftStorageKey,
  parentTaskId,
  pendingRelationship,
  onClose,
  onNavigateToTask,
  flushNameUpdate,
  persistTaskDescription,
  onCloseBlocked,
  setShowSyncWarning,
}: UseTaskDialogCloseProps): UseTaskDialogCloseReturn {
  const handleCloseRef = useRef<() => void>(() => {});
  const isClosingRef = useRef(false);

  // Main close handler
  const handleClose = useCallback(async () => {
    if (isClosingRef.current) return;

    // Show warning if not synced in collaboration mode
    if (collaborationMode && !isCreateMode && (!synced || !connected)) {
      setShowSyncWarning(true);
      return;
    }

    isClosingRef.current = true;

    try {
      await flushNameUpdate();

      if (!isCreateMode && taskId) {
        const descriptionPersisted = (await persistTaskDescription?.()) ?? true;

        if (!descriptionPersisted) {
          onCloseBlocked?.();
          return;
        }
      }

      if (!isCreateMode) {
        clearDraft(draftStorageKey);
      }

      onClose();
    } catch (error) {
      console.error('Error during close save:', error);
      onCloseBlocked?.();
    } finally {
      isClosingRef.current = false;
    }
  }, [
    collaborationMode,
    isCreateMode,
    synced,
    connected,
    flushNameUpdate,
    taskId,
    persistTaskDescription,
    onCloseBlocked,
    draftStorageKey,
    onClose,
    setShowSyncWarning,
  ]);

  // Force close handler (bypasses sync warning)
  const handleForceClose = useCallback(async () => {
    setShowSyncWarning(false);
    onClose();

    const performBackgroundSaves = async () => {
      try {
        await flushNameUpdate();

        if (!isCreateMode && taskId) {
          await persistTaskDescription?.();
        }

        if (!isCreateMode) {
          clearDraft(draftStorageKey);
        }
      } catch (error) {
        console.error('Error during background save on force close:', error);
      }
    };

    performBackgroundSaves();
  }, [
    setShowSyncWarning,
    onClose,
    flushNameUpdate,
    isCreateMode,
    taskId,
    persistTaskDescription,
    draftStorageKey,
  ]);

  // Navigate back to related task (for create mode with pending relationship)
  const handleNavigateBack = useCallback(async () => {
    const taskIdToNavigateTo =
      pendingRelationship?.relatedTaskId ?? parentTaskId;

    if (!taskIdToNavigateTo || !onNavigateToTask) {
      onClose();
      return;
    }

    await onNavigateToTask(taskIdToNavigateTo);
  }, [
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
  handleCloseRef.current = handleClose;

  return {
    handleClose,
    handleForceClose,
    handleNavigateBack,
    handleDialogOpenChange,
    handleCloseRef,
  };
}
