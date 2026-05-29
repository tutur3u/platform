'use client';

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type ChatAttachmentDraft,
  type ChatMessage,
  deleteWorkspaceChatMessage,
  editWorkspaceChatMessage,
  listWorkspaceChatConversationMessages,
  type SendChatMessageResult,
  sendWorkspaceChatMessage,
  sendWorkspaceChatMessageStream,
  toggleWorkspaceChatReaction,
} from '@tuturuuu/internal-api';
import { chatQueryKeys } from './query-keys';

export function useChatMessages({
  conversationId,
  limit = 80,
  wsId,
}: {
  conversationId?: string | null;
  limit?: number;
  wsId: string;
}) {
  return useQuery({
    enabled: Boolean(conversationId),
    queryFn: () =>
      listWorkspaceChatConversationMessages(wsId, conversationId ?? '', {
        limit,
      }),
    queryKey: chatQueryKeys.messages(wsId, conversationId ?? 'none', limit),
    staleTime: 5_000,
  });
}

export function useSendChatMessage({
  conversationId,
  currentUserId,
  streamAssistant = false,
  wsId,
}: {
  conversationId?: string | null;
  currentUserId: string;
  streamAssistant?: boolean;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: {
      attachments?: ChatAttachmentDraft[];
      content: string;
      kind?: 'assistant' | 'system' | 'user';
      replyToMessageId?: string | null;
    }) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      if (!streamAssistant) {
        return sendWorkspaceChatMessage(wsId, conversationId, payload);
      }

      const assistantStreamId = createOptimisticId('assistant');
      const appendAssistantDelta = (delta: string) => {
        queryClient.setQueriesData<ChatMessage[]>(
          {
            queryKey: [...chatQueryKeys.all(wsId), 'messages', conversationId],
          },
          (current = []) =>
            appendStreamingAssistantMessage({
              contentDelta: delta,
              conversationId,
              current,
              messageId: assistantStreamId,
            })
        );
      };
      const appendAssistantPart = (part: Record<string, unknown>) => {
        queryClient.setQueriesData<ChatMessage[]>(
          {
            queryKey: [...chatQueryKeys.all(wsId), 'messages', conversationId],
          },
          (current = []) =>
            appendStreamingAssistantMessage({
              conversationId,
              current,
              messageId: assistantStreamId,
              part,
            })
        );
      };

      return sendWorkspaceChatMessageStream(wsId, conversationId, payload, {
        onAssistantDelta: appendAssistantDelta,
        onAssistantPart: appendAssistantPart,
        onMessages: (messages) => {
          queryClient.setQueriesData<ChatMessage[]>(
            {
              queryKey: [
                ...chatQueryKeys.all(wsId),
                'messages',
                conversationId,
              ],
            },
            (current = []) =>
              mergeCachedMessages(
                current.filter((item) => item.id !== assistantStreamId),
                messages
              )
          );
        },
      });
    },
    onMutate: async (payload) => {
      if (!conversationId || (payload.kind && payload.kind !== 'user')) return;

      const optimisticId = createOptimisticId('message');
      const optimisticMessage: ChatMessage = {
        attachments: (payload.attachments ?? []).map((attachment, index) => ({
          contentType: attachment.contentType,
          conversationId,
          createdAt: new Date().toISOString(),
          filename: attachment.filename,
          fullPath: attachment.fullPath ?? null,
          id: createOptimisticId(`attachment-${index}`),
          messageId: optimisticId,
          sizeBytes: attachment.sizeBytes,
          storagePath: attachment.path,
          storageWsId: attachment.storageWsId ?? null,
          uploaderId: currentUserId,
        })),
        content: payload.content,
        conversationId,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        editedAt: null,
        id: optimisticId,
        kind: 'user',
        metadata: { optimistic: true },
        reactions: [],
        replyToMessageId: payload.replyToMessageId ?? null,
        sender: null,
        senderId: currentUserId,
        updatedAt: null,
      };

      await queryClient.cancelQueries({
        queryKey: [...chatQueryKeys.all(wsId), 'messages', conversationId],
      });
      queryClient.setQueriesData<ChatMessage[]>(
        {
          queryKey: [...chatQueryKeys.all(wsId), 'messages', conversationId],
        },
        (current = []) => mergeCachedMessages(current, [optimisticMessage])
      );

      return { conversationId, optimisticId };
    },
    onError: (_error, _payload, context) => {
      if (!context?.conversationId || !context.optimisticId) return;

      queryClient.setQueriesData<ChatMessage[]>(
        {
          queryKey: [
            ...chatQueryKeys.all(wsId),
            'messages',
            context.conversationId,
          ],
        },
        (current = []) =>
          current.filter(
            (message) =>
              message.id !== context.optimisticId &&
              !(
                message.kind === 'assistant' &&
                message.metadata?.optimistic === true &&
                message.metadata?.streaming === true
              )
          )
      );
    },
    onSuccess: (result, _payload, context) => {
      const messages = getSendResultMessages(result);
      const message = messages.at(-1) ?? result.message;
      const targetConversationId =
        context?.conversationId ?? message.conversationId;

      queryClient.setQueriesData<ChatMessage[]>(
        {
          queryKey: [
            ...chatQueryKeys.all(wsId),
            'messages',
            targetConversationId,
          ],
        },
        (current = []) =>
          mergeCachedMessages(
            current.filter((item) => item.id !== context?.optimisticId),
            messages
          )
      );
      queryClient.invalidateQueries({
        queryKey: [...chatQueryKeys.all(wsId), 'conversations'],
      });
      queryClient.invalidateQueries({
        queryKey: [
          ...chatQueryKeys.all(wsId),
          'messages',
          message.conversationId,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.sharedContent(wsId, message.conversationId),
      });
    },
  });
}

export function useEditChatMessage({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { content: string; messageId: string }) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return editWorkspaceChatMessage(wsId, conversationId, payload.messageId, {
        content: payload.content,
      });
    },
    onSuccess: ({ message }) => {
      patchCachedMessage(queryClient, wsId, message);
    },
  });
}

export function useDeleteChatMessage({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return deleteWorkspaceChatMessage(wsId, conversationId, messageId);
    },
    onSuccess: ({ message }) => {
      patchCachedMessage(queryClient, wsId, message);
      queryClient.invalidateQueries({
        queryKey: [...chatQueryKeys.all(wsId), 'conversations'],
      });
    },
  });
}

export function useToggleChatReaction({
  conversationId,
  wsId,
}: {
  conversationId?: string | null;
  wsId: string;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { emoji: string; messageId: string }) => {
      if (!conversationId) {
        throw new Error('Conversation is required');
      }

      return toggleWorkspaceChatReaction(wsId, conversationId, payload);
    },
    onSuccess: ({ message }) => {
      patchCachedMessage(queryClient, wsId, message);
    },
  });
}

function patchCachedMessage(
  queryClient: QueryClient,
  wsId: string,
  message: ChatMessage
) {
  queryClient.setQueriesData<ChatMessage[]>(
    {
      queryKey: [
        ...chatQueryKeys.all(wsId),
        'messages',
        message.conversationId,
      ],
    },
    (current = []) =>
      current.map((item) => (item.id === message.id ? message : item))
  );
}

function createOptimisticId(prefix: string) {
  const randomId =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `optimistic-${prefix}-${randomId}`;
}

function getSendResultMessages(result: SendChatMessageResult) {
  return result.messages?.length ? result.messages : [result.message];
}

function mergeCachedMessages(
  current: ChatMessage[],
  incomingMessages: ChatMessage[]
) {
  const next = [...current];

  for (const incoming of incomingMessages) {
    const existingIndex = next.findIndex(
      (message) => message.id === incoming.id
    );

    if (existingIndex >= 0) {
      next[existingIndex] = incoming;
    } else {
      next.push(incoming);
    }
  }

  return next;
}

function appendStreamingAssistantMessage({
  contentDelta,
  conversationId,
  current,
  messageId,
  part,
}: {
  contentDelta?: string;
  conversationId: string;
  current: ChatMessage[];
  messageId: string;
  part?: Record<string, unknown>;
}) {
  const existingIndex = current.findIndex(
    (message) => message.id === messageId
  );
  if (existingIndex >= 0) {
    return current.map((message, index) =>
      index === existingIndex
        ? {
            ...message,
            content: `${message.content}${contentDelta ?? ''}`,
            metadata: part
              ? appendStreamingAssistantPart(message.metadata, part)
              : message.metadata,
          }
        : message
    );
  }

  const streamingMessage: ChatMessage = {
    attachments: [],
    content: contentDelta ?? '',
    conversationId,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    editedAt: null,
    id: messageId,
    kind: 'assistant',
    metadata: {
      optimistic: true,
      streaming: true,
      ...(part ? { ai: { parts: [part] } } : {}),
    },
    reactions: [],
    replyToMessageId: null,
    sender: null,
    senderId: null,
    updatedAt: null,
  };

  return [...current, streamingMessage];
}

function appendStreamingAssistantPart(
  metadata: Record<string, unknown>,
  part: Record<string, unknown>
) {
  const ai = readRecord(metadata.ai);
  const parts = Array.isArray(ai?.parts)
    ? (ai.parts as Record<string, unknown>[])
    : [];
  const nextParts = mergeStreamingPart(parts, part);

  return {
    ...metadata,
    ai: {
      ...(ai ?? {}),
      parts: nextParts,
    },
  };
}

function mergeStreamingPart(
  parts: Record<string, unknown>[],
  part: Record<string, unknown>
) {
  const normalizedPart = normalizeStreamingPart(part);

  if (part.type === 'reasoning' && typeof part.text === 'string') {
    const last = parts.at(-1);
    if (last?.type === 'reasoning' && typeof last.text === 'string') {
      return [
        ...parts.slice(0, -1),
        { ...last, text: `${last.text}${part.text}` },
      ];
    }
  }

  const toolCallId = readString(normalizedPart.toolCallId);
  if (!toolCallId) return [...parts, normalizedPart];

  const existingIndex = parts.findIndex(
    (item) => readString(item.toolCallId) === toolCallId
  );
  if (existingIndex < 0) return [...parts, normalizedPart];

  const existing = parts[existingIndex]!;
  const merged = mergeToolPart(existing, normalizedPart);
  return [
    ...parts.slice(0, existingIndex),
    merged,
    ...parts.slice(existingIndex + 1),
  ];
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeStreamingPart(part: Record<string, unknown>) {
  const type = readString(part.type);

  if (type === 'tool-input-start') {
    return {
      ...part,
      type: 'dynamic-tool',
      state: 'input-streaming',
    };
  }

  if (type === 'tool-input-delta') {
    return {
      ...part,
      inputTextDelta: part.inputTextDelta,
      type: 'dynamic-tool',
      state: 'input-streaming',
    };
  }

  if (type === 'tool-input-available') {
    return {
      ...part,
      type: 'dynamic-tool',
      state: 'input-available',
    };
  }

  if (type === 'tool-input-error') {
    return {
      ...part,
      type: 'dynamic-tool',
      state: 'output-error',
    };
  }

  if (type === 'tool-output-available') {
    return {
      ...part,
      type: 'dynamic-tool',
      state: part.preliminary ? 'output-streaming' : 'output-available',
    };
  }

  if (type === 'tool-output-error' || type === 'tool-output-denied') {
    return {
      ...part,
      type: 'dynamic-tool',
      state: 'output-error',
    };
  }

  return part;
}

function mergeToolPart(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
) {
  const existingInput = existing.input;
  const incomingInput = incoming.input;
  const inputTextDelta = readString(incoming.inputTextDelta);
  const mergedInput =
    incomingInput ??
    (inputTextDelta
      ? `${typeof existingInput === 'string' ? existingInput : ''}${inputTextDelta}`
      : existingInput);

  return {
    ...existing,
    ...incoming,
    input: mergedInput,
    toolName: incoming.toolName ?? existing.toolName,
    output: incoming.output ?? existing.output,
    errorText: incoming.errorText ?? existing.errorText,
  };
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
