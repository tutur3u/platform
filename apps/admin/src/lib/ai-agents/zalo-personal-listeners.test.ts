import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  createAiAgentPersonalZaloRuntime: vi.fn(),
  getAiAgentById: vi.fn(),
  getChannelSecretValues: vi.fn(),
  isAiAgentZaloPersonalEnabled: vi.fn(),
  persistAiAgentExternalSdkMessage: vi.fn(),
  persistAiAgentExternalSdkThread: vi.fn(),
  recordAiAgentZaloPersonalConnection: vi.fn(),
  syncZaloPersonalWebHistory: vi.fn(),
}));

vi.mock('./external-chat-mirror', () => ({
  persistAiAgentExternalSdkMessage: (
    ...args: Parameters<typeof mocks.persistAiAgentExternalSdkMessage>
  ) => mocks.persistAiAgentExternalSdkMessage(...args),
  persistAiAgentExternalSdkThread: (
    ...args: Parameters<typeof mocks.persistAiAgentExternalSdkThread>
  ) => mocks.persistAiAgentExternalSdkThread(...args),
}));

vi.mock('./registry', () => ({
  getAiAgentById: (...args: Parameters<typeof mocks.getAiAgentById>) =>
    mocks.getAiAgentById(...args),
  getChannelSecretValues: (
    ...args: Parameters<typeof mocks.getChannelSecretValues>
  ) => mocks.getChannelSecretValues(...args),
  isAiAgentZaloPersonalEnabled: (
    ...args: Parameters<typeof mocks.isAiAgentZaloPersonalEnabled>
  ) => mocks.isAiAgentZaloPersonalEnabled(...args),
  recordAiAgentZaloPersonalConnection: (
    ...args: Parameters<typeof mocks.recordAiAgentZaloPersonalConnection>
  ) => mocks.recordAiAgentZaloPersonalConnection(...args),
}));

vi.mock('./runtime', () => ({
  createAiAgentPersonalZaloRuntime: (
    ...args: Parameters<typeof mocks.createAiAgentPersonalZaloRuntime>
  ) => mocks.createAiAgentPersonalZaloRuntime(...args),
}));

vi.mock('./zalo-personal-web-sync', () => ({
  syncZaloPersonalWebHistory: (
    ...args: Parameters<typeof mocks.syncZaloPersonalWebHistory>
  ) => mocks.syncZaloPersonalWebHistory(...args),
}));

import {
  syncAiAgentZaloPersonalHistory,
  syncAiAgentZaloPersonalPhoneHistory,
} from './zalo-personal-listeners';

const channel = {
  adapter: 'zalo' as const,
  autoRespond: true,
  displayName: 'Personal Zalo',
  enabled: true,
  externalChannelId: null,
  historySyncEnabled: true,
  id: 'channel-1',
  lastDeployedAt: null,
  lastError: null,
  lastEventAt: null,
  mentionRoleIds: [],
  secrets: [],
  status: 'deployed' as const,
  webhookUrl: null,
  workspaceId: 'workspace-1',
  zaloAccountMode: 'personal' as const,
  zaloPersonalOwnId: null,
};

const agent = {
  channels: [channel],
  createdAt: null,
  enabled: true,
  id: 'agent-1',
  instructions: 'Help mapped Zalo users.',
  modelId: 'google/gemini-3.1-flash-lite',
  name: 'Zalo Agent',
  temperature: null,
  tools: [],
  updatedAt: null,
};

function sdkMessage({
  isMe,
  text,
  threadId,
}: {
  isMe: boolean;
  text: string;
  threadId: string;
}) {
  return {
    author: {
      fullName: isMe ? 'Personal Zalo' : 'Sender',
      isBot: isMe,
      isMe,
      userId: isMe ? 'own-1' : 'zalo-user-1',
      userName: isMe ? 'Personal Zalo' : 'Sender',
    },
    id: `${threadId}:${text}`,
    metadata: {
      dateSent: new Date('2026-06-09T16:00:00.000Z'),
    },
    raw: {},
    text,
    threadId,
  };
}

describe('personal Zalo listener history sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const scope = globalThis as typeof globalThis & {
      __tuturuuuAiAgentZaloPersonalListeners?: Map<string, unknown>;
    };

    scope.__tuturuuuAiAgentZaloPersonalListeners?.clear();
    mocks.getAiAgentById.mockResolvedValue(agent);
    mocks.getChannelSecretValues.mockResolvedValue({
      personalCookieJson: '[]',
      personalImei: 'imei',
      personalUserAgent: 'user-agent',
    });
    mocks.isAiAgentZaloPersonalEnabled.mockResolvedValue(true);
    mocks.recordAiAgentZaloPersonalConnection.mockResolvedValue(undefined);
    mocks.syncZaloPersonalWebHistory.mockResolvedValue({
      approvalRequested: false,
      conversations: 0,
      error: 'zalo_personal_web_sync_login_required',
      groupMessages: 0,
      messages: [],
      missingRanges: 0,
      requestAccepted: false,
      status: 'failed',
      threads: [],
      userMessages: 0,
    });
  });

  it('persists historical personal Zalo messages into mirrored chat threads', async () => {
    const disconnect = vi.fn();
    const adapter = {
      disconnect,
      fetchThread: vi.fn(async (threadId: string) => ({
        channelId: 'channel-1',
        id: threadId,
      })),
      getPersonalStatus: vi.fn(() => ({
        connected: true,
        lastError: null,
        lastEventAt: '2026-06-09T16:01:00.000Z',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-09T16:00:00.000Z',
      })),
      syncPersonalHistory: vi.fn(async () => ({
        exhausted: true,
        failedGroupHistories: 0,
        groupMessages: 1,
        groupsScanned: 1,
        messages: [
          sdkMessage({
            isMe: false,
            text: 'historical inbound',
            threadId: 'zalo-personal:channel-1:user:zalo-user-1',
          }),
          sdkMessage({
            isMe: true,
            text: 'historical outbound',
            threadId: 'zalo-personal:channel-1:group:group-1',
          }),
        ],
        pageCount: 2,
        threads: [],
        timedOut: false,
        userMessages: 1,
      })),
    };
    mocks.createAiAgentPersonalZaloRuntime.mockResolvedValue({
      adapter,
      chat: {},
    });

    await expect(
      syncAiAgentZaloPersonalHistory({
        agentId: 'agent-1',
        channelId: 'channel-1',
      })
    ).resolves.toMatchObject({
      status: {
        connected: false,
        ownId: 'own-1',
        running: false,
      },
      sync: {
        exhausted: true,
        failedGroupHistories: 0,
        groupMessages: 1,
        groupsScanned: 1,
        pageCount: 2,
        synced: 2,
        threads: 2,
        timedOut: false,
        userMessages: 1,
      },
    });
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenCalledTimes(2);
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        direction: 'inbound',
        platformUserId: null,
      })
    );
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        direction: 'outbound',
        platformUserId: null,
      })
    );
    expect(adapter.fetchThread).toHaveBeenCalledWith(
      'zalo-personal:channel-1:user:zalo-user-1'
    );
    expect(adapter.fetchThread).toHaveBeenCalledWith(
      'zalo-personal:channel-1:group:group-1'
    );
    expect(mocks.recordAiAgentZaloPersonalConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 'channel-1',
        error: null,
        ownId: 'own-1',
      })
    );
    expect(disconnect).toHaveBeenCalled();
  });

  it('persists discovered personal Zalo threads even when they have no messages', async () => {
    const disconnect = vi.fn();
    const adapter = {
      disconnect,
      fetchThread: vi.fn(),
      getPersonalStatus: vi.fn(() => ({
        connected: true,
        lastError: null,
        lastEventAt: '2026-06-10T04:40:00.000Z',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-10T04:39:00.000Z',
      })),
      syncPersonalHistory: vi.fn(async () => ({
        exhausted: true,
        failedGroupHistories: 0,
        groupMessages: 0,
        groupsScanned: 1,
        messages: [],
        pageCount: 0,
        threads: [
          {
            channelId: 'channel-1',
            id: 'zalo-personal:channel-1:group:1726066103327482314',
            isDM: false,
            metadata: {
              threadTitle: 'Experiment',
            },
          },
        ],
        timedOut: false,
        userMessages: 0,
      })),
    };
    mocks.createAiAgentPersonalZaloRuntime.mockResolvedValue({
      adapter,
      chat: {},
    });

    await expect(
      syncAiAgentZaloPersonalHistory({
        agentId: 'agent-1',
        channelId: 'channel-1',
      })
    ).resolves.toMatchObject({
      sync: {
        groupsScanned: 1,
        synced: 0,
        threads: 1,
      },
    });
    expect(mocks.persistAiAgentExternalSdkThread).toHaveBeenCalledWith(
      expect.objectContaining({
        thread: expect.objectContaining({
          id: 'zalo-personal:channel-1:group:1726066103327482314',
        }),
      })
    );
    expect(mocks.persistAiAgentExternalSdkMessage).not.toHaveBeenCalled();
    expect(adapter.fetchThread).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it('persists phone-approved personal Zalo transfer messages without exposing raw secrets', async () => {
    const disconnect = vi.fn();
    const adapter = {
      disconnect,
      fetchThread: vi.fn(async (threadId: string) => ({
        channelId: 'channel-1',
        id: threadId,
      })),
      getPersonalStatus: vi.fn(() => ({
        connected: true,
        lastError: null,
        lastEventAt: '2026-06-09T16:01:00.000Z',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-09T16:00:00.000Z',
      })),
      syncPersonalPhoneHistory: vi.fn(async () => ({
        approvalRequested: true,
        cleaned: true,
        error: null,
        groupMessages: 1,
        messages: [
          sdkMessage({
            isMe: false,
            text: 'phone inbound',
            threadId: 'zalo-personal:channel-1:user:zalo-user-1',
          }),
          sdkMessage({
            isMe: true,
            text: 'phone outbound',
            threadId: 'zalo-personal:channel-1:group:group-1',
          }),
        ],
        pullAttempts: 1,
        requestAccepted: true,
        requestHttpError: null,
        requestViaHttp: true,
        requestViaWebSocket: true,
        status: 'completed' as const,
        userMessages: 1,
      })),
    };
    mocks.createAiAgentPersonalZaloRuntime.mockResolvedValue({
      adapter,
      chat: {},
    });

    const result = await syncAiAgentZaloPersonalPhoneHistory({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });

    expect(result).toMatchObject({
      status: {
        connected: false,
        ownId: 'own-1',
        running: false,
      },
      sync: {
        approvalRequested: true,
        cleaned: true,
        error: null,
        groupMessages: 1,
        pullAttempts: 1,
        requestAccepted: true,
        requestHttpError: null,
        requestViaHttp: true,
        requestViaWebSocket: true,
        status: 'completed',
        synced: 2,
        threads: 2,
        userMessages: 1,
      },
    });
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenCalledTimes(2);
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        direction: 'inbound',
        platformUserId: null,
      })
    );
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        direction: 'outbound',
        platformUserId: null,
      })
    );
    expect(JSON.stringify(result)).not.toContain('cookie');
    expect(JSON.stringify(result)).not.toContain('imei');
    expect(JSON.stringify(result)).not.toContain('userAgent');
    expect(disconnect).toHaveBeenCalled();
  });

  it('prefers zca-js phone transfer messages over browser web sync telemetry', async () => {
    const disconnect = vi.fn();
    const adapter = {
      disconnect,
      fetchThread: vi.fn(async (threadId: string) => ({
        channelId: 'channel-1',
        id: threadId,
      })),
      getPersonalStatus: vi.fn(() => ({
        connected: true,
        lastError: null,
        lastEventAt: '2026-06-09T16:01:00.000Z',
        ownId: 'own-1',
        running: true,
        startedAt: '2026-06-09T16:00:00.000Z',
      })),
      syncPersonalPhoneHistory: vi.fn(async () => ({
        approvalRequested: true,
        cleaned: true,
        error: null,
        groupMessages: 0,
        messages: [
          sdkMessage({
            isMe: false,
            text: 'transfer phone inbound',
            threadId: 'zalo-personal:channel-1:user:zalo-user-1',
          }),
        ],
        pullAttempts: 1,
        requestAccepted: true,
        requestHttpError: null,
        requestViaHttp: true,
        requestViaWebSocket: true,
        status: 'completed' as const,
        userMessages: 1,
      })),
    };
    const browserMessages = [
      sdkMessage({
        isMe: false,
        text: 'web phone inbound',
        threadId: 'zalo-personal:channel-1:user:zalo-web-user',
      }),
      sdkMessage({
        isMe: true,
        text: 'web phone outbound',
        threadId: 'zalo-personal:channel-1:user:zalo-web-user',
      }),
    ];

    mocks.createAiAgentPersonalZaloRuntime.mockResolvedValue({
      adapter,
      chat: {},
    });
    mocks.syncZaloPersonalWebHistory.mockResolvedValue({
      approvalRequested: true,
      conversations: 7,
      error: null,
      groupMessages: 0,
      messages: browserMessages,
      missingRanges: 0,
      requestAccepted: true,
      status: 'completed',
      threads: [
        {
          channelId: 'channel-1',
          id: 'zalo-personal:channel-1:user:zalo-web-user',
        },
      ],
      userMessages: 2,
    });

    const result = await syncAiAgentZaloPersonalPhoneHistory({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });

    expect(mocks.syncZaloPersonalWebHistory).not.toHaveBeenCalled();
    expect(adapter.syncPersonalPhoneHistory).toHaveBeenCalled();
    expect(result.sync).toMatchObject({
      approvalRequested: true,
      cleaned: true,
      error: null,
      groupMessages: 0,
      requestAccepted: true,
      requestViaHttp: true,
      requestViaWebSocket: true,
      status: 'completed',
      synced: 1,
      threads: 1,
      userMessages: 1,
    });
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenCalledTimes(1);
    expect(mocks.persistAiAgentExternalSdkMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.objectContaining({
          text: 'transfer phone inbound',
        }),
      })
    );
    expect(JSON.stringify(result)).not.toContain('cookie');
    expect(JSON.stringify(result)).not.toContain('imei');
    expect(JSON.stringify(result)).not.toContain('userAgent');
    expect(disconnect).toHaveBeenCalled();
  });

  it('does not persist browser web sync telemetry when transfer sync fails empty', async () => {
    const disconnect = vi.fn();
    const adapter = {
      disconnect,
      fetchThread: vi.fn(),
      getPersonalStatus: vi.fn(() => ({
        connected: false,
        lastError: 'zalo_personal_phone_sync_failed',
        lastEventAt: '2026-06-09T16:01:00.000Z',
        ownId: 'own-1',
        running: false,
        startedAt: null,
      })),
      syncPersonalPhoneHistory: vi.fn(async () => ({
        approvalRequested: false,
        cleaned: false,
        error: 'zalo_personal_phone_sync_failed',
        groupMessages: 0,
        messages: [],
        pullAttempts: 0,
        requestAccepted: false,
        requestHttpError: null,
        requestViaHttp: false,
        requestViaWebSocket: false,
        status: 'failed' as const,
        userMessages: 0,
      })),
    };

    mocks.createAiAgentPersonalZaloRuntime.mockResolvedValue({
      adapter,
      chat: {},
    });
    mocks.syncZaloPersonalWebHistory.mockResolvedValue({
      approvalRequested: true,
      conversations: 7,
      error: null,
      groupMessages: 0,
      messages: [],
      missingRanges: 0,
      requestAccepted: true,
      status: 'completed',
      threads: [],
      userMessages: 0,
    });

    const result = await syncAiAgentZaloPersonalPhoneHistory({
      agentId: 'agent-1',
      channelId: 'channel-1',
    });

    expect(mocks.syncZaloPersonalWebHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: 'agent-1',
        channelDisplayName: 'Personal Zalo',
        channelId: 'channel-1',
        cookieJson: '[]',
        imei: 'imei',
        userAgent: 'user-agent',
      })
    );
    expect(mocks.persistAiAgentExternalSdkMessage).not.toHaveBeenCalled();
    expect(result.sync).toMatchObject({
      error: 'zalo_personal_phone_sync_failed',
      status: 'failed',
      synced: 0,
      threads: 0,
    });
    expect(disconnect).toHaveBeenCalled();
  });
});
