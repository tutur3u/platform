import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatConversation } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateConversationDialog } from './create-conversation-dialog';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  createFriendRequest: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./hooks', () => ({
  useChatDirectory: () => ({
    data: [],
    isFetching: false,
  }),
  useCreateChatConversation: () => ({
    isPending: false,
    mutateAsync: mocks.createConversation,
  }),
  useCreateChatFriendRequest: () => ({
    isPending: false,
    mutateAsync: mocks.createFriendRequest,
  }),
}));

const createdConversation: ChatConversation = {
  aiEnabled: true,
  archivedAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  createdBy: 'user-1',
  description: null,
  id: 'conversation-1',
  latestMessage: null,
  memberCount: 1,
  members: [],
  metadata: {
    source: 'personal-ai-chat',
  },
  title: null,
  type: 'ai',
  unreadCount: 0,
  updatedAt: '2026-06-02T00:00:00.000Z',
  wsId: 'personal-workspace-1',
};

describe('CreateConversationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createConversation.mockResolvedValue({
      conversation: createdConversation,
    });
  });

  it('creates personal AI chats with personal AI metadata', async () => {
    const onCreated = vi.fn();

    render(
      <CreateConversationDialog
        conversationScope="personal"
        currentUserId="user-1"
        onCreated={onCreated}
        onOpenChange={vi.fn()}
        open
        wsId="personal-workspace-1"
      />
    );

    fireEvent.click(screen.getByText('type_ai'));
    fireEvent.click(screen.getByText('next'));
    fireEvent.click(screen.getByText('create'));

    await waitFor(() => {
      expect(mocks.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          aiEnabled: true,
          metadata: {
            source: 'personal-ai-chat',
          },
          type: 'ai',
        })
      );
    });
    expect(onCreated).toHaveBeenCalledWith(createdConversation);
  });
});
