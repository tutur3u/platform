export type ChatSdkAdapterTier = 'official' | 'vendor-official' | 'community';

export type ChatSdkAdapterKind = 'platform' | 'state';

export type ChatSdkAdapterRuntime =
  | 'node'
  | 'browser'
  | 'cloudflare-workers'
  | 'platform-native';

export interface ChatSdkAdapterDefinition {
  readonly description: string;
  readonly displayName: string;
  readonly docsUrl: string;
  readonly factoryExport: string;
  readonly id: string;
  readonly kind: ChatSdkAdapterKind;
  readonly packageName: string;
  readonly runtime: ChatSdkAdapterRuntime;
  readonly tier: ChatSdkAdapterTier;
}

export const CHAT_SDK_PLATFORM_ADAPTERS = [
  {
    description:
      'Slack workspace bots with threads, reactions, interactive messages, and native streaming.',
    displayName: 'Slack',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createSlackAdapter',
    id: 'slack',
    kind: 'platform',
    packageName: '@chat-adapter/slack',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Microsoft Teams bots with adaptive cards, mentions, conversation threading, and Teams streaming support.',
    displayName: 'Microsoft Teams',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createTeamsAdapter',
    id: 'teams',
    kind: 'platform',
    packageName: '@chat-adapter/teams',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Google Chat spaces and direct messages with Google Chat cards and Workspace Events support.',
    displayName: 'Google Chat',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createGoogleChatAdapter',
    id: 'gchat',
    kind: 'platform',
    packageName: '@chat-adapter/gchat',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Discord bots with slash commands, gateway forwarding, threads, reactions, and rich embeds.',
    displayName: 'Discord',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createDiscordAdapter',
    id: 'discord',
    kind: 'platform',
    packageName: '@chat-adapter/discord',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'GitHub issue and pull request comment threads backed by GitHub App or PAT authentication.',
    displayName: 'GitHub',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createGitHubAdapter',
    id: 'github',
    kind: 'platform',
    packageName: '@chat-adapter/github',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Linear issue comments and agent sessions for workspace automation and project workflows.',
    displayName: 'Linear',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createLinearAdapter',
    id: 'linear',
    kind: 'platform',
    packageName: '@chat-adapter/linear',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Telegram groups, channels, direct chats, inline keyboards, and post/edit streaming.',
    displayName: 'Telegram',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createTelegramAdapter',
    id: 'telegram',
    kind: 'platform',
    packageName: '@chat-adapter/telegram',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'WhatsApp Business Cloud customer messaging with buffered streaming, templates, and media handling.',
    displayName: 'WhatsApp Business Cloud',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createWhatsAppAdapter',
    id: 'whatsapp',
    kind: 'platform',
    packageName: '@chat-adapter/whatsapp',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Facebook Messenger conversations with templates, buttons, reactions, and postbacks.',
    displayName: 'Messenger',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createMessengerAdapter',
    id: 'messenger',
    kind: 'platform',
    packageName: '@chat-adapter/messenger',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Browser chat UI adapter that speaks the AI SDK UI stream protocol for React, Vue, and Svelte clients.',
    displayName: 'Web',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createWebAdapter',
    id: 'web',
    kind: 'platform',
    packageName: '@chat-adapter/web',
    runtime: 'browser',
    tier: 'official',
  },
  {
    description:
      'Matrix adapter built and maintained by Beeper for Matrix rooms and threads.',
    displayName: 'Beeper Matrix',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createMatrixAdapter',
    id: 'matrix',
    kind: 'platform',
    packageName: '@beeper/chat-adapter-matrix',
    runtime: 'node',
    tier: 'vendor-official',
  },
  {
    description:
      'Photon iMessage adapter for local on-device and Photon-hosted iMessage integrations.',
    displayName: 'Photon iMessage',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createiMessageAdapter',
    id: 'imessage',
    kind: 'platform',
    packageName: 'chat-adapter-imessage',
    runtime: 'platform-native',
    tier: 'vendor-official',
  },
  {
    description:
      'Resend email adapter for bidirectional threaded email, rich HTML, and attachments.',
    displayName: 'Resend Email',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createResendAdapter',
    id: 'resend',
    kind: 'platform',
    packageName: '@resend/chat-sdk-adapter',
    runtime: 'node',
    tier: 'vendor-official',
  },
  {
    description:
      'Unified Zernio social DM adapter for Instagram, Facebook, Telegram, WhatsApp, X, Bluesky, and Reddit.',
    displayName: 'Zernio',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createZernioAdapter',
    id: 'zernio',
    kind: 'platform',
    packageName: '@zernio/chat-sdk-adapter',
    runtime: 'node',
    tier: 'vendor-official',
  },
  {
    description:
      'Liveblocks Comments adapter for conversational bots over rooms, threads, and comments.',
    displayName: 'Liveblocks',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createLiveblocksAdapter',
    id: 'liveblocks',
    kind: 'platform',
    packageName: '@liveblocks/chat-sdk-adapter',
    runtime: 'node',
    tier: 'vendor-official',
  },
  {
    description:
      'Webex spaces and threads with adaptive-card oriented message handling.',
    displayName: 'Webex',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createWebexAdapter',
    id: 'webex',
    kind: 'platform',
    packageName: '@bitbasti/chat-adapter-webex',
    runtime: 'node',
    tier: 'community',
  },
  {
    description:
      'Unofficial WhatsApp adapter powered by Baileys for WhatsApp-native messaging.',
    displayName: 'Baileys WhatsApp',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createBaileysAdapter',
    id: 'baileys',
    kind: 'platform',
    packageName: 'chat-adapter-baileys',
    runtime: 'node',
    tier: 'community',
  },
  {
    description:
      'Sendblue iMessage adapter for building iMessage bots through Sendblue.',
    displayName: 'Sendblue iMessage',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createSendblueAdapter',
    id: 'sendblue',
    kind: 'platform',
    packageName: 'chat-adapter-sendblue',
    runtime: 'node',
    tier: 'community',
  },
  {
    description:
      'Blooio adapter for iMessage, RCS, and SMS conversations from the same bot.',
    displayName: 'Blooio iMessage/RCS/SMS',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createBlooioAdapter',
    id: 'blooio',
    kind: 'platform',
    packageName: 'chat-adapter-blooio',
    runtime: 'node',
    tier: 'community',
  },
  {
    description:
      'Zalo Bot Platform adapter with webhook signature verification, buffered streaming, and typing indicators.',
    displayName: 'Zalo',
    docsUrl: 'https://chat-sdk.dev/adapters/community/zalo',
    factoryExport: 'createZaloAdapter',
    id: 'zalo',
    kind: 'platform',
    packageName: 'chat-adapter-zalo',
    runtime: 'node',
    tier: 'community',
  },
  {
    description:
      'Mattermost posts, reactions, slash commands, and threaded workspace conversations.',
    displayName: 'Mattermost',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createMattermostAdapter',
    id: 'mattermost',
    kind: 'platform',
    packageName: 'chat-adapter-mattermost',
    runtime: 'node',
    tier: 'community',
  },
] as const satisfies readonly ChatSdkAdapterDefinition[];

export const CHAT_SDK_STATE_ADAPTERS = [
  {
    description:
      'In-memory state for local development and tests. Do not use for multi-instance production bots.',
    displayName: 'Memory',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createMemoryState',
    id: 'memory',
    kind: 'state',
    packageName: '@chat-adapter/state-memory',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Redis state adapter for subscriptions, dedupe, caching, and distributed webhook locks.',
    displayName: 'Redis',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createRedisState',
    id: 'redis',
    kind: 'state',
    packageName: '@chat-adapter/state-redis',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'ioredis state adapter for Redis clusters and sentinel-backed deployments.',
    displayName: 'ioredis',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createIoRedisState',
    id: 'ioredis',
    kind: 'state',
    packageName: '@chat-adapter/state-ioredis',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'PostgreSQL state adapter for durable subscriptions, cache entries, and distributed locks.',
    displayName: 'PostgreSQL',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createPostgresState',
    id: 'postgres',
    kind: 'state',
    packageName: '@chat-adapter/state-pg',
    runtime: 'node',
    tier: 'official',
  },
  {
    description:
      'Cloudflare Durable Objects state adapter with SQLite-backed persistence and distributed locking.',
    displayName: 'Cloudflare Durable Objects',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createCloudflareState',
    id: 'cloudflare-do',
    kind: 'state',
    packageName: 'chat-state-cloudflare-do',
    runtime: 'cloudflare-workers',
    tier: 'community',
  },
  {
    description:
      'MySQL state adapter for persistence, distributed locks, caching, lists, and queues.',
    displayName: 'MySQL',
    docsUrl: 'https://chat-sdk.dev/adapters',
    factoryExport: 'createMySqlState',
    id: 'mysql',
    kind: 'state',
    packageName: 'chat-state-mysql',
    runtime: 'node',
    tier: 'community',
  },
] as const satisfies readonly ChatSdkAdapterDefinition[];

export const CHAT_SDK_ADAPTERS = [
  ...CHAT_SDK_PLATFORM_ADAPTERS,
  ...CHAT_SDK_STATE_ADAPTERS,
] as const;

export type ChatSdkPlatformAdapterDefinition =
  (typeof CHAT_SDK_PLATFORM_ADAPTERS)[number];
export type ChatSdkPlatformAdapterId = ChatSdkPlatformAdapterDefinition['id'];
export type ChatSdkStateAdapterDefinition =
  (typeof CHAT_SDK_STATE_ADAPTERS)[number];
export type ChatSdkStateAdapterId = ChatSdkStateAdapterDefinition['id'];
export type ChatSdkKnownAdapterDefinition = (typeof CHAT_SDK_ADAPTERS)[number];
export type ChatSdkKnownAdapterId = ChatSdkKnownAdapterDefinition['id'];

export function isChatSdkPlatformAdapterId(
  value: string
): value is ChatSdkPlatformAdapterId {
  return CHAT_SDK_PLATFORM_ADAPTERS.some((adapter) => adapter.id === value);
}

export function isChatSdkStateAdapterId(
  value: string
): value is ChatSdkStateAdapterId {
  return CHAT_SDK_STATE_ADAPTERS.some((adapter) => adapter.id === value);
}

export function getChatSdkPlatformAdapterDefinition(
  id: ChatSdkPlatformAdapterId
): ChatSdkPlatformAdapterDefinition {
  return CHAT_SDK_PLATFORM_ADAPTERS.find((adapter) => adapter.id === id)!;
}

export function getChatSdkStateAdapterDefinition(
  id: ChatSdkStateAdapterId
): ChatSdkStateAdapterDefinition {
  return CHAT_SDK_STATE_ADAPTERS.find((adapter) => adapter.id === id)!;
}
