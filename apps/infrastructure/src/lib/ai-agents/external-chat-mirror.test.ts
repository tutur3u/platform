import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  callPrivateChatRpc: vi.fn(),
}));

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: Parameters<typeof mocks.callPrivateChatRpc>) =>
    mocks.callPrivateChatRpc(...args),
}));

import {
  persistAiAgentExternalSdkMessage,
  persistAiAgentExternalSdkThread,
} from './external-chat-mirror';

const agent = {
  id: 'agent-1',
  name: 'Zalo Agent',
};

const channel = {
  adapter: 'zalo' as const,
  autoRespond: true,
  displayName: 'Personal Zalo',
  externalChannelId: null,
  historySyncEnabled: true,
  id: 'zalo-personal',
  workspaceId: '00000000-0000-0000-0000-000000000000',
};

describe('persistAiAgentExternalSdkMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
      if (name === 'ai_agent_external_upsert_thread') {
        return { id: 'thread-uuid' };
      }

      return { id: 'message-uuid' };
    });
  });

  it('uses SDK thread metadata title for self-authored mirrored messages', async () => {
    await persistAiAgentExternalSdkMessage({
      agent: agent as never,
      channel: channel as never,
      direction: 'outbound',
      message: {
        author: {
          fullName: 'Personal Zalo',
          isBot: true,
          isMe: true,
          userId: 'own-1',
          userName: 'Personal Zalo',
        },
        id: 'message-1',
        metadata: {
          dateSent: new Date('2026-06-10T03:56:53.000Z'),
        },
        raw: {},
        text: 'Saved note',
        threadId: 'zalo-thread-1',
      } as never,
      thread: {
        channelId: 'zalo-personal',
        id: 'zalo-thread-1',
        isDM: true,
        metadata: {
          threadTitle: 'My Documents',
        },
      } as never,
    });

    expect(mocks.callPrivateChatRpc).toHaveBeenNthCalledWith(
      1,
      'ai_agent_external_upsert_thread',
      expect.objectContaining({
        p_external_thread_id: 'zalo-thread-1',
        p_title: 'My Documents',
      })
    );
  });

  it('upserts discovered external threads without requiring a message', async () => {
    await persistAiAgentExternalSdkThread({
      agent: agent as never,
      channel: channel as never,
      thread: {
        channelId: 'zalo-personal',
        id: 'zalo-personal:zalo-personal:group:1726066103327482314',
        isDM: false,
        metadata: {
          threadTitle: 'Experiment',
        },
      } as never,
    });

    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'ai_agent_external_upsert_thread',
      expect.objectContaining({
        p_external_thread_id:
          'zalo-personal:zalo-personal:group:1726066103327482314',
        p_title: 'Experiment',
      })
    );
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledTimes(1);
  });
});
