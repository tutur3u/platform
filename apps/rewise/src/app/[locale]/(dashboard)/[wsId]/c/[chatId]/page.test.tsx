import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getChats: vi.fn(),
  requireRewiseWorkspace: vi.fn(),
}));

vi.mock('../../chat', () => ({ default: () => null }));
vi.mock('../../helper', () => mocks);
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  redirect: () => {
    throw new Error('redirect');
  },
}));

import AIPage from './page';

const contributor = {
  id: 'contributor',
  display_name: 'Contributor',
  avatar_url: '/synthetic-avatar.png',
  user_private_details: { email: 'contributor@example.test' },
};

function fixture({ isPublic = true, creatorId = 'owner' } = {}) {
  const userSelect = vi.fn(() => ({
    // Return the private field too, so the payload assertion also tests the
    // explicit mapping independently of the database projection.
    in: vi.fn().mockResolvedValue({ data: [contributor], error: null }),
  }));
  const from = vi.fn((table: string) => {
    if (table === 'ai_chats') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'chat', creator_id: creatorId, is_public: isPublic },
              error: null,
            }),
          })),
        })),
      };
    }
    if (table === 'ai_chat_messages') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'message',
                  creator_id: contributor.id,
                  role: 'USER',
                  content: 'Synthetic message',
                },
                {
                  id: 'reply',
                  creator_id: null,
                  role: 'ASSISTANT',
                  content: 'Hi',
                },
              ],
              error: null,
            }),
          })),
        })),
      };
    }
    if (table === 'users') return { select: userSelect };
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.createAdminClient.mockResolvedValue({ from });
  return { from, userSelect };
}

function openChat() {
  return AIPage({
    params: Promise.resolve({ chatId: 'chat', wsId: 'workspace' }),
    searchParams: Promise.resolve({ lang: 'en' }),
  });
}

interface ChatPayload {
  initialMessages: Array<{
    id: string;
    role: string;
    parts: Array<{ type: string; text: string }>;
    user?: { id: string; display_name: string; avatar_url: string };
  }>;
}

describe('Rewise chat contributor privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireRewiseWorkspace.mockResolvedValue({
      user: { id: 'viewer', email: 'viewer@example.test' },
      wsId: 'workspace',
    });
    mocks.getChats.mockResolvedValue({ data: [], count: 0 });
  });

  it.each([
    ['public chat viewer', true, 'owner'],
    ['private chat owner', false, 'viewer'],
  ])(
    'sends only public contributor identity to a %s',
    async (_, isPublic, creatorId) => {
      const { userSelect } = fixture({ isPublic, creatorId });
      const page = await openChat();
      expect(
        isValidElement<{ children: ReactElement<ChatPayload> }>(page)
      ).toBe(true);
      if (!isValidElement<{ children: ReactElement<ChatPayload> }>(page)) {
        throw new Error('Expected a page element');
      }
      const messages = page.props.children.props.initialMessages;
      expect(messages).toEqual([
        {
          id: 'message',
          role: 'user',
          parts: [{ type: 'text', text: 'Synthetic message' }],
          user: {
            id: contributor.id,
            display_name: contributor.display_name,
            avatar_url: contributor.avatar_url,
          },
        },
        {
          id: 'reply',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hi' }],
          user: undefined,
        },
      ]);
      expect(JSON.stringify(messages)).not.toContain('email');
      expect(JSON.stringify(messages)).not.toContain(
        'contributor@example.test'
      );
      expect(userSelect).toHaveBeenCalledWith('id, display_name, avatar_url');
    }
  );

  it('denies another user access to a private chat before reading contributors', async () => {
    const { from } = fixture({ isPublic: false });
    await expect(openChat()).rejects.toThrow('notFound');
    expect(from).not.toHaveBeenCalledWith('ai_chat_messages');
    expect(from).not.toHaveBeenCalledWith('users');
  });
});
