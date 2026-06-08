import {
  type Adapter,
  type AdapterPostableMessage,
  type ChatInstance,
  type FetchOptions,
  type FetchResult,
  type FormattedContent,
  Message,
  parseMarkdown,
  type RawMessage,
  type StreamChunk,
  type StreamOptions,
  stringifyMarkdown,
  type ThreadInfo,
  type UserInfo,
} from 'chat';
import {
  type API,
  type Credentials,
  ThreadType,
  Zalo,
  type Message as ZcaMessage,
} from 'zca-js';

export interface ZaloPersonalAdapterConfig {
  channelId: string;
  cookieJson: string;
  displayName: string;
  imei: string;
  language?: string;
  ownId?: string | null;
  userAgent: string;
}

export interface ZaloPersonalStatus {
  connected: boolean;
  lastError: string | null;
  lastEventAt: string | null;
  ownId: string | null;
  running: boolean;
  startedAt: string | null;
}

export interface ZaloPersonalThreadRef {
  externalThreadId: string;
  threadType: ThreadType;
}

export interface ZaloPersonalSentRaw {
  externalThreadId: string;
  id: string;
  isSelf: true;
  response: unknown;
  text: string;
  threadId: string;
  threadType: ThreadType;
  ts: number;
}

export type ZaloPersonalRawMessage = ZcaMessage | ZaloPersonalSentRaw;

export type ZaloPersonalAdapter = Adapter<
  ZaloPersonalThreadRef,
  ZaloPersonalRawMessage
> & {
  getPersonalStatus(): ZaloPersonalStatus;
  startPersonalListener(): Promise<ZaloPersonalStatus>;
  stopPersonalListener(): Promise<ZaloPersonalStatus>;
  validateLogin(): Promise<ZaloPersonalStatus>;
};

const THREAD_ID_PREFIX = 'zalo-personal';

export function parseZaloPersonalCookieJson(
  cookieJson: string
): Credentials['cookie'] {
  const parsed = JSON.parse(cookieJson) as unknown;

  if (Array.isArray(parsed)) {
    return parsed as Credentials['cookie'];
  }

  if (isRecord(parsed) && Array.isArray(parsed.cookies)) {
    return parsed as Credentials['cookie'];
  }

  throw new Error('zalo_personal_cookie_json_invalid');
}

export function createZaloPersonalAdapter(
  config: ZaloPersonalAdapterConfig
): ZaloPersonalAdapter {
  let api: API | null = null;
  let chat: ChatInstance | null = null;
  let listenersAttached = false;
  let status: ZaloPersonalStatus = {
    connected: false,
    lastError: null,
    lastEventAt: null,
    ownId: config.ownId?.trim() || null,
    running: false,
    startedAt: null,
  };

  function setStatus(update: Partial<ZaloPersonalStatus>) {
    status = { ...status, ...update };
    return status;
  }

  function encodeThreadId(ref: ZaloPersonalThreadRef) {
    return [
      THREAD_ID_PREFIX,
      config.channelId,
      ref.threadType === ThreadType.Group ? 'group' : 'user',
      ref.externalThreadId,
    ].join(':');
  }

  function decodeThreadId(threadId: string): ZaloPersonalThreadRef {
    const [prefix, channelId, rawType, ...idParts] = threadId.split(':');

    if (
      prefix !== THREAD_ID_PREFIX ||
      channelId !== config.channelId ||
      !rawType ||
      idParts.length === 0
    ) {
      return {
        externalThreadId: threadId,
        threadType: ThreadType.User,
      };
    }

    return {
      externalThreadId: idParts.join(':'),
      threadType: rawType === 'group' ? ThreadType.Group : ThreadType.User,
    };
  }

  function messageThreadId(raw: ZcaMessage) {
    return encodeThreadId({
      externalThreadId: raw.threadId,
      threadType: raw.type,
    });
  }

  async function connect() {
    if (api) return api;

    try {
      if (!config.cookieJson.trim() || !config.imei.trim()) {
        throw new Error('zalo_personal_credentials_missing');
      }

      const zalo = new Zalo();
      api = await zalo.login({
        cookie: parseZaloPersonalCookieJson(config.cookieJson),
        imei: config.imei,
        language: config.language,
        userAgent: config.userAgent,
      });

      const ownId = api.getOwnId();
      setStatus({
        connected: true,
        lastError: null,
        ownId: ownId || status.ownId,
      });

      return api;
    } catch (error) {
      setStatus({
        connected: false,
        lastError: error instanceof Error ? error.message : String(error),
        running: false,
      });
      throw error;
    }
  }

  function attachListeners(apiInstance: API) {
    if (listenersAttached) return;

    apiInstance.listener.on('connected', () => {
      setStatus({
        connected: true,
        lastError: null,
        running: true,
      });
    });
    apiInstance.listener.on('disconnected', (_code, reason) => {
      setStatus({
        connected: false,
        lastError: reason || null,
        running: false,
      });
    });
    apiInstance.listener.on('closed', (_code, reason) => {
      setStatus({
        connected: false,
        lastError: reason || null,
        running: false,
      });
    });
    apiInstance.listener.on('error', (error) => {
      setStatus({
        lastError: error instanceof Error ? error.message : String(error),
      });
    });
    apiInstance.listener.on('message', (message) => {
      void handleIncomingMessage(message);
    });

    listenersAttached = true;
  }

  async function handleIncomingMessage(raw: ZcaMessage) {
    if (raw.isSelf || typeof raw.data.content !== 'string') {
      return;
    }

    const sdkMessage = adapter.parseMessage(raw);
    setStatus({ lastEventAt: new Date().toISOString() });

    await chat?.processMessage(adapter, sdkMessage.threadId, sdkMessage, {
      waitUntil: (task) => {
        void task.catch((error) => {
          setStatus({
            lastError: error instanceof Error ? error.message : String(error),
          });
        });
      },
    });
  }

  function unsupported(feature: string) {
    return new Error(`zalo_personal_${feature}_unsupported`);
  }

  const adapter: ZaloPersonalAdapter = {
    addReaction: async () => {
      throw unsupported('reaction');
    },
    channelIdFromThreadId: (_threadId) => config.channelId,
    decodeThreadId,
    deleteMessage: async () => {
      throw unsupported('delete');
    },
    disconnect: async () => {
      api?.listener.stop();
      api = null;
      listenersAttached = false;
      setStatus({
        connected: false,
        running: false,
      });
    },
    editMessage: async () => {
      throw unsupported('edit');
    },
    encodeThreadId,
    fetchMessages: async (
      threadId,
      options?: FetchOptions
    ): Promise<FetchResult<ZaloPersonalRawMessage>> => {
      const apiInstance = await connect();
      const thread = decodeThreadId(threadId);

      if (thread.threadType !== ThreadType.Group) {
        return { messages: [] };
      }

      const result = await apiInstance.getGroupChatHistory(
        thread.externalThreadId,
        options?.limit ?? 50
      );

      const messages = result.groupMsgs
        .map((message) => adapter.parseMessage(message))
        .sort(
          (a, b) =>
            a.metadata.dateSent.getTime() - b.metadata.dateSent.getTime()
        );

      return { messages };
    },
    fetchThread: async (threadId): Promise<ThreadInfo> => {
      const thread = decodeThreadId(threadId);

      return {
        channelId: config.channelId,
        channelName: config.displayName,
        id: threadId,
        isDM: thread.threadType === ThreadType.User,
        metadata: {
          accountMode: 'personal',
          externalThreadId: thread.externalThreadId,
          threadType: thread.threadType === ThreadType.Group ? 'group' : 'user',
        },
      };
    },
    getPersonalStatus: () => status,
    getUser: async (userId): Promise<UserInfo | null> => ({
      fullName: userId,
      isBot: false,
      userId,
      userName: userId,
    }),
    handleWebhook: async () =>
      Response.json(
        { error: 'Personal Zalo channels use a listener, not webhooks.' },
        { status: 404 }
      ),
    initialize: async (instance) => {
      chat = instance;
    },
    isDM: (threadId) => decodeThreadId(threadId).threadType === ThreadType.User,
    lockScope: 'thread',
    name: 'zalo',
    openDM: async (userId) =>
      encodeThreadId({
        externalThreadId: userId,
        threadType: ThreadType.User,
      }),
    parseMessage: (raw) => {
      if (isSentRaw(raw)) {
        return new Message<ZaloPersonalRawMessage>({
          attachments: [],
          author: {
            fullName: config.displayName,
            isBot: true,
            isMe: true,
            userId: status.ownId ?? 'zalo-personal-self',
            userName: config.displayName,
          },
          formatted: parseMarkdown(raw.text),
          id: raw.id,
          metadata: {
            dateSent: new Date(raw.ts),
            edited: false,
          },
          raw,
          text: raw.text,
          threadId: raw.threadId,
        });
      }

      const text =
        typeof raw.data.content === 'string'
          ? raw.data.content
          : '[Unsupported Zalo message]';
      const authorId =
        raw.data.uidFrom || raw.data.userId || (raw.isSelf ? status.ownId : '');

      return new Message<ZaloPersonalRawMessage>({
        attachments: [],
        author: {
          fullName: raw.data.dName || authorId || 'Zalo user',
          isBot: raw.isSelf,
          isMe: raw.isSelf,
          userId: authorId || raw.threadId,
          userName: raw.data.dName || authorId || raw.threadId,
        },
        formatted: parseMarkdown(text),
        id: raw.data.msgId || raw.data.cliMsgId || `${raw.data.ts}`,
        metadata: {
          dateSent: dateFromZaloTimestamp(raw.data.ts),
          edited: false,
        },
        raw,
        text,
        threadId: messageThreadId(raw),
      });
    },
    postMessage: async (threadId, message) => {
      const apiInstance = await connect();
      const thread = decodeThreadId(threadId);
      const text = extractPostableText(message);
      const response = await apiInstance.sendMessage(
        { msg: text },
        thread.externalThreadId,
        thread.threadType
      );
      const id = String(
        response.message?.msgId ??
          response.attachment.at(0)?.msgId ??
          Date.now()
      );

      return {
        id,
        raw: {
          externalThreadId: thread.externalThreadId,
          id,
          isSelf: true,
          response,
          text,
          threadId,
          threadType: thread.threadType,
          ts: Date.now(),
        },
        threadId,
      };
    },
    removeReaction: async () => {
      throw unsupported('reaction');
    },
    renderFormatted: (content: FormattedContent) => stringifyMarkdown(content),
    startPersonalListener: async () => {
      const apiInstance = await connect();
      attachListeners(apiInstance);
      apiInstance.listener.start({ retryOnClose: true });

      return setStatus({
        connected: true,
        lastError: null,
        running: true,
        startedAt: status.startedAt ?? new Date().toISOString(),
      });
    },
    startTyping: async (threadId) => {
      const apiInstance = await connect();
      const thread = decodeThreadId(threadId);
      await apiInstance.sendTypingEvent(
        thread.externalThreadId,
        thread.threadType
      );
    },
    stopPersonalListener: async () => {
      api?.listener.stop();

      return setStatus({
        connected: false,
        running: false,
      });
    },
    stream: async (
      threadId,
      textStream: AsyncIterable<string | StreamChunk>,
      _options?: StreamOptions
    ): Promise<RawMessage<ZaloPersonalRawMessage> | null> => {
      let text = '';

      for await (const chunk of textStream) {
        if (typeof chunk === 'string') {
          text += chunk;
        } else if (chunk.type === 'markdown_text') {
          text += chunk.text;
        }
      }

      return adapter.postMessage(threadId, text.trim() || 'Done.');
    },
    userName: config.displayName,
    validateLogin: async () => {
      const apiInstance = await connect();

      return setStatus({
        connected: true,
        lastError: null,
        ownId: apiInstance.getOwnId() || status.ownId,
      });
    },
  };

  return adapter;
}

function dateFromZaloTimestamp(value: string) {
  const numeric = Number.parseInt(value, 10);

  if (!Number.isFinite(numeric)) {
    return new Date();
  }

  return new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
}

function extractPostableText(message: AdapterPostableMessage) {
  if (typeof message === 'string') {
    return message;
  }

  if (isRecord(message)) {
    if (typeof message.markdown === 'string') {
      return message.markdown;
    }

    if (typeof message.text === 'string') {
      return message.text;
    }

    if (isRecord(message.ast)) {
      return stringifyMarkdown(message.ast as unknown as FormattedContent);
    }
  }

  return String(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSentRaw(value: unknown): value is ZaloPersonalSentRaw {
  return isRecord(value) && value.isSelf === true && 'response' in value;
}
