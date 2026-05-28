import type { ChatConversation, ChatMessage } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  getChatInitials,
  getConversationTitle,
  getLastMessagePreview,
  isReadOnlyChatConversation,
} from './utils';

const baseMessage: ChatMessage = {
  attachments: [],
  content: '',
  conversationId: 'conversation-1',
  createdAt: '2026-05-27T00:00:00.000Z',
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
};

function conversation(overrides: Partial<ChatConversation>): ChatConversation {
  return {
    aiEnabled: false,
    archivedAt: null,
    createdAt: '2026-05-27T00:00:00.000Z',
    createdBy: 'user-1',
    description: null,
    id: 'conversation-1',
    latestMessage: null,
    memberCount: 2,
    members: [],
    metadata: {},
    title: null,
    type: 'group',
    unreadCount: 0,
    updatedAt: '2026-05-27T00:00:00.000Z',
    wsId: 'workspace-1',
    ...overrides,
  };
}

describe('chat utils', () => {
  it('derives compact initials for users and labels', () => {
    expect(getChatInitials('Ada Lovelace')).toBe('AL');
    expect(
      getChatInitials({
        avatarUrl: null,
        displayName: 'Grace',
        handle: null,
        id: 'u1',
      })
    ).toBe('G');
  });

  it('uses the other direct participant as the direct conversation title', () => {
    const title = getConversationTitle(
      conversation({
        members: [
          {
            archivedAt: null,
            conversationId: 'conversation-1',
            id: 'member-1',
            joinedAt: '2026-05-27T00:00:00.000Z',
            lastReadAt: null,
            mutedAt: null,
            pinnedAt: null,
            role: 'member',
            user: {
              avatarUrl: null,
              displayName: 'Ada Lovelace',
              handle: null,
              id: 'user-2',
            },
            userId: 'user-2',
          },
        ],
        type: 'direct',
      }),
      'user-1'
    );

    expect(title).toBe('Ada Lovelace');
  });

  it('builds useful message previews for files and deleted messages', () => {
    expect(
      getLastMessagePreview(
        {
          ...baseMessage,
          attachments: [
            {
              contentType: 'text/plain',
              conversationId: 'conversation-1',
              createdAt: '2026-05-27T00:00:00.000Z',
              filename: 'notes.txt',
              fullPath: 'workspace-1/chats/conversation-1/notes.txt',
              id: 'attachment-1',
              messageId: 'message-1',
              sizeBytes: 1024,
              storagePath: 'chats/conversation-1/notes.txt',
              uploaderId: 'user-1',
            },
          ],
        },
        {
          attachment: 'attachment',
          message: 'message',
          messageDeleted: 'message_deleted',
          noMessagesYet: 'no_messages_yet',
        }
      )
    ).toBe('notes.txt');
    expect(
      getLastMessagePreview(
        { ...baseMessage, deletedAt: 'now' },
        { messageDeleted: 'message_deleted' }
      )
    ).toBe('message_deleted');
  });

  it('formats file sizes for attachment rows', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('recognizes read-only virtual AI agent conversations', () => {
    expect(
      isReadOnlyChatConversation(
        conversation({
          metadata: {
            readOnly: true,
            source: 'ai-agent',
          },
        })
      )
    ).toBe(true);
    expect(isReadOnlyChatConversation(conversation({ metadata: {} }))).toBe(
      false
    );
  });
});
