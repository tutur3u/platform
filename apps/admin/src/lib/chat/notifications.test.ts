import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatConversation, ChatMessage } from './private-rpc';

vi.mock('server-only', () => ({}));

const mocks = {
  createAdminClient: vi.fn(),
  privateRpc: vi.fn(),
  serverError: vi.fn(),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

const conversationId = '11111111-1111-4111-8111-111111111111';
const activeMember = createMember('user-2');
const mutedMember = createMember('user-3', '2026-05-31T01:00:00.000Z');
const secondActiveMember = createMember('user-4');

const conversation = {
  aiEnabled: false,
  archivedAt: null,
  createdAt: '2026-05-31T00:00:00.000Z',
  createdBy: 'user-1',
  description: null,
  id: conversationId,
  latestMessage: null,
  memberCount: 4,
  members: [
    createMember('user-1'),
    activeMember,
    mutedMember,
    activeMember,
    secondActiveMember,
  ],
  metadata: {},
  title: 'Product',
  type: 'channel',
  unreadCount: 0,
  updatedAt: '2026-05-31T00:00:00.000Z',
  wsId: '22222222-2222-4222-8222-222222222222',
} satisfies ChatConversation;

const message = {
  attachments: [],
  content: 'The mobile chat thread is ready.',
  conversationId: conversation.id,
  createdAt: '2026-05-31T00:05:00.000Z',
  deletedAt: null,
  editedAt: null,
  id: '33333333-3333-4333-8333-333333333333',
  kind: 'user',
  metadata: {},
  reactions: [],
  replyToMessageId: null,
  sender: {
    avatarUrl: null,
    displayName: 'Ava',
    handle: null,
    id: 'user-1',
  },
  senderId: 'user-1',
  updatedAt: null,
} satisfies ChatMessage;

function createMember(userId: string, mutedAt: string | null = null) {
  return {
    archivedAt: null,
    conversationId,
    id: `${userId}-member`,
    joinedAt: '2026-05-31T00:00:00.000Z',
    lastReadAt: null,
    mutedAt,
    pinnedAt: null,
    role: 'member' as const,
    user: {
      avatarUrl: null,
      displayName: userId,
      handle: null,
      id: userId,
    },
    userId,
  };
}

describe('chat notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privateRpc.mockResolvedValue({ data: 'notification-1', error: null });
    mocks.createAdminClient.mockResolvedValue({
      schema: () => ({ rpc: mocks.privateRpc }),
    });
  });

  it('targets only explicit non-sender, non-muted conversation members', async () => {
    const { getChatPushRecipientUserIds } = await import('./notifications');

    expect(
      getChatPushRecipientUserIds({
        actorUserId: 'user-1',
        conversation,
      })
    ).toEqual(['user-2', 'user-4']);
  });

  it('queues immediate chat push notifications with deep-link metadata', async () => {
    const { notifyChatMessageRecipients } = await import('./notifications');

    await expect(
      notifyChatMessageRecipients({
        actorUserId: 'user-1',
        conversation,
        message,
        wsId: conversation.wsId,
      })
    ).resolves.toEqual({
      createdCount: 2,
      failedCount: 0,
      recipientCount: 2,
    });

    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.privateRpc).toHaveBeenCalledTimes(2);
    expect(mocks.privateRpc).toHaveBeenNthCalledWith(
      1,
      'create_chat_message_push_notification',
      expect.objectContaining({
        p_actor_user_id: 'user-1',
        p_conversation_id: conversation.id,
        p_data: expect.objectContaining({
          conversation_id: conversation.id,
          message_id: message.id,
          openTarget: 'chat',
          workspace_id: conversation.wsId,
        }),
        p_message_id: message.id,
        p_title: 'Ava in Product',
        p_user_id: 'user-2',
        p_ws_id: conversation.wsId,
      })
    );
    expect(mocks.privateRpc).toHaveBeenNthCalledWith(
      2,
      'create_chat_message_push_notification',
      expect.objectContaining({
        p_user_id: 'user-4',
      })
    );
  });
});
