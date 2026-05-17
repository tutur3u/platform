'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import type SupabaseProvider from '@tuturuuu/ui/hooks/supabase-provider';
import { SUPABASE_PROVIDER_SYNC_ORIGIN } from '@tuturuuu/ui/hooks/supabase-provider';
import {
  convertJsonContentToYjsState,
  convertYjsStateToJsonContent,
} from '@tuturuuu/utils/yjs-helper';
import debounce from 'lodash/debounce';
import type React from 'react';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { DESCRIPTION_SYNC_DEBOUNCE_MS } from '../constants';
import {
  getDescriptionContent,
  serializeTaskDescriptionContent,
  updateTaskDescriptionCaches,
} from '../utils';
import {
  fetchWorkspaceTaskDescription,
  updateWorkspaceTaskDescription,
} from './task-api';

const EMPTY_DOC_CONTENT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export interface UseTaskYjsSyncProps {
  taskId?: string;
  wsId: string;
  boardId: string;
  isOpen: boolean;
  isCreateMode: boolean;
  /** Whether realtime features (Yjs sync) are enabled - true for all tiers */
  realtimeEnabled: boolean;
  editorInstance: Editor | null;
  doc: Y.Doc | null;
  yjsProvider?: SupabaseProvider | null;
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
  editorInstance,
  doc,
  yjsProvider,
  queryClient,
  flushEditorPendingRef,
}: UseTaskYjsSyncProps): void {
  const initializedTaskIdRef = useRef<string | null>(null);

  // Initialize Yjs state for task description if not present
  useEffect(() => {
    if (!taskId || !editorInstance?.schema || !doc) return;
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
        const serverDescriptionContent = getDescriptionContent(
          taskDescription.description
        );
        const canonicalDescription =
          serverDescriptionContent ?? EMPTY_DOC_CONTENT;
        const hasCanonicalDescriptionSource = serverDescriptionContent !== null;

        const applyYjsStateToDoc = (yjsState: Uint8Array) => {
          const syncOrigin = yjsProvider ?? SUPABASE_PROVIDER_SYNC_ORIGIN;
          doc.transact(() => {
            const fragment = doc.getXmlFragment('prosemirror');
            if (fragment.length > 0) {
              fragment.delete(0, fragment.length);
            }
          }, syncOrigin);

          if (yjsState.length > 0) {
            Y.applyUpdate(doc, yjsState, syncOrigin);
          }
        };

        if (!currentYjsState || currentYjsState.length === 0) {
          const yjsState = convertJsonContentToYjsState(
            canonicalDescription,
            editorInstance.schema
          );
          const nextYjsState = Array.from(yjsState);

          await updateWorkspaceTaskDescription(wsId, taskId, {
            description_yjs_state: nextYjsState,
          });

          applyYjsStateToDoc(yjsState);
          initializedTaskIdRef.current = taskId;
          return;
        }

        try {
          convertYjsStateToJsonContent(
            Uint8Array.from(currentYjsState),
            editorInstance.schema
          );
          initializedTaskIdRef.current = taskId;
          return;
        } catch {
          if (!hasCanonicalDescriptionSource) {
            initializedTaskIdRef.current = taskId;
            return;
          }

          const healedYjsState = convertJsonContentToYjsState(
            canonicalDescription,
            editorInstance.schema
          );

          await updateWorkspaceTaskDescription(wsId, taskId, {
            description_yjs_state: Array.from(healedYjsState),
          });
          applyYjsStateToDoc(healedYjsState);
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
  }, [doc, editorInstance, taskId, wsId, yjsProvider]);

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
