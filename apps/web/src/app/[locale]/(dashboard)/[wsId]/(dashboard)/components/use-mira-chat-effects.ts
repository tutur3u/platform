'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import type { MessageFileAttachment } from './file-preview-chips';
import {
  WORKSPACE_CONTEXT_EVENT,
  WORKSPACE_CONTEXT_STORAGE_KEY_PREFIX,
} from './mira-chat-constants';
import { getMiraToolCallId, getMiraToolName } from './mira-tool-part-utils';

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
  wsId: string;
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
  wsId,
}: UseMiraChatEffectsParams) {
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    const wasBusy = prev === 'submitted' || prev === 'streaming';
    if (wasBusy && (status === 'ready' || status === 'error')) {
      queryClient.invalidateQueries({ queryKey: ['ai-credits'] });
      routerRefresh();
    }
  }, [queryClient, routerRefresh, status]);

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

        if (toolName === 'update_my_settings') {
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
            const trimmed = nextWorkspaceContextId.trim();
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
