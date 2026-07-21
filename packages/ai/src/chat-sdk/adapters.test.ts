import { describe, expect, it } from 'vitest';
import {
  CHAT_SDK_ADAPTERS,
  CHAT_SDK_PLATFORM_ADAPTERS,
  CHAT_SDK_STATE_ADAPTERS,
  getChatSdkPlatformAdapterDefinition,
  getChatSdkStateAdapterDefinition,
  isChatSdkPlatformAdapterId,
  isChatSdkStateAdapterId,
} from './adapters';
import {
  createChatSdkRuntime,
  createChatSdkStateAdapter,
  loadChatSdkPlatformAdapterFactory,
  loadChatSdkStateAdapterFactory,
} from './registry';

describe('Chat SDK adapter registry', () => {
  it('tracks every adapter currently listed by Chat SDK', () => {
    expect(CHAT_SDK_PLATFORM_ADAPTERS).toHaveLength(21);
    expect(CHAT_SDK_STATE_ADAPTERS).toHaveLength(6);
    expect(CHAT_SDK_ADAPTERS).toHaveLength(27);
  });

  it('includes all official platform adapters', () => {
    expect(CHAT_SDK_PLATFORM_ADAPTERS.map((adapter) => adapter.id)).toEqual(
      expect.arrayContaining([
        'discord',
        'gchat',
        'github',
        'linear',
        'messenger',
        'slack',
        'teams',
        'telegram',
        'web',
        'whatsapp',
      ])
    );
  });

  it('includes vendor-official and community platform adapters, including Zalo', () => {
    expect(CHAT_SDK_PLATFORM_ADAPTERS.map((adapter) => adapter.id)).toEqual(
      expect.arrayContaining([
        'baileys',
        'blooio',
        'imessage',
        'liveblocks',
        'matrix',
        'mattermost',
        'resend',
        'sendblue',
        'webex',
        'zalo',
        'zernio',
      ])
    );

    expect(getChatSdkPlatformAdapterDefinition('zalo')).toMatchObject({
      docsUrl: 'https://chat-sdk.dev/adapters/community/zalo',
      factoryExport: 'createZaloAdapter',
      packageName: 'chat-adapter-zalo',
      tier: 'community',
    });
  });

  it('includes official and community state adapters', () => {
    expect(CHAT_SDK_STATE_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'memory',
      'redis',
      'ioredis',
      'postgres',
      'cloudflare-do',
      'mysql',
    ]);

    expect(getChatSdkStateAdapterDefinition('cloudflare-do')).toMatchObject({
      factoryExport: 'createCloudflareState',
      packageName: 'chat-state-cloudflare-do',
      runtime: 'cloudflare-workers',
    });
  });

  it('keeps adapter ids and packages unique', () => {
    const ids = CHAT_SDK_ADAPTERS.map((adapter) => adapter.id);
    const packages = CHAT_SDK_ADAPTERS.map((adapter) => adapter.packageName);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(packages).size).toBe(packages.length);
  });

  it('narrows known adapter ids', () => {
    expect(isChatSdkPlatformAdapterId('zalo')).toBe(true);
    expect(isChatSdkPlatformAdapterId('redis')).toBe(false);
    expect(isChatSdkStateAdapterId('redis')).toBe(true);
    expect(isChatSdkStateAdapterId('slack')).toBe(false);
  });

  it('points at resolvable adapter packages', () => {
    for (const adapter of CHAT_SDK_ADAPTERS) {
      expect(import.meta.resolve(adapter.packageName)).toContain(
        adapter.packageName.replace('/', '+')
      );
    }
  });
});

describe('Chat SDK adapter factories', () => {
  it('loads representative platform adapter factories in the Node test runtime', async () => {
    const testRuntimeAdapterIds = [
      'slack',
      'web',
      'resend',
      'zernio',
      'liveblocks',
      'zalo',
      'mattermost',
    ] as const;

    await Promise.all(
      testRuntimeAdapterIds.map(async (adapterId) => {
        const factory = await loadChatSdkPlatformAdapterFactory(adapterId);

        expect(factory).toEqual(expect.any(Function));
      })
    );
  }, 20_000);

  it('loads Node-compatible state adapter factories', async () => {
    await Promise.all(
      CHAT_SDK_STATE_ADAPTERS.filter(
        (adapter) => adapter.runtime !== 'cloudflare-workers'
      ).map(async (adapter) => {
        const factory = await loadChatSdkStateAdapterFactory(adapter.id);

        expect(factory).toEqual(expect.any(Function));
      })
    );
  });

  it('creates the memory state adapter for local runtimes', async () => {
    const state = await createChatSdkStateAdapter('memory');

    expect(state).toMatchObject({
      delete: expect.any(Function),
      get: expect.any(Function),
      set: expect.any(Function),
    });
  });

  it('creates a Chat runtime from selected adapters and a required state adapter', async () => {
    const chat = await createChatSdkRuntime({
      adapters: {},
      state: 'memory',
      userName: 'tuturuuu',
    });

    expect(chat.webhooks).toEqual({});
  });
});
