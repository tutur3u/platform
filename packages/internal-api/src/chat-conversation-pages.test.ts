import { describe, expect, it, vi } from 'vitest';
import {
  readChatConversationPage,
  searchWorkspaceChatConversations,
} from './chat-conversation-pages';

const options = (fetchMock: ReturnType<typeof vi.fn>) => ({
  baseUrl: 'https://internal.example.com',
  fetch: fetchMock as unknown as typeof fetch,
});

describe('searchWorkspaceChatConversations', () => {
  it('sends the query to the conversations route and reads the page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        canModerate: true,
        conversations: [{ id: 'conversation-1', type: 'channel' }, {}],
        nextOffset: 20,
      })
    );

    const page = await searchWorkspaceChatConversations(
      'workspace-1',
      'design',
      { limit: 20 },
      options(fetchMock)
    );

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe(
      '/api/v1/workspaces/workspace-1/chat/conversations'
    );
    expect(url.searchParams.get('q')).toBe('design');
    expect(url.searchParams.get('limit')).toBe('20');
    expect(page).toEqual({
      canModerate: true,
      conversations: [{ id: 'conversation-1', type: 'channel' }],
      nextOffset: 20,
    });
  });
});

describe('readChatConversationPage', () => {
  it('treats a missing moderation flag as not moderating', () => {
    expect(readChatConversationPage({ conversations: [] })).toEqual({
      canModerate: false,
      conversations: [],
      nextOffset: null,
    });
  });
});
