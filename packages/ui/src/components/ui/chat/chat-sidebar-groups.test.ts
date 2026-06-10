import type { ChatConversation } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import { getChatConversationSections } from './chat-sidebar';

function conversation(
  type: ChatConversation['type'],
  id = `${type}-conversation`,
  metadata: ChatConversation['metadata'] = type === 'ai'
    ? { source: 'personal-ai-chat' }
    : {}
): ChatConversation {
  return {
    aiEnabled: type === 'ai',
    archivedAt: null,
    createdAt: '2026-06-02T00:00:00.000Z',
    createdBy: 'user-1',
    description: null,
    id,
    latestMessage: null,
    memberCount: 1,
    members: [],
    metadata,
    title: null,
    type,
    unreadCount: 0,
    updatedAt: '2026-06-02T00:00:00.000Z',
    wsId: 'workspace-1',
  };
}

describe('chat sidebar conversation sections', () => {
  it('keeps personal AI conversations visible with personal chats', () => {
    const sections = getChatConversationSections({
      conversations: [
        conversation('direct'),
        conversation('group'),
        conversation('channel', 'channel-conversation', {
          scope: 'personal',
        }),
        conversation('ai'),
      ],
      labels: {
        ai: 'AI agents',
        channel: 'Channels',
        direct: 'Direct messages',
        group: 'Groups',
      },
      scope: 'personal',
    });

    expect(sections).toMatchObject([
      {
        conversations: [{ id: 'direct-conversation' }],
        label: 'Direct messages',
        sectionType: 'direct',
      },
      {
        conversations: [{ id: 'group-conversation' }],
        label: 'Groups',
        sectionType: 'group',
      },
      {
        conversations: [{ id: 'channel-conversation' }],
        label: 'Channels',
        sectionType: 'channel',
      },
      {
        conversations: [{ id: 'ai-conversation' }],
        label: 'AI agents',
        sectionType: 'ai',
      },
    ]);
  });
});
