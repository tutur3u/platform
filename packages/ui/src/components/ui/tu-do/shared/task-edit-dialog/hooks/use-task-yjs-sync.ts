'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
import debounce from 'lodash/debounce';
import type React from 'react';
import { useEffect } from 'react';
import type * as Y from 'yjs';
import { DESCRIPTION_SYNC_DEBOUNCE_MS } from '../constants';
import { saveYjsDescriptionToDatabase } from '../utils';

const supabase = createClient();

export interface UseTaskYjsSyncProps {
  taskId?: string;
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
  // Initialize Yjs state for task description if not present
  useEffect(() => {
    if (!taskId || !editorInstance?.schema || !description || !doc) return;

    const initializeYjsState = async () => {
      try {
        const { data: taskData, error: taskDataError } = await supabase
          .from('tasks')
          .select('description_yjs_state')
          .eq('id', taskId)
          .single();

        if (taskDataError) throw taskDataError;

        if (!taskData?.description_yjs_state) {
          const yjsState = convertJsonContentToYjsState(
            description,
            editorInstance.schema
          );
          const { error: updateError } = await supabase
            .from('tasks')
            .update({ description_yjs_state: Array.from(yjsState) })
            .eq('id', taskId);

          if (updateError) throw updateError;

          // Import Y dynamically to apply update
          const Y = await import('yjs');
          Y.applyUpdate(doc, yjsState);
        }
      } catch (error) {
        console.error('Error initializing Yjs state:', error);
      }
    };

    initializeYjsState();
  }, [doc, description, editorInstance, taskId]);

  // Event-based sync: Update description field from Yjs for real-time UI updates
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

    const syncDescriptionFromYjs = async () => {
      if (!flushEditorPendingRef.current) return;

      const currentDescription = flushEditorPendingRef.current();
      const descriptionString = currentDescription
        ? JSON.stringify(currentDescription)
        : null;

      if (descriptionString === lastSyncedContent) return;

      const success = await saveYjsDescriptionToDatabase({
        taskId,
        getContent: () => currentDescription,
        boardId,
        queryClient,
        context: 'yjs-update',
      });

      if (success) lastSyncedContent = descriptionString;
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
