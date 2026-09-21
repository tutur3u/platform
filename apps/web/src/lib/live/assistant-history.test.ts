import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
vi.mock('@tuturuuu/ai/credits/model-mapping', () => ({
  resolveGatewayModelId: (id: string) => id,
}));

import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { loadAssistantLiveSeedHistory } from './assistant-history';

function accessClient(data: { id: string } | null, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  const from = vi.fn().mockReturnValue(query);
  return { client: { from } as unknown as TypedSupabaseClient, from, query };
}

describe('owned Live history', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [null, null],
    [null, { message: 'ownership lookup failed' }],
  ])(
    'never obtains privileged access without confirmed ownership',
    async (data, error) => {
      const { client } = accessClient(data, error);
      await expect(
        loadAssistantLiveSeedHistory({
          supabase: client,
          chatId: 'foreign-chat',
          userId: 'caller',
        })
      ).rejects.toThrow();
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('reads bounded owned messages server-side and restores chronological order', async () => {
    const {
      client,
      from,
      query: ownership,
    } = accessClient({ id: 'owned-chat' });
    const messages = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { role: 'assistant', content: 'Reply', metadata: null },
          { role: 'user', content: 'Question', metadata: null },
        ],
        error: null,
      }),
    };
    const adminFrom = vi.fn().mockReturnValue(messages);
    mocks.createAdminClient.mockResolvedValue({ from: adminFrom });
    const history = await loadAssistantLiveSeedHistory({
      supabase: client,
      chatId: 'owned-chat',
      userId: 'caller',
    });
    expect(from).toHaveBeenCalledExactlyOnceWith('ai_chats');
    expect(ownership.eq).toHaveBeenCalledWith('creator_id', 'caller');
    expect(adminFrom).toHaveBeenCalledExactlyOnceWith('ai_chat_messages');
    expect(messages.eq).toHaveBeenCalledWith('chat_id', 'owned-chat');
    expect(messages.limit).toHaveBeenCalledWith(200);
    expect(history).toEqual([
      { role: 'user', parts: [{ text: 'Question' }] },
      { role: 'model', parts: [{ text: 'Reply' }] },
    ]);
  });
});
