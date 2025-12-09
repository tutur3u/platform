'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import type React from 'react';
import { useCallback, useRef } from 'react';
import type { PendingRelationship } from '../types/pending-relationship';
import { clearDraft, saveYjsDescriptionToDatabase } from '../utils';

export interface UseTaskDialogCloseProps {
  taskId?: string;
  boardId: string;
  isCreateMode: boolean;
  collaborationMode: boolean;
  synced: boolean;
  connected: boolean;
  draftStorageKey: string;
  parentTaskId?: string;
  pendingRelationship?: PendingRelationship;

  // Refs
  flushEditorPendingRef: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;

  // Callbacks
  queryClient: QueryClient;
  onClose: () => void;
  onNavigateToTask?: (taskId: string) => Promise<void>;
  flushNameUpdate: () => Promise<void>;

  // State setters
  setShowSyncWarning: React.Dispatch<React.SetStateAction<boolean>>;
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
  boardId,
  isCreateMode,
  collaborationMode,
  synced,
  connected,
  draftStorageKey,
  parentTaskId,
  pendingRelationship,
  flushEditorPendingRef,
  queryClient,
  onClose,
  onNavigateToTask,
  flushNameUpdate,
  setShowSyncWarning,
}: UseTaskDialogCloseProps): UseTaskDialogCloseReturn {
  const handleCloseRef = useRef<() => void>(() => {});

  // Main close handler
  const handleClose = useCallback(async () => {
    // Show warning if not synced in collaboration mode
    if (collaborationMode && !isCreateMode && (!synced || !connected)) {
      setShowSyncWarning(true);
      return;
    }

    // Close dialog immediately
    onClose();

    // Background saves (non-blocking)
    const performBackgroundSaves = async () => {
      try {
        await flushNameUpdate();

        if (
          collaborationMode &&
          !isCreateMode &&
          taskId &&
          flushEditorPendingRef.current
        ) {
          await saveYjsDescriptionToDatabase({
            taskId,
            getContent: flushEditorPendingRef.current,
            boardId,
            queryClient,
            context: 'close',
          });
        }

        if (!isCreateMode) {
          clearDraft(draftStorageKey);
        }
      } catch (error) {
        console.error('Error during background save on close:', error);
      }
    };

    performBackgroundSaves();
  }, [
    collaborationMode,
    isCreateMode,
    synced,
    connected,
    onClose,
    flushNameUpdate,
    taskId,
    boardId,
    queryClient,
    draftStorageKey,
    flushEditorPendingRef,
    setShowSyncWarning,
  ]);

  // Force close handler (bypasses sync warning)
  const handleForceClose = useCallback(async () => {
    setShowSyncWarning(false);
    onClose();

    const performBackgroundSaves = async () => {
      try {
        await flushNameUpdate();

        if (
          collaborationMode &&
          !isCreateMode &&
          taskId &&
          flushEditorPendingRef.current
        ) {
          await saveYjsDescriptionToDatabase({
            taskId,
            getContent: flushEditorPendingRef.current,
            boardId,
            queryClient,
            context: 'force-close',
          });
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
    collaborationMode,
    isCreateMode,
    taskId,
    boardId,
    queryClient,
    draftStorageKey,
    flushEditorPendingRef,
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
