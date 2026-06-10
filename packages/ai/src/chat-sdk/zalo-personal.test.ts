import { Message } from 'chat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class FakeListener {
    private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

    ws: { readyState: number } | null = null;

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    off(event: string, handler: (...args: unknown[]) => void) {
      const handlers = this.handlers.get(event) ?? [];
      this.handlers.set(
        event,
        handlers.filter((candidate) => candidate !== handler)
      );
    }

    removeListener(event: string, handler: (...args: unknown[]) => void) {
      this.off(event, handler);
    }

    removeAllListeners() {
      this.handlers.clear();
    }

    requestOldMessages = vi.fn();
    sendWs = vi.fn();
    start = vi.fn(() => {
      this.ws = { readyState: 1 };
      queueMicrotask(() => this.emit('connected'));
    });
    stop = vi.fn(() => {
      this.ws = null;
      this.emit('disconnected', 1000, 'manual');
    });
  }

  const listener = new FakeListener();
  const transferCalls: { name: string; props: unknown }[] = [];
  const transferErrors = new Map<string, Error>();
  const transferPullResponses: unknown[] = [];
  const api = {
    custom: vi.fn((name: string) => {
      Object.defineProperty(api, name, {
        configurable: true,
        value: vi.fn(async (props: unknown) => {
          transferCalls.push({ name, props });

          const error = transferErrors.get(name);
          if (error) throw error;

          if (name === 'tuturuuuPullMobileMessages') {
            return (
              transferPullResponses.shift() ?? {
                hasMore: false,
                msgs: [],
              }
            );
          }

          return { ok: true };
        }),
      });
    }),
    getArchivedChatList: vi.fn(),
    getAllGroups: vi.fn(),
    getGroupInfo: vi.fn(),
    getGroupChatHistory: vi.fn(),
    getHiddenConversations: vi.fn(),
    getOwnId: vi.fn(),
    getPinConversations: vi.fn(),
    getUserInfo: vi.fn(),
    listener,
    sendMessage: vi.fn(),
    sendTypingEvent: vi.fn(),
    zpwServiceMap: {
      file: ['https://file.zalo.test'],
    },
  };

  return {
    api,
    listener,
    login: vi.fn(),
    loginQR: vi.fn(),
    transferCalls,
    transferErrors,
    transferPullResponses,
  };
});

vi.mock('zca-js', () => ({
  FriendEventType: {
    REQUEST: 2,
  },
  GroupMessage: class GroupMessage {
    data: Record<string, string | number | boolean>;
    isSelf: boolean;
    threadId: string;
    type = 1;

    constructor(
      ownId: string,
      data: Record<string, string | number | boolean>
    ) {
      this.data = data;
      this.isSelf = data.uidFrom === ownId;
      this.threadId = String(data.idTo ?? '');
    }
  },
  LoginQRCallbackEventType: {
    GotLoginInfo: 4,
    QRCodeDeclined: 3,
    QRCodeExpired: 1,
    QRCodeGenerated: 0,
    QRCodeScanned: 2,
  },
  ThreadType: {
    Group: 1,
    User: 0,
  },
  UserMessage: class UserMessage {
    data: Record<string, string | number | boolean>;
    isSelf: boolean;
    threadId: string;
    type = 0;

    constructor(
      ownId: string,
      data: Record<string, string | number | boolean>
    ) {
      const senderId = String(data.uidFrom ?? '');
      const receiverId = String(data.idTo ?? '');

      this.data = data;
      this.isSelf = senderId === ownId;
      this.threadId = senderId === ownId ? receiverId : senderId;
    }
  },
  Zalo: class Zalo {
    login(...args: unknown[]) {
      return mocks.login(...args);
    }

    loginQR(...args: unknown[]) {
      return mocks.loginQR(...args);
    }
  },
}));

import {
  createZaloPersonalAdapter,
  loginZaloPersonalWithQr,
  parseZaloPersonalCookieJson,
} from './zalo-personal';

function createAdapter() {
  return createZaloPersonalAdapter({
    channelId: 'channel-1',
    cookieJson: '[{"name":"zpsid","value":"cookie"}]',
    displayName: 'Personal Zalo',
    imei: 'imei-1',
    userAgent: 'agent-1',
  });
}

function zcaMessage(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      cliMsgId: 'cli-1',
      content: 'hello',
      dName: 'Sender',
      msgId: 'msg-1',
      ts: '1700000000000',
      uidFrom: 'zalo-user-1',
    },
    isSelf: false,
    threadId: 'zalo-user-1',
    type: 0,
    ...overrides,
  };
}

describe('Zalo personal Chat SDK adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transferCalls.length = 0;
    mocks.transferErrors.clear();
    mocks.transferPullResponses.length = 0;
    mocks.api.getOwnId.mockReturnValue('own-1');
    mocks.api.getAllGroups.mockResolvedValue({
      gridVerMap: {},
      version: '1',
    });
    mocks.api.getArchivedChatList.mockResolvedValue({
      items: [],
      version: 1,
    });
    mocks.api.getGroupInfo.mockResolvedValue({
      gridInfoMap: {},
      removedsGroup: [],
      unchangedsGroup: [],
    });
    mocks.api.getGroupChatHistory.mockResolvedValue({
      groupMsgs: [],
      lastActionId: '',
      lastActionIdOther: '',
      more: 0,
    });
    mocks.api.getHiddenConversations.mockResolvedValue({
      pin: '',
      threads: [],
    });
    mocks.api.sendMessage.mockResolvedValue({
      attachment: [],
      message: { msgId: 42 },
    });
    mocks.api.getPinConversations.mockResolvedValue({
      conversations: [],
      version: 1,
    });
    mocks.api.getUserInfo.mockResolvedValue({
      changed_profiles: {},
      phonebook_version: 1,
      unchanged_profiles: {},
    });
    mocks.listener.requestOldMessages.mockReset();
    mocks.listener.requestOldMessages.mockImplementation((type: number) =>
      mocks.listener.emit('old_messages', [], type)
    );
    mocks.listener.sendWs.mockReset();
    mocks.listener.ws = null;
    mocks.login.mockResolvedValue(mocks.api);
    mocks.loginQR.mockResolvedValue(mocks.api);
    mocks.listener.removeAllListeners();
  });

  it('parses browser-exported cookie JSON', () => {
    expect(
      parseZaloPersonalCookieJson('[{"name":"zpsid","value":"cookie"}]')
    ).toEqual([{ name: 'zpsid', value: 'cookie' }]);
    expect(
      parseZaloPersonalCookieJson(
        '{"url":"https://chat.zalo.me","cookies":[{"name":"zpsid","value":"cookie"}]}'
      )
    ).toEqual({
      cookies: [{ name: 'zpsid', value: 'cookie' }],
      url: 'https://chat.zalo.me',
    });
  });

  it('validates login and records the own account ID', async () => {
    const adapter = createAdapter();

    await expect(adapter.validateLogin()).resolves.toMatchObject({
      connected: true,
      ownId: 'own-1',
    });
    expect(mocks.login).toHaveBeenCalledWith({
      cookie: [{ name: 'zpsid', value: 'cookie' }],
      imei: 'imei-1',
      language: undefined,
      userAgent: 'agent-1',
    });
  });

  it('sends messages through zca-js with decoded thread type', async () => {
    const adapter = createAdapter();
    const threadId = adapter.encodeThreadId({
      externalThreadId: 'group-1',
      threadType: 1,
    });

    await expect(adapter.postMessage(threadId, 'reply')).resolves.toMatchObject(
      {
        id: '42',
        threadId,
      }
    );
    expect(mocks.api.sendMessage).toHaveBeenCalledWith(
      { msg: 'reply' },
      'group-1',
      1
    );
  });

  it('dispatches inbound personal messages through Chat SDK processing', async () => {
    const adapter = createAdapter();
    const chat = {
      processMessage: vi.fn(),
    };

    await adapter.initialize(chat as never);
    await adapter.startPersonalListener();
    mocks.listener.emit('message', zcaMessage());

    expect(chat.processMessage).toHaveBeenCalledWith(
      adapter,
      'zalo-personal:channel-1:user:zalo-user-1',
      expect.any(Message),
      expect.objectContaining({ waitUntil: expect.any(Function) })
    );
  });

  it('dispatches inbound friend request messages through Chat SDK processing', async () => {
    const adapter = createAdapter();
    const chat = {
      processMessage: vi.fn(),
    };

    await adapter.initialize(chat as never);
    await adapter.startPersonalListener();
    mocks.listener.emit('friend_event', {
      data: {
        fromUid: 'zalo-user-2',
        message: 'Hello',
        src: 0,
        toUid: 'own-1',
      },
      isSelf: false,
      threadId: 'own-1',
      type: 2,
    });

    expect(chat.processMessage).toHaveBeenCalledWith(
      adapter,
      'zalo-personal:channel-1:user:zalo-user-2',
      expect.objectContaining({
        author: expect.objectContaining({
          isMe: false,
          userId: 'zalo-user-2',
        }),
        text: 'Hello',
        threadId: 'zalo-personal:channel-1:user:zalo-user-2',
      }),
      expect.objectContaining({ waitUntil: expect.any(Function) })
    );
  });

  it('syncs paginated user and group history batches', async () => {
    const adapter = createAdapter();
    const userMessage = zcaMessage({
      data: {
        cliMsgId: 'cli-user-1',
        content: 'historical user message',
        dName: 'Sender',
        msgId: 'msg-user-1',
        ts: '1700000000000',
        uidFrom: 'zalo-user-1',
      },
      threadId: 'zalo-user-1',
      type: 0,
    });
    const groupMessage = zcaMessage({
      data: {
        cliMsgId: 'cli-group-1',
        content: 'historical group message',
        dName: 'Group Sender',
        idTo: 'group-1',
        msgId: 'msg-group-1',
        ts: '1700000001000',
        uidFrom: 'zalo-user-2',
      },
      threadId: 'group-1',
      type: 1,
    });

    mocks.listener.requestOldMessages.mockImplementation(
      (type: number, lastMsgId: string | null) => {
        if (type === 0 && !lastMsgId) {
          mocks.listener.emit('old_messages', [userMessage], type);
        } else if (type === 1 && !lastMsgId) {
          mocks.listener.emit('old_messages', [groupMessage], type);
        } else {
          mocks.listener.emit('old_messages', [], type);
        }
      }
    );

    const result = await adapter.syncPersonalHistory({
      maxPagesPerType: 3,
      pageTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      exhausted: true,
      groupMessages: 1,
      timedOut: false,
      userMessages: 1,
    });
    expect(result.messages.map((message) => message.text)).toEqual([
      'historical user message',
      'historical group message',
    ]);
    expect(mocks.listener.requestOldMessages).toHaveBeenCalledWith(0, null);
    expect(mocks.listener.requestOldMessages).toHaveBeenCalledWith(
      0,
      'msg-user-1'
    );
    expect(mocks.listener.requestOldMessages).toHaveBeenCalledWith(1, null);
    expect(mocks.listener.requestOldMessages).toHaveBeenCalledWith(
      1,
      'msg-group-1'
    );
  });

  it('syncs enumerated group histories independently from listener backlog', async () => {
    const adapter = createAdapter();
    const groupMessage = zcaMessage({
      data: {
        cliMsgId: 'cli-group-2',
        content: 'enumerated group message',
        dName: 'Group Sender',
        idTo: 'group-2',
        msgId: 'msg-group-2',
        ts: '1700000002000',
        uidFrom: 'zalo-user-3',
      },
      threadId: 'group-2',
      type: 1,
    });

    mocks.api.getAllGroups.mockResolvedValue({
      gridVerMap: {
        'group-1': 'v1',
        'group-2': 'v2',
      },
      version: '2',
    });
    mocks.api.getGroupChatHistory.mockImplementation(async (groupId: string) =>
      groupId === 'group-2'
        ? {
            groupMsgs: [groupMessage],
            lastActionId: 'last-2',
            lastActionIdOther: '',
            more: 0,
          }
        : {
            groupMsgs: [],
            lastActionId: '',
            lastActionIdOther: '',
            more: 0,
          }
    );

    const result = await adapter.syncPersonalHistory({
      maxGroups: 10,
      maxPagesPerType: 1,
      messagesPerGroup: 25,
      pageTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      failedGroupHistories: 0,
      groupMessages: 1,
      groupsScanned: 2,
      timedOut: false,
      userMessages: 0,
    });
    expect(result.messages.map((message) => message.text)).toEqual([
      'enumerated group message',
    ]);
    expect(result.threads.map((thread) => thread.id)).toEqual([
      'zalo-personal:channel-1:group:group-1',
      'zalo-personal:channel-1:group:group-2',
    ]);
    expect(mocks.api.getAllGroups).toHaveBeenCalled();
    expect(mocks.api.getGroupChatHistory).toHaveBeenCalledWith('group-1', 25);
    expect(mocks.api.getGroupChatHistory).toHaveBeenCalledWith('group-2', 25);
  });

  it('can sync enumerated group histories without starting listener backfill', async () => {
    const adapter = createAdapter();

    mocks.api.getAllGroups.mockResolvedValue({
      gridVerMap: {
        'group-1': 'v1',
      },
      version: '1',
    });

    const result = await adapter.syncPersonalHistory({
      includeListenerBackfill: false,
      includeUsers: false,
      messagesPerGroup: 25,
      pageTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      groupsScanned: 1,
      pageCount: 0,
      userMessages: 0,
    });
    expect(result.threads.map((thread) => thread.id)).toEqual([
      'zalo-personal:channel-1:group:group-1',
    ]);
    expect(mocks.listener.start).not.toHaveBeenCalled();
    expect(mocks.listener.requestOldMessages).not.toHaveBeenCalled();
    expect(mocks.api.getGroupChatHistory).toHaveBeenCalledWith('group-1', 25);
  });

  it('returns enumerated group threads even when group history is empty', async () => {
    const adapter = createAdapter();

    mocks.api.getAllGroups.mockResolvedValue({
      gridVerMap: {
        '1726066103327482314': 'v1',
      },
      version: '1',
    });
    mocks.api.getGroupInfo.mockResolvedValue({
      gridInfoMap: {
        '1726066103327482314': {
          avt: '',
          fullAvt: '',
          name: 'Experiment',
        },
      },
      removedsGroup: [],
      unchangedsGroup: [],
    });

    const result = await adapter.syncPersonalHistory({
      includeListenerBackfill: false,
      includeUsers: false,
      messagesPerGroup: 25,
      pageTimeoutMs: 100,
    });

    expect(result.messages).toEqual([]);
    expect(result.threads).toMatchObject([
      {
        id: 'zalo-personal:channel-1:group:1726066103327482314',
        metadata: {
          externalThreadId: '1726066103327482314',
          threadTitle: 'Experiment',
          threadType: 'group',
        },
      },
    ]);
    expect(mocks.api.getGroupChatHistory).toHaveBeenCalledWith(
      '1726066103327482314',
      25
    );
  });

  it('syncs hidden group histories that are not in the visible group map', async () => {
    const adapter = createAdapter();
    const hiddenGroupMessage = zcaMessage({
      data: {
        cliMsgId: 'cli-hidden-group',
        content: 'hidden group message',
        dName: 'Hidden Group Sender',
        idTo: 'g-hidden-1',
        msgId: 'msg-hidden-group',
        ts: '1700000002500',
        uidFrom: 'zalo-user-hidden',
      },
      threadId: 'g-hidden-1',
      type: 1,
    });

    mocks.api.getAllGroups.mockResolvedValue({
      gridVerMap: {},
      version: '1',
    });
    mocks.api.getHiddenConversations.mockResolvedValue({
      pin: '',
      threads: [
        {
          is_group: 1,
          thread_id: 'g-hidden-1',
        },
      ],
    });
    mocks.api.getGroupChatHistory.mockImplementation(async (groupId: string) =>
      groupId === 'g-hidden-1'
        ? {
            groupMsgs: [hiddenGroupMessage],
            lastActionId: 'last-hidden',
            lastActionIdOther: '',
            more: 0,
          }
        : {
            groupMsgs: [],
            lastActionId: '',
            lastActionIdOther: '',
            more: 0,
          }
    );

    const result = await adapter.syncPersonalHistory({
      includeListenerBackfill: false,
      includeUsers: false,
      maxGroups: 10,
      messagesPerGroup: 25,
      pageTimeoutMs: 100,
    });

    expect(result).toMatchObject({
      groupMessages: 1,
      groupsScanned: 1,
      userMessages: 0,
    });
    expect(result.messages.map((message) => message.text)).toEqual([
      'hidden group message',
    ]);
    expect(result.threads.map((thread) => thread.id)).toEqual([
      'zalo-personal:channel-1:group:g-hidden-1',
    ]);
    expect(mocks.api.getGroupChatHistory).toHaveBeenCalledWith(
      'g-hidden-1',
      25
    );
  });

  it('uses zca-js profile metadata for fetched thread names', async () => {
    const adapter = createAdapter();
    const groupThreadId = adapter.encodeThreadId({
      externalThreadId: 'g-experiment',
      threadType: 1,
    });
    const userThreadId = adapter.encodeThreadId({
      externalThreadId: 'zalo-user-1',
      threadType: 0,
    });

    mocks.api.getGroupInfo.mockResolvedValue({
      gridInfoMap: {
        'g-experiment': {
          avt: 'group-avatar',
          fullAvt: 'group-full-avatar',
          name: 'Experiment',
        },
      },
      removedsGroup: [],
      unchangedsGroup: [],
    });
    mocks.api.getUserInfo.mockResolvedValue({
      changed_profiles: {
        'zalo-user-1_0': {
          avatar: 'user-avatar',
          displayName: 'Võ Hoàng Phúc',
          userId: 'zalo-user-1',
          username: 'vhp',
          zaloName: 'VHP',
        },
      },
      phonebook_version: 1,
      unchanged_profiles: {},
    });

    await expect(adapter.fetchThread(groupThreadId)).resolves.toMatchObject({
      id: groupThreadId,
      isDM: false,
      metadata: {
        authorAvatarUrl: 'group-full-avatar',
        externalThreadId: 'g-experiment',
        threadTitle: 'Experiment',
        threadType: 'group',
      },
    });
    await expect(adapter.fetchThread(userThreadId)).resolves.toMatchObject({
      id: userThreadId,
      isDM: true,
      metadata: {
        authorAvatarUrl: 'user-avatar',
        externalThreadId: 'zalo-user-1',
        threadTitle: 'Võ Hoàng Phúc',
        threadType: 'user',
      },
    });
  });

  it('requests phone-approved transfer sync and returns sanitized messages', async () => {
    const adapter = createAdapter();
    const userMessage = zcaMessage({
      data: {
        cliMsgId: 'cli-phone-user-1',
        content: 'phone user message',
        dName: 'Phone Sender',
        msgId: 'msg-phone-user-1',
        ts: '1700000003000',
        uidFrom: 'zalo-user-phone',
      },
      threadId: 'zalo-user-phone',
      type: 0,
    });
    const groupMessage = zcaMessage({
      data: {
        cliMsgId: 'cli-phone-group-1',
        content: 'phone group message',
        dName: 'Phone Group Sender',
        idTo: 'group-phone',
        msgId: 'msg-phone-group-1',
        ts: '1700000004000',
        uidFrom: 'zalo-user-group',
      },
      threadId: 'group-phone',
      type: 1,
    });
    mocks.transferPullResponses.push({
      groupMsgs: [groupMessage],
      hasMore: false,
      lastSeqId: 42,
      msgs: [userMessage],
    });
    mocks.transferErrors.set(
      'tuturuuuRequestPhoneSync',
      new Error('Request failed with status code 404')
    );

    const result = await adapter.syncPersonalPhoneHistory({
      maxPulls: 2,
      pullDelayMs: 250,
    });

    expect(result).toMatchObject({
      approvalRequested: true,
      cleaned: true,
      error: null,
      groupMessages: 1,
      pullAttempts: 1,
      requestAccepted: true,
      requestHttpError: 'Request failed with status code 404',
      requestViaHttp: false,
      requestViaWebSocket: true,
      status: 'completed',
      userMessages: 1,
    });
    expect(result.messages.map((message) => message.text)).toEqual([
      'phone user message',
      'phone group message',
    ]);
    expect(mocks.transferCalls.map((call) => call.name)).toEqual([
      'tuturuuuRequestPhoneSync',
      'tuturuuuPullMobileMessages',
      'tuturuuuCleanMobileSync',
    ]);
    expect(mocks.listener.start).toHaveBeenCalledWith({ retryOnClose: true });
    expect(mocks.listener.sendWs).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: 590,
        data: expect.objectContaining({
          data: expect.objectContaining({
            app: 'tuturuuu-chat',
            imei: 'imei-1',
            pc_name: 'Personal Zalo',
            platform: 'web',
            public_key: expect.any(String),
          }),
          reqId: expect.any(String),
        }),
        subCmd: 0,
        version: 1,
      }),
      false
    );
    expect(mocks.listener.sendWs).toHaveBeenCalledWith(
      expect.objectContaining({
        cmd: 592,
        data: expect.objectContaining({
          app: 'tuturuuu-chat',
          imei: 'imei-1',
          pc_name: 'Personal Zalo',
          platform: 'web',
          public_key: expect.any(String),
          reqId: expect.any(String),
        }),
        subCmd: 0,
        version: 1,
      }),
      false
    );

    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toContain('BEGIN PRIVATE KEY');
    expect(serializedResult).not.toContain('agent-1');
    expect(serializedResult).not.toContain('imei-1');
    expect(serializedResult).not.toContain('zpsid');
  });

  it('reports waiting_for_phone when transfer sync approval is still pending', async () => {
    const adapter = createAdapter();
    mocks.transferErrors.set(
      'tuturuuuPullMobileMessages',
      new Error('USER_DONT_CONFIRM')
    );

    const result = await adapter.syncPersonalPhoneHistory({
      maxPulls: 1,
      pullDelayMs: 250,
      useListenerWakeup: false,
    });

    expect(result).toMatchObject({
      approvalRequested: true,
      cleaned: false,
      error: 'USER_DONT_CONFIRM',
      messages: [],
      requestAccepted: true,
      requestHttpError: null,
      requestViaHttp: true,
      requestViaWebSocket: false,
      status: 'waiting_for_phone',
    });
    expect(mocks.transferCalls.map((call) => call.name)).toEqual([
      'tuturuuuRequestPhoneSync',
      'tuturuuuPullMobileMessages',
      'tuturuuuCancelMobileMessages',
    ]);
  });

  it('reports completed_no_payload when approval completes without transferable messages', async () => {
    const adapter = createAdapter();

    const result = await adapter.syncPersonalPhoneHistory({
      maxPulls: 1,
      pullDelayMs: 250,
      useListenerWakeup: false,
    });

    expect(result).toMatchObject({
      approvalRequested: true,
      cleaned: false,
      error: null,
      messages: [],
      pullAttempts: 1,
      requestAccepted: true,
      requestHttpError: null,
      requestViaHttp: true,
      requestViaWebSocket: false,
      status: 'completed_no_payload',
    });
    expect(adapter.getPersonalStatus().lastError).toBe(
      'zalo_personal_phone_sync_no_payload'
    );
    expect(mocks.transferCalls.map((call) => call.name)).toEqual([
      'tuturuuuRequestPhoneSync',
      'tuturuuuPullMobileMessages',
    ]);
  });

  it('emits QR progress and returns captured login credentials after success', async () => {
    const events: unknown[] = [];

    mocks.loginQR.mockImplementation(
      async (_options: unknown, callback: (event: unknown) => void) => {
        callback({
          actions: {
            abort: vi.fn(),
            retry: vi.fn(),
            saveToFile: vi.fn(),
          },
          data: {
            code: 'qr-code-1',
            image: 'base64-image',
            options: {
              enabledCheckOCR: true,
              enabledMultiLayer: false,
            },
            token: 'qr-token',
          },
          type: 0,
        });
        callback({
          actions: {
            abort: vi.fn(),
            retry: vi.fn(),
          },
          data: {
            avatar: 'https://avatar.test/a.png',
            display_name: 'Scanned Account',
          },
          type: 2,
        });
        callback({
          actions: null,
          data: {
            cookie: [{ key: 'zpsid', value: 'cookie' }],
            imei: 'qr-imei',
            userAgent: 'qr-agent',
          },
          type: 4,
        });

        return mocks.api;
      }
    );

    await expect(
      loginZaloPersonalWithQr({ language: 'vi' }, (event) => {
        events.push(event);
      })
    ).resolves.toMatchObject({
      credentials: {
        cookieJson: '[{"key":"zpsid","value":"cookie"}]',
        imei: 'qr-imei',
        userAgent: 'qr-agent',
      },
      ownId: 'own-1',
    });

    expect(mocks.loginQR).toHaveBeenCalledWith(
      {
        language: 'vi',
        userAgent: undefined,
      },
      expect.any(Function)
    );
    expect(events).toMatchObject([
      {
        qrImageDataUrl: 'data:image/png;base64,base64-image',
        type: 'qr_generated',
      },
      {
        scannedProfile: {
          avatar: 'https://avatar.test/a.png',
          displayName: 'Scanned Account',
        },
        type: 'qr_scanned',
      },
      { type: 'credentials_ready' },
      { ownId: 'own-1', type: 'authenticated' },
    ]);
    expect(JSON.stringify(events)).not.toContain('cookie');
    expect(JSON.stringify(events)).not.toContain('qr-imei');
    expect(JSON.stringify(events)).not.toContain('qr-agent');
  });

  it('fails QR login when the mobile confirmation is declined', async () => {
    const abort = vi.fn();

    mocks.loginQR.mockImplementation(
      (_options: unknown, callback: (event: unknown) => void) => {
        callback({
          actions: {
            abort,
            retry: vi.fn(),
          },
          data: {
            code: 'qr-code-1',
          },
          type: 3,
        });

        return new Promise(() => undefined);
      }
    );

    await expect(loginZaloPersonalWithQr()).rejects.toThrow(
      'zalo_personal_qr_declined'
    );
    expect(abort).toHaveBeenCalled();
  });

  it('fails QR login when the generated code expires', async () => {
    mocks.loginQR.mockImplementation(
      (_options: unknown, callback: (event: unknown) => void) => {
        callback({
          actions: {
            abort: vi.fn(),
            retry: vi.fn(),
          },
          data: null,
          type: 1,
        });

        return new Promise(() => undefined);
      }
    );

    await expect(loginZaloPersonalWithQr()).rejects.toThrow(
      'zalo_personal_qr_expired'
    );
  });
});
