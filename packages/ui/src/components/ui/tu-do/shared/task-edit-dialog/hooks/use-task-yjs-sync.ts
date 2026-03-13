'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
import debounce from 'lodash/debounce';
import type React from 'react';
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';
import { DESCRIPTION_SYNC_DEBOUNCE_MS } from '../constants';
import {
  serializeTaskDescriptionContent,
  updateTaskDescriptionCaches,
} from '../utils';
import {
  fetchWorkspaceTaskDescription,
  updateWorkspaceTaskDescription,
} from './task-api';

export interface UseTaskYjsSyncProps {
  taskId?: string;
  wsId: string;
  boardId: string;
  isOpen: boolean;
  isCreateMode: boolean;
  /** Whether realtime features (Yjs sync) are enabled - true for all tiers */
  realtimeEnabled: boolean;
  description: JSONContent | null;
  editorInstance: Editor | null;
  doc: Y.Doc | null;
  queryClient: QueryClient;
  flushEditorPendingRef: React.MutableRefObject<
    (() => JSONContent | null) | undefined
  >;
}

/**
 * Hook to manage Yjs synchronization for task descriptions.
 * Handles initialization and real-time sync of Yjs state.
 */
export function useTaskYjsSync({
  taskId,
  wsId,
  boardId,
  isOpen,
  isCreateMode,
  realtimeEnabled,
  description,
  editorInstance,
  doc,
  queryClient,
  flushEditorPendingRef,
}: UseTaskYjsSyncProps): void {
  const initializedTaskIdRef = useRef<string | null>(null);

  // Initialize Yjs state for task description if not present
  useEffect(() => {
    if (!taskId || !editorInstance?.schema || !description || !doc) return;
    if (initializedTaskIdRef.current === taskId) return;

    const initializeYjsState = async () => {
      try {
        const taskDescription = await fetchWorkspaceTaskDescription(
          wsId,
          taskId
        );
        const currentYjsState = Array.isArray(
          taskDescription.description_yjs_state
        )
          ? taskDescription.description_yjs_state
          : null;

        if (!currentYjsState || currentYjsState.length === 0) {
          const yjsState = convertJsonContentToYjsState(
            description,
            editorInstance.schema
          );

          if (yjsState.length > 0) {
            await updateWorkspaceTaskDescription(wsId, taskId, {
              description_yjs_state: Array.from(yjsState),
            });
          }

          // Import Y dynamically to apply update
          const Y = await import('yjs');
          Y.applyUpdate(doc, yjsState);
        }

        initializedTaskIdRef.current = taskId;
      } catch (error) {
        console.error('Error initializing Yjs state:', {
          taskId,
          wsId,
          ...(error instanceof Error
            ? { message: error.message, name: error.name }
            : { error }),
        });
      }
    };

    initializeYjsState();
  }, [doc, description, editorInstance, taskId, wsId]);

  useEffect(() => {
    if (
      initializedTaskIdRef.current &&
      initializedTaskIdRef.current !== taskId
    ) {
      initializedTaskIdRef.current = null;
    }
  }, [taskId]);

  // Event-based sync: update local caches from Yjs for real-time UI updates
  useEffect(() => {
    if (
      !realtimeEnabled ||
      isCreateMode ||
      !isOpen ||
      !taskId ||
      !flushEditorPendingRef.current ||
      !doc
    ) {
      return;
    }

    let lastSyncedContent: string | null = null;

    const syncDescriptionFromYjs = () => {
      if (!flushEditorPendingRef.current) return;

      const currentDescription = flushEditorPendingRef.current();
      const descriptionString =
        serializeTaskDescriptionContent(currentDescription);

      if (descriptionString === lastSyncedContent) return;

      updateTaskDescriptionCaches({
        taskId,
        descriptionString,
        boardId,
        queryClient,
      });
      lastSyncedContent = descriptionString;
    };

    const debouncedSync = debounce(
      syncDescriptionFromYjs,
      DESCRIPTION_SYNC_DEBOUNCE_MS
    );
    const handleYjsUpdate = () => debouncedSync();

    doc.on('update', handleYjsUpdate);
    syncDescriptionFromYjs();

    return () => {
      doc.off('update', handleYjsUpdate);
      debouncedSync.cancel();
    };
  }, [
    realtimeEnabled,
    isCreateMode,
    isOpen,
    taskId,
    boardId,
    queryClient,
    doc,
    flushEditorPendingRef,
  ]);
}
