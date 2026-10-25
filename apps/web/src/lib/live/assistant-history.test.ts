import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
vi.mock('@tuturuuu/ai/credits/model-mapping', () => ({
  resolveGatewayModelId: (id: string) => id,
}));

import {
  buildLiveSeedHistory,
  loadAssistantLiveSeedHistory,
  type OwnedAssistantLiveChat,
} from './assistant-history';

const ownedChat = {
  id: 'owned-chat',
  title: null,
  model: null,
  is_public: false,
  created_at: null,
} as OwnedAssistantLiveChat;

function messageQuery(data: unknown[], error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error }),
  };
}

describe('owned Live history', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads bounded owned messages in one ownership-joined query', async () => {
    const messages = messageQuery([
      { role: 'assistant', content: 'Reply', metadata: null },
      { role: 'user', content: 'Question', metadata: null },
    ]);
    const adminFrom = vi.fn().mockReturnValue(messages);
    mocks.createAdminClient.mockResolvedValue({ from: adminFrom });
    const history = await loadAssistantLiveSeedHistory({
      chat: ownedChat,
      userId: 'caller',
    });
    expect(adminFrom).toHaveBeenCalledExactlyOnceWith('ai_chat_messages');
    expect(messages.select).toHaveBeenCalledWith(
      expect.stringContaining('ai_chats!chat_id!inner(creator_id)')
    );
    expect(messages.eq).toHaveBeenCalledWith('chat_id', 'owned-chat');
    expect(messages.eq).toHaveBeenCalledWith('ai_chats.creator_id', 'caller');
    expect(messages.limit).toHaveBeenCalledWith(60);
    expect(history).toEqual([
      { role: 'user', parts: [{ text: 'Question' }] },
      { role: 'model', parts: [{ text: 'Reply' }] },
    ]);
  });

  it('surfaces message read failures instead of seeding partial context', async () => {
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(messageQuery([], { message: 'boom' })),
    });
    await expect(
      loadAssistantLiveSeedHistory({ chat: ownedChat, userId: 'caller' })
    ).rejects.toThrow('boom');
  });
});

describe('seed history budget', () => {
  const row = (role: string, content: string) => ({
    role,
    content,
    metadata: null,
  });

  it('keeps the newest turns that fit the character budget in order', () => {
    const history = buildLiveSeedHistory(
      [
        row('user', 'a'.repeat(6)),
        row('assistant', 'b'.repeat(4)),
        row('user', 'c'.repeat(4)),
      ],
      10
    );
    expect(history.map((turn) => turn.parts[0]!.text)).toEqual([
      'bbbb',
      'cccc',
    ]);
  });

  it('keeps the tail of an oversized latest message', () => {
    const history = buildLiveSeedHistory(
      [row('user', `${'x'.repeat(5)}end`)],
      3
    );
    expect(history).toEqual([{ role: 'user', parts: [{ text: 'end' }] }]);
  });

  it('skips non-conversational roles without spending budget', () => {
    const history = buildLiveSeedHistory(
      [row('system', 'ignored'), row('tool', 'ignored'), row('user', 'hi')],
      2
    );
    expect(history).toEqual([{ role: 'user', parts: [{ text: 'hi' }] }]);
  });
});
