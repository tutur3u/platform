import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatConversation } from '@tuturuuu/internal-api';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateConversationDialog } from './create-conversation-dialog';
import { CreateIntegrationPanel } from './create-integration-panel';

const mocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  createFriendRequest: vi.fn(),
  createIntegration: vi.fn(),
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
  useCreateChatIntegration: () => ({
    isPending: false,
    mutate: mocks.createIntegration,
    variables: null,
  }),
}));

vi.mock('../sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
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
    mocks.createIntegration.mockImplementation((_payload, options) => {
      options?.onSuccess?.({
        agent: { id: 'chat-integrations' },
        channel: { id: 'chat-zalo-personal' },
        conversationId: 'ai-agent-chat-integrations-chat-zalo-personal',
      });
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

  it('creates personal channels with personal scope metadata', async () => {
    render(
      <CreateConversationDialog
        conversationScope="personal"
        currentUserId="user-1"
        onCreated={vi.fn()}
        onOpenChange={vi.fn()}
        open
        wsId="personal-workspace-1"
      />
    );

    fireEvent.click(screen.getByText('type_channel'));
    fireEvent.click(screen.getByText('next'));
    fireEvent.change(screen.getByPlaceholderText('channel_name_placeholder'), {
      target: { value: 'Ideas' },
    });
    fireEvent.click(screen.getByText('create'));

    await waitFor(() => {
      expect(mocks.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          aiEnabled: false,
          metadata: {
            scope: 'personal',
          },
          title: 'Ideas',
          type: 'channel',
        })
      );
    });
  });

  it('hides the integrations tab outside the internal root workspace', () => {
    render(
      <CreateConversationDialog
        currentUserId="user-1"
        enableRootIntegrations
        onCreated={vi.fn()}
        onOpenChange={vi.fn()}
        open
        wsId="workspace-1"
      />
    );

    expect(screen.queryByText('tab_integrations')).toBeNull();
  });

  it('shows the integrations tab in the internal root workspace', () => {
    render(
      <CreateConversationDialog
        currentUserId="user-1"
        enableRootIntegrations
        onCreated={vi.fn()}
        onOpenChange={vi.fn()}
        open
        wsId={ROOT_WORKSPACE_ID}
      />
    );

    expect(screen.getByRole('tab', { name: 'tab_integrations' })).toBeTruthy();
  });

  it('selects the returned virtual agent conversation after integration setup', () => {
    const onCreated = vi.fn();

    render(
      <CreateIntegrationPanel onCreated={(result) => onCreated(result)} />
    );

    fireEvent.click(screen.getByText('integration_zalo_personal'));

    expect(mocks.createIntegration).toHaveBeenCalledWith(
      { kind: 'zalo-personal' },
      expect.any(Object)
    );
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'ai-agent-chat-integrations-chat-zalo-personal',
      })
    );
  });
});
