/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ChatMessage } from '@tuturuuu/internal-api';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSendChatMessage } from './hooks-messages';
import { chatQueryKeys } from './query-keys';

const mocks = vi.hoisted(() => ({
  deleteWorkspaceChatMessage: vi.fn(),
  editWorkspaceChatMessage: vi.fn(),
  listWorkspaceChatConversationMessages: vi.fn(),
  sendWorkspaceChatMessage: vi.fn(),
  sendWorkspaceChatMessageStream: vi.fn(),
  toggleWorkspaceChatReaction: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  deleteWorkspaceChatMessage: (
    ...args: Parameters<typeof mocks.deleteWorkspaceChatMessage>
  ) => mocks.deleteWorkspaceChatMessage(...args),
  editWorkspaceChatMessage: (
    ...args: Parameters<typeof mocks.editWorkspaceChatMessage>
  ) => mocks.editWorkspaceChatMessage(...args),
  listWorkspaceChatConversationMessages: (
    ...args: Parameters<typeof mocks.listWorkspaceChatConversationMessages>
  ) => mocks.listWorkspaceChatConversationMessages(...args),
  sendWorkspaceChatMessage: (
    ...args: Parameters<typeof mocks.sendWorkspaceChatMessage>
  ) => mocks.sendWorkspaceChatMessage(...args),
  sendWorkspaceChatMessageStream: (
    ...args: Parameters<typeof mocks.sendWorkspaceChatMessageStream>
  ) => mocks.sendWorkspaceChatMessageStream(...args),
  toggleWorkspaceChatReaction: (
    ...args: Parameters<typeof mocks.toggleWorkspaceChatReaction>
  ) => mocks.toggleWorkspaceChatReaction(...args),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    attachments: [],
    content: 'hello',
    conversationId: 'conversation-1',
    createdAt: '2026-05-30T07:00:00.000Z',
    deletedAt: null,
    editedAt: null,
    id: 'message-1',
    kind: 'user',
    metadata: {},
    reactions: [],
    replyToMessageId: null,
    sender: null,
    senderId: 'user-1',
    updatedAt: null,
    ...overrides,
  };
}

describe('useSendChatMessage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the saved user message and clears the temporary assistant when native AI fails', async () => {
    const queryClient = createQueryClient();
    const userMessage = createMessage();
    const messagesKey = chatQueryKeys.messages(
      'workspace-1',
      'conversation-1',
      80
    );

    queryClient.setQueryData<ChatMessage[]>(messagesKey, []);
    mocks.sendWorkspaceChatMessageStream.mockImplementation(
      async (_workspaceId, _conversationId, _payload, handlers) => {
        handlers.onAssistantDelta?.('partial assistant response');

        return {
          assistantError: 'Assistant response failed. Your message was saved.',
          message: userMessage,
          messages: [userMessage],
        };
      }
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useSendChatMessage({
          conversationId: 'conversation-1',
          currentUserId: 'user-1',
          streamAssistant: true,
          wsId: 'workspace-1',
        }),
      { wrapper }
    );

    await result.current.mutateAsync({ content: 'hello' });

    expect(queryClient.getQueryData<ChatMessage[]>(messagesKey)).toEqual([
      userMessage,
    ]);
  });
});
