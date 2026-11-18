import type { QueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import { MAX_TASK_DESCRIPTION_LENGTH } from '@tuturuuu/utils/constants';
import { convertJsonContentToYjsState } from '@tuturuuu/utils/yjs-helper';
import { type RefObject, useCallback } from 'react';
import {
  canPersistTaskDescriptionSnapshot,
  createTaskDescriptionPersistenceGuardState,
  normalizeTaskDescriptionSnapshot,
  saveAndVerifyYjsDescriptionToDatabase,
  serializeTaskDescriptionPersistenceSnapshot,
  type TaskDescriptionPersistenceGuardState,
} from '../utils';

export function useTaskDescriptionClose({
  isCreateMode,
  descriptionEditedRef,
  taskId,
  effectiveTaskWsId,
  editorInstance,
  boardId,
  queryClient,
  confirmSavedDescription,
  closeBlockedByOverflowRef,
  descriptionPersistenceGuardRef,
  flushEditorPendingRef,
  persistedDescriptionRef,
  setShowDescriptionOverflowWarning,
}: {
  isCreateMode: boolean;
  descriptionEditedRef: RefObject<boolean>;
  taskId?: string;
  effectiveTaskWsId: string;
  editorInstance: Editor | null;
  boardId: string;
  queryClient: QueryClient;
  confirmSavedDescription: (content: JSONContent | null) => void;
  closeBlockedByOverflowRef: RefObject<boolean>;
  descriptionPersistenceGuardRef: RefObject<TaskDescriptionPersistenceGuardState>;
  flushEditorPendingRef: RefObject<(() => JSONContent | null) | undefined>;
  persistedDescriptionRef: RefObject<string | null>;
  setShowDescriptionOverflowWarning: (open: boolean) => void;
}) {
  const persistTaskDescriptionOnClose = useCallback(async () => {
    if (
      isCreateMode ||
      !taskId ||
      !flushEditorPendingRef.current ||
      !descriptionEditedRef.current
    ) {
      return true;
    }

    closeBlockedByOverflowRef.current = false;

    const currentContent = normalizeTaskDescriptionSnapshot(
      flushEditorPendingRef.current()
    );
    const currentSerializedDescription =
      serializeTaskDescriptionPersistenceSnapshot(currentContent) ?? null;

    if (
      currentSerializedDescription &&
      currentSerializedDescription.length > MAX_TASK_DESCRIPTION_LENGTH
    ) {
      closeBlockedByOverflowRef.current = true;
      setShowDescriptionOverflowWarning(true);
      return false;
    }

    const initialSerializedDescription = persistedDescriptionRef.current;

    if (currentSerializedDescription === initialSerializedDescription) {
      return true;
    }

    if (
      !canPersistTaskDescriptionSnapshot({
        currentSerializedDescription,
        guardState: descriptionPersistenceGuardRef.current,
      })
    ) {
      return false;
    }

    const yjsState =
      currentContent && editorInstance?.schema
        ? Array.from(
            convertJsonContentToYjsState(currentContent, editorInstance.schema)
          )
        : null;

    const didPersist = await saveAndVerifyYjsDescriptionToDatabase({
      wsId: effectiveTaskWsId,
      taskId,
      getContent: () => currentContent,
      getYjsState: () => yjsState,
      boardId,
      queryClient,
      context: 'close',
    });

    if (didPersist) {
      persistedDescriptionRef.current = currentSerializedDescription;
      confirmSavedDescription(currentContent);
      descriptionPersistenceGuardRef.current =
        createTaskDescriptionPersistenceGuardState({
          persistedDescription: currentSerializedDescription,
          trustPersistedDescription: true,
        });
    }

    return didPersist;
  }, [
    isCreateMode,
    descriptionEditedRef,
    taskId,
    effectiveTaskWsId,
    editorInstance,
    boardId,
    queryClient,
    confirmSavedDescription,
    closeBlockedByOverflowRef,
    descriptionPersistenceGuardRef,
    flushEditorPendingRef,
    persistedDescriptionRef,
    setShowDescriptionOverflowWarning,
  ]);

  const hasPendingRealtimeDescriptionChanges = useCallback(() => {
    if (
      isCreateMode ||
      !taskId ||
      !flushEditorPendingRef.current ||
      !descriptionEditedRef.current
    ) {
      return false;
    }

    const currentContent = normalizeTaskDescriptionSnapshot(
      flushEditorPendingRef.current()
    );
    const currentSerializedDescription =
      serializeTaskDescriptionPersistenceSnapshot(currentContent) ?? null;

    if (
      currentSerializedDescription &&
      currentSerializedDescription.length > MAX_TASK_DESCRIPTION_LENGTH
    ) {
      return false;
    }

    const initialSerializedDescription = persistedDescriptionRef.current;

    return currentSerializedDescription !== initialSerializedDescription;
  }, [
    isCreateMode,
    descriptionEditedRef,
    taskId,
    flushEditorPendingRef,
    persistedDescriptionRef,
  ]);

  return {
    persistTaskDescriptionOnClose,
    hasPendingRealtimeDescriptionChanges,
  };
}
