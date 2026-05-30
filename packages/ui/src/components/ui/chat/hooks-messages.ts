'use client';

import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
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

const DEFAULT_CHAT_MESSAGES_LIMIT = 80;

export interface ChatMessagesPage {
  hasMore: boolean;
  limit: number;
  messages: ChatMessage[];
  nextBefore: string | null;
}

export function useChatMessages({
  conversationId,
  limit = DEFAULT_CHAT_MESSAGES_LIMIT,
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

export function useInfiniteChatMessages({
  conversationId,
  limit = DEFAULT_CHAT_MESSAGES_LIMIT,
  wsId,
}: {
  conversationId?: string | null;
  limit?: number;
  wsId: string;
}) {
  return useInfiniteQuery<
    ChatMessagesPage,
    Error,
    InfiniteData<ChatMessagesPage>,
    ReturnType<typeof chatQueryKeys.messagesInfinite>,
    string | null
  >({
    enabled: Boolean(conversationId),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextBefore ?? undefined) : undefined,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const messages = await listWorkspaceChatConversationMessages(
        wsId,
        conversationId ?? '',
        {
          before: pageParam ?? undefined,
          limit,
        }
      );

      return createChatMessagesPage(messages, limit);
    },
    queryKey: chatQueryKeys.messagesInfinite(
      wsId,
      conversationId ?? 'none',
      limit
    ),
    staleTime: 5_000,
  });
}

export function flattenChatMessagePages(data?: InfiniteData<ChatMessagesPage>) {
  return [...(data?.pages ?? [])].reverse().flatMap((page) => page.messages);
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
        patchCachedMessages(queryClient, wsId, conversationId, (current) =>
          appendStreamingAssistantMessage({
            contentDelta: delta,
            conversationId,
            current,
            messageId: assistantStreamId,
          })
        );
      };
      const appendAssistantPart = (part: Record<string, unknown>) => {
        patchCachedMessages(queryClient, wsId, conversationId, (current) =>
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
          patchCachedMessages(queryClient, wsId, conversationId, (current) =>
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
      await queryClient.cancelQueries({
        queryKey: [
          ...chatQueryKeys.all(wsId),
          'messages-infinite',
          conversationId,
        ],
      });
      patchCachedMessages(queryClient, wsId, conversationId, (current) =>
        mergeCachedMessages(current, [optimisticMessage])
      );

      return { conversationId, optimisticId };
    },
    onError: (_error, _payload, context) => {
      if (!context?.conversationId || !context.optimisticId) return;

      patchCachedMessages(
        queryClient,
        wsId,
        context.conversationId,
        (current) =>
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

      patchCachedMessages(queryClient, wsId, targetConversationId, (current) =>
        mergeCachedMessages(
          current.filter(
            (item) =>
              item.id !== context?.optimisticId &&
              !(
                result.assistantError &&
                isOptimisticStreamingAssistantMessage(item)
              )
          ),
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
        queryKey: [
          ...chatQueryKeys.all(wsId),
          'messages-infinite',
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
  patchCachedMessages(queryClient, wsId, message.conversationId, (current) =>
    current.map((item) => (item.id === message.id ? message : item))
  );
}

function patchCachedMessages(
  queryClient: QueryClient,
  wsId: string,
  conversationId: string,
  updater: (messages: ChatMessage[]) => ChatMessage[]
) {
  queryClient.setQueriesData<ChatMessage[]>(
    {
      queryKey: [...chatQueryKeys.all(wsId), 'messages', conversationId],
    },
    (current = []) => updater(current)
  );
  queryClient.setQueriesData<InfiniteData<ChatMessagesPage>>(
    {
      queryKey: [
        ...chatQueryKeys.all(wsId),
        'messages-infinite',
        conversationId,
      ],
    },
    (current) => {
      if (!current) return current;

      const limit = current.pages[0]?.limit ?? DEFAULT_CHAT_MESSAGES_LIMIT;
      return {
        ...current,
        pageParams: [null],
        pages: [
          createChatMessagesPage(
            updater(flattenChatMessagePages(current)),
            limit
          ),
        ],
      };
    }
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

function isOptimisticStreamingAssistantMessage(message: ChatMessage) {
  return (
    message.kind === 'assistant' &&
    message.metadata?.optimistic === true &&
    message.metadata?.streaming === true
  );
}

export function mergeCachedMessages(
  current: ChatMessage[],
  incomingMessages: ChatMessage[]
) {
  const originalOrder = new Map(
    current.map((message, index) => [message.id, index] as const)
  );
  const incomingOrder = new Map(
    incomingMessages.map((message, index) => [message.id, index] as const)
  );
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

  return next.sort((a, b) =>
    compareMessages(a, b, originalOrder, incomingOrder)
  );
}

function createChatMessagesPage(
  messages: ChatMessage[],
  limit: number
): ChatMessagesPage {
  return {
    hasMore: messages.length >= limit,
    limit,
    messages,
    nextBefore: messages[0]?.createdAt ?? null,
  };
}

function compareMessages(
  a: ChatMessage,
  b: ChatMessage,
  originalOrder: Map<string, number>,
  incomingOrder: Map<string, number>
) {
  const optimisticChatDiff = compareOptimisticChatMessages(a, b, incomingOrder);
  if (optimisticChatDiff !== 0) return optimisticChatDiff;

  const createdDiff = readMessageTimestamp(a) - readMessageTimestamp(b);
  if (createdDiff !== 0) return createdDiff;

  const incomingDiff =
    readMessageOrder(a, incomingOrder) - readMessageOrder(b, incomingOrder);
  if (incomingDiff !== 0) return incomingDiff;

  return (
    readMessageOrder(a, originalOrder) - readMessageOrder(b, originalOrder)
  );
}

function compareOptimisticChatMessages(
  a: ChatMessage,
  b: ChatMessage,
  incomingOrder: Map<string, number>
) {
  const aRank = getOptimisticChatRank(a, incomingOrder);
  const bRank = getOptimisticChatRank(b, incomingOrder);
  if (aRank === null || bRank === null) return 0;
  return aRank - bRank;
}

function getOptimisticChatRank(
  message: ChatMessage,
  incomingOrder: Map<string, number>
) {
  if (message.kind === 'user' && message.metadata?.optimistic === true) {
    return 0;
  }

  if (
    message.kind === 'assistant' &&
    (incomingOrder.has(message.id) || message.metadata?.optimistic === true)
  ) {
    return 1;
  }

  return null;
}

function readMessageTimestamp(message: ChatMessage) {
  const timestamp = Date.parse(message.createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function readMessageOrder(message: ChatMessage, order: Map<string, number>) {
  return order.get(message.id) ?? Number.MAX_SAFE_INTEGER;
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
