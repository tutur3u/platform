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

      return sendWorkspaceChatMessageStream(wsId, conversationId, payload, {
        onAssistantDelta: appendAssistantDelta,
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
}: {
  contentDelta: string;
  conversationId: string;
  current: ChatMessage[];
  messageId: string;
}) {
  const existingIndex = current.findIndex(
    (message) => message.id === messageId
  );
  if (existingIndex >= 0) {
    return current.map((message, index) =>
      index === existingIndex
        ? { ...message, content: `${message.content}${contentDelta}` }
        : message
    );
  }

  const streamingMessage: ChatMessage = {
    attachments: [],
    content: contentDelta,
    conversationId,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    editedAt: null,
    id: messageId,
    kind: 'assistant',
    metadata: { optimistic: true, streaming: true },
    reactions: [],
    replyToMessageId: null,
    sender: null,
    senderId: null,
    updatedAt: null,
  };

  return [...current, streamingMessage];
}
