import { Message } from 'chat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class FakeListener {
    private handlers = new Map<string, ((...args: unknown[]) => void)[]>();

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

    removeAllListeners() {
      this.handlers.clear();
    }

    start = vi.fn();
    stop = vi.fn();
  }

  const listener = new FakeListener();
  const api = {
    getGroupChatHistory: vi.fn(),
    getOwnId: vi.fn(),
    listener,
    sendMessage: vi.fn(),
    sendTypingEvent: vi.fn(),
  };

  return {
    api,
    listener,
    login: vi.fn(),
  };
});

vi.mock('zca-js', () => ({
  ThreadType: {
    Group: 1,
    User: 0,
  },
  Zalo: class Zalo {
    login(...args: unknown[]) {
      return mocks.login(...args);
    }
  },
}));

import {
  createZaloPersonalAdapter,
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
    mocks.api.getOwnId.mockReturnValue('own-1');
    mocks.api.sendMessage.mockResolvedValue({
      attachment: [],
      message: { msgId: 42 },
    });
    mocks.login.mockResolvedValue(mocks.api);
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
});
