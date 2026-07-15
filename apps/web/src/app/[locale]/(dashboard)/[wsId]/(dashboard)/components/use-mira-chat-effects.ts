'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import { getActiveBoardRefresh } from '@tuturuuu/tasks-ui/tu-do/shared/board-broadcast-context';
import { normalizeWorkspaceContextId } from '@tuturuuu/utils/constants';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import type { MessageFileAttachment } from './file-preview-chips';
import {
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from './mira-chat-constants';
import { getMiraToolCallId, getMiraToolName } from './mira-tool-part-utils';

const TASK_MUTATION_TOOL_NAMES = new Set([
  'create_task',
  'complete_task',
  'update_task',
  'delete_task',
  'add_task_labels',
  'remove_task_labels',
  'add_task_to_project',
  'remove_task_from_project',
  'add_task_assignee',
  'remove_task_assignee',
]);

const TASK_LIST_MUTATION_TOOL_NAMES = new Set([
  'create_board',
  'update_board',
  'delete_board',
  'create_task_list',
  'update_task_list',
  'delete_task_list',
]);

const TASK_LABEL_MUTATION_TOOL_NAMES = new Set([
  'create_task_label',
  'update_task_label',
  'delete_task_label',
]);

const TASK_PROJECT_MUTATION_TOOL_NAMES = new Set([
  'create_project',
  'update_project',
  'delete_project',
]);

interface UseMiraChatEffectsParams {
  isFullscreen?: boolean;
  messageAttachmentsRef: MutableRefObject<Map<string, MessageFileAttachment[]>>;
  messages: UIMessage[];
  onToggleFullscreen?: () => void;
  queryClient: QueryClient;
  routerRefresh: () => void;
  setMessageAttachments: Dispatch<
    SetStateAction<Map<string, MessageFileAttachment[]>>
  >;
  setWorkspaceContextId: (value: string) => void;
  status: string;
  taskBoardId?: string;
  wsId: string;
}

function isErroredToolOutput(part: unknown): boolean {
  const output = (part as { output?: unknown })?.output;
  if (!output || typeof output !== 'object') return false;

  const error = (output as { error?: unknown }).error;
  return typeof error === 'string' && error.trim().length > 0;
}

function invalidateMiraTaskCaches({
  includeLists,
  includeLabels,
  includeProjects,
  queryClient,
  taskBoardId,
  wsId,
}: {
  includeLists?: boolean;
  includeLabels?: boolean;
  includeProjects?: boolean;
  queryClient: QueryClient;
  taskBoardId?: string;
  wsId: string;
}) {
  const boardId = taskBoardId?.trim();

  void queryClient.invalidateQueries({ queryKey: ['tasks'], exact: true });
  void queryClient.invalidateQueries({ queryKey: ['task'] });
  void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
  void queryClient.invalidateQueries({
    queryKey: ['task-board', wsId],
    exact: true,
  });
  void queryClient.invalidateQueries({ queryKey: ['task-boards', wsId] });

  if (boardId) {
    if (includeLists) {
      void queryClient.invalidateQueries({
        queryKey: ['task-board', wsId, boardId],
      });
      void queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
    }
    getActiveBoardRefresh()?.({ includeLists, invalidateTasks: false });
  }

  if (includeLists) {
    void queryClient.invalidateQueries({ queryKey: ['task_lists'] });
  }

  if (includeLabels) {
    void queryClient.invalidateQueries({
      queryKey: ['workspace-labels', wsId],
    });
  }

  if (includeProjects) {
    void queryClient.invalidateQueries({
      queryKey: ['workspace-task-projects', wsId],
    });
  }
}

function getTaskRefreshScope(toolName: string) {
  if (TASK_LIST_MUTATION_TOOL_NAMES.has(toolName)) {
    return { includeLists: true };
  }

  if (TASK_LABEL_MUTATION_TOOL_NAMES.has(toolName)) {
    return { includeLabels: true };
  }

  if (TASK_PROJECT_MUTATION_TOOL_NAMES.has(toolName)) {
    return { includeProjects: true };
  }

  if (TASK_MUTATION_TOOL_NAMES.has(toolName)) {
    return {};
  }

  return null;
}

export function useMiraChatEffects({
  isFullscreen,
  messageAttachmentsRef,
  messages,
  onToggleFullscreen,
  queryClient,
  routerRefresh,
  setMessageAttachments,
  setWorkspaceContextId,
  status,
  taskBoardId,
  wsId,
}: UseMiraChatEffectsParams) {
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    const wasBusy = prev === 'submitted' || prev === 'streaming';
    if (wasBusy && (status === 'ready' || status === 'error')) {
      queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
      if (!taskBoardId) {
        routerRefresh();
      }
    }
  }, [queryClient, routerRefresh, status, taskBoardId]);

  const handledToolOutputs = useRef(new Set<string>());
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const parts = message.parts ?? [];
      for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        if (!part) continue;

        const toolName = getMiraToolName(part);
        const state =
          (part as any).toolInvocation?.state || (part as any).state;
        const partId = getMiraToolCallId(part, index);
        const key = `${message.id}-${toolName}-${partId}`;

        if (state !== 'output-available') continue;
        if (handledToolOutputs.current.has(key)) continue;

        const taskRefreshScope = getTaskRefreshScope(toolName);
        if (taskRefreshScope) {
          handledToolOutputs.current.add(key);
          if (!isErroredToolOutput(part)) {
            invalidateMiraTaskCaches({
              queryClient,
              taskBoardId,
              wsId,
              ...taskRefreshScope,
            });
          }
        } else if (toolName === 'update_my_settings') {
          handledToolOutputs.current.add(key);
          queryClient.invalidateQueries({
            queryKey: ['mira-soul', 'detail'],
          });
        } else if (toolName === 'set_immersive_mode') {
          handledToolOutputs.current.add(key);
          const output = (part as { output?: unknown }).output;
          const enabled = (output as { enabled?: boolean })?.enabled;
          if (typeof enabled === 'boolean' && enabled !== isFullscreen) {
            onToggleFullscreen?.();
          }
        } else if (toolName === 'set_workspace_context') {
          handledToolOutputs.current.add(key);
          const output = (part as { output?: unknown }).output;
          const nextWorkspaceContextId = (
            output as { workspaceContextId?: unknown }
          )?.workspaceContextId;
          if (
            typeof nextWorkspaceContextId === 'string' &&
            nextWorkspaceContextId.trim().length > 0
          ) {
            const trimmed = normalizeWorkspaceContextId(nextWorkspaceContextId);
            // Update the config hook state
            setWorkspaceContextId(trimmed);
            // Persist to localStorage and dispatch the event immediately
            // so the selector badge updates without waiting for the config
            // hook's persistence useEffect to fire in a later render cycle.
            localStorage.setItem(
              `${WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX}${wsId}`,
              trimmed
            );
            window.dispatchEvent(
              new CustomEvent(WORKSPACE_CONTEXT_EVENT, {
                detail: { wsId, workspaceContextId: trimmed },
              })
            );
          }
        }
      }
    }
  }, [
    isFullscreen,
    messages,
    onToggleFullscreen,
    queryClient,
    setWorkspaceContextId,
    taskBoardId,
    wsId,
  ]);

  const prevMessageIdsRef = useRef(new Set<string>());
  useEffect(() => {
    const prevIds = prevMessageIdsRef.current;
    const currentIds = new Set(messages.map((message) => message.id));
    prevMessageIdsRef.current = currentIds;

    for (const message of messages) {
      if (message.role !== 'user') continue;
      if (prevIds.has(message.id)) continue;

      const latestUpload = messageAttachmentsRef.current.get(
        '__latest_user_upload'
      );
      if (!latestUpload?.length) continue;

      setMessageAttachments((prev) => {
        const next = new Map(prev);
        next.set(message.id, latestUpload);
        next.delete('__latest_user_upload');
        next.delete('pending');
        next.delete('queued');
        messageAttachmentsRef.current = next;
        return next;
      });
      break;
    }
  }, [messageAttachmentsRef, messages, setMessageAttachments]);
}
