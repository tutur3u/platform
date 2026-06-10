import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ChatConversation } from '@tuturuuu/internal-api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSidebarPanel } from './chat-sidebar-panel';

const mocks = vi.hoisted(() => ({
  chatSidebarProps: null as Record<string, unknown> | null,
  createDialogProps: null as Record<string, unknown> | null,
  fetchNextPage: vi.fn(),
  routerReplace: vi.fn(),
  useChatMessageSearch: vi.fn(),
  useInfiniteChatConversations: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/personal',
  useRouter: () => ({
    replace: mocks.routerReplace,
  }),
  useSearchParams: () => new URLSearchParams('scope=personal'),
}));

vi.mock('./chat-sidebar', () => ({
  ChatSidebar: (props: Record<string, unknown>) => {
    mocks.chatSidebarProps = props;
    return (
      <button
        onClick={() =>
          (props.onLoadMoreConversations as (() => void) | undefined)?.()
        }
        type="button"
      >
        load more
      </button>
    );
  },
}));

vi.mock('./create-conversation-dialog', () => ({
  CreateConversationDialog: (props: Record<string, unknown>) => {
    mocks.createDialogProps = props;
    return null;
  },
}));

vi.mock('./hooks', () => ({
  flattenChatConversationPages: (
    data?: { pages?: { conversations?: ChatConversation[] }[] } | null
  ) => data?.pages?.flatMap((page) => page.conversations ?? []) ?? [],
  useChatMessageSearch: (...args: unknown[]) =>
    mocks.useChatMessageSearch(...args),
  useInfiniteChatConversations: (...args: unknown[]) =>
    mocks.useInfiniteChatConversations(...args),
}));

const conversation: ChatConversation = {
  aiEnabled: false,
  archivedAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  createdBy: 'user-1',
  description: null,
  id: 'conversation-1',
  latestMessage: null,
  memberCount: 2,
  members: [],
  metadata: {},
  title: 'Planning',
  type: 'group',
  unreadCount: 0,
  updatedAt: '2026-06-02T00:00:00.000Z',
  wsId: 'personal',
};

describe('ChatSidebarPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chatSidebarProps = null;
    mocks.createDialogProps = null;
    window.localStorage.clear();
    mocks.useChatMessageSearch.mockReturnValue({ data: [] });
    mocks.useInfiniteChatConversations.mockReturnValue({
      data: {
        pages: [{ conversations: [conversation], nextOffset: 40 }],
      },
      fetchNextPage: mocks.fetchNextPage,
      hasNextPage: true,
      isFetchingNextPage: false,
      isLoading: false,
    });
  });

  it('uses the infinite conversations query and forwards load-more controls', () => {
    render(
      <ChatSidebarPanel
        currentUserId="user-1"
        isCollapsed={false}
        wsId="personal"
      />
    );

    expect(mocks.useInfiniteChatConversations).toHaveBeenCalledWith({
      archived: 'active',
      wsId: 'personal',
    });
    expect(mocks.chatSidebarProps).toMatchObject({
      conversations: [conversation],
      hasMoreConversations: true,
      isFetchingMoreConversations: false,
      isLoading: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'load more' }));

    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('updates Next router state when auto-selecting the first conversation', async () => {
    render(
      <ChatSidebarPanel
        currentUserId="user-1"
        isCollapsed={false}
        wsId="personal"
      />
    );

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith(
        '/personal?scope=personal&conversationId=conversation-1',
        { scroll: false }
      );
    });
  });

  it('opens agent details when an integration returns a virtual conversation', async () => {
    render(
      <ChatSidebarPanel
        currentUserId="user-1"
        enableRootIntegrations
        isCollapsed={false}
        wsId="personal"
      />
    );

    await waitFor(() => {
      expect(mocks.createDialogProps).toBeTruthy();
    });
    mocks.routerReplace.mockClear();

    (
      mocks.createDialogProps?.onIntegrationCreated as
        | ((conversationId: string) => void)
        | undefined
    )?.('ai-agent-chat-integrations-chat-zalo-personal');

    expect(mocks.routerReplace).toHaveBeenCalledWith(
      '/personal?scope=personal&conversationId=ai-agent-chat-integrations-chat-zalo-personal&details=agent',
      { scroll: false }
    );
  });
});
