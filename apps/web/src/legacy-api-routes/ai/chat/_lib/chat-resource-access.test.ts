import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chats: [] as { id: string; creator_id: string }[],
  error: null as { message: string } | null,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: () => {
      let id: unknown;
      const query = {
        select: () => query,
        eq: (_key: string, value: unknown) => {
          id = value;
          return query;
        },
        maybeSingle: async () => ({
          data: mocks.chats.find((chat) => chat.id === id) ?? null,
          error: mocks.error,
        }),
      };
      return query;
    },
  }),
}));

import {
  parseAiChatResourcePath,
  verifyAiChatResourceScopes,
} from './chat-resource-access';

const OWN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

describe('AI chat resource access', () => {
  beforeEach(() => {
    mocks.chats = [
      { id: OWN, creator_id: 'actor' },
      { id: OTHER, creator_id: 'other-member' },
    ];
    mocks.error = null;
  });

  it('parses chat and temp resource paths and rejects traversal', () => {
    expect(
      parseAiChatResourcePath(`ws/chats/ai/resources/${OWN}/a.jpg`)
    ).toEqual({ kind: 'chat', chatId: OWN, wsId: 'ws' });
    expect(
      parseAiChatResourcePath('ws/chats/ai/resources/temp/actor/a.jpg')
    ).toEqual({ kind: 'temp', userId: 'actor', wsId: 'ws' });
    expect(
      parseAiChatResourcePath(`ws/chats/ai/resources/${OWN}/../x.jpg`)
    ).toBeNull();
    expect(parseAiChatResourcePath(`ws/chats/ai/resources/${OWN}`)).toBeNull();
    expect(parseAiChatResourcePath('ws/mira/images/a.png')).toBeNull();
  });

  it("denies another member's chat folder and temp folder", async () => {
    const other = parseAiChatResourcePath(
      `ws/chats/ai/resources/${OTHER}/a.jpg`
    );
    const temp = parseAiChatResourcePath('ws/chats/ai/resources/temp/x/a.jpg');
    await expect(
      verifyAiChatResourceScopes({ scopes: [other!], userId: 'actor' })
    ).resolves.toBe('not_found');
    await expect(
      verifyAiChatResourceScopes({ scopes: [temp!], userId: 'actor' })
    ).resolves.toBe('not_found');
  });

  it('allows own chats, own temp files and ids without a chat row', async () => {
    const scopes = [
      `ws/chats/ai/resources/${OWN}/a.jpg`,
      'ws/chats/ai/resources/temp/actor/a.jpg',
      'ws/chats/ai/resources/33333333-3333-4333-8333-333333333333/a.jpg',
    ].map((path) => parseAiChatResourcePath(path)!);
    await expect(
      verifyAiChatResourceScopes({ scopes, userId: 'actor' })
    ).resolves.toBe('allowed');
  });

  it('fails closed when the ownership lookup errors', async () => {
    mocks.error = { message: 'boom' };
    const scope = parseAiChatResourcePath(`ws/chats/ai/resources/${OWN}/a.jpg`);
    await expect(
      verifyAiChatResourceScopes({ scopes: [scope!], userId: 'actor' })
    ).resolves.toBe('lookup_failed');
  });
});
