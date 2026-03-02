'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect, useRef } from 'react';
import type { MessageFileAttachment } from './file-preview-chips';

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
}: UseMiraChatEffectsParams) {
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    const wasBusy = prev === 'submitted' || prev === 'streaming';
    if (wasBusy && status === 'ready') {
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

        // Extract tool name and state safely
        const toolName =
          (part as any).toolInvocation?.toolName || (part as any).toolName;
        const state =
          (part as any).toolInvocation?.state || (part as any).state;
        const partId =
          (part as any).toolInvocation?.toolCallId || (part as any).id || index;
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
            setWorkspaceContextId(nextWorkspaceContextId.trim());
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
