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
  type FriendEvent,
  FriendEventType,
  GroupMessage,
  type LoginQRCallbackEvent,
  LoginQRCallbackEventType,
  ThreadType,
  UserMessage,
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

export const ZALO_PERSONAL_QR_TTL_MS = 100_000;

export type ZaloPersonalQrLoginEvent =
  | {
      actions: ZaloPersonalQrLoginActions;
      expiresAt: string;
      qrImageDataUrl: string;
      type: 'qr_generated';
    }
  | {
      actions: ZaloPersonalQrLoginActions;
      type: 'qr_expired';
    }
  | {
      actions: ZaloPersonalQrLoginActions;
      scannedProfile: ZaloPersonalQrScannedProfile;
      type: 'qr_scanned';
    }
  | {
      actions: ZaloPersonalQrLoginActions;
      type: 'qr_declined';
    }
  | {
      type: 'credentials_ready';
    }
  | {
      ownId: string | null;
      type: 'authenticated';
    };

export interface ZaloPersonalQrLoginActions {
  abort: () => unknown;
  retry: () => unknown;
}

export interface ZaloPersonalQrScannedProfile {
  avatar: string | null;
  displayName: string | null;
}

export interface ZaloPersonalQrLoginCredentials {
  cookieJson: string;
  imei: string;
  userAgent: string;
}

export interface ZaloPersonalQrLoginResult {
  api: API;
  credentials: ZaloPersonalQrLoginCredentials;
  ownId: string | null;
}

export interface ZaloPersonalQrLoginOptions {
  language?: string;
  userAgent?: string;
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

export interface ZaloPersonalFriendRequestRaw {
  externalThreadId: string;
  id: string;
  kind: 'friend_request';
  original: FriendEvent;
  senderId: string;
  text: string;
  threadId: string;
  ts: number;
}

export type ZaloPersonalRawMessage =
  | ZcaMessage
  | ZaloPersonalFriendRequestRaw
  | ZaloPersonalSentRaw;

export interface ZaloPersonalHistorySyncOptions {
  includeGroups?: boolean;
  includeListenerBackfill?: boolean;
  includeUsers?: boolean;
  maxGroups?: number;
  maxPagesPerType?: number;
  messagesPerGroup?: number;
  pageTimeoutMs?: number;
}

export interface ZaloPersonalHistorySyncResult {
  exhausted: boolean;
  failedGroupHistories: number;
  groupMessages: number;
  groupsScanned: number;
  messages: Message<ZaloPersonalRawMessage>[];
  pageCount: number;
  threads: ThreadInfo[];
  timedOut: boolean;
  userMessages: number;
}

export interface ZaloPersonalPhoneSyncOptions {
  fromSeqId?: number;
  maxPulls?: number;
  minSeqId?: number;
  pullDelayMs?: number;
  signal?: AbortSignal;
  tempKey?: string;
  useListenerWakeup?: boolean;
}

export type ZaloPersonalPhoneSyncStatus =
  | 'completed'
  | 'completed_no_payload'
  | 'failed'
  | 'partial'
  | 'waiting_for_phone';

export interface ZaloPersonalPhoneSyncResult {
  approvalRequested: boolean;
  cleaned: boolean;
  error: string | null;
  groupMessages: number;
  messages: Message<ZaloPersonalRawMessage>[];
  pullAttempts: number;
  requestAccepted: boolean;
  requestHttpError: string | null;
  requestViaHttp: boolean;
  requestViaWebSocket: boolean;
  status: ZaloPersonalPhoneSyncStatus;
  userMessages: number;
}

export type ZaloPersonalAdapter = Adapter<
  ZaloPersonalThreadRef,
  ZaloPersonalRawMessage
> & {
  getPersonalStatus(): ZaloPersonalStatus;
  startPersonalListener(): Promise<ZaloPersonalStatus>;
  stopPersonalListener(): Promise<ZaloPersonalStatus>;
  syncPersonalHistory(
    options?: ZaloPersonalHistorySyncOptions
  ): Promise<ZaloPersonalHistorySyncResult>;
  syncPersonalPhoneHistory(
    options?: ZaloPersonalPhoneSyncOptions
  ): Promise<ZaloPersonalPhoneSyncResult>;
  validateLogin(): Promise<ZaloPersonalStatus>;
};

const THREAD_ID_PREFIX = 'zalo-personal';
const DEFAULT_HISTORY_MAX_GROUPS = 1000;
const DEFAULT_HISTORY_MAX_PAGES_PER_TYPE = 1000;
const DEFAULT_HISTORY_MESSAGES_PER_GROUP = 200;
const DEFAULT_HISTORY_PAGE_TIMEOUT_MS = 8000;
const HISTORY_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_PHONE_SYNC_MAX_PULLS = 4;
const DEFAULT_PHONE_SYNC_PULL_DELAY_MS = 20_000;
const PHONE_SYNC_PC_NAME_MAX_LENGTH = 80;
const ZALO_LISTENER_SOCKET_OPEN_STATE = 1;
const ZALO_PHONE_SYNC_REQUEST_CMD = 590;
const ZALO_PHONE_SYNC_WAKEUP_CMD = 592;
const PHONE_SYNC_TRANSFER_API_MARKER =
  '__tuturuuuZaloPersonalTransferApisAttached';

type ZaloPersonalTransferApi = API & {
  [PHONE_SYNC_TRANSFER_API_MARKER]?: true;
  tuturuuuCancelMobileMessages?: (
    props: ZaloPersonalPhoneSyncPublicKeyProps
  ) => Promise<unknown>;
  tuturuuuCleanMobileSync?: (
    props: ZaloPersonalPhoneSyncPublicKeyProps
  ) => Promise<unknown>;
  tuturuuuGetBackupMsgInfo?: (
    props?: ZaloPersonalPhoneSyncRetryProps
  ) => Promise<unknown>;
  tuturuuuGetCrossDb?: (
    props: ZaloPersonalPhoneSyncCrossDbProps
  ) => Promise<unknown>;
  tuturuuuPullMobileMessages?: (
    props: ZaloPersonalPhoneSyncPullProps
  ) => Promise<unknown>;
  tuturuuuRequestPhoneSync?: (
    props: ZaloPersonalPhoneSyncRequestProps
  ) => Promise<unknown>;
};

interface ZaloPersonalThreadProfile {
  avatarUrl: string | null;
  title: string | null;
}

interface ZaloPersonalPhoneSyncCrossDbProps {
  retry?: number;
  syncSession: string;
}

interface ZaloPersonalPhoneSyncPublicKeyProps {
  publicKey: string;
}

interface ZaloPersonalPhoneSyncPullProps {
  fromSeqId: number;
  isRetry: number;
  minSeqId: number;
  publicKey: string;
  tempKey: string;
}

interface ZaloPersonalPhoneSyncRequestProps {
  data: Record<string, unknown>;
  reqId: string;
}

interface ZaloPersonalPhoneSyncRetryProps {
  retry?: number;
}

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

export async function loginZaloPersonalWithQr(
  options: ZaloPersonalQrLoginOptions = {},
  onEvent?: (event: ZaloPersonalQrLoginEvent) => void | Promise<void>
): Promise<ZaloPersonalQrLoginResult> {
  let credentials: ZaloPersonalQrLoginCredentials | null = null;
  let rejectTerminal: ((error: Error) => void) | null = null;
  const terminal = new Promise<never>((_, reject) => {
    rejectTerminal = reject;
  });

  const zalo = new Zalo();
  const apiPromise = zalo.loginQR(
    {
      language: options.language,
      userAgent: options.userAgent,
    },
    (event) => {
      if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
        credentials = {
          cookieJson: JSON.stringify(event.data.cookie),
          imei: event.data.imei,
          userAgent: event.data.userAgent,
        };
      }

      handleQrLoginEvent(event, (loginEvent) => {
        if (loginEvent.type === 'qr_declined') {
          rejectTerminal?.(new Error('zalo_personal_qr_declined'));
          loginEvent.actions.abort();
        } else if (loginEvent.type === 'qr_expired') {
          rejectTerminal?.(new Error('zalo_personal_qr_expired'));
        }

        void Promise.resolve(onEvent?.(loginEvent)).catch(() => undefined);
      });
    }
  );

  void apiPromise.catch(() => undefined);
  const api = await Promise.race([apiPromise, terminal]);

  if (!credentials) {
    throw new Error('zalo_personal_qr_credentials_missing');
  }

  const ownId = api.getOwnId() || null;
  await Promise.resolve(onEvent?.({ ownId, type: 'authenticated' })).catch(
    () => undefined
  );

  return {
    api,
    credentials,
    ownId,
  };
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
  const groupProfileCache = new Map<string, ZaloPersonalThreadProfile | null>();
  const userProfileCache = new Map<string, ZaloPersonalThreadProfile | null>();

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

  function toThreadInfo(
    ref: ZaloPersonalThreadRef,
    profile: ZaloPersonalThreadProfile | null
  ): ThreadInfo {
    const threadType = ref.threadType === ThreadType.Group ? 'group' : 'user';

    return {
      channelId: config.channelId,
      channelName: config.displayName,
      id: encodeThreadId(ref),
      isDM: ref.threadType === ThreadType.User,
      metadata: {
        accountMode: 'personal',
        authorAvatarUrl: profile?.avatarUrl ?? null,
        externalThreadId: ref.externalThreadId,
        threadTitle: profile?.title ?? null,
        threadType,
      },
    };
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
    apiInstance.listener.on('friend_event', (event) => {
      void handleFriendEvent(event);
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

  async function handleFriendEvent(event: FriendEvent) {
    if (
      event.type !== FriendEventType.REQUEST ||
      event.isSelf ||
      !isRecord(event.data) ||
      typeof event.data.message !== 'string' ||
      !event.data.message.trim() ||
      typeof event.data.fromUid !== 'string' ||
      !event.data.fromUid.trim()
    ) {
      return;
    }

    const senderId = event.data.fromUid.trim();
    const threadId = encodeThreadId({
      externalThreadId: senderId,
      threadType: ThreadType.User,
    });
    const raw: ZaloPersonalFriendRequestRaw = {
      externalThreadId: senderId,
      id: `friend-request:${senderId}:${Date.now()}`,
      kind: 'friend_request',
      original: event,
      senderId,
      text: event.data.message.trim(),
      threadId,
      ts: Date.now(),
    };
    const sdkMessage = adapter.parseMessage(raw);
    setStatus({ lastEventAt: new Date(raw.ts).toISOString() });

    await chat?.processMessage(adapter, threadId, sdkMessage, {
      waitUntil: (task) => {
        void task.catch((error) => {
          setStatus({
            lastError: error instanceof Error ? error.message : String(error),
          });
        });
      },
    });
  }

  async function waitForListenerConnection(apiInstance: API) {
    if (isZaloListenerSocketOpen(apiInstance.listener)) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        removeZaloListener(
          apiInstance.listener,
          'connected',
          onConnected as (...args: unknown[]) => void
        );
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onConnected = () => {
        if (isZaloListenerSocketOpen(apiInstance.listener)) {
          finish();
        }
      };
      const timer = setTimeout(finish, HISTORY_CONNECT_TIMEOUT_MS);

      apiInstance.listener.on('connected', onConnected);
      void Promise.resolve().then(() => {
        if (isZaloListenerSocketOpen(apiInstance.listener)) {
          finish();
        }
      });
    });
  }

  async function requestOldMessagePage({
    apiInstance,
    lastMsgId,
    pageTimeoutMs,
    threadType,
  }: {
    apiInstance: API;
    lastMsgId: string | null;
    pageTimeoutMs: number;
    threadType: ThreadType;
  }): Promise<{
    messages: ZcaMessage[];
    timedOut: boolean;
  }> {
    return await new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        clearTimeout(timer);
        removeZaloListener(
          apiInstance.listener,
          'old_messages',
          onMessages as (...args: unknown[]) => void
        );
      };
      const finish = (messages: ZcaMessage[], timedOut: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ messages, timedOut });
      };
      const onMessages = (messages: ZcaMessage[], type: ThreadType) => {
        if (type !== threadType) return;
        finish(messages, false);
      };
      const timer = setTimeout(
        () => finish([], true),
        Math.max(1000, pageTimeoutMs)
      );

      apiInstance.listener.on('old_messages', onMessages);
      apiInstance.listener.requestOldMessages(threadType, lastMsgId);
    });
  }

  async function syncThreadTypeHistory({
    apiInstance,
    maxPages,
    pageTimeoutMs,
    threadType,
  }: {
    apiInstance: API;
    maxPages: number;
    pageTimeoutMs: number;
    threadType: ThreadType;
  }) {
    const messages: Message<ZaloPersonalRawMessage>[] = [];
    const seen = new Set<string>();
    let exhausted = false;
    let lastMsgId: string | null = null;
    let pageCount = 0;
    let timedOut = false;

    for (let page = 0; page < maxPages; page += 1) {
      const pageResult = await requestOldMessagePage({
        apiInstance,
        lastMsgId,
        pageTimeoutMs,
        threadType,
      });
      pageCount += 1;

      if (pageResult.timedOut) {
        timedOut = true;
        break;
      }

      if (pageResult.messages.length === 0) {
        exhausted = true;
        break;
      }

      let newMessages = 0;

      for (const raw of pageResult.messages) {
        const id = zaloMessageUniqueKey(raw);
        if (seen.has(id)) continue;

        seen.add(id);
        messages.push(adapter.parseMessage(raw));
        newMessages += 1;
      }

      const nextLastMsgId = getOldestZaloMessageId(pageResult.messages);

      if (!nextLastMsgId || nextLastMsgId === lastMsgId || newMessages === 0) {
        exhausted = true;
        break;
      }

      lastMsgId = nextLastMsgId;
    }

    return {
      exhausted,
      messages,
      pageCount,
      timedOut,
    };
  }

  async function syncEnumeratedGroupHistory({
    apiInstance,
    maxGroups,
    messagesPerGroup,
  }: {
    apiInstance: API;
    maxGroups: number;
    messagesPerGroup: number;
  }) {
    const messages: Message<ZaloPersonalRawMessage>[] = [];
    const seen = new Set<string>();
    const threads: ThreadInfo[] = [];
    let failedGroupHistories = 0;
    const groups = await apiInstance.getAllGroups().catch((error) => {
      failedGroupHistories += 1;
      setStatus({
        lastError: error instanceof Error ? error.message : String(error),
      });

      return null;
    });
    if (!groups) {
      return {
        failedGroupHistories,
        groupsScanned: 0,
        messages,
        threads,
      };
    }

    const groupIds = await collectZaloGroupIds({
      apiInstance,
      groups,
      maxGroups,
    });

    for (const groupId of groupIds) {
      const profile = await getZaloGroupThreadProfile(apiInstance, groupId);
      threads.push(
        toThreadInfo(
          {
            externalThreadId: groupId,
            threadType: ThreadType.Group,
          },
          profile
        )
      );

      try {
        const history = await apiInstance.getGroupChatHistory(
          groupId,
          messagesPerGroup
        );

        for (const raw of history.groupMsgs) {
          const id = zaloMessageUniqueKey(raw);
          if (seen.has(id)) continue;

          seen.add(id);
          messages.push(adapter.parseMessage(raw));
        }
      } catch (error) {
        failedGroupHistories += 1;
        setStatus({
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      failedGroupHistories,
      groupsScanned: groupIds.length,
      messages,
      threads,
    };
  }

  async function collectZaloGroupIds({
    apiInstance,
    groups,
    maxGroups,
  }: {
    apiInstance: API;
    groups: { gridVerMap?: Record<string, unknown> };
    maxGroups: number;
  }) {
    const groupIds = new Set(Object.keys(groups.gridVerMap ?? {}));

    const hidden = await apiInstance.getHiddenConversations().catch(() => null);

    for (const thread of hidden?.threads ?? []) {
      if (thread.is_group === 1 && thread.thread_id) {
        groupIds.add(thread.thread_id);
      }
    }

    const pinned = await apiInstance.getPinConversations().catch(() => null);

    for (const conversationId of pinned?.conversations ?? []) {
      if (isLikelyZaloGroupId(conversationId)) {
        groupIds.add(conversationId);
      }
    }

    const archived = await apiInstance.getArchivedChatList().catch(() => null);

    for (const groupId of extractZaloGroupIds(archived)) {
      groupIds.add(groupId);
    }

    return [...groupIds].slice(0, maxGroups);
  }

  async function getZaloGroupThreadProfile(
    apiInstance: API,
    groupId: string
  ): Promise<ZaloPersonalThreadProfile | null> {
    if (groupProfileCache.has(groupId)) {
      return groupProfileCache.get(groupId) ?? null;
    }

    const profile = await apiInstance
      .getGroupInfo(groupId)
      .then((result) => {
        const normalizedGroupId = groupId.replace(/^g/u, '');
        const info =
          result.gridInfoMap?.[groupId] ??
          result.gridInfoMap?.[normalizedGroupId];

        if (!info) return null;

        return {
          avatarUrl: stringValue(info.fullAvt || info.avt) || null,
          title: stringValue(info.name) || null,
        };
      })
      .catch(() => null);

    groupProfileCache.set(groupId, profile);

    return profile;
  }

  async function getZaloUserThreadProfile(
    apiInstance: API,
    userId: string
  ): Promise<ZaloPersonalThreadProfile | null> {
    if (userProfileCache.has(userId)) {
      return userProfileCache.get(userId) ?? null;
    }

    const profile = await apiInstance
      .getUserInfo(userId)
      .then((result) => {
        const changedProfiles = Object.values(result.changed_profiles ?? {});
        const info =
          result.changed_profiles?.[userId] ??
          result.changed_profiles?.[`${userId}_0`] ??
          changedProfiles.find((candidate) => candidate.userId === userId) ??
          null;

        if (!info) return null;

        return {
          avatarUrl: stringValue(info.avatar) || null,
          title:
            stringValue(info.displayName) ||
            stringValue(info.zaloName) ||
            stringValue(info.username) ||
            null,
        };
      })
      .catch(() => null);

    userProfileCache.set(userId, profile);

    return profile;
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
      const apiInstance = await connect();
      const thread = decodeThreadId(threadId);
      const profile =
        thread.threadType === ThreadType.Group
          ? await getZaloGroupThreadProfile(
              apiInstance,
              thread.externalThreadId
            )
          : await getZaloUserThreadProfile(
              apiInstance,
              thread.externalThreadId
            );
      return toThreadInfo(thread, profile);
    },
    getPersonalStatus: () => status,
    getUser: async (userId): Promise<UserInfo | null> => {
      const apiInstance = await connect();
      const profile = await getZaloUserThreadProfile(apiInstance, userId);

      return {
        fullName: profile?.title ?? userId,
        isBot: false,
        userId,
        userName: profile?.title ?? userId,
      };
    },
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

      if (isFriendRequestRaw(raw)) {
        return new Message<ZaloPersonalRawMessage>({
          attachments: [],
          author: {
            fullName: raw.senderId,
            isBot: false,
            isMe: false,
            userId: raw.senderId,
            userName: raw.senderId,
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
      if (status.running && isZaloListenerSocketOpen(apiInstance.listener)) {
        return status;
      }
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
    syncPersonalHistory: async (options = {}) => {
      const apiInstance = await connect();

      const maxPages = Math.max(
        1,
        options.maxPagesPerType ?? DEFAULT_HISTORY_MAX_PAGES_PER_TYPE
      );
      const pageTimeoutMs =
        options.pageTimeoutMs ?? DEFAULT_HISTORY_PAGE_TIMEOUT_MS;
      const includeUsers = options.includeUsers ?? true;
      const includeGroups = options.includeGroups ?? true;
      const includeListenerBackfill = options.includeListenerBackfill ?? true;
      const maxGroups = Math.max(
        1,
        options.maxGroups ?? DEFAULT_HISTORY_MAX_GROUPS
      );
      const messagesPerGroup = Math.max(
        1,
        options.messagesPerGroup ?? DEFAULT_HISTORY_MESSAGES_PER_GROUP
      );

      if (includeListenerBackfill && (includeUsers || includeGroups)) {
        attachListeners(apiInstance);
        await adapter.startPersonalListener();
        await waitForListenerConnection(apiInstance);
      }

      const userResult =
        includeUsers && includeListenerBackfill
          ? await syncThreadTypeHistory({
              apiInstance,
              maxPages,
              pageTimeoutMs,
              threadType: ThreadType.User,
            })
          : { exhausted: true, messages: [], pageCount: 0, timedOut: false };
      const groupResult =
        includeGroups && includeListenerBackfill
          ? await syncThreadTypeHistory({
              apiInstance,
              maxPages,
              pageTimeoutMs,
              threadType: ThreadType.Group,
            })
          : { exhausted: true, messages: [], pageCount: 0, timedOut: false };
      const enumeratedGroupResult = includeGroups
        ? await syncEnumeratedGroupHistory({
            apiInstance,
            maxGroups,
            messagesPerGroup,
          })
        : {
            failedGroupHistories: 0,
            groupsScanned: 0,
            messages: [],
            threads: [],
          };
      const messages = dedupeSdkMessages([
        ...userResult.messages,
        ...groupResult.messages,
        ...enumeratedGroupResult.messages,
      ]).sort(
        (a, b) => a.metadata.dateSent.getTime() - b.metadata.dateSent.getTime()
      );
      const userMessages = messages.filter(
        (message) =>
          decodeThreadId(message.threadId).threadType === ThreadType.User
      ).length;
      const groupMessages = messages.length - userMessages;
      const now = new Date().toISOString();

      setStatus({
        lastError:
          userResult.timedOut || groupResult.timedOut
            ? 'zalo_personal_history_sync_timed_out'
            : enumeratedGroupResult.failedGroupHistories > 0
              ? 'zalo_personal_history_sync_partial'
              : null,
        lastEventAt: messages.at(-1)?.metadata.dateSent.toISOString() ?? now,
      });

      return {
        exhausted:
          userResult.exhausted &&
          groupResult.exhausted &&
          enumeratedGroupResult.failedGroupHistories === 0,
        failedGroupHistories: enumeratedGroupResult.failedGroupHistories,
        groupMessages,
        groupsScanned: enumeratedGroupResult.groupsScanned,
        messages,
        pageCount: userResult.pageCount + groupResult.pageCount,
        threads: dedupeThreads(enumeratedGroupResult.threads),
        timedOut: userResult.timedOut || groupResult.timedOut,
        userMessages,
      };
    },
    syncPersonalPhoneHistory: async (options = {}) => {
      const apiInstance = await connect();
      const transferApi = attachZaloPersonalTransferApis(apiInstance, config);
      const keyPair = await generatePhoneSyncKeyPair();
      const requestId = createPhoneSyncRequestId();
      const publicKey = keyPair.publicKeyBase64;
      const maxPulls = Math.max(
        1,
        options.maxPulls ?? DEFAULT_PHONE_SYNC_MAX_PULLS
      );
      const pullDelayMs = Math.max(
        250,
        options.pullDelayMs ?? DEFAULT_PHONE_SYNC_PULL_DELAY_MS
      );
      let fromSeqId = Math.max(0, options.fromSeqId ?? 0);
      let minSeqId = Math.max(0, options.minSeqId ?? 0);
      let tempKey = options.tempKey ?? '';
      let requestViaHttp = false;
      let requestViaWebSocket = false;
      let requestAccepted = false;
      let requestHttpError: string | null = null;
      let cleaned = false;
      let lastError: string | null = null;
      let pullAttempts = 0;
      const messages: Message<ZaloPersonalRawMessage>[] = [];

      const syncPayload = buildPhoneSyncPayload({
        config,
        publicKey,
        requestId,
      });
      const useListenerWakeup = options.useListenerWakeup ?? true;

      try {
        assertPhoneSyncNotAborted(options.signal);

        if (useListenerWakeup) {
          attachListeners(apiInstance);
          await adapter.startPersonalListener();
          await waitForListenerConnection(apiInstance);
          requestViaWebSocket = sendPhoneSyncApprovalRequest({
            apiInstance,
            payload: syncPayload,
            requestId,
          });
        }

        if (!requestViaWebSocket) {
          try {
            await transferApi.tuturuuuRequestPhoneSync?.({
              data: syncPayload,
              reqId: requestId,
            });
            requestViaHttp = true;
          } catch (error) {
            requestHttpError = toSafePhoneSyncError(error);
            throw error;
          }
        }

        requestAccepted = requestViaWebSocket || requestViaHttp;

        if (!requestAccepted) {
          throw new Error('zalo_personal_phone_sync_request_not_sent');
        }

        for (let attempt = 0; attempt < maxPulls; attempt += 1) {
          await delay(pullDelayMs, options.signal);
          assertPhoneSyncNotAborted(options.signal);

          try {
            const pullResponse = await transferApi.tuturuuuPullMobileMessages?.(
              {
                fromSeqId,
                isRetry: attempt > 0 ? 1 : 0,
                minSeqId,
                publicKey,
                tempKey,
              }
            );
            pullAttempts += 1;
            const decodedResponse = await decodePhoneSyncResponse(
              pullResponse,
              keyPair.privateKeyPem
            );
            const batchMessages = collectPhoneSyncMessages(
              decodedResponse,
              status.ownId ?? config.ownId ?? ''
            ).map((raw) => adapter.parseMessage(raw));

            messages.push(...batchMessages);
            const nextSeqId = findPhoneSyncSequenceId(decodedResponse);
            const nextMinSeqId = findPhoneSyncMinSequenceId(decodedResponse);
            const nextTempKey = findPhoneSyncTempKey(decodedResponse);

            if (typeof nextSeqId === 'number' && nextSeqId > fromSeqId) {
              fromSeqId = nextSeqId;
            }

            if (typeof nextMinSeqId === 'number' && nextMinSeqId > minSeqId) {
              minSeqId = nextMinSeqId;
            }

            if (nextTempKey !== null) {
              tempKey = nextTempKey;
            }

            if (
              batchMessages.length > 0 &&
              !phoneSyncResponseHasMore(decodedResponse)
            ) {
              break;
            }
          } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);

            if (!isPhoneSyncApprovalPendingError(lastError)) {
              throw error;
            }
          }
        }
      } catch (error) {
        lastError = options.signal?.aborted
          ? 'zalo_personal_phone_sync_cancelled'
          : error instanceof Error
            ? error.message
            : String(error);
      } finally {
        if (requestAccepted && messages.length > 0) {
          cleaned =
            (await transferApi
              .tuturuuuCleanMobileSync?.({ publicKey })
              .then(() => true)
              .catch(() => false)) ?? false;
        } else if (
          requestAccepted &&
          lastError &&
          messages.length === 0 &&
          !isPhoneSyncApprovalPendingError(lastError)
        ) {
          await transferApi
            .tuturuuuCancelMobileMessages?.({ publicKey })
            .catch(() => undefined);
        }
      }

      const dedupedMessages = dedupeSdkMessages(messages).sort(
        (a, b) => a.metadata.dateSent.getTime() - b.metadata.dateSent.getTime()
      );
      const userMessages = dedupedMessages.filter(
        (message) =>
          decodeThreadId(message.threadId).threadType === ThreadType.User
      ).length;
      const groupMessages = dedupedMessages.length - userMessages;
      const statusValue = getPhoneSyncStatus({
        lastError,
        messages: dedupedMessages,
        pullAttempts,
        requestAccepted,
      });

      setStatus({
        lastError:
          statusValue === 'completed'
            ? null
            : statusValue === 'completed_no_payload'
              ? 'zalo_personal_phone_sync_no_payload'
              : (lastError ?? 'zalo_personal_phone_sync_waiting_for_phone'),
        lastEventAt:
          dedupedMessages.at(-1)?.metadata.dateSent.toISOString() ??
          new Date().toISOString(),
      });

      return {
        approvalRequested: requestAccepted,
        cleaned,
        error: statusValue === 'completed' ? null : lastError,
        groupMessages,
        messages: dedupedMessages,
        pullAttempts,
        requestAccepted,
        requestHttpError,
        requestViaHttp,
        requestViaWebSocket,
        status: statusValue,
        userMessages,
      };
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

function attachZaloPersonalTransferApis(
  apiInstance: API,
  config: ZaloPersonalAdapterConfig
) {
  const scoped = apiInstance as ZaloPersonalTransferApi;

  if (scoped[PHONE_SYNC_TRANSFER_API_MARKER]) {
    return scoped;
  }

  scoped.custom<unknown, ZaloPersonalPhoneSyncRequestProps>(
    'tuturuuuRequestPhoneSync',
    async ({ props, utils }) =>
      zaloPersonalTransferGet({
        baseUrl: `${scoped.zpwServiceMap.file[0]}/api/transfer-sync-v2/request-sync`,
        params: {
          data: JSON.stringify(props.data),
          reqId: String(props.reqId),
        },
        utils,
      })
  );
  scoped.custom<unknown, ZaloPersonalPhoneSyncPullProps>(
    'tuturuuuPullMobileMessages',
    async ({ props, utils }) =>
      zaloPersonalTransferGet({
        baseUrl: `${scoped.zpwServiceMap.file[0]}/api/message/pull_mobile_msg`,
        params: {
          from_seq_id: props.fromSeqId > 0 ? props.fromSeqId + 1 : 0,
          imei: config.imei,
          is_retry: props.isRetry,
          min_seq_id: props.minSeqId,
          pc_name: getPhoneSyncPcName(config.displayName),
          public_key: props.publicKey,
          temp_key: props.tempKey,
        },
        utils,
      })
  );
  scoped.custom<unknown, ZaloPersonalPhoneSyncPublicKeyProps>(
    'tuturuuuCancelMobileMessages',
    async ({ props, utils }) =>
      zaloPersonalTransferGet({
        baseUrl: `${scoped.zpwServiceMap.file[0]}/api/message/cancel_pull_mobile_msg`,
        params: {
          imei: config.imei,
          pc_name: getPhoneSyncPcName(config.displayName),
          public_key: props.publicKey,
        },
        utils,
      })
  );
  scoped.custom<unknown, ZaloPersonalPhoneSyncPublicKeyProps>(
    'tuturuuuCleanMobileSync',
    async ({ props, utils }) =>
      zaloPersonalTransferGet({
        baseUrl: `${scoped.zpwServiceMap.file[0]}/api/message/delete_snapshot_mobile_msg`,
        params: {
          imei: config.imei,
          public_key: props.publicKey,
        },
        utils,
      })
  );
  scoped.custom<unknown, ZaloPersonalPhoneSyncCrossDbProps>(
    'tuturuuuGetCrossDb',
    async ({ props, utils }) =>
      zaloPersonalTransferGet({
        baseUrl: `${scoped.zpwServiceMap.file[0]}/api/message/get_crossdb`,
        headers:
          typeof props.retry === 'number'
            ? { nretry: String(props.retry) }
            : undefined,
        params: {
          pc_name: getPhoneSyncPcName(config.displayName),
          sync_session: props.syncSession,
        },
        utils,
      })
  );
  scoped.custom<unknown, ZaloPersonalPhoneSyncRetryProps | undefined>(
    'tuturuuuGetBackupMsgInfo',
    async ({ props, utils }) => {
      const response = await utils.request(
        utils.makeURL(
          `${scoped.zpwServiceMap.file[0]}/api/message/get_backupmsginfo`
        ),
        {
          headers:
            typeof props?.retry === 'number'
              ? { nretry: String(props.retry) }
              : undefined,
          method: 'GET',
        }
      );

      return utils.resolve(response, (result) =>
        normalizeZaloResponseData(result.data)
      );
    }
  );

  Object.defineProperty(scoped, PHONE_SYNC_TRANSFER_API_MARKER, {
    enumerable: false,
    value: true,
  });

  return scoped;
}

async function zaloPersonalTransferGet({
  baseUrl,
  headers,
  params,
  utils,
}: {
  baseUrl: string;
  headers?: Record<string, string>;
  params: Record<string, unknown>;
  utils: Parameters<Parameters<API['custom']>[1]>[0]['utils'];
}) {
  const encryptedParams = utils.encodeAES(JSON.stringify(params));

  if (!encryptedParams) {
    throw new Error('zalo_personal_phone_sync_encrypt_failed');
  }

  const response = await utils.request(
    utils.makeURL(baseUrl, { params: encryptedParams }),
    {
      headers,
      method: 'GET',
    }
  );

  return utils.resolve(response, (result) =>
    normalizeZaloResponseData(result.data)
  );
}

async function generatePhoneSyncKeyPair() {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: {
      format: 'pem',
      type: 'pkcs8',
    },
    publicExponent: 0x10001,
    publicKeyEncoding: {
      format: 'der',
      type: 'spki',
    },
  });

  return {
    privateKeyPem: privateKey,
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
  };
}

function createPhoneSyncRequestId() {
  return `tuturuuu-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildPhoneSyncPayload({
  config,
  publicKey,
  requestId,
}: {
  config: ZaloPersonalAdapterConfig;
  publicKey: string;
  requestId: string;
}) {
  return {
    app: 'tuturuuu-chat',
    imei: config.imei,
    pc_name: getPhoneSyncPcName(config.displayName),
    platform: 'web',
    public_key: publicKey,
    req_id: requestId,
    scopes: ['conversation', 'preview', 'message'],
    sync_states: ['sync-conversation', 'sync-preview', 'sync-other'],
    sync_version: 2,
    ts: Date.now(),
  };
}

function getPhoneSyncPcName(displayName?: string) {
  const normalized = (displayName || 'Tuturuuu Chat')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized.slice(0, PHONE_SYNC_PC_NAME_MAX_LENGTH) || 'Tuturuuu Chat';
}

function sendPhoneSyncApprovalRequest({
  apiInstance,
  payload,
  requestId,
}: {
  apiInstance: API;
  payload: Record<string, unknown>;
  requestId: string;
}) {
  const requestSent = sendPhoneSyncWebSocket(apiInstance, {
    cmd: ZALO_PHONE_SYNC_REQUEST_CMD,
    data: {
      data: payload,
      reqId: requestId,
    },
    subCmd: 0,
    version: 1,
  });

  if (requestSent) {
    sendPhoneSyncMobileWakeup(apiInstance, payload);
  }

  return requestSent;
}

function sendPhoneSyncMobileWakeup(
  apiInstance: API,
  payload: Record<string, unknown>
) {
  sendPhoneSyncWebSocket(apiInstance, {
    cmd: ZALO_PHONE_SYNC_WAKEUP_CMD,
    data: {
      ...payload,
      reqId: createPhoneSyncRequestId(),
    },
    subCmd: 0,
    version: 1,
  });
}

type PhoneSyncWebSocketPayload = {
  cmd: number;
  data: Record<string, unknown>;
  subCmd: number;
  version: number;
};

function sendPhoneSyncWebSocket(
  apiInstance: API,
  payload: PhoneSyncWebSocketPayload
) {
  if (!isZaloListenerSocketOpen(apiInstance.listener)) return false;

  const listenerWithSender = apiInstance.listener as API['listener'] & {
    sendWs?: (payload: PhoneSyncWebSocketPayload, requireId?: boolean) => void;
  };

  try {
    listenerWithSender.sendWs?.(payload, false);
    return true;
  } catch {
    return false;
  }
}

async function decodePhoneSyncResponse(
  value: unknown,
  privateKeyPem: string
): Promise<unknown> {
  const normalized = normalizeZaloResponseData(value);
  const encryptedPayload = findEncryptedPhoneSyncPayload(normalized);

  if (!encryptedPayload) {
    return normalized;
  }

  const decrypted = await decryptPhoneSyncPayload(
    encryptedPayload,
    privateKeyPem
  ).catch(() => null);

  return decrypted === null ? normalized : normalizeZaloResponseData(decrypted);
}

async function decryptPhoneSyncPayload(payload: string, privateKeyPem: string) {
  const { constants, privateDecrypt } = await import('node:crypto');
  const decrypted = privateDecrypt(
    {
      key: privateKeyPem,
      oaepHash: 'sha256',
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(payload, 'base64')
  );

  return decrypted.toString('utf8');
}

function normalizeZaloResponseData(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function collectPhoneSyncMessages(value: unknown, ownId: string): ZcaMessage[] {
  const messages: ZcaMessage[] = [];
  const seen = new Set<string>();

  collectPhoneSyncMessagesRecursive({
    hint: null,
    messages,
    ownId,
    seen,
    value,
  });

  return messages;
}

function collectPhoneSyncMessagesRecursive({
  hint,
  messages,
  ownId,
  seen,
  value,
}: {
  hint: ThreadType | null;
  messages: ZcaMessage[];
  ownId: string;
  seen: Set<string>;
  value: unknown;
}) {
  const normalizedValue = normalizeZaloResponseData(value);

  if (Array.isArray(normalizedValue)) {
    for (const item of normalizedValue) {
      collectPhoneSyncMessagesRecursive({
        hint,
        messages,
        ownId,
        seen,
        value: item,
      });
    }

    return;
  }

  if (!isRecord(normalizedValue)) {
    return;
  }

  const directMessage = toPhoneSyncZcaMessage(normalizedValue, ownId, hint);

  if (directMessage) {
    const key = zaloMessageUniqueKey(directMessage);
    if (!seen.has(key)) {
      seen.add(key);
      messages.push(directMessage);
    }
  }

  for (const [key, child] of Object.entries(normalizedValue)) {
    collectPhoneSyncMessagesRecursive({
      hint: phoneSyncThreadHintFromKey(key) ?? hint,
      messages,
      ownId,
      seen,
      value: child,
    });
  }
}

function toPhoneSyncZcaMessage(
  value: Record<string, unknown>,
  ownId: string,
  hint: ThreadType | null
): ZcaMessage | null {
  if (isRecord(value.data) && typeof value.threadId === 'string') {
    return value as unknown as ZcaMessage;
  }

  const content = value.content ?? value.msg ?? value.message;
  const uidFrom = stringValue(value.uidFrom ?? value.fromUid ?? value.senderId);
  const idTo = stringValue(
    value.idTo ?? value.toUid ?? value.uidTo ?? value.toId ?? value.convId
  );

  if (!uidFrom || !idTo || typeof content === 'undefined') {
    return null;
  }

  const msgId = stringValue(value.msgId ?? value.globalMsgId ?? value.id);
  const cliMsgId = stringValue(
    value.cliMsgId ?? value.clientMsgId ?? value.cmi
  );
  const ts = stringValue(value.ts ?? value.sendDttm ?? value.time);

  if (!msgId && !cliMsgId && !ts) {
    return null;
  }

  const data = {
    ...value,
    cliMsgId: cliMsgId || msgId || ts || String(Date.now()),
    content,
    idTo,
    msgId: msgId || cliMsgId || ts || String(Date.now()),
    ts: ts || String(Date.now()),
    uidFrom,
  };

  if (hint === ThreadType.Group || isLikelyZaloGroupId(idTo)) {
    return new GroupMessage(ownId, data as never) as ZcaMessage;
  }

  return new UserMessage(ownId, data as never) as ZcaMessage;
}

function phoneSyncThreadHintFromKey(key: string) {
  const normalized = key.toLowerCase();

  if (normalized.includes('group')) {
    return ThreadType.Group;
  }

  if (normalized === 'msgs' || normalized.includes('oneone')) {
    return ThreadType.User;
  }

  return null;
}

function phoneSyncResponseHasMore(value: unknown) {
  const more = findFirstRecordValue(value, [
    'hasMore',
    'has_more',
    'more',
    'needMore',
    'need_more',
  ]);

  if (typeof more === 'boolean') {
    return more;
  }

  if (typeof more === 'number') {
    return more > 0;
  }

  if (typeof more === 'string') {
    return more === '1' || more.toLowerCase() === 'true';
  }

  return false;
}

function findPhoneSyncSequenceId(value: unknown) {
  return findLargestNumericRecordValue(value, [
    'lastSeqId',
    'last_seq_id',
    'maxSeqId',
    'max_seq_id',
    'seqId',
    'seq_id',
    'fromSeqId',
    'from_seq_id',
  ]);
}

function findPhoneSyncMinSequenceId(value: unknown) {
  return findLargestNumericRecordValue(value, ['minSeqId', 'min_seq_id']);
}

function findPhoneSyncTempKey(value: unknown) {
  const tempKey = findFirstRecordValue(value, ['tempKey', 'temp_key']);

  return typeof tempKey === 'string' ? tempKey : null;
}

function findEncryptedPhoneSyncPayload(value: unknown): string | null {
  const payload = findFirstRecordValue(value, [
    'ciphertext',
    'cipher_text',
    'encrypted',
    'encryptedData',
    'encrypted_data',
    'encryptedMsg',
    'encrypted_msg',
  ]);

  return typeof payload === 'string' && payload.trim() ? payload.trim() : null;
}

function findFirstRecordValue(value: unknown, keys: string[]): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstRecordValue(item, keys);
      if (typeof found !== 'undefined') return found;
    }

    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    if (key in value) {
      return value[key];
    }
  }

  for (const child of Object.values(value)) {
    const found = findFirstRecordValue(child, keys);
    if (typeof found !== 'undefined') return found;
  }

  return undefined;
}

function findLargestNumericRecordValue(value: unknown, keys: string[]) {
  let largest: number | null = null;

  visitRecordValues(value, (key, candidate) => {
    if (!keys.includes(key)) return;
    const numeric =
      typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string'
          ? Number.parseInt(candidate, 10)
          : Number.NaN;

    if (Number.isFinite(numeric)) {
      largest = Math.max(largest ?? numeric, numeric);
    }
  });

  return largest;
}

function visitRecordValues(
  value: unknown,
  visitor: (key: string, value: unknown) => void
) {
  if (Array.isArray(value)) {
    for (const child of value) {
      visitRecordValues(child, visitor);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    visitor(key, child);
    visitRecordValues(child, visitor);
  }
}

function getPhoneSyncStatus({
  lastError,
  messages,
  pullAttempts,
  requestAccepted,
}: {
  lastError: string | null;
  messages: Message<ZaloPersonalRawMessage>[];
  pullAttempts: number;
  requestAccepted: boolean;
}): ZaloPersonalPhoneSyncStatus {
  if (messages.length > 0 && lastError) {
    return 'partial';
  }

  if (messages.length > 0) {
    return 'completed';
  }

  if (requestAccepted && pullAttempts > 0 && !lastError) {
    return 'completed_no_payload';
  }

  if (requestAccepted && !lastError) {
    return 'waiting_for_phone';
  }

  if (lastError && isPhoneSyncApprovalPendingError(lastError)) {
    return 'waiting_for_phone';
  }

  return 'failed';
}

function isPhoneSyncApprovalPendingError(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes('user_dont_confirm') ||
    normalized.includes('sync_request_timeout') ||
    normalized.includes('waiting_for_phone') ||
    normalized.includes('timeout')
  );
}

function toSafePhoneSyncError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);

  return raw
    .replace(/[A-Za-z0-9+/=]{80,}/g, '[redacted]')
    .replace(/params=[^&\s]+/g, 'params=[redacted]')
    .slice(0, 240);
}

function isLikelyZaloGroupId(value: string) {
  return value.startsWith('g') || value.startsWith('group');
}

function extractZaloGroupIds(value: unknown) {
  const groupIds = new Set<string>();

  collectZaloGroupIdsFromValue(value, groupIds);

  return [...groupIds];
}

function collectZaloGroupIdsFromValue(value: unknown, groupIds: Set<string>) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectZaloGroupIdsFromValue(item, groupIds);
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const isGroupRecord =
    value.is_group === 1 ||
    value.isGroup === true ||
    value.type === ThreadType.Group ||
    value.threadType === ThreadType.Group ||
    value.threadType === 'group';
  const candidateKeys = [
    'conversationId',
    'groupId',
    'group_id',
    'grid',
    'id',
    'idTo',
    'threadId',
    'thread_id',
  ];

  for (const key of candidateKeys) {
    const candidate = stringValue(value[key]);
    const keySuggestsGroup = key.toLowerCase().includes('group');

    if (
      candidate &&
      (isGroupRecord || keySuggestsGroup || isLikelyZaloGroupId(candidate))
    ) {
      groupIds.add(candidate);
    }
  }

  for (const child of Object.values(value)) {
    collectZaloGroupIdsFromValue(child, groupIds);
  }
}

function stringValue(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function delay(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new Error('zalo_personal_phone_sync_cancelled'));
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('zalo_personal_phone_sync_cancelled'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function assertPhoneSyncNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('zalo_personal_phone_sync_cancelled');
  }
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

function dedupeSdkMessages(
  messages: Message<ZaloPersonalRawMessage>[]
): Message<ZaloPersonalRawMessage>[] {
  const seen = new Set<string>();
  const deduped: Message<ZaloPersonalRawMessage>[] = [];

  for (const message of messages) {
    const key = `${message.threadId}:${message.id}`;
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(message);
  }

  return deduped;
}

function dedupeThreads(threads: ThreadInfo[]) {
  const seen = new Set<string>();
  const deduped: ThreadInfo[] = [];

  for (const thread of threads) {
    if (seen.has(thread.id)) continue;

    seen.add(thread.id);
    deduped.push(thread);
  }

  return deduped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function handleQrLoginEvent(
  event: LoginQRCallbackEvent,
  emit: (event: ZaloPersonalQrLoginEvent) => void
) {
  switch (event.type) {
    case LoginQRCallbackEventType.QRCodeGenerated:
      emit({
        actions: event.actions,
        expiresAt: new Date(Date.now() + ZALO_PERSONAL_QR_TTL_MS).toISOString(),
        qrImageDataUrl: toQrImageDataUrl(event.data.image),
        type: 'qr_generated',
      });
      break;
    case LoginQRCallbackEventType.QRCodeExpired:
      emit({
        actions: event.actions,
        type: 'qr_expired',
      });
      break;
    case LoginQRCallbackEventType.QRCodeScanned:
      emit({
        actions: event.actions,
        scannedProfile: {
          avatar: event.data.avatar || null,
          displayName: event.data.display_name || null,
        },
        type: 'qr_scanned',
      });
      break;
    case LoginQRCallbackEventType.QRCodeDeclined:
      emit({
        actions: event.actions,
        type: 'qr_declined',
      });
      break;
    case LoginQRCallbackEventType.GotLoginInfo:
      emit({ type: 'credentials_ready' });
      break;
  }
}

function isSentRaw(value: unknown): value is ZaloPersonalSentRaw {
  return isRecord(value) && value.isSelf === true && 'response' in value;
}

function isFriendRequestRaw(
  value: unknown
): value is ZaloPersonalFriendRequestRaw {
  return isRecord(value) && value.kind === 'friend_request';
}

function getOldestZaloMessageId(messages: ZcaMessage[]) {
  return messages
    .slice()
    .sort(
      (a, b) =>
        dateFromZaloTimestamp(a.data.ts).getTime() -
        dateFromZaloTimestamp(b.data.ts).getTime()
    )
    .at(0)?.data.msgId;
}

function removeZaloListener(
  listener: API['listener'],
  event: string,
  handler: (...args: unknown[]) => void
) {
  const listenerWithOff = listener as typeof listener & {
    off?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (
      event: string,
      handler: (...args: unknown[]) => void
    ) => void;
  };

  if (typeof listenerWithOff.off === 'function') {
    listenerWithOff.off(event, handler);
  } else {
    listenerWithOff.removeListener?.(event, handler);
  }
}

function isZaloListenerSocketOpen(listener: API['listener']) {
  const listenerWithSocket = listener as unknown as {
    ws?: { readyState?: number } | null;
  };

  return listenerWithSocket.ws?.readyState === ZALO_LISTENER_SOCKET_OPEN_STATE;
}

function zaloMessageUniqueKey(message: ZcaMessage) {
  return [
    message.type,
    message.threadId,
    message.data.msgId || message.data.cliMsgId || message.data.ts,
  ].join(':');
}

function toQrImageDataUrl(image: string) {
  const trimmed = image.trim();

  return trimmed.startsWith('data:image/')
    ? trimmed
    : `data:image/png;base64,${trimmed}`;
}
